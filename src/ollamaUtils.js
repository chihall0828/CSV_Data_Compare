const OLLAMA_SETTINGS_KEY = "csv-data-compare-ollama-settings";

// URL.prototype.hostname keeps the brackets for IPv6 literals (e.g. "[::1]").
const ALLOWED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";
export const DEFAULT_OLLAMA_TIMEOUT_SECONDS = 10;
export const MIN_OLLAMA_TIMEOUT_SECONDS = 3;
export const MAX_OLLAMA_TIMEOUT_SECONDS = 60;

export const OLLAMA_MODEL_SUGGESTIONS = ["llama3.2", "gemma3", "qwen3"];

// Strict allowlist: only http://localhost, http://127.0.0.1, or http://[::1]
// (any port), with no embedded credentials. Uses the URL parser rather than
// substring matching so hostnames like "localhost.evil.com" or paths like
// "/localhost" cannot slip through.
export function isLocalOllamaEndpoint(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  if (url.username !== "" || url.password !== "") return false;
  return ALLOWED_HOSTNAMES.has(url.hostname.toLowerCase());
}

export function clampOllamaTimeoutSeconds(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_OLLAMA_TIMEOUT_SECONDS;
  return Math.min(MAX_OLLAMA_TIMEOUT_SECONDS, Math.max(MIN_OLLAMA_TIMEOUT_SECONDS, n));
}

function defaultOllamaSettings() {
  return {
    enabled: false,
    endpoint: DEFAULT_OLLAMA_ENDPOINT,
    model: "",
    timeoutSeconds: DEFAULT_OLLAMA_TIMEOUT_SECONDS
  };
}

// Only these four fields are ever persisted. No fetched model list, no
// export payloads, no generated text, no CSV data.
export function readOllamaSettings() {
  const defaults = defaultOllamaSettings();
  try {
    const raw = window.localStorage.getItem(OLLAMA_SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaults.enabled,
      endpoint: isLocalOllamaEndpoint(parsed.endpoint) ? parsed.endpoint : defaults.endpoint,
      model: typeof parsed.model === "string" ? parsed.model : defaults.model,
      timeoutSeconds: clampOllamaTimeoutSeconds(parsed.timeoutSeconds ?? defaults.timeoutSeconds)
    };
  } catch {
    return defaults;
  }
}

export function writeOllamaSettings(settings) {
  const safe = {
    enabled: Boolean(settings.enabled),
    endpoint: isLocalOllamaEndpoint(settings.endpoint) ? settings.endpoint : DEFAULT_OLLAMA_ENDPOINT,
    model: typeof settings.model === "string" ? settings.model.slice(0, 200) : "",
    timeoutSeconds: clampOllamaTimeoutSeconds(settings.timeoutSeconds)
  };
  try {
    window.localStorage.setItem(OLLAMA_SETTINGS_KEY, JSON.stringify(safe));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) — non-fatal.
  }
  return safe;
}

// System prompt for interpretation generation (Phase L3). Matches the
// template in docs/llm-payload-design.md: interpret the summary only, never
// invent numbers, always disclose this is AI-generated reference material.
export const LLM_SYSTEM_PROMPT =
  "あなたは統計解析の補助者です。与えられた要約統計・検定結果だけに基づいて、" +
  "(1) 結果の読み方 (2) 比較ポイント (3) 注意点 (4) 考察のたたき台 を日本語で簡潔に書いてください。" +
  "数値の捏造をしない・p値だけで断定しない・効果量とサンプルサイズに言及する・" +
  "「これはAI生成の参考情報であり最終判断はユーザーが行う」と末尾に明記する、を必ず守ってください。";

const LLM_ALLOWED_RESULT_TYPES = new Set(["statistics-result", "hypothesis-test-result"]);

// Keys that would indicate raw row data leaking into a payload. Defense in
// depth on top of buildLlmPayload()'s whitelist sanitization: this function
// is the last checkpoint before anything leaves the browser.
const LLM_FORBIDDEN_PAYLOAD_KEYS = new Set([
  "rows", "rawrows", "rawdata", "csv", "rawcsv", "cells", "coordinates", "coords"
]);

const LLM_PAYLOAD_MAX_CHARS = 20000;

// Throws if the payload doesn't look like a buildLlmPayload() output, is
// suspiciously large, or contains any key associated with raw row data.
export function assertLlmPayloadSafe(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("LLM payload must be an object.");
  }
  if (payload.task !== "interpretation" || !Array.isArray(payload.results) || payload.results.length === 0) {
    throw new Error("LLM payload has an unexpected shape.");
  }
  for (const result of payload.results) {
    if (!LLM_ALLOWED_RESULT_TYPES.has(result?.exportType)) {
      throw new Error(`LLM payload contains an unsupported result type: ${String(result?.exportType)}`);
    }
  }
  const serialized = JSON.stringify(payload);
  if (serialized.length > LLM_PAYLOAD_MAX_CHARS) {
    throw new Error("LLM payload is unexpectedly large; refusing to send.");
  }
  (function walk(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, val] of Object.entries(value)) {
      if (LLM_FORBIDDEN_PAYLOAD_KEYS.has(key.toLowerCase())) {
        throw new Error(`LLM payload safety check failed: forbidden key "${key}".`);
      }
      walk(val);
    }
  })(payload);
  return true;
}

// One of only two functions in this module that perform network I/O. Takes
// endpoint/model/timeout plus an already-sanitized buildLlmPayload() output —
// it has no way to accept dataset/rows, and re-validates the payload itself
// (assertLlmPayloadSafe) before ever building the request body.
export async function generateInterpretation(endpoint, model, timeoutSeconds, payload) {
  if (!isLocalOllamaEndpoint(endpoint)) {
    return { ok: false, reason: "invalid_endpoint" };
  }
  if (typeof model !== "string" || model.trim() === "") {
    return { ok: false, reason: "missing_model" };
  }
  try {
    assertLlmPayloadSafe(payload);
  } catch (error) {
    return { ok: false, reason: "unsafe_payload", message: String(error?.message ?? error) };
  }

  const timeoutMs = clampOllamaTimeoutSeconds(timeoutSeconds) * 1000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: LLM_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload, null, 2) }
        ]
      })
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message = typeof errorBody?.error === "string" ? errorBody.error : null;
      return { ok: false, reason: "http_error", status: response.status, message };
    }
    const data = await response.json().catch(() => null);
    const text = data?.message?.content;
    if (typeof text !== "string" || text.trim() === "") {
      return { ok: false, reason: "malformed_response" };
    }
    return { ok: true, text };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

// The only function in this module that performs network I/O for connection
// checks. Takes just an endpoint and a timeout — it cannot accept
// dataset/rows, so summary statistics or raw CSV data can never be routed
// through a connection check.
export async function checkOllamaConnection(endpoint, timeoutSeconds) {
  if (!isLocalOllamaEndpoint(endpoint)) {
    return { ok: false, reason: "invalid_endpoint" };
  }
  const timeoutMs = clampOllamaTimeoutSeconds(timeoutSeconds) * 1000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/tags`, {
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok) {
      return { ok: false, reason: "http_error", status: response.status };
    }
    const data = await response.json().catch(() => null);
    if (!data || !Array.isArray(data.models)) {
      return { ok: false, reason: "malformed_response" };
    }
    const models = data.models
      .map((item) => (typeof item?.name === "string" ? item.name : null))
      .filter((name) => name !== null);
    return { ok: true, models };
  } catch (error) {
    if (error?.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
