import {
  isLocalOllamaEndpoint,
  clampOllamaTimeoutSeconds,
  DEFAULT_OLLAMA_TIMEOUT_SECONDS,
  MIN_OLLAMA_TIMEOUT_SECONDS,
  LLM_SYSTEM_PROMPT,
  assertLlmPayloadSafe
} from "../src/ollamaUtils.js";
import { buildLlmPayload, buildStatisticsExportPayload } from "../src/exportUtils.js";

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

// ---- LLM system prompt (Phase L3) ----
assert(typeof LLM_SYSTEM_PROMPT === "string" && LLM_SYSTEM_PROMPT.length > 0, "system prompt is a non-empty string");
assert(LLM_SYSTEM_PROMPT.includes("AI生成の参考情報"), "system prompt requires the AI-generated disclaimer");
assert(LLM_SYSTEM_PROMPT.includes("数値の捏造をしない"), "system prompt forbids fabricating numbers");

// ---- assertLlmPayloadSafe (Phase L3 payload safety check) ----
const sampleStatsResult = {
  datasetName: "sample.csv",
  column: "KF_E_m",
  filteredN: 100,
  sampledN: 100,
  missingCount: 0,
  sampleMode: "all",
  sampleParams: {},
  n: 100,
  mean: 1.5,
  variance: 2.5,
  stddev: Math.sqrt(2.5),
  min: -1,
  max: 4,
  median: 1.4,
  bivariate: null
};
const validPayload = buildLlmPayload(buildStatisticsExportPayload(sampleStatsResult));

function assertThrows(fn, message) {
  try {
    fn();
    failures.push(`${message} (did not throw)`);
  } catch {
    // expected
  }
}

function assertDoesNotThrow(fn, message) {
  try {
    fn();
  } catch (error) {
    failures.push(`${message} (threw: ${String(error?.message ?? error)})`);
  }
}

assertDoesNotThrow(() => assertLlmPayloadSafe(validPayload), "assertLlmPayloadSafe accepts a valid buildLlmPayload() output");
assertThrows(() => assertLlmPayloadSafe(null), "assertLlmPayloadSafe rejects null");
assertThrows(() => assertLlmPayloadSafe({}), "assertLlmPayloadSafe rejects empty object");
assertThrows(() => assertLlmPayloadSafe({ ...validPayload, task: "raw-dump" }), "assertLlmPayloadSafe rejects wrong task");
assertThrows(() => assertLlmPayloadSafe({ ...validPayload, results: [] }), "assertLlmPayloadSafe rejects empty results");
assertThrows(
  () => assertLlmPayloadSafe({ ...validPayload, results: [{ exportType: "raw-rows", rows: [[1, 2]] }] }),
  "assertLlmPayloadSafe rejects unsupported exportType"
);
assertThrows(
  () =>
    assertLlmPayloadSafe({
      ...validPayload,
      results: [{ ...validPayload.results[0], rows: [[1, 2, 3]] }]
    }),
  "assertLlmPayloadSafe rejects a top-level 'rows' key smuggled into a result"
);
assertThrows(
  () =>
    assertLlmPayloadSafe({
      ...validPayload,
      results: [
        {
          ...validPayload.results[0],
          univariate: { ...validPayload.results[0].univariate, rawData: "leaked" }
        }
      ]
    }),
  "assertLlmPayloadSafe rejects a nested 'rawData' key"
);
assertThrows(
  () => assertLlmPayloadSafe({ ...validPayload, userNote: "x".repeat(25000) }),
  "assertLlmPayloadSafe rejects an oversized payload"
);

// ---- report ----
if (failures.length === 0) {
  console.log(JSON.stringify({ status: "ok" }));
} else {
  console.error(JSON.stringify({ status: "fail", failures }));
  process.exit(1);
}
