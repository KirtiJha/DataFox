import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  XMarkIcon,
  CircleStackIcon,
  PlayIcon,
  StopIcon,
  ArrowDownTrayIcon,
  TableCellsIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

const ROW_LIMITS = [100, 1000, 10000];
const NUMERIC_TYPE = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|FLOAT|DOUBLE|DECIMAL|REAL)/;

const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${units[i]}`;
};

const formatCell = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

// Profile statistics come back as strings; trim long decimals like 186.70408163265307.
const formatStat = (value) =>
  typeof value === "string" && /^-?\d+\.\d{5,}$/.test(value)
    ? String(parseFloat(Number(value).toFixed(4)))
    : value;

const quoteIdentifier = (name) =>
  /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;

/**
 * SQL workbench over a remote file or folder. The dataset is exposed as a
 * view named `data`; queries run in the main process via DuckDB.
 */
const QueryWorkbench = ({ target, onClose }) => {
  const [session, setSession] = useState(null);
  const [openError, setOpenError] = useState(null);
  const [openProgress, setOpenProgress] = useState(null);
  const [sql, setSql] = useState("");
  const [rowLimit, setRowLimit] = useState(1000);
  const [result, setResult] = useState(null);
  const [queryError, setQueryError] = useState(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState("results");
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const editorRef = useRef(null);
  const sessionRef = useRef(null);

  const api = typeof window !== "undefined" ? window.electronAPI : null;

  const runQuery = useCallback(
    async (text = sql, activeSession = session) => {
      if (!activeSession || !text.trim()) return;
      setRunning(true);
      setQueryError(null);
      const response = await api.queryRun(activeSession.sessionId, text, rowLimit);
      setRunning(false);
      if (response.success) {
        setResult(response.data);
        setTab("results");
      } else {
        setQueryError(response.error);
      }
    },
    [api, sql, session, rowLimit]
  );

  // Open the dataset (downloads into the local cache) and run the default query.
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    const unsubscribe = api.onQueryProgress((progress) => setOpenProgress(progress));

    api.queryOpen({ path: target.path, isDirectory: !!target.isDirectory }).then((response) => {
      if (cancelled) {
        if (response.success) api.queryClose(response.data.sessionId);
        return;
      }
      setOpenProgress(null);
      if (!response.success) {
        setOpenError(response.error);
        return;
      }
      sessionRef.current = response.data;
      setSession(response.data);
      // Opened from the assistant: start with the query it ran.
      const initialSql = target.sql || response.data.defaultQuery;
      setSql(initialSql);
      runQuery(initialSql, response.data);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      if (sessionRef.current) api.queryClose(sessionRef.current.sessionId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.path, target.isDirectory]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, running]);

  const loadProfile = async () => {
    setTab("profile");
    if (profile || profileLoading || !session) return;
    setProfileLoading(true);
    const response = await api.queryProfile(session.sessionId);
    setProfileLoading(false);
    if (response.success) setProfile(response.data);
    else toast.error(`Profiling failed: ${response.error}`);
  };

  const cancelQuery = () => {
    if (session) api.queryCancel(session.sessionId);
  };

  const exportResult = async (format) => {
    setShowExport(false);
    const baseName = (session?.name || "query-result").replace(/\.[^.]+$/, "");
    const response = await api.queryExport(session.sessionId, sql, format, `${baseName}-query`);
    if (response.success) toast.success(`Exported to ${response.data.filePath}`);
    else if (!response.canceled) toast.error(`Export failed: ${response.error}`);
  };

  const insertAtCursor = (text) => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const next = sql.slice(0, start) + text + sql.slice(end);
    setSql(next);
    requestAnimationFrame(() => {
      editor.focus();
      editor.selectionStart = editor.selectionEnd = start + text.length;
    });
  };

  const onEditorKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      runQuery();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={() => !running && onClose()}
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.97, opacity: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full h-full max-w-7xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <CircleStackIcon className="w-5 h-5 text-purple-500" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900 dark:text-white truncate">
              {target.name || target.path}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{target.path}</p>
          </div>
          {session && (
            <div className="hidden md:flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-medium">
                {session.format.toUpperCase()}
              </span>
              <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {session.fileCount} file{session.fileCount === 1 ? "" : "s"} · {formatBytes(session.totalBytes)}
              </span>
              <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {session.columns.length} columns
              </span>
            </div>
          )}
          <button
            onClick={onClose}
            disabled={running}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
            title="Close (Esc)"
          >
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {!session ? (
          <div className="flex-1 flex items-center justify-center p-8">
            {openError ? (
              <div className="max-w-md text-center">
                <ExclamationTriangleIcon className="w-10 h-10 text-red-500 mx-auto mb-3" />
                <p className="font-medium text-gray-900 dark:text-white mb-1">Can't open this dataset</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{openError}</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent mx-auto mb-3" />
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {openProgress
                    ? `Fetching files ${openProgress.current}/${openProgress.total} · ${openProgress.fileName}`
                    : "Preparing dataset…"}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* Columns sidebar */}
            <aside className="w-56 shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto hidden lg:block">
              <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                data
              </div>
              {session.columns.map((column) => (
                <button
                  key={column.name}
                  onClick={() => insertAtCursor(quoteIdentifier(column.name))}
                  className="w-full text-left px-4 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 group"
                  title="Insert into query"
                >
                  <div className="text-sm text-gray-800 dark:text-gray-200 truncate">{column.name}</div>
                  <div className="text-xs text-gray-400 truncate font-mono">{column.type}</div>
                </button>
              ))}
              {session.skippedFiles > 0 && (
                <p className="px-4 py-3 text-xs text-gray-400">
                  {session.skippedFiles} file{session.skippedFiles === 1 ? "" : "s"} in other formats skipped.
                </p>
              )}
            </aside>

            <div className="flex-1 flex flex-col min-w-0">
              {/* Editor */}
              <div className="border-b border-gray-200 dark:border-gray-700">
                <textarea
                  ref={editorRef}
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  onKeyDown={onEditorKeyDown}
                  spellCheck={false}
                  rows={6}
                  className="w-full resize-y px-4 py-3 font-mono text-sm bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none border-0"
                  placeholder="SELECT * FROM data LIMIT 100"
                />
                <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800">
                  {running ? (
                    <button onClick={cancelQuery} className="btn btn-sm flex items-center gap-1 bg-red-600 text-white hover:bg-red-700">
                      <StopIcon className="w-4 h-4" /> Cancel
                    </button>
                  ) : (
                    <button onClick={() => runQuery()} className="btn btn-primary btn-sm flex items-center gap-1">
                      <PlayIcon className="w-4 h-4" /> Run
                    </button>
                  )}
                  <span className="text-xs text-gray-400 hidden sm:inline">⌘/Ctrl + Enter</span>
                  <div className="flex-1" />
                  <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    Show
                    <select
                      value={rowLimit}
                      onChange={(e) => setRowLimit(Number(e.target.value))}
                      className="text-xs rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700 py-0.5"
                    >
                      {ROW_LIMITS.map((limit) => (
                        <option key={limit} value={limit}>{limit.toLocaleString()} rows</option>
                      ))}
                    </select>
                  </label>
                  <div className="relative">
                    <button
                      onClick={() => setShowExport((v) => !v)}
                      disabled={running}
                      className="btn btn-sm flex items-center gap-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      title="Export the full result, not just the rows shown"
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" /> Export
                    </button>
                    {showExport && (
                      <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 py-1">
                        {["csv", "parquet", "json"].map((format) => (
                          <button
                            key={format}
                            onClick={() => exportResult(format)}
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                          >
                            {format.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 px-4 border-b border-gray-200 dark:border-gray-700">
                {[
                  { id: "results", label: "Results", icon: TableCellsIcon, onClick: () => setTab("results") },
                  { id: "profile", label: "Column profile", icon: ChartBarIcon, onClick: loadProfile },
                ].map(({ id, label, icon: Icon, onClick }) => (
                  <button
                    key={id}
                    onClick={onClick}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px ${
                      tab === id
                        ? "border-purple-500 text-purple-600 dark:text-purple-400"
                        : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
                <div className="flex-1" />
                {tab === "results" && result && !queryError && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {result.rows.length.toLocaleString()}
                    {result.truncated ? "+" : ""} row{result.rows.length === 1 ? "" : "s"} · {result.elapsedMs} ms
                  </span>
                )}
              </div>

              {/* Output */}
              <div className="flex-1 overflow-auto min-h-0">
                {tab === "results" ? (
                  queryError ? (
                    <pre className="m-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm whitespace-pre-wrap font-mono">
                      {queryError}
                    </pre>
                  ) : running && !result ? (
                    <p className="p-4 text-sm text-gray-500">Running…</p>
                  ) : result ? (
                    <ResultsGrid result={result} />
                  ) : null
                ) : (
                  <ProfileTable profile={profile} loading={profileLoading} />
                )}
              </div>
              {tab === "results" && result?.truncated && !queryError && (
                <div className="px-4 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
                  Showing the first {result.rows.length.toLocaleString()} rows. Export to get the full result.
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

const ResultsGrid = ({ result }) => {
  if (result.columns.length === 0) {
    return <p className="p-4 text-sm text-gray-500">Statement executed.</p>;
  }
  return (
    <table className="min-w-full text-sm border-collapse">
      <thead className="sticky top-0 bg-gray-100 dark:bg-gray-700 z-[1]">
        <tr>
          <th className="px-3 py-2 text-right text-xs font-normal text-gray-400 w-12">#</th>
          {result.columns.map((column) => (
            <th key={column.name} className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
              {column.name}
              <span className="ml-1.5 text-xs font-normal font-mono text-gray-400">{column.type}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.map((row, i) => (
          <tr key={i} className="border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-700/30">
            <td className="px-3 py-1.5 text-right text-xs text-gray-400 tabular-nums">{i + 1}</td>
            {result.columns.map((column) => {
              const value = formatCell(row[column.name]);
              const numeric = NUMERIC_TYPE.test(column.type);
              return (
                <td
                  key={column.name}
                  className={`px-3 py-1.5 max-w-xs truncate text-gray-800 dark:text-gray-200 ${numeric ? "text-right tabular-nums font-mono" : ""}`}
                  title={value ?? "NULL"}
                >
                  {value === null ? <span className="text-gray-400 italic">NULL</span> : value}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const ProfileTable = ({ profile, loading }) => {
  if (loading || !profile) {
    return <p className="p-4 text-sm text-gray-500">Profiling every row of the dataset…</p>;
  }
  return (
    <table className="min-w-full text-sm border-collapse">
      <thead className="sticky top-0 bg-gray-100 dark:bg-gray-700">
        <tr className="text-left text-gray-700 dark:text-gray-200">
          {["Column", "Type", "Nulls", "Distinct (≈)", "Min", "Max", "Mean", "Median"].map((heading) => (
            <th key={heading} className="px-3 py-2 font-medium whitespace-nowrap">{heading}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {profile.map((column) => (
          <tr key={column.name} className="border-b border-gray-100 dark:border-gray-700/60">
            <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{column.name}</td>
            <td className="px-3 py-2 font-mono text-xs text-gray-500">{column.type}</td>
            <td className="px-3 py-2 w-40">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                  <div
                    className={`h-full ${column.nullPercentage > 20 ? "bg-amber-500" : "bg-purple-500"}`}
                    style={{ width: `${Math.min(100, column.nullPercentage || 0)}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-gray-600 dark:text-gray-300 w-12 text-right">
                  {column.nullPercentage ?? 0}%
                </span>
              </div>
            </td>
            <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
              {column.approxUnique?.toLocaleString() ?? "–"}
            </td>
            {[column.min, column.max, column.avg, column.q50].map(formatStat).map((value, i) => (
              <td key={i} className="px-3 py-2 max-w-[12rem] truncate font-mono text-xs text-gray-700 dark:text-gray-300" title={value ?? ""}>
                {value ?? <span className="text-gray-400">–</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default QueryWorkbench;
