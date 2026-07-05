import {
  isLocalOllamaEndpoint,
  clampOllamaTimeoutSeconds,
  DEFAULT_OLLAMA_TIMEOUT_SECONDS,
  MIN_OLLAMA_TIMEOUT_SECONDS
} from "../src/ollamaUtils.js";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

// ---- allowed endpoints ----
assert(isLocalOllamaEndpoint("http://localhost:11434"), "allow localhost:11434");
assert(isLocalOllamaEndpoint("http://127.0.0.1:11434"), "allow 127.0.0.1:11434");
assert(isLocalOllamaEndpoint("http://localhost:1"), "allow localhost with arbitrary port");
assert(isLocalOllamaEndpoint("http://[::1]:11434"), "allow [::1]:11434");
assert(isLocalOllamaEndpoint("http://LOCALHOST:11434"), "allow uppercase hostname (case-insensitive)");
assert(isLocalOllamaEndpoint("http://localhost:11434/"), "allow trailing slash");

// ---- rejected endpoints: wrong protocol / host ----
assert(!isLocalOllamaEndpoint("https://localhost:11434"), "reject https protocol");
assert(!isLocalOllamaEndpoint("http://example.com:11434"), "reject external host");
assert(!isLocalOllamaEndpoint("http://192.168.1.10:11434"), "reject LAN IP");
assert(!isLocalOllamaEndpoint(""), "reject empty string");
assert(!isLocalOllamaEndpoint("not a url"), "reject malformed URL");
assert(!isLocalOllamaEndpoint(null), "reject null");
assert(!isLocalOllamaEndpoint(undefined), "reject undefined");

// ---- rejected endpoints: hostname bypass tricks ----
assert(!isLocalOllamaEndpoint("http://localhost.evil.com:11434"), "reject hostname suffix trick");
assert(!isLocalOllamaEndpoint("http://evil.com/localhost"), "reject localhost only in path");
assert(!isLocalOllamaEndpoint("http://evil.localhost.com"), "reject localhost only as substring");
assert(!isLocalOllamaEndpoint("javascript:alert(1)"), "reject non-http scheme");
assert(!isLocalOllamaEndpoint("file:///etc/passwd"), "reject file scheme");

// ---- rejected endpoints: embedded credentials ----
assert(!isLocalOllamaEndpoint("http://user:pass@evil.com/"), "reject credentials pointing at external host");
assert(!isLocalOllamaEndpoint("http://user:pass@localhost:11434"), "reject credentials even on localhost host");

// ---- timeout clamping ----
assert(clampOllamaTimeoutSeconds(10) === 10, "clamp: in-range value unchanged");
assert(clampOllamaTimeoutSeconds(1) === 3, "clamp: below minimum -> 3");
assert(clampOllamaTimeoutSeconds(999) === 60, "clamp: above maximum -> 60");
assert(clampOllamaTimeoutSeconds("abc") === DEFAULT_OLLAMA_TIMEOUT_SECONDS, "clamp: non-numeric -> default");
assert(clampOllamaTimeoutSeconds(null) === MIN_OLLAMA_TIMEOUT_SECONDS, "clamp: null coerces to 0, clamped up to minimum");
assert(clampOllamaTimeoutSeconds(5.9) === 5, "clamp: fractional value floored");

// ---- report ----
if (failures.length === 0) {
  console.log(JSON.stringify({ status: "ok" }));
} else {
  console.error(JSON.stringify({ status: "fail", failures }));
  process.exit(1);
}
