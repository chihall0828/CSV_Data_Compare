import {
  buildLlmPayload,
  LLM_PAYLOAD_SCHEMA_VERSION,
  safeFileSlug,
  dateStamp,
  buildStatisticsExportPayload,
  buildHypothesisExportPayload,
  statisticsPayloadToMarkdown,
  hypothesisPayloadToMarkdown
} from "../src/exportUtils.js";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

// ---- safeFileSlug ----
assert(safeFileSlug("data 01.csv") === "data_01", `slug: got ${safeFileSlug("data 01.csv")}`);
assert(safeFileSlug("") === "dataset", "slug fallback for empty name");
assert(safeFileSlug("日本語データ.xlsx") === "日本語データ", `slug unicode: got ${safeFileSlug("日本語データ.xlsx")}`);

// ---- dateStamp ----
assert(dateStamp(new Date(2026, 6, 2)) === "20260702", `dateStamp: got ${dateStamp(new Date(2026, 6, 2))}`);

// ---- statistics payload ----
const statsResult = {
  datasetName: "sample.csv",
  column: "KF_E_m",
  filteredN: 440,
  sampledN: 100,
  missingCount: 2,
  sampleMode: "random_n",
  sampleParams: { n: 100, seed: 42, start: 1, end: 440 },
  n: 98,
  mean: 1.5,
  variance: 2.5,
  stddev: Math.sqrt(2.5),
  min: -1,
  max: 4,
  median: 1.4,
  bivariate: {
    columnA: "KF_E_m",
    columnB: "KF_N_m",
    n: 98,
    excludedCount: 2,
    covariance: 0.8,
    pearson: 0.9,
    rSquared: 0.81
  }
};

const statsPayload = buildStatisticsExportPayload(statsResult);
assert(statsPayload.exportType === "statistics-result", "stats exportType");
assert(statsPayload.dataset === "sample.csv", "stats dataset name");
assert(statsPayload.column === "KF_E_m", "stats column");
assert(statsPayload.sample.mode === "random_n", "stats sample mode");
assert(statsPayload.sample.n === 100 && statsPayload.sample.seed === 42, "stats sample n/seed");
assert(statsPayload.sample.rowsAfterFilter === 440, "stats rowsAfterFilter");
assert(statsPayload.sample.rowsInSample === 100, "stats rowsInSample");
assert(statsPayload.univariate.count === 98, "stats count");
assert(statsPayload.univariate.missing === 2, "stats missing");
assert(statsPayload.univariate.mean === 1.5, "stats mean");
assert(statsPayload.univariate.variance === 2.5, "stats variance");
assert(statsPayload.bivariate.pearsonCorrelation === 0.9, "stats bivariate pearson");
assert(statsPayload.bivariate.rSquared === 0.81, "stats bivariate rSquared");

const statsMd = statisticsPayloadToMarkdown(statsPayload);
assert(statsMd.includes("# Statistics result"), "stats md title");
assert(statsMd.includes("| Count (n) | 98 |"), "stats md count row");
assert(statsMd.includes("| Mean | 1.5 |"), "stats md mean row");
assert(statsMd.includes("Random 100 rows (seed 42)"), "stats md sample mode");
assert(statsMd.includes("## Bivariate statistics"), "stats md bivariate section");
assert(statsMd.includes("| Pearson correlation | 0.9 |"), "stats md pearson row");

// Statistics payload without bivariate
const statsNoBi = buildStatisticsExportPayload({ ...statsResult, bivariate: null });
assert(statsNoBi.bivariate === null, "stats payload bivariate null");
assert(!statisticsPayloadToMarkdown(statsNoBi).includes("## Bivariate"), "stats md no bivariate section");

// ---- hypothesis payload ----
const hypResult = {
  testName: "Welch's t-test",
  nA: 5, nB: 5,
  meanA: 3, meanB: 5,
  varianceA: 2.5, varianceB: 2.5,
  statistic: -2, df: 8,
  pValue: 0.0805,
  alpha: 0.05,
  significant: false,
  meanDiff: -2,
  effectSize: -1.2649,
  cautions: ["Assumes approximately normal data.", "Check sample size and effect size."]
};

const hypContext = {
  sampleA: { dataset: "a.csv", column: "KF_E_m", group: null },
  sampleB: { dataset: "b.csv", column: "KF_E_m", group: "condition = block" },
  alternative: "two-sided"
};

const hypPayload = buildHypothesisExportPayload(hypResult, hypContext);
assert(hypPayload.exportType === "hypothesis-test-result", "hyp exportType");
assert(hypPayload.testName === "Welch's t-test", "hyp testName");
assert(hypPayload.sampleA.dataset === "a.csv", "hyp sampleA dataset");
assert(hypPayload.sampleB.group === "condition = block", "hyp sampleB group");
assert(hypPayload.alternative === "two-sided", "hyp alternative");
assert(hypPayload.result.pValue === 0.0805, "hyp pValue");
assert(hypPayload.result.alpha === 0.05, "hyp alpha");
assert(hypPayload.result.significant === false, "hyp significant");
assert(hypPayload.result.degreesOfFreedom === 8, "hyp df");
assert(hypPayload.cautions.length === 2, "hyp cautions length");

const hypMd = hypothesisPayloadToMarkdown(hypPayload);
assert(hypMd.includes("# Hypothesis test result"), "hyp md title");
assert(hypMd.includes("- Test: Welch's t-test"), "hyp md test name");
assert(hypMd.includes("| p-value | 0.0805 |"), "hyp md p-value row");
assert(hypMd.includes("| Judgement | Not significant |"), "hyp md judgement row");
assert(hypMd.includes("- Sample B: b.csv / KF_E_m (group: condition = block)"), "hyp md sample B line");
assert(hypMd.includes("- Assumes approximately normal data."), "hyp md caution line");

// One-sample style context (no sample B dataset)
const hypOneSample = buildHypothesisExportPayload(hypResult, {
  sampleA: hypContext.sampleA,
  sampleB: { dataset: null, column: "μ₀ = 0", group: null },
  alternative: "two-sided"
});
assert(
  hypothesisPayloadToMarkdown(hypOneSample).includes("- Sample B: μ₀ = 0"),
  "hyp md one-sample B line"
);

// ---- filename slug edge cases ----
assert(safeFileSlug("my data (v2).csv") === "my_data_v2", `slug symbols: got ${safeFileSlug("my data (v2).csv")}`);
assert(safeFileSlug("a.b.c.csv") === "a_b_c", `slug inner dots: got ${safeFileSlug("a.b.c.csv")}`);
assert(safeFileSlug("実験 データ#1.xlsx") === "実験_データ_1", `slug ja+symbols: got ${safeFileSlug("実験 データ#1.xlsx")}`);
assert(safeFileSlug("___") === "dataset", `slug underscores-only fallback: got ${safeFileSlug("___")}`);
assert(!/[\\/:*?"<>|\s]/.test(safeFileSlug("bad\\/:*?\"<>| name.csv")), "slug must not contain filesystem-unsafe characters");

// ---- payload schema: required keys must always be present ----
const STATS_REQUIRED_KEYS = ["exportType", "app", "exportedAt", "dataset", "column", "sample", "univariate", "bivariate"];
const STATS_UNIVARIATE_KEYS = ["count", "missing", "mean", "variance", "stddev", "min", "max", "median"];
const STATS_SAMPLE_KEYS = ["mode", "rowsAfterFilter", "rowsInSample"];
for (const key of STATS_REQUIRED_KEYS) {
  assert(key in statsPayload, `stats payload missing key: ${key}`);
}
for (const key of STATS_UNIVARIATE_KEYS) {
  assert(key in statsPayload.univariate, `stats payload univariate missing key: ${key}`);
}
for (const key of STATS_SAMPLE_KEYS) {
  assert(key in statsPayload.sample, `stats payload sample missing key: ${key}`);
}

const HYP_REQUIRED_KEYS = ["exportType", "app", "exportedAt", "testName", "sampleA", "sampleB", "alternative", "result", "cautions"];
const HYP_RESULT_KEYS = [
  "nA", "nB", "meanA", "meanB", "varianceA", "varianceB",
  "statistic", "degreesOfFreedom", "pValue", "alpha", "significant", "meanDifference", "effectSize"
];
for (const key of HYP_REQUIRED_KEYS) {
  assert(key in hypPayload, `hyp payload missing key: ${key}`);
}
for (const key of HYP_RESULT_KEYS) {
  assert(key in hypPayload.result, `hyp payload result missing key: ${key}`);
}

// Core judgement values must never be dropped even when optional stats are null
const hypNulls = buildHypothesisExportPayload(
  { ...hypResult, nB: null, varianceB: null, meanDiff: null, effectSize: null },
  hypContext
);
assert(hypNulls.result.pValue === 0.0805, "hyp payload keeps pValue with null optionals");
assert(hypNulls.result.alpha === 0.05, "hyp payload keeps alpha with null optionals");
assert(hypNulls.result.significant === false, "hyp payload keeps significant with null optionals");
for (const key of HYP_RESULT_KEYS) {
  assert(key in hypNulls.result, `hyp payload (null optionals) missing key: ${key}`);
}

// ---- markdown robustness ----
// Rendered markdown must never leak raw undefined/NaN text
const allMd = [
  statsMd,
  statisticsPayloadToMarkdown(statsNoBi),
  hypMd,
  hypothesisPayloadToMarkdown(hypNulls)
];
for (const md of allMd) {
  assert(!md.includes("undefined"), "markdown must not contain 'undefined'");
  assert(!/\bNaN\b/.test(md), "markdown must not contain 'NaN'");
}
// Null optional values render as the placeholder dash
const hypNullsMd = hypothesisPayloadToMarkdown(hypNulls);
assert(hypNullsMd.includes("| Effect size | — |"), "hyp md renders null effect size as dash");
assert(hypNullsMd.includes("| Sample B n | — |"), "hyp md renders null nB as dash");
// Judgement values still present
assert(hypNullsMd.includes("| p-value | 0.0805 |"), "hyp md keeps p-value with null optionals");
assert(hypNullsMd.includes("| Alpha | 0.05 |"), "hyp md keeps alpha with null optionals");

// Dataset names with Japanese/symbols flow through markdown unescaped-but-intact
const jaPayload = buildStatisticsExportPayload({ ...statsResult, datasetName: "実験 データ#1.xlsx" });
assert(
  statisticsPayloadToMarkdown(jaPayload).includes("- Dataset: 実験 データ#1.xlsx"),
  "stats md preserves Japanese dataset name"
);

// ---- LLM payload (Phase L1) ----

// Built from Export JSON: statistics + hypothesis results together
const llmPayload = buildLlmPayload([statsPayload, hypPayload], { userNote: "block条件は遮蔽実験" });
assert(llmPayload.schemaVersion === LLM_PAYLOAD_SCHEMA_VERSION, "llm schemaVersion");
assert(llmPayload.task === "interpretation", "llm task");
assert(llmPayload.language === "ja", "llm default language ja");
assert(buildLlmPayload(statsPayload, { language: "en" }).language === "en", "llm language en option");
assert(llmPayload.results.length === 2, "llm results length");
assert(llmPayload.userNote === "block条件は遮蔽実験", "llm userNote preserved");
assert(typeof llmPayload.generatedAt === "string" && llmPayload.generatedAt.includes("T"), "llm generatedAt ISO");

// Single (non-array) input is wrapped
assert(buildLlmPayload(statsPayload).results.length === 1, "llm single input wrapped");

// Summary values survive sanitization
const llmStats = llmPayload.results[0];
assert(llmStats.univariate.mean === 1.5, "llm stats mean survives");
assert(llmStats.bivariate.pearsonCorrelation === 0.9, "llm stats pearson survives");
assert(llmStats.sample.rowsAfterFilter === 440, "llm stats sample rows survive");
const llmHyp = llmPayload.results[1];
assert(llmHyp.result.pValue === 0.0805, "llm hyp pValue survives");
assert(llmHyp.result.alpha === 0.05, "llm hyp alpha survives");
assert(llmHyp.result.significant === false, "llm hyp significant survives");
assert(llmHyp.cautions.length === 2, "llm hyp cautions survive");
assert(llmHyp.sampleB.group === "condition = block", "llm hyp group survives");

// Whitelist: raw-data-like extra fields must be stripped, never forwarded
const poisoned = {
  ...statsPayload,
  rows: [[1, 2, 3]],
  rawData: "secret",
  univariate: { ...statsPayload.univariate, cells: [1, 2, 3] }
};
const llmClean = buildLlmPayload(poisoned).results[0];
const llmCleanJson = JSON.stringify(llmClean);
assert(!("rows" in llmClean), "llm strips top-level rows");
assert(!llmCleanJson.includes("rawData") && !llmCleanJson.includes("secret"), "llm strips rawData");
assert(!llmCleanJson.includes("cells"), "llm strips nested unknown keys");
assert(llmClean.univariate.mean === 1.5, "llm keeps whitelisted values after stripping");

// Non-string cautions are filtered out
const mixedCautions = buildLlmPayload({ ...hypPayload, cautions: ["ok", 42, null, "also ok"] }).results[0];
assert(mixedCautions.cautions.length === 2, "llm filters non-string cautions");

// userNote is clamped to 2000 chars and non-strings become empty
assert(buildLlmPayload(statsPayload, { userNote: "x".repeat(3000) }).userNote.length === 2000, "llm userNote clamp");
assert(buildLlmPayload(statsPayload, { userNote: 123 }).userNote === "", "llm non-string userNote empty");

// Unsupported exportType and empty input must throw
let threwUnknown = false;
try { buildLlmPayload({ exportType: "raw-rows", rows: [] }); } catch { threwUnknown = true; }
assert(threwUnknown, "llm throws on unsupported exportType");
let threwEmpty = false;
try { buildLlmPayload([]); } catch { threwEmpty = true; }
assert(threwEmpty, "llm throws on empty results");

// ---- report ----
if (failures.length === 0) {
  console.log(JSON.stringify({ status: "ok" }));
} else {
  console.error(JSON.stringify({ status: "fail", failures }));
  process.exit(1);
}
