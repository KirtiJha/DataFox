import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  XMarkIcon,
  SparklesIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const modelKey = (ref) => (ref ? `${ref.providerId}::${ref.modelId}` : "");

/**
 * Configure AI providers and models. API keys are sent to the main process
 * and stored encrypted; they are never read back into the UI.
 */
const AISettingsModal = ({ onClose, onSaved }) => {
  const api = typeof window !== "undefined" ? window.electronAPI : null;
  const [presets, setPresets] = useState([]);
  const [effortLevels, setEffortLevels] = useState([]);
  const [providers, setProviders] = useState([]);
  const [defaultModel, setDefaultModel] = useState(null);
  const [enabledConnections, setEnabledConnections] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [showPresets, setShowPresets] = useState(false);
  const [available, setAvailable] = useState({}); // providerId -> fetched model ids
  const [busy, setBusy] = useState(null); // "fetch" | "test:<model>" | "save"

  useEffect(() => {
    api.aiSettingsGet().then((response) => {
      if (!response.success) return;
      const data = response.data;
      setPresets(data.presets);
      setEffortLevels(data.effortLevels);
      setProviders(data.providers);
      setDefaultModel(data.defaultModel);
      setEnabledConnections(data.enabledConnections);
      setSelectedId(data.providers[0]?.id || null);
    });
  }, [api]);

  const selected = providers.find((p) => p.id === selectedId);
  const preset = presets.find((p) => p.preset === selected?.preset);

  const update = (changes) =>
    setProviders((prev) => prev.map((p) => (p.id === selectedId ? { ...p, ...changes } : p)));

  const addProvider = (presetConfig) => {
    const provider = {
      id: newId(),
      preset: presetConfig.preset,
      type: presetConfig.type,
      name: presetConfig.name,
      baseURL: presetConfig.baseURL,
      hasApiKey: false,
      apiKey: "",
      models: (presetConfig.suggestedModels || []).map((m) => ({ ...m })),
    };
    setProviders((prev) => [...prev, provider]);
    setSelectedId(provider.id);
    setShowPresets(false);
  };

  const removeProvider = () => {
    setProviders((prev) => prev.filter((p) => p.id !== selectedId));
    setSelectedId(providers.find((p) => p.id !== selectedId)?.id || null);
  };

  const updateModel = (index, changes) =>
    update({ models: selected.models.map((m, i) => (i === index ? { ...m, ...changes } : m)) });

  const addModel = (id = "") => {
    if (id && selected.models.some((m) => m.id === id)) return;
    update({ models: [...selected.models, { id, ...(selected.type === "anthropic" ? { effort: "medium" } : {}) }] });
  };

  // Only send the key when the user typed one, so a saved key isn't overwritten.
  const requestProvider = (provider) => {
    const { hasApiKey, apiKey, ...rest } = provider;
    return apiKey ? { ...rest, apiKey } : rest;
  };

  const fetchModels = async () => {
    setBusy("fetch");
    const response = await api.aiListModels(requestProvider(selected));
    setBusy(null);
    if (response.success) {
      setAvailable((prev) => ({ ...prev, [selected.id]: response.data }));
      if (response.data.length === 0) toast("The provider returned no models");
    } else {
      toast.error(response.error);
    }
  };

  const testModel = async (modelId) => {
    setBusy(`test:${modelId}`);
    const response = await api.aiTest(requestProvider(selected), modelId);
    setBusy(null);
    if (response.success) toast.success(`${modelId} replied: “${response.data.reply || "(empty)"}”`);
    else toast.error(response.error, { duration: 8000 });
  };

  const save = async () => {
    setBusy("save");
    const response = await api.aiSettingsSave({
      providers: providers.map(requestProvider),
      defaultModel,
    });
    setBusy(null);
    if (response.success) {
      toast.success("AI settings saved");
      onSaved?.();
      onClose();
    } else {
      toast.error(response.error);
    }
  };

  const revokeConnection = async (connectionId) => {
    const response = await api.aiSetConnectionEnabled(connectionId, false);
    if (response.success) setEnabledConnections(response.data.enabledConnections);
  };

  const allModels = providers.flatMap((p) =>
    p.models.filter((m) => m.id.trim()).map((m) => ({ providerId: p.id, modelId: m.id.trim(), label: `${m.id} · ${p.name}` }))
  );
  const inputClass =
    "w-full text-sm rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 focus:ring-purple-500 focus:border-purple-500";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.97, opacity: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <SparklesIcon className="w-5 h-5 text-purple-500" />
          <h2 className="font-semibold text-gray-900 dark:text-white flex-1">AI Settings</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Provider list */}
          <div className="w-60 shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col">
            <div className="flex-1 overflow-y-auto py-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left px-4 py-2 ${
                    p.id === selectedId ? "bg-purple-50 dark:bg-purple-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-700/40"
                  }`}
                >
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {p.models.filter((m) => m.id).length} model{p.models.filter((m) => m.id).length === 1 ? "" : "s"}
                  </div>
                </button>
              ))}
              {providers.length === 0 && (
                <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No providers yet.</p>
              )}
            </div>
            <div className="relative p-3 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setShowPresets((v) => !v)} className="btn btn-primary btn-sm w-full flex items-center justify-center gap-1">
                <PlusIcon className="w-4 h-4" /> Add provider
              </button>
              {showPresets && (
                <div className="absolute bottom-full left-3 right-3 mb-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1 z-10">
                  {presets.map((p) => (
                    <button
                      key={p.preset}
                      onClick={() => addProvider(p)}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Provider form */}
          <div className="flex-1 overflow-y-auto p-5">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-center">
                <div>
                  <SparklesIcon className="w-10 h-10 text-purple-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                    Add a provider to use the assistant. Anthropic, OpenAI, Gemini, OpenRouter, Groq, local Ollama or LM
                    Studio, and any OpenAI-compatible endpoint are supported.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Name</span>
                    <input className={inputClass} value={selected.name} onChange={(e) => update({ name: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      API type
                    </span>
                    <input
                      className={`${inputClass} bg-gray-50 dark:bg-gray-800`}
                      value={selected.type === "anthropic" ? "Anthropic Messages API" : "OpenAI-compatible Chat Completions"}
                      readOnly
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Base URL</span>
                  <input
                    className={inputClass}
                    value={selected.baseURL}
                    placeholder={selected.type === "anthropic" ? "Default (api.anthropic.com)" : "https://…/v1"}
                    onChange={(e) => update({ baseURL: e.target.value })}
                  />
                  {selected.type === "anthropic" && (
                    <span className="text-[11px] text-gray-400">Leave empty unless you use a proxy or gateway.</span>
                  )}
                </label>

                <label className="block">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300 flex items-center gap-1">
                    <KeyIcon className="w-3.5 h-3.5" /> API key {preset && !preset.requiresKey && "(optional)"}
                  </span>
                  <input
                    type="password"
                    className={inputClass}
                    value={selected.apiKey || ""}
                    placeholder={selected.hasApiKey ? "•••••••• saved. Type to replace" : "Paste your API key"}
                    onChange={(e) => update({ apiKey: e.target.value })}
                    autoComplete="off"
                  />
                  <span className="text-[11px] text-gray-400">
                    Stored encrypted with your system keychain.{" "}
                    {preset?.keyUrl && (
                      <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="text-purple-600 dark:text-purple-400 hover:underline">
                        Get a key
                      </a>
                    )}
                  </span>
                </label>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Models</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={fetchModels}
                        disabled={busy === "fetch"}
                        className="text-xs flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50"
                      >
                        <ArrowPathIcon className={`w-3.5 h-3.5 ${busy === "fetch" ? "animate-spin" : ""}`} /> Fetch available
                      </button>
                      <button onClick={() => addModel()} className="text-xs flex items-center gap-1 text-purple-600 dark:text-purple-400 hover:underline">
                        <PlusIcon className="w-3.5 h-3.5" /> Add
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {selected.models.map((model, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          className={`${inputClass} font-mono text-xs flex-1`}
                          value={model.id}
                          placeholder="model id, e.g. claude-opus-5-5"
                          onChange={(e) => updateModel(index, { id: e.target.value })}
                        />
                        {selected.type === "anthropic" && (
                          <select
                            className="text-xs rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                            value={model.effort || ""}
                            onChange={(e) => updateModel(index, { effort: e.target.value || undefined })}
                            title="Effort: how much the model thinks before answering"
                          >
                            <option value="">effort: default</option>
                            {effortLevels.map((level) => (
                              <option key={level} value={level}>effort: {level}</option>
                            ))}
                          </select>
                        )}
                        <button
                          onClick={() => testModel(model.id)}
                          disabled={!model.id || busy === `test:${model.id}`}
                          className="text-xs px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
                        >
                          {busy === `test:${model.id}` ? "Testing…" : "Test"}
                        </button>
                        <button
                          onClick={() => update({ models: selected.models.filter((_, i) => i !== index) })}
                          className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Remove model"
                        >
                          <TrashIcon className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    ))}
                    {selected.models.length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Add a model id, or fetch the provider's list.</p>
                    )}
                  </div>

                  {available[selected.id]?.length > 0 && (
                    <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 p-2 max-h-40 overflow-y-auto">
                      <p className="text-[11px] text-gray-400 px-1 pb-1">Click to add:</p>
                      <div className="flex flex-wrap gap-1">
                        {available[selected.id].map((id) => {
                          const added = selected.models.some((m) => m.id === id);
                          return (
                            <button
                              key={id}
                              onClick={() => addModel(id)}
                              disabled={added}
                              className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                                added
                                  ? "border-green-300 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20"
                                  : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-purple-400"
                              }`}
                            >
                              {added && <CheckCircleIcon className="inline w-3 h-3 mr-0.5" />}
                              {id}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                  <button onClick={removeProvider} className="text-xs text-red-600 hover:underline">
                    Remove this provider
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-3 space-y-3">
          {Object.keys(enabledConnections).length > 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-gray-600 dark:text-gray-300">Assistant allowed on: </span>
              {Object.keys(enabledConnections).map((id) => (
                <span key={id} className="inline-flex items-center gap-1 mr-2 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">
                  {id}
                  <button onClick={() => revokeConnection(id)} title="Revoke" className="hover:text-red-600">
                    <XMarkIcon className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-2 flex-1">
              Default model
              <select
                className="text-xs rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 flex-1 max-w-sm"
                value={modelKey(defaultModel)}
                onChange={(e) => {
                  const [providerId, modelId] = e.target.value.split("::");
                  setDefaultModel({ providerId, modelId });
                }}
              >
                {!defaultModel && <option value="">First configured model</option>}
                {allModels.map((m) => (
                  <option key={modelKey(m)} value={modelKey(m)}>{m.label}</option>
                ))}
              </select>
            </label>
            <button onClick={onClose} className="btn btn-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">
              Cancel
            </button>
            <button onClick={save} disabled={busy === "save"} className="btn btn-primary btn-sm">
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AISettingsModal;
