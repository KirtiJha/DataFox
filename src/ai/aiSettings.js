/**
 * AI provider settings: configured providers and models, the default model,
 * and which connections the user has allowed the assistant to read.
 *
 * API keys are encrypted at rest with the OS keychain and never leave the main
 * process; the renderer only sees whether a key is set.
 */

const crypto = require("crypto");
const path = require("path");
const fs = require("fs-extra");
const { app } = require("electron");
const { encryptSecret, decryptSecret } = require("../secrets");

// Two adapters cover everything: Anthropic's API, and the OpenAI-compatible
// Chat Completions API that OpenAI, Gemini, Ollama, OpenRouter, Groq, LM
// Studio and many gateways implement.
const PRESETS = [
  {
    preset: "anthropic",
    type: "anthropic",
    name: "Anthropic (Claude)",
    baseURL: "",
    requiresKey: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    suggestedModels: [
      { id: "claude-opus-5-5", effort: "medium" },
      { id: "claude-sonnet-5-5", effort: "medium" },
      { id: "claude-haiku-5-5", effort: "medium" },
    ],
  },
  { preset: "openai", type: "openai", name: "OpenAI", baseURL: "https://api.openai.com/v1", requiresKey: true, keyUrl: "https://platform.openai.com/api-keys" },
  { preset: "gemini", type: "openai", name: "Google Gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", requiresKey: true, keyUrl: "https://aistudio.google.com/apikey" },
  { preset: "openrouter", type: "openai", name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", requiresKey: true, keyUrl: "https://openrouter.ai/keys" },
  { preset: "groq", type: "openai", name: "Groq", baseURL: "https://api.groq.com/openai/v1", requiresKey: true, keyUrl: "https://console.groq.com/keys" },
  { preset: "ollama", type: "openai", name: "Ollama (local)", baseURL: "http://localhost:11434/v1", requiresKey: false },
  { preset: "lmstudio", type: "openai", name: "LM Studio (local)", baseURL: "http://localhost:1234/v1", requiresKey: false },
  { preset: "custom", type: "openai", name: "Custom (OpenAI-compatible)", baseURL: "", requiresKey: false },
];

const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];

class AISettings {
  constructor() {
    this.file = path.join(app.getPath("userData"), "ai-settings.json");
    this.settings = { providers: [], defaultModel: null, enabledConnections: {} };
    this.ready = app.whenReady().then(() => this.load());
  }

  async load() {
    try {
      if (await fs.pathExists(this.file)) {
        const stored = await fs.readJson(this.file);
        this.settings = {
          providers: (stored.providers || []).map((p) => ({ ...p, apiKey: decryptSecret(p.apiKey) || "" })),
          defaultModel: stored.defaultModel || null,
          enabledConnections: stored.enabledConnections || {},
        };
      }
    } catch (error) {
      console.error("Failed to load AI settings:", error);
    }
  }

  async persist() {
    const stored = {
      version: 1,
      ...this.settings,
      providers: this.settings.providers.map((p) => ({ ...p, apiKey: encryptSecret(p.apiKey) })),
    };
    await fs.ensureDir(path.dirname(this.file));
    await fs.writeJson(this.file, stored, { spaces: 2 });
  }

  /** Settings safe to hand to the renderer: keys replaced by a flag. */
  async getPublic() {
    await this.ready;
    return {
      presets: PRESETS,
      effortLevels: EFFORT_LEVELS,
      providers: this.settings.providers.map(({ apiKey, ...rest }) => ({ ...rest, hasApiKey: !!apiKey })),
      defaultModel: this.settings.defaultModel,
      enabledConnections: this.settings.enabledConnections,
    };
  }

  /**
   * Replace providers and the default model. A provider's `apiKey` is only
   * changed when the renderer sends a string ('' clears it); otherwise the
   * stored key is kept.
   */
  async save({ providers, defaultModel }) {
    await this.ready;
    const existing = new Map(this.settings.providers.map((p) => [p.id, p]));
    this.settings.providers = providers.map((p) => {
      const previous = existing.get(p.id);
      const { hasApiKey, ...rest } = p;
      return {
        ...rest,
        id: p.id || crypto.randomUUID(),
        name: (p.name || "").trim() || "Provider",
        baseURL: (p.baseURL || "").trim().replace(/\/+$/, ""),
        apiKey: typeof p.apiKey === "string" ? p.apiKey.trim() : previous?.apiKey || "",
        models: (p.models || [])
          .filter((m) => m.id && m.id.trim())
          .map((m) => ({
            id: m.id.trim(),
            ...(m.effort && EFFORT_LEVELS.includes(m.effort) ? { effort: m.effort } : {}),
          })),
      };
    });

    const valid = (ref) =>
      ref && this.settings.providers.some((p) => p.id === ref.providerId && p.models.some((m) => m.id === ref.modelId));
    this.settings.defaultModel = valid(defaultModel) ? defaultModel : this.firstModel();
    await this.persist();
    return this.getPublic();
  }

  firstModel() {
    for (const provider of this.settings.providers) {
      if (provider.models.length > 0) return { providerId: provider.id, modelId: provider.models[0].id };
    }
    return null;
  }

  async setConnectionEnabled(connectionId, enabled) {
    await this.ready;
    if (enabled) this.settings.enabledConnections[connectionId] = true;
    else delete this.settings.enabledConnections[connectionId];
    await this.persist();
    return this.getPublic();
  }

  /** Full provider (with key) and model config for the main process only. */
  async resolve(modelRef) {
    await this.ready;
    const ref = modelRef || this.settings.defaultModel;
    const provider = ref && this.settings.providers.find((p) => p.id === ref.providerId);
    const model = provider?.models.find((m) => m.id === ref.modelId);
    if (!provider || !model) {
      throw new Error("No AI model is configured. Add a provider in AI Settings.");
    }
    return { provider, model };
  }

  /** Provider config for listing models or testing: a saved provider, or an unsaved draft. */
  async providerForRequest(draft) {
    await this.ready;
    const saved = draft.id && this.settings.providers.find((p) => p.id === draft.id);
    return {
      ...saved,
      ...draft,
      baseURL: (draft.baseURL ?? saved?.baseURL ?? "").trim().replace(/\/+$/, ""),
      apiKey: typeof draft.apiKey === "string" ? draft.apiKey.trim() : saved?.apiKey || "",
    };
  }
}

module.exports = { AISettings, PRESETS };
