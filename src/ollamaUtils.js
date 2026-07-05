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

// The only function in this module that performs network I/O. Takes just an
// endpoint and a timeout — it cannot accept dataset/rows, so summary
// statistics or raw CSV data can never be routed through a connection check.
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
