import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  SparklesIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  StopIcon,
  PlusIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleStackIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import Markdown from "./Markdown";
import { DataAgent, ASSISTANT_TOOL_NAMES } from "../utils/assistant/dataAgent";
import { connectionIdFor, getSearchEngine } from "../utils/searchEngineRegistry";

const SUGGESTIONS = [
  "What data is on this server?",
  "Which files have an email column?",
  "Summarize the largest dataset in this folder",
  "Are there columns with many missing values?",
];

const modelKey = (ref) => (ref ? `${ref.providerId}::${ref.modelId}` : "");

/**
 * Side panel for the "Ask your data" assistant.
 */
const AssistantPanel = ({ connectionInfo, currentPath, onClose, onOpenSettings, onOpenInWorkbench, settingsVersion }) => {
  const api = typeof window !== "undefined" ? window.electronAPI : null;
  const [settings, setSettings] = useState(null);
  const [modelRef, setModelRef] = useState(null);
  const [items, setItems] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const agentRef = useRef(null);
  const streamingRef = useRef(null); // index of the assistant item receiving deltas
  const scrollRef = useRef(null);

  const connectionId = connectionIdFor(connectionInfo);
  const enabled = !!settings?.enabledConnections?.[connectionId];
  const models = (settings?.providers || []).flatMap((provider) =>
    provider.models.map((model) => ({ providerId: provider.id, modelId: model.id, label: `${model.id} · ${provider.name}` }))
  );

  useEffect(() => {
    api.aiSettingsGet().then((response) => {
      if (!response.success) return;
      setSettings(response.data);
      setModelRef((current) => {
        const stillValid = response.data.providers.some(
          (p) => p.id === current?.providerId && p.models.some((m) => m.id === current?.modelId)
        );
        return stillValid ? current : response.data.defaultModel;
      });
    });
  }, [api, settingsVersion]);

  // Stream assistant text into the item currently being written.
  useEffect(() => {
    return api.onAiDelta(({ chatId, text }) => {
      if (chatId !== agentRef.current?.chatId || streamingRef.current === null) return;
      const index = streamingRef.current;
      setItems((prev) => {
        const next = [...prev];
        if (next[index]) next[index] = { ...next[index], text: next[index].text + text };
        return next;
      });
    });
  }, [api]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [items]);

  const resetChat = useCallback(async () => {
    const agent = agentRef.current;
    agentRef.current = null;
    streamingRef.current = null;
    setItems([]);
    setBusy(false);
    if (agent) await agent.close();
  }, []);

  // A new connection or model means a new conversation.
  useEffect(() => {
    resetChat();
  }, [connectionId, modelKey(modelRef), resetChat]);

  useEffect(() => () => agentRef.current?.close(), []);

  const handleEvent = useCallback((event) => {
    setItems((prev) => {
      const next = [...prev];
      switch (event.type) {
        case "assistant-start":
          next.push({ kind: "assistant", text: "" });
          streamingRef.current = next.length - 1;
          break;
        case "assistant-end": {
          const index = streamingRef.current;
          streamingRef.current = null;
          if (index !== null && next[index]) {
            const text = event.text || next[index].text;
            if (text.trim()) next[index] = { ...next[index], text, done: true };
            else next.splice(index, 1);
          }
          break;
        }
        case "tool-start":
          next.push({ kind: "tool", id: event.id, name: event.name, input: event.input, status: "running" });
          break;
        case "tool-progress": {
          const index = next.findLastIndex((item) => item.kind === "tool" && item.status === "running");
          if (index !== -1) next[index] = { ...next[index], progress: event.text };
          break;
        }
        case "tool-end": {
          const index = next.findIndex((item) => item.kind === "tool" && item.id === event.id);
          if (index !== -1) {
            next[index] = { ...next[index], status: event.ok ? "done" : "error", summary: event.summary, display: event.display, progress: null };
          }
          break;
        }
        default:
          break;
      }
      return next;
    });
  }, []);

  const send = async (text) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    setItems((prev) => [...prev, { kind: "user", text: question }]);
    setBusy(true);

    try {
      if (!agentRef.current) {
        const agent = new DataAgent({
          api,
          searchEngine: getSearchEngine(connectionInfo),
          connectionInfo,
          modelRef,
          onEvent: handleEvent,
        });
        await agent.start();
        agentRef.current = agent;
      }
      const result = await agentRef.current.ask(question, currentPath);
      if (result.stopped) setItems((prev) => [...prev, { kind: "notice", text: "Stopped." }]);
    } catch (error) {
      setItems((prev) => [...prev, { kind: "error", text: error.message }]);
      if (error.ended) {
        await agentRef.current?.close();
        agentRef.current = null;
      }
    } finally {
      setBusy(false);
      streamingRef.current = null;
    }
  };

  const enableConnection = async () => {
    const response = await api.aiSetConnectionEnabled(connectionId, true);
    if (response.success) setSettings(response.data);
  };

  const onKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send(input);
    }
  };

  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      className="w-[420px] shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col min-h-0"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <SparklesIcon className="w-5 h-5 text-purple-500" />
        <h3 className="font-semibold text-gray-900 dark:text-white flex-1">Ask your data</h3>
        {items.length > 0 && (
          <button onClick={resetChat} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700" title="New chat">
            <PlusIcon className="w-4 h-4 text-gray-500" />
          </button>
        )}
        <button onClick={onOpenSettings} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700" title="AI settings">
          <Cog6ToothIcon className="w-4 h-4 text-gray-500" />
        </button>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700" title="Close">
          <XMarkIcon className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {!settings ? null : models.length === 0 ? (
        <EmptyState
          icon={SparklesIcon}
          title="Connect an AI provider"
          text="Use Claude, OpenAI, Gemini, a local Ollama model, or any OpenAI-compatible service."
          action="Open AI settings"
          onAction={onOpenSettings}
        />
      ) : !enabled ? (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-900/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheckIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <p className="font-medium text-gray-900 dark:text-white">Allow the assistant on this connection?</p>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              The assistant answers questions by searching and querying your files. To do that it sends the
              following to your AI provider:
            </p>
            <ul className="text-sm text-gray-700 dark:text-gray-200 space-y-1 mb-3 list-disc pl-5">
              <li>File and folder names and paths</li>
              <li>Column names and types</li>
              <li>Results of the queries it runs (up to 50 rows each)</li>
            </ul>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Whole files are never uploaded. Queries run locally in a sandbox that can only read DataFox's query
              cache. You can turn this off in AI settings.
            </p>
            <button onClick={enableConnection} className="btn btn-primary btn-sm w-full">
              Allow for {connectionInfo?.bucket || connectionInfo?.host}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Model picker */}
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
            <select
              value={modelKey(modelRef)}
              onChange={(e) => {
                const [providerId, modelId] = e.target.value.split("::");
                setModelRef({ providerId, modelId });
              }}
              disabled={busy}
              className="w-full text-xs rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 py-1"
            >
              {models.map((m) => (
                <option key={modelKey(m)} value={modelKey(m)}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Conversation */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {items.length === 0 && (
              <div className="pt-6">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  Ask about the files on this connection. The assistant finds the right files, writes SQL, runs it, and
                  explains the result.
                </p>
                <div className="space-y-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => send(suggestion)}
                      className="w-full text-left text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 text-gray-700 dark:text-gray-200"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {items.map((item, index) => (
              <ConversationItem key={index} item={item} onOpenInWorkbench={onOpenInWorkbench} />
            ))}
            {busy && streamingRef.current === null && !items.some((i) => i.kind === "tool" && i.status === "running") && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="animate-pulse">●</span> Thinking…
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-end gap-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 focus-within:ring-2 focus-within:ring-purple-500/40">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={Math.min(5, Math.max(1, input.split("\n").length))}
                placeholder="Ask a question about your data…"
                className="flex-1 resize-none bg-transparent border-0 p-0 text-sm focus:ring-0 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
              {busy ? (
                <button onClick={() => agentRef.current?.stop()} className="p-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white" title="Stop">
                  <StopIcon className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim()}
                  className="p-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white"
                  title="Send (Enter)"
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">AI answers can be wrong. Check the queries behind them.</p>
          </div>
        </>
      )}
    </motion.aside>
  );
};

const EmptyState = ({ icon: Icon, title, text, action, onAction }) => (
  <div className="flex-1 flex items-center justify-center p-8 text-center">
    <div>
      <Icon className="w-10 h-10 text-purple-400 mx-auto mb-3" />
      <p className="font-medium text-gray-900 dark:text-white mb-1">{title}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{text}</p>
      <button onClick={onAction} className="btn btn-primary btn-sm">{action}</button>
    </div>
  </div>
);

const ConversationItem = ({ item, onOpenInWorkbench }) => {
  const [expanded, setExpanded] = useState(false);

  if (item.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-purple-600 text-white px-3 py-2 text-sm whitespace-pre-wrap">
          {item.text}
        </div>
      </div>
    );
  }

  if (item.kind === "assistant") {
    return (
      <div className="text-gray-800 dark:text-gray-100">
        <Markdown text={item.text} />
      </div>
    );
  }

  if (item.kind === "error" || item.kind === "notice") {
    return (
      <div
        className={`flex items-start gap-2 text-sm rounded-lg px-3 py-2 ${
          item.kind === "error"
            ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
            : "bg-gray-50 dark:bg-gray-700/40 text-gray-500"
        }`}
      >
        {item.kind === "error" && <ExclamationTriangleIcon className="w-4 h-4 mt-0.5 shrink-0" />}
        <span>{item.text}</span>
      </div>
    );
  }

  // Tool activity
  const label = ASSISTANT_TOOL_NAMES[item.name] || item.name;
  const target = item.input?.path || item.input?.query;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 text-xs overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/40 text-left"
      >
        {item.status === "running" ? (
          <span className="w-3.5 h-3.5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin shrink-0" />
        ) : item.status === "error" ? (
          <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        ) : (
          <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 shrink-0" />
        )}
        <span className="font-medium text-gray-700 dark:text-gray-200">{label}</span>
        {target && <span className="font-mono text-gray-500 truncate">{target}</span>}
        <span className="ml-auto text-gray-400 shrink-0">{item.progress || item.summary}</span>
        {expanded ? <ChevronDownIcon className="w-3 h-3 text-gray-400" /> : <ChevronRightIcon className="w-3 h-3 text-gray-400" />}
      </button>

      {expanded && item.input?.sql && (
        <pre className="px-3 py-2 bg-gray-50 dark:bg-gray-900 font-mono text-[11px] whitespace-pre-wrap border-t border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
          {item.input.sql}
        </pre>
      )}
      {expanded && item.status === "error" && (
        <p className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 text-amber-700 dark:text-amber-300 whitespace-pre-wrap">
          {item.summary}
        </p>
      )}

      {item.display?.kind === "table" && <ResultTable display={item.display} onOpenInWorkbench={onOpenInWorkbench} />}
    </div>
  );
};

const ResultTable = ({ display, onOpenInWorkbench }) => {
  const rows = display.rows.slice(0, 20);
  const formatCell = (value) =>
    value === null || value === undefined ? "NULL" : typeof value === "object" ? JSON.stringify(value) : String(value);

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      <div className="overflow-x-auto max-h-64">
        <table className="min-w-full">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-700">
            <tr>
              {display.columns.map((column) => (
                <th key={column.name} className="px-2 py-1 text-left font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-t border-gray-100 dark:border-gray-700/60">
                {display.columns.map((column) => (
                  <td key={column.name} className="px-2 py-1 max-w-[10rem] truncate text-gray-700 dark:text-gray-300" title={formatCell(row[column.name])}>
                    {formatCell(row[column.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50/60 dark:bg-gray-800 text-gray-500">
        <span>
          {display.rows.length > rows.length || display.truncated
            ? `Showing ${rows.length} of ${display.rows.length}${display.truncated ? "+" : ""} rows`
            : `${rows.length} row${rows.length === 1 ? "" : "s"}`}
        </span>
        <button
          onClick={() =>
            onOpenInWorkbench({
              path: display.path,
              name: display.path.split("/").pop() || "/",
              isDirectory: display.isDirectory,
              sql: display.sql,
            })
          }
          className="flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:underline"
        >
          <CircleStackIcon className="w-3.5 h-3.5" /> Open in SQL workbench
        </button>
      </div>
    </div>
  );
};

export default AssistantPanel;
