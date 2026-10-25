/**
 * Protocol-independent helpers that turn raw file bytes into either a preview
 * (for the PreviewModal) or a compact content index (for content search).
 * Every connection manager only has to implement readFile(); everything else
 * lives here so FTP, SFTP and S3 behave identically.
 */

const path = require("path");
const parquet = require("@dsnp/parquetjs");

const PREVIEW_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const PREVIEW_PARQUET_ROWS = 100;

// Per-type download limits for content indexing. Larger files are indexed by
// metadata only.
const INDEX_MAX_BYTES = {
  json: 20 * 1024 * 1024,
  parquet: 50 * 1024 * 1024,
  text: 5 * 1024 * 1024,
};

const TEXT_EXTENSIONS = new Set(["csv", "txt", "xml", "yaml", "yml", "log", "md"]);
const INDEXABLE_EXTENSIONS = new Set(["json", "parquet", ...TEXT_EXTENSIONS]);

// Caps that keep the persisted index a reasonable size.
const MAX_FIELDS = 500;
const MAX_VALUES = 2000;
const MAX_VALUE_LENGTH = 200;
const MAX_SEARCHABLE_TEXT = 500 * 1024;

function getExtension(fileName) {
  return path.extname(fileName || "").slice(1).toLowerCase();
}

function getContentKind(fileName) {
  const ext = getExtension(fileName);
  if (ext === "json" || ext === "parquet") return ext;
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  return null;
}

function isIndexable(fileName) {
  return INDEXABLE_EXTENSIONS.has(getExtension(fileName));
}

function indexMaxBytes(fileName) {
  const kind = getContentKind(fileName);
  return kind ? INDEX_MAX_BYTES[kind] : 0;
}

async function readParquetBuffer(buffer, maxRows = Infinity) {
  const reader = await parquet.ParquetReader.openBuffer(buffer);
  try {
    let schema = [];
    try {
      const fieldList = reader.getSchema()?.fieldList || [];
      schema = fieldList.map((field) => ({
        name: field.name,
        type: field.primitiveType || field.originalType || "unknown",
      }));
    } catch (error) {
      // Some files have schemas parquetjs cannot describe; rows still read.
    }

    let totalRows = null;
    try {
      const count = Number(reader.getRowCount());
      if (Number.isFinite(count)) totalRows = count;
    } catch (error) {
      // Row count is optional metadata.
    }

    const rows = [];
    const cursor = reader.getCursor();
    let record;
    while (rows.length < maxRows && (record = await cursor.next())) {
      rows.push(record);
    }
    return { schema, rows, totalRows: totalRows ?? rows.length };
  } finally {
    await reader.close();
  }
}

// parquetjs returns BigInt for INT64 columns, which JSON.stringify rejects.
function jsonReplacer(key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

/**
 * Build preview content for a downloaded file.
 * Parquet files are rendered as a JSON summary with the first rows;
 * everything else is returned as UTF-8 text.
 */
async function buildPreviewContent(buffer, fileName) {
  if (getExtension(fileName) !== "parquet") {
    return buffer.toString("utf-8");
  }

  try {
    const { schema, rows, totalRows } = await readParquetBuffer(
      buffer,
      PREVIEW_PARQUET_ROWS
    );
    return JSON.stringify(
      {
        schema,
        rowCount: totalRows,
        columnCount: schema.length || (rows[0] ? Object.keys(rows[0]).length : 0),
        previewRows: rows,
        message: `Showing first ${rows.length} of ${totalRows} rows`,
        fileInfo: { fileName, fileSize: buffer.length },
      },
      jsonReplacer,
      2
    );
  } catch (error) {
    return JSON.stringify(
      {
        error: "Unable to parse Parquet file",
        message: "This Parquet file format may not be supported for preview",
        fileName,
        fileSize: buffer.length,
        suggestion:
          "Please download the file to view its contents with a specialized Parquet viewer",
        details: error.message,
      },
      null,
      2
    );
  }
}

/**
 * Collects unique field names and values while walking parsed data.
 */
class ContentCollector {
  constructor() {
    this.fields = new Set();
    this.values = new Set();
    this.textParts = [];
    this.textLength = 0;
  }

  addField(name) {
    if (this.fields.size < MAX_FIELDS) this.fields.add(name);
  }

  addValue(value) {
    if (value === null || value === undefined) return;
    const str = String(value);
    if (!str) return;
    this.addText(str);
    if (this.values.size < MAX_VALUES && str.length <= MAX_VALUE_LENGTH) {
      this.values.add(str);
    }
  }

  addText(str) {
    if (this.textLength >= MAX_SEARCHABLE_TEXT) return;
    this.textParts.push(str);
    this.textLength += str.length + 1;
  }

  walk(node, prefix = "", depth = 0) {
    if (depth > 20 || this.textLength >= MAX_SEARCHABLE_TEXT) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        this.walk(item, prefix, depth + 1);
        if (this.textLength >= MAX_SEARCHABLE_TEXT) break;
      }
    } else if (node instanceof Date) {
      this.addValue(node.toISOString());
    } else if (Buffer.isBuffer(node)) {
      this.addValue(node.toString("utf-8"));
    } else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        const fieldName = prefix ? `${prefix}.${key}` : key;
        this.addField(fieldName);
        this.walk(value, fieldName, depth + 1);
      }
    } else {
      this.addValue(node);
    }
  }

  result(extra) {
    const fields = Array.from(this.fields);
    return {
      fields,
      values: Array.from(this.values),
      searchableText: `${fields.join(" ")} ${this.textParts.join(" ")}`
        .slice(0, MAX_SEARCHABLE_TEXT)
        .toLowerCase(),
      truncated: this.textLength >= MAX_SEARCHABLE_TEXT,
      ...extra,
    };
  }
}

/**
 * Extract a compact, searchable representation of a file's content.
 * Returns { type, fields, values, searchableText, recordCount, fullyIndexed, ... }.
 */
async function extractIndexContent(buffer, fileName) {
  const kind = getContentKind(fileName);

  if (kind === "json") {
    const collector = new ContentCollector();
    try {
      const data = JSON.parse(buffer.toString("utf-8"));
      collector.walk(data);
      return collector.result({
        type: "json",
        recordCount: Array.isArray(data) ? data.length : 1,
        fullyIndexed: true,
      });
    } catch (error) {
      // Not valid JSON (e.g. JSON Lines) - fall back to plain text indexing.
      collector.addText(buffer.toString("utf-8"));
      return collector.result({
        type: "json",
        recordCount: 0,
        fullyIndexed: false,
        error: `JSON parse error: ${error.message}`,
      });
    }
  }

  if (kind === "parquet") {
    const { schema, rows, totalRows } = await readParquetBuffer(buffer);
    const collector = new ContentCollector();
    schema.forEach((field) => collector.addField(field.name));
    collector.walk(rows);
    const result = collector.result({
      type: "parquet",
      recordCount: totalRows,
      columnCount: schema.length,
      fullyIndexed: true,
    });
    result.schema = Object.fromEntries(schema.map((f) => [f.name, f.type]));
    return result;
  }

  if (kind === "text") {
    const collector = new ContentCollector();
    const text = buffer.toString("utf-8");
    collector.addText(text);
    return collector.result({
      type: "text",
      recordCount: text ? text.split("\n").length : 0,
      fullyIndexed: text.length <= MAX_SEARCHABLE_TEXT,
    });
  }

  throw new Error(`Unsupported file type for content indexing: ${fileName}`);
}

module.exports = {
  PREVIEW_MAX_BYTES,
  getExtension,
  isIndexable,
  indexMaxBytes,
  buildPreviewContent,
  extractIndexContent,
};
