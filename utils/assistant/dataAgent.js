/**
 * The "Ask your data" agent. The model plans; these tools act on the
 * connection through existing app features (the search index, directory
 * listings and the sandboxed DuckDB query engine). LLM calls and API keys stay
 * in the main process; the loop runs here because the search index does.
 *
 * What reaches the model: file names and paths, column schemas, and query
 * results (capped). Raw files are never sent.
 */

const MAX_STEPS = 16;
const ROWS_TO_MODEL = 50;
const ROWS_TO_UI = 200;
const MAX_CELL_CHARS = 200;
const MAX_RESULT_CHARS = 16000;

const TOOLS = [
  {
    name: "search_files",
    description:
      "Search the connection's file index by file name, path, and indexed content (JSON field names and values, Parquet columns and values, CSV/text). Use this to find which files hold the data a question is about. Results include each file's path, size, modification date and how it matched.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words that must all match, a \"quoted phrase\", or a wildcard like *.parquet" },
        limit: { type: "integer", description: "Maximum results (default 20, max 50)" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "list_directory",
    description: "List the files and folders in a remote directory.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Absolute directory path, e.g. / or /sales/2026" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "describe_dataset",
    description:
      "Open a Parquet, CSV or JSON file, or a folder of them, as a SQL dataset and return its columns and types. Call this before writing SQL so column names are exact. A folder combines all files of its most common format.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Absolute path of the file or folder" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "run_sql",
    description:
      `Run a DuckDB SQL query against a dataset. The dataset is always available as the view named \`data\`. Return at most ${ROWS_TO_MODEL} rows to you, so aggregate in SQL (GROUP BY, COUNT, SUM, AVG, ORDER BY ... LIMIT) instead of fetching raw rows. The user sees the result as a table.`,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path of the file or folder to query" },
        sql: { type: "string", description: "A single DuckDB SELECT statement over the view `data`" },
      },
      required: ["path", "sql"],
      additionalProperties: false,
    },
  },
  {
    name: "profile_dataset",
    description:
      "Compute per-column statistics for a whole dataset: type, null percentage, approximate distinct count, min, max, mean and median. Useful for data quality questions and for understanding value ranges.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Absolute path of the file or folder" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
];

function systemPrompt(connectionInfo) {
  const where =
    connectionInfo?.type === "s3"
      ? `the S3 bucket "${connectionInfo.bucket}"`
      : `the ${String(connectionInfo?.type || "remote").toUpperCase()} server ${connectionInfo?.host || ""}`;

  return `You are the data assistant inside DataFox, a desktop client for FTP, SFTP and S3 storage. You help the user find files and answer questions about the data in them, working on ${where}.

How to work:
- Locate data before querying it: use search_files (fast, uses the index) or list_directory. Never guess paths.
- Call describe_dataset before writing SQL so you use exact column names and types.
- SQL is DuckDB. The dataset is always the view \`data\`; one query reads one file or folder. Prefer aggregations over raw rows. For nested JSON use unnest() and struct field access (col.field).
- If a query fails, read the error, fix the SQL and try again.
- The search index is built in the background, so it can be incomplete for a while; fall back to list_directory if search finds nothing.

How to answer:
- Answer the question directly first, then the supporting numbers.
- Name the file or folder paths your answer comes from.
- If the data can't answer the question, say what is missing instead of guessing.
- Be concise. Use short markdown: bullet lists, small tables, \`code\` for paths and columns. The user already sees each query's result table, so summarize rather than repeating whole tables.`;
}

function truncateCell(value) {
  if (value === null || value === undefined) return value;
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}…` : value;
}

function toModelJson(payload) {
  let json = JSON.stringify(payload);
  if (json.length > MAX_RESULT_CHARS && Array.isArray(payload.rows)) {
    // Drop rows until the payload fits, and say so.
    const rows = [...payload.rows];
    while (rows.length > 1 && json.length > MAX_RESULT_CHARS) {
      rows.splice(Math.floor(rows.length / 2));
      json = JSON.stringify({ ...payload, rows, note: `Only ${rows.length} rows shown to keep the result small.` });
    }
  }
  return json.length > MAX_RESULT_CHARS ? `${json.slice(0, MAX_RESULT_CHARS)}…(truncated)` : json;
}

function requireString(input, key) {
  const value = input?.[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`"${key}" must be a non-empty string`);
  }
  return value.trim();
}

function requirePath(input) {
  const path = requireString(input, "path");
  return path.startsWith("/") ? path.replace(/\/+$/, "") || "/" : `/${path}`;
}

export class DataAgent {
  /**
   * @param {Object} options
   * @param {Object} options.api - window.electronAPI
   * @param {Object} options.searchEngine - this connection's SearchEngine
   * @param {Object} options.connectionInfo
   * @param {Object|null} options.modelRef - { providerId, modelId }, or null for the default
   * @param {Function} options.onEvent - receives UI events (see emit calls)
   */
  constructor({ api, searchEngine, connectionInfo, modelRef, onEvent }) {
    this.api = api;
    this.searchEngine = searchEngine;
    this.connectionInfo = connectionInfo;
    this.modelRef = modelRef;
    this.onEvent = onEvent;
    this.chatId = null;
    this.datasets = new Map(); // path -> query session
    this.lastFolder = null;
    this.stopped = false;
  }

  async start() {
    const response = await this.api.aiChatStart(this.modelRef, systemPrompt(this.connectionInfo), TOOLS);
    if (!response.success) throw new Error(response.error);
    this.chatId = response.data.chatId;
    return response.data;
  }

  /**
   * Run one user question to completion, calling tools as the model asks.
   */
  async ask(question, currentFolder) {
    this.stopped = false;
    let input = { text: this.withContext(question, currentFolder) };

    for (let step = 0; step < MAX_STEPS; step++) {
      this.onEvent({ type: "assistant-start" });
      const response = await this.api.aiChatSend(this.chatId, input);
      if (!response.success) {
        this.onEvent({ type: "assistant-end", text: "" });
        if (response.aborted) return { stopped: true };
        if (response.ended) this.chatId = null;
        throw Object.assign(new Error(response.error), { ended: !!response.ended });
      }

      const turn = response.data;
      this.onEvent({ type: "assistant-end", text: turn.text });
      if (turn.toolCalls.length === 0) return { done: true };

      const toolResults = [];
      for (const call of turn.toolCalls) {
        if (this.stopped) return { stopped: true };
        toolResults.push(await this.runTool(call));
      }
      input = { toolResults };
    }

    throw new Error(`Stopped after ${MAX_STEPS} steps without a final answer. Try a more specific question.`);
  }

  withContext(question, currentFolder) {
    if (!currentFolder || currentFolder === this.lastFolder) return question;
    this.lastFolder = currentFolder;
    return `[The user is currently viewing the folder ${currentFolder}]\n\n${question}`;
  }

  async stop() {
    this.stopped = true;
    if (this.chatId) await this.api.aiChatStop(this.chatId);
  }

  async close() {
    this.stopped = true;
    if (this.chatId) await this.api.aiChatClose(this.chatId);
    for (const session of this.datasets.values()) {
      await this.api.queryClose(session.sessionId);
    }
    this.datasets.clear();
  }

  // ---------------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------------

  async runTool(call) {
    this.onEvent({ type: "tool-start", id: call.id, name: call.name, input: call.input });
    try {
      if (call.input && "__invalidArguments" in call.input) {
        throw new Error(`Tool arguments were not valid JSON: ${call.input.__invalidArguments}`);
      }
      const handler = {
        search_files: () => this.searchFiles(call.input),
        list_directory: () => this.listDirectory(call.input),
        describe_dataset: () => this.describeDataset(call.input),
        run_sql: () => this.runSql(call.input),
        profile_dataset: () => this.profileDataset(call.input),
      }[call.name];
      if (!handler) throw new Error(`Unknown tool: ${call.name}`);

      const { forModel, summary, display } = await handler();
      this.onEvent({ type: "tool-end", id: call.id, ok: true, summary, display });
      return { id: call.id, content: toModelJson(forModel) };
    } catch (error) {
      this.onEvent({ type: "tool-end", id: call.id, ok: false, summary: error.message });
      return { id: call.id, content: `Error: ${error.message}`, isError: true };
    }
  }

  async searchFiles(input) {
    const query = requireString(input, "query");
    const limit = Math.min(Math.max(1, Number(input.limit) || 20), 50);
    const results = (await this.searchEngine.search(query)).slice(0, limit);
    const status = this.searchEngine.getIndexingStatus();

    return {
      forModel: {
        results: results.map((r) => ({
          path: r.fullPath,
          type: r.isDirectory ? "folder" : "file",
          size: r.size,
          modified: r.modifiedTime || null,
          matchedBy: r.sources,
          contentMatches: (r.matches || []).slice(0, 3).map((m) => `${m.type}: ${truncateCell(m.value)}`),
        })),
        indexStillBuilding: status.isIndexing,
      },
      summary: `${results.length} result${results.length === 1 ? "" : "s"} for “${query}”`,
    };
  }

  async listDirectory(input) {
    const path = requirePath(input);
    const response = await this.api.ftpList(path);
    if (!response.success) throw new Error(response.error);
    const entries = response.data || [];
    return {
      forModel: {
        path,
        entries: entries.slice(0, 200).map((e) => ({
          name: e.name,
          type: e.isDirectory ? "folder" : "file",
          ...(e.isDirectory ? {} : { size: e.size }),
          modified: e.modifiedAt || null,
        })),
        ...(entries.length > 200 ? { note: `${entries.length - 200} more entries not shown` } : {}),
      },
      summary: `${entries.length} item${entries.length === 1 ? "" : "s"} in ${path}`,
    };
  }

  async dataset(path) {
    if (this.datasets.has(path)) return this.datasets.get(path);
    this.onEvent({ type: "tool-progress", text: `Opening ${path}…` });
    const response = await this.api.queryOpen({ path, isDirectory: await this.isDirectory(path) });
    if (!response.success) throw new Error(response.error);
    this.datasets.set(path, response.data);
    return response.data;
  }

  async isDirectory(path) {
    const known = this.searchEngine?.fileIndex.get(path);
    if (known) return known.isDirectory;
    // Not indexed yet: a path without a data-file extension is treated as a folder.
    return !/\.(parquet|csv|tsv|json|jsonl|ndjson)$/i.test(path);
  }

  async describeDataset(input) {
    const path = requirePath(input);
    const session = await this.dataset(path);
    return {
      forModel: {
        path,
        format: session.format,
        files: session.fileCount,
        totalBytes: session.totalBytes,
        skippedFilesInOtherFormats: session.skippedFiles,
        columns: session.columns,
      },
      summary: `${session.columns.length} columns · ${session.fileCount} ${session.format.toUpperCase()} file${session.fileCount === 1 ? "" : "s"}`,
    };
  }

  async runSql(input) {
    const path = requirePath(input);
    const sql = requireString(input, "sql");
    const session = await this.dataset(path);
    const response = await this.api.queryRun(session.sessionId, sql, ROWS_TO_UI);
    if (!response.success) throw new Error(response.error);
    const result = response.data;

    return {
      forModel: {
        columns: result.columns,
        rows: result.rows.slice(0, ROWS_TO_MODEL).map((row) =>
          Object.fromEntries(Object.entries(row).map(([k, v]) => [k, truncateCell(v)]))
        ),
        rowsReturned: result.rows.length,
        moreRowsExist: result.truncated || result.rows.length > ROWS_TO_MODEL,
      },
      summary: `${result.rows.length}${result.truncated ? "+" : ""} row${result.rows.length === 1 ? "" : "s"} · ${result.elapsedMs} ms`,
      display: {
        kind: "table",
        path,
        isDirectory: session.isDirectory,
        sql,
        columns: result.columns,
        rows: result.rows,
        truncated: result.truncated,
      },
    };
  }

  async profileDataset(input) {
    const path = requirePath(input);
    const session = await this.dataset(path);
    const response = await this.api.queryProfile(session.sessionId);
    if (!response.success) throw new Error(response.error);
    return {
      forModel: { path, columns: response.data },
      summary: `Profiled ${response.data.length} columns`,
    };
  }
}

export const ASSISTANT_TOOL_NAMES = Object.fromEntries(
  [
    ["search_files", "Searched files"],
    ["list_directory", "Listed folder"],
    ["describe_dataset", "Read schema"],
    ["run_sql", "Ran SQL"],
    ["profile_dataset", "Profiled columns"],
  ]
);
