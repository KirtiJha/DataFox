/**
 * SQL over remote files, powered by DuckDB.
 *
 * Files are downloaded into a local cache (keyed by connection, path, size and
 * mtime, so changed files are re-fetched) and exposed to SQL as a view named
 * `data`. The same path works for FTP, FTPS, SFTP and S3.
 *
 * DuckDB is sandboxed: it can only read and write inside the cache folder, can't
 * reach the network or install extensions, and the settings are locked. This
 * keeps user-written (and later AI-written) SQL from touching the rest of the disk.
 */

const { EventEmitter } = require("events");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs-extra");

const FORMATS = {
  parquet: (files) => `read_parquet(${files}, union_by_name = true)`,
  csv: (files) => `read_csv(${files}, union_by_name = true)`,
  tsv: (files) => `read_csv(${files}, union_by_name = true, delim = '\t')`,
  json: (files) => `read_json_auto(${files}, union_by_name = true)`,
  jsonl: (files) => `read_json_auto(${files}, union_by_name = true, format = 'newline_delimited')`,
  ndjson: (files) => `read_json_auto(${files}, union_by_name = true, format = 'newline_delimited')`,
};

const EXPORT_FORMATS = {
  csv: "(FORMAT csv, HEADER true)",
  parquet: "(FORMAT parquet)",
  json: "(FORMAT json, ARRAY true)",
};

const MAX_FILES = 1000;
const MAX_DATASET_BYTES = 2 * 1024 * 1024 * 1024; // 2GB per dataset
const MAX_CACHE_BYTES = 4 * 1024 * 1024 * 1024; // 4GB total, least recently used evicted
const DEFAULT_ROW_LIMIT = 1000;
const MAX_ROW_LIMIT = 10000;
const DOWNLOAD_CONCURRENCY = { ftp: 1, ftps: 1, sftp: 4, s3: 4 };

function extensionOf(name) {
  return path.extname(name).slice(1).toLowerCase();
}

function isQueryable(name) {
  return extensionOf(name) in FORMATS;
}

function sqlString(value) {
  // DuckDB accepts forward slashes on every platform.
  return `'${value.replace(/\\/g, "/").replace(/'/g, "''")}'`;
}

function joinRemote(dir, name) {
  return `${dir === "/" ? "" : dir}/${name}`;
}

class QueryEngine extends EventEmitter {
  constructor(ftpManager, userDataPath) {
    super();
    this.ftpManager = ftpManager;
    this.cacheDir = path.join(userDataPath, "query-cache");
    this.filesDir = path.join(this.cacheDir, "files");
    this.exportsDir = path.join(this.cacheDir, "exports");
    this.sessions = new Map();
    this.instance = null;
  }

  async getInstance() {
    if (this.instance) return this.instance;

    await fs.ensureDir(this.filesDir);
    await fs.ensureDir(this.exportsDir);
    // Loaded lazily so a missing native binary only disables queries, not the app.
    let DuckDBInstance;
    try {
      ({ DuckDBInstance } = require("@duckdb/node-api"));
    } catch (error) {
      throw new Error(`The SQL engine could not be loaded on this system: ${error.message}`);
    }
    const instance = await DuckDBInstance.create(":memory:", {
      autoinstall_known_extensions: "false",
      autoload_known_extensions: "false",
    });
    const setup = await instance.connect();
    const allowed = `${this.cacheDir.replace(/\\/g, "/")}/`;
    await setup.run(`SET allowed_directories = [${sqlString(allowed)}]`);
    await setup.run("SET enable_external_access = false");
    await setup.run("SET lock_configuration = true");
    setup.closeSync();

    this.instance = instance;
    return instance;
  }

  // ---------------------------------------------------------------------------
  // Datasets
  // ---------------------------------------------------------------------------

  /**
   * Open a query session over a remote file or folder.
   * @param {{ path: string, isDirectory: boolean }} target
   * @returns {Promise<Object>} Session summary: id, format, file counts, columns
   */
  async openSession(target) {
    if (!this.ftpManager.isConnectionActive()) {
      throw new Error("Not connected to server");
    }

    const sessionId = crypto.randomUUID();
    await fs.ensureDir(this.filesDir);
    const { files, format, skipped } = await this.resolveFiles(target);
    const localPaths = await this.downloadFiles(sessionId, files);

    const instance = await this.getInstance();
    const connection = await instance.connect();
    const fileList = `[${localPaths.map(sqlString).join(", ")}]`;
    try {
      await connection.run(`CREATE TEMP VIEW data AS SELECT * FROM ${FORMATS[format](fileList)}`);
    } catch (error) {
      connection.closeSync();
      throw new Error(`Could not read ${format.toUpperCase()} data: ${firstLine(error)}`);
    }

    const columns = await this.describe(connection);
    this.sessions.set(sessionId, { connection, target, format });

    return {
      sessionId,
      name: path.posix.basename(target.path) || "/",
      path: target.path,
      isDirectory: !!target.isDirectory,
      format,
      fileCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + (file.size || 0), 0),
      skippedFiles: skipped,
      columns,
      defaultQuery: "SELECT *\nFROM data\nLIMIT 100",
    };
  }

  async resolveFiles(target) {
    let files;
    if (target.isDirectory) {
      files = [];
      await this.collectFiles(target.path, files);
    } else {
      const dir = path.posix.dirname(target.path);
      const name = path.posix.basename(target.path);
      const listing = await this.ftpManager.listDirectory(dir);
      const entry = listing.find((file) => file.name === name && !file.isDirectory);
      if (!entry) throw new Error(`File not found: ${target.path}`);
      files = [{ ...entry, remotePath: target.path }];
    }

    const queryable = files.filter((file) => isQueryable(file.name));
    if (queryable.length === 0) {
      throw new Error("No Parquet, CSV or JSON files found");
    }

    // A folder can mix formats; query the most common one.
    const counts = {};
    for (const file of queryable) {
      const format = extensionOf(file.name);
      counts[format] = (counts[format] || 0) + 1;
    }
    const format = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const selected = queryable.filter((file) => extensionOf(file.name) === format);

    if (selected.length > MAX_FILES) {
      throw new Error(`Too many files (${selected.length}); the limit is ${MAX_FILES}. Query a subfolder instead.`);
    }
    const totalBytes = selected.reduce((sum, file) => sum + (file.size || 0), 0);
    if (totalBytes > MAX_DATASET_BYTES) {
      throw new Error(`Dataset is ${formatBytes(totalBytes)}; the limit is ${formatBytes(MAX_DATASET_BYTES)}.`);
    }

    return { files: selected, format, skipped: files.length - selected.length };
  }

  async collectFiles(dir, out) {
    for (const entry of await this.ftpManager.listDirectory(dir)) {
      const remotePath = joinRemote(dir, entry.name);
      if (entry.isDirectory) {
        await this.collectFiles(remotePath, out);
      } else {
        out.push({ ...entry, remotePath });
      }
      if (out.length > MAX_FILES * 5) {
        throw new Error("Folder is too large to query; choose a subfolder.");
      }
    }
  }

  cachePathFor(file) {
    const info = this.ftpManager.getConnectionInfo() || {};
    const key = [
      info.type, info.host, info.port, info.bucket, info.username,
      file.remotePath, file.size, file.modifiedAt ? new Date(file.modifiedAt).getTime() : "",
    ].join("|");
    const hash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
    return path.join(this.filesDir, `${hash}.${extensionOf(file.name)}`);
  }

  async downloadFiles(sessionId, files) {
    const protocol = this.ftpManager.getConnectionInfo()?.type;
    const limit = DOWNLOAD_CONCURRENCY[protocol] || 2;
    const localPaths = files.map((file) => this.cachePathFor(file));
    let done = 0;
    let next = 0;

    const worker = async () => {
      while (next < files.length) {
        const index = next++;
        const file = files[index];
        const localPath = localPaths[index];

        if (await fs.pathExists(localPath)) {
          // Touch so least-recently-used eviction keeps it.
          const now = new Date();
          await fs.utimes(localPath, now, now);
        } else {
          const partial = `${localPath}.part`;
          await this.ftpManager.downloadFile(file.remotePath, partial, null, { track: false });
          await fs.move(partial, localPath, { overwrite: true });
        }

        done++;
        this.emit("progress", {
          sessionId,
          phase: "download",
          current: done,
          total: files.length,
          fileName: file.name,
        });
      }
    };

    await Promise.all(Array.from({ length: Math.min(limit, files.length) }, worker));
    await this.evictCache(new Set(localPaths));
    return localPaths;
  }

  async evictCache(keep) {
    const entries = [];
    for (const name of await fs.readdir(this.filesDir)) {
      const fullPath = path.join(this.filesDir, name);
      const stats = await fs.stat(fullPath);
      entries.push({ fullPath, size: stats.size, used: stats.mtimeMs });
    }
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    entries.sort((a, b) => a.used - b.used);
    for (const entry of entries) {
      if (total <= MAX_CACHE_BYTES) break;
      if (keep.has(entry.fullPath)) continue;
      await fs.remove(entry.fullPath);
      total -= entry.size;
    }
  }

  async describe(connection) {
    const reader = await connection.runAndReadAll("DESCRIBE data");
    return reader.getRowObjectsJson().map((row) => ({
      name: row.column_name,
      type: row.column_type,
    }));
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("Query session has expired; reopen the dataset.");
    return session;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Run SQL and return up to `limit` rows as JSON-safe objects.
   */
  async run(sessionId, sql, limit = DEFAULT_ROW_LIMIT) {
    const { connection } = this.getSession(sessionId);
    const rowLimit = Math.min(Math.max(1, limit), MAX_ROW_LIMIT);
    const started = Date.now();

    try {
      const reader = await connection.runAndReadUntil(sql, rowLimit + 1);
      const rows = reader.getRowObjectsJson();
      return {
        columns: reader.columnNames().map((name, i) => ({
          name,
          type: reader.columnTypes()[i].toString(),
        })),
        rows: rows.slice(0, rowLimit),
        truncated: rows.length > rowLimit || !reader.done,
        elapsedMs: Date.now() - started,
      };
    } catch (error) {
      // Keep DuckDB's full message: later lines point at the error position and suggest fixes.
      throw new Error(String(error?.message || error).trim().slice(0, 2000));
    }
  }

  /** Per-column statistics for the whole dataset (DuckDB SUMMARIZE). */
  async profile(sessionId) {
    const { connection } = this.getSession(sessionId);
    const reader = await connection.runAndReadAll("SUMMARIZE data");
    return reader.getRowObjectsJson().map((row) => ({
      name: row.column_name,
      type: row.column_type,
      min: row.min,
      max: row.max,
      approxUnique: row.approx_unique === null ? null : Number(row.approx_unique),
      avg: row.avg,
      std: row.std,
      q25: row.q25,
      q50: row.q50,
      q75: row.q75,
      count: row.count === null ? null : Number(row.count),
      nullPercentage: row.null_percentage === null ? null : Number(row.null_percentage),
    }));
  }

  /** Write the full result of `sql` (not just the shown rows) to `filePath`. */
  async exportResult(sessionId, sql, format, filePath) {
    const { connection } = this.getSession(sessionId);
    if (!EXPORT_FORMATS[format]) throw new Error(`Unsupported export format: ${format}`);

    // DuckDB may only write inside the cache, so export there and move the file.
    const staging = path.join(this.exportsDir, `${crypto.randomUUID()}.${format}`);
    const query = sql.trim().replace(/;+\s*$/, "");
    try {
      await connection.run(`COPY (${query}) TO ${sqlString(staging)} ${EXPORT_FORMATS[format]}`);
      await fs.move(staging, filePath, { overwrite: true });
    } catch (error) {
      await fs.remove(staging);
      throw new Error(firstLine(error));
    }
    return { filePath };
  }

  cancel(sessionId) {
    this.getSession(sessionId).connection.interrupt();
  }

  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.connection.closeSync();
    this.sessions.delete(sessionId);
  }

  closeAll() {
    for (const sessionId of this.sessions.keys()) this.closeSession(sessionId);
  }

  async clearCache() {
    this.closeAll();
    await fs.emptyDir(this.filesDir);
  }
}

function firstLine(error) {
  return String(error?.message || error).split("\n")[0];
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

module.exports = { QueryEngine, isQueryable };
