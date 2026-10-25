/**
 * LLM provider adapters with one conversation interface:
 *
 *   const chat = createConversation({ provider, model, system, tools });
 *   const turn = await chat.send({ text } | { toolResults }, { onText, signal });
 *   // turn = { text, toolCalls: [{ id, name, input }], stopReason }
 *
 * Each conversation keeps its history in the provider's native format so
 * nothing is lost between turns (Anthropic thinking and fallback blocks must
 * be sent back unchanged).
 *
 * Tools are given as { name, description, parameters } with JSON Schema parameters.
 */

const Anthropic = require("@anthropic-ai/sdk").default;

const ANTHROPIC_MAX_TOKENS = 32000;
// Models that accept server-side refusal fallbacks (`fallbacks: "default"`):
// if a safety classifier declines, the API re-runs the request on Anthropic's
// recommended fallback model instead of returning a refusal.
const ANTHROPIC_FALLBACK_MODELS = new Set([
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_JSON_RETRIES = 2;

class AbortedError extends Error {
  constructor() {
    super("Stopped");
    this.name = "AbortedError";
  }
}

class RefusalError extends Error {
  constructor(category) {
    super(
      `The model declined this request${category ? ` (${category})` : ""}. ` +
        "Start a new chat and rephrase, or try a different model."
    );
    this.name = "RefusalError";
  }
}

// ---------------------------------------------------------------------------
// Anthropic (official SDK)
// ---------------------------------------------------------------------------

function anthropicClient(provider) {
  return new Anthropic({
    apiKey: provider.apiKey,
    ...(provider.baseURL ? { baseURL: provider.baseURL } : {}),
    maxRetries: 2,
  });
}

function describeAnthropicError(error) {
  if (error instanceof Anthropic.APIUserAbortError) return new AbortedError();
  if (error instanceof Anthropic.AuthenticationError) return new Error("Anthropic rejected the API key. Check it in AI Settings.");
  if (error instanceof Anthropic.PermissionDeniedError) return new Error(`Anthropic denied access: ${error.message}`);
  if (error instanceof Anthropic.NotFoundError) return new Error(`Model or endpoint not found: ${error.message}`);
  if (error instanceof Anthropic.RateLimitError) return new Error("Rate limited by Anthropic. Wait a moment and try again.");
  if (error instanceof Anthropic.BadRequestError) return new Error(`Anthropic rejected the request: ${error.message}`);
  if (error instanceof Anthropic.APIConnectionError) return new Error("Could not reach Anthropic. Check your network connection.");
  if (error instanceof Anthropic.APIError) return new Error(`Anthropic API error ${error.status ?? ""}: ${error.message}`);
  return error;
}

class AnthropicConversation {
  constructor({ provider, model, system, tools }) {
    this.client = anthropicClient(provider);
    this.model = model;
    this.system = system;
    // Eager input streaming isn't accepted by every proxy, so only use it on the direct API.
    const eager = !provider.baseURL;
    this.useFallbacks = !provider.baseURL && ANTHROPIC_FALLBACK_MODELS.has(model.id);
    this.tools = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
      ...(eager ? { eager_input_streaming: true } : {}),
    }));
    this.messages = [];
  }

  async send(input, { onText, signal } = {}) {
    this.messages.push({
      role: "user",
      content: input.toolResults
        ? input.toolResults.map((result) => ({
            type: "tool_result",
            tool_use_id: result.id,
            content: result.content,
            ...(result.isError ? { is_error: true } : {}),
          }))
        : input.text,
    });

    const params = {
      model: this.model.id,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: this.system,
      ...(this.tools.length > 0 ? { tools: this.tools } : {}),
      messages: this.messages,
      // The system prompt and tools are identical every turn, so cache the prefix.
      cache_control: { type: "ephemeral" },
      ...(this.model.effort ? { output_config: { effort: this.model.effort } } : {}),
      ...(this.useFallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" } : {}),
    };

    let message;
    for (let attempt = 0; ; attempt++) {
      const stream = this.useFallbacks
        ? this.client.beta.messages.stream(params, { signal })
        : this.client.messages.stream(params, { signal });
      if (onText) stream.on("text", onText);
      try {
        message = await stream.finalMessage();
        break;
      } catch (error) {
        // With eager input streaming, an unparseable tool input rejects with a
        // non-API error; re-issue the turn. API errors are not retried here.
        if (error instanceof Anthropic.APIError || signal?.aborted || attempt >= MAX_JSON_RETRIES) {
          throw describeAnthropicError(error);
        }
      }
    }

    if (message.stop_reason === "refusal") {
      // A refusal can cut a tool call off mid-input; never run that turn's tools.
      throw new RefusalError(message.stop_details?.category);
    }

    const toolCalls = message.content
      .filter((block) => block.type === "tool_use")
      .map((block) => ({ id: block.id, name: block.name, input: block.input }));

    if (message.stop_reason === "max_tokens" && toolCalls.length > 0) {
      throw new Error("The model's response was cut off before it finished a tool call.");
    }

    // Append the full content, including thinking and fallback blocks.
    this.messages.push({ role: "assistant", content: message.content });

    return {
      text: message.content.filter((block) => block.type === "text").map((block) => block.text).join(""),
      toolCalls,
      stopReason: message.stop_reason,
      servedBy: message.model,
    };
  }
}

async function listAnthropicModels(provider) {
  const ids = [];
  for await (const model of anthropicClient(provider).models.list({ limit: 100 })) {
    ids.push(model.id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// OpenAI-compatible Chat Completions (OpenAI, Gemini, Ollama, OpenRouter, ...)
// ---------------------------------------------------------------------------

function openAIHeaders(provider) {
  return {
    "Content-Type": "application/json",
    ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
    // OpenRouter uses these to attribute traffic; other servers ignore them.
    "HTTP-Referer": "https://github.com/kirtijha/datafox",
    "X-Title": "DataFox",
  };
}

async function openAIError(response) {
  let detail = "";
  try {
    const body = await response.json();
    detail = body.error?.message || body.message || JSON.stringify(body);
  } catch {
    detail = response.statusText;
  }
  if (response.status === 401 || response.status === 403) {
    return new Error(`The provider rejected the API key (${response.status}): ${detail}`);
  }
  if (response.status === 429) return new Error(`Rate limited by the provider: ${detail}`);
  return new Error(`Provider error ${response.status}: ${detail}`);
}

async function openAIFetch(provider, pathname, init) {
  if (!provider.baseURL) throw new Error("This provider needs a base URL.");
  try {
    return await fetch(`${provider.baseURL}${pathname}`, init);
  } catch (error) {
    if (error.name === "AbortError") throw new AbortedError();
    throw new Error(`Could not reach ${provider.baseURL}: ${error.cause?.code || error.message}`);
  }
}

function parseArguments(raw) {
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // Reported back to the model as a tool error by the executor.
    return { __invalidArguments: raw };
  }
}

class OpenAIConversation {
  constructor({ provider, model, system, tools }) {
    this.provider = provider;
    this.model = model;
    this.tools = tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }));
    this.messages = [{ role: "system", content: system }];
  }

  async send(input, { onText, signal } = {}) {
    if (input.toolResults) {
      for (const result of input.toolResults) {
        this.messages.push({ role: "tool", tool_call_id: result.id, content: result.content });
      }
    } else {
      this.messages.push({ role: "user", content: input.text });
    }

    const response = await openAIFetch(this.provider, "/chat/completions", {
      method: "POST",
      headers: openAIHeaders(this.provider),
      body: JSON.stringify({
        model: this.model.id,
        messages: this.messages,
        ...(this.tools.length > 0 ? { tools: this.tools } : {}),
        stream: true,
      }),
      signal,
    });
    if (!response.ok) throw await openAIError(response);

    let text = "";
    let finishReason = null;
    const calls = [];

    const absorb = (choice) => {
      const delta = choice.delta || choice.message || {};
      if (delta.content) {
        text += delta.content;
        onText?.(delta.content);
      }
      for (const [i, call] of (delta.tool_calls || []).entries()) {
        const index = call.index ?? i;
        calls[index] ||= { id: "", name: "", arguments: "" };
        if (call.id) calls[index].id = call.id;
        if (call.function?.name) calls[index].name += call.function.name;
        if (call.function?.arguments) {
          calls[index].arguments +=
            typeof call.function.arguments === "string"
              ? call.function.arguments
              : JSON.stringify(call.function.arguments);
        }
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    };

    try {
      if ((response.headers.get("content-type") || "").includes("application/json")) {
        // Some servers ignore `stream: true`.
        const body = await response.json();
        absorb(body.choices?.[0] || {});
      } else {
        const decoder = new TextDecoder();
        let buffer = "";
        for await (const chunk of response.body) {
          buffer += decoder.decode(chunk, { stream: true });
          let newline;
          while ((newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") continue;
            const event = JSON.parse(data);
            if (event.error) throw new Error(`Provider error: ${event.error.message || JSON.stringify(event.error)}`);
            for (const choice of event.choices || []) absorb(choice);
          }
        }
      }
    } catch (error) {
      if (error.name === "AbortError" || signal?.aborted) throw new AbortedError();
      throw error;
    }

    const toolCalls = calls.filter(Boolean).map((call, i) => ({
      id: call.id || `call_${Date.now()}_${i}`,
      name: call.name,
      input: parseArguments(call.arguments),
      rawArguments: call.arguments,
    }));

    this.messages.push({
      role: "assistant",
      content: text || null,
      ...(toolCalls.length > 0
        ? {
            tool_calls: toolCalls.map((call) => ({
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: call.rawArguments || "{}" },
            })),
          }
        : {}),
    });

    return {
      text,
      toolCalls: toolCalls.map(({ rawArguments, ...call }) => call),
      stopReason: finishReason,
      servedBy: this.model.id,
    };
  }
}

async function listOpenAIModels(provider) {
  const response = await openAIFetch(provider, "/models", { headers: openAIHeaders(provider) });
  if (!response.ok) throw await openAIError(response);
  const body = await response.json();
  return (body.data || body.models || [])
    .map((model) => (model.id || model.name || "").replace(/^models\//, ""))
    .filter(Boolean)
    .sort();
}

// ---------------------------------------------------------------------------

function createConversation(options) {
  return options.provider.type === "anthropic"
    ? new AnthropicConversation(options)
    : new OpenAIConversation(options);
}

function listModels(provider) {
  return provider.type === "anthropic" ? listAnthropicModels(provider) : listOpenAIModels(provider);
}

module.exports = { createConversation, listModels, AbortedError, RefusalError };
