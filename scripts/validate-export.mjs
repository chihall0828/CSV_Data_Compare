import {
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

// ---- report ----
if (failures.length === 0) {
  console.log(JSON.stringify({ status: "ok" }));
} else {
  console.error(JSON.stringify({ status: "fail", failures }));
  process.exit(1);
}
