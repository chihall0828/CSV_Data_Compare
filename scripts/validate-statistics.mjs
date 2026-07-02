import {
  extractNumericValues,
  extractNumericPairs,
  computeUnivariate,
  computeBivariate,
  applySampleMode,
  seededRandomSample,
  applyRowFilter
} from "../src/statisticsUtils.js";
import {
  runOneSampleT,
  runIndependentT,
  runWelchT,
  runPairedT,
  runFTest,
  runCorrelationTest
} from "../src/hypothesisUtils.js";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function nearlyEqual(actual, expected, tol = 1e-9) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  return Math.abs(actual - expected) <= tol;
}

// ---- computeUnivariate ----

const sample = [1, 2, 3, 4, 5];
const stats = computeUnivariate(sample);

assert(stats.n === 5, `n: expected 5, got ${stats.n}`);
assert(nearlyEqual(stats.mean, 3), `mean: expected 3, got ${stats.mean}`);
assert(nearlyEqual(stats.variance, 2.5), `variance: expected 2.5, got ${stats.variance}`);
assert(nearlyEqual(stats.stddev, Math.sqrt(2.5)), `stddev: expected ${Math.sqrt(2.5)}, got ${stats.stddev}`);
assert(stats.min === 1, `min: expected 1, got ${stats.min}`);
assert(stats.max === 5, `max: expected 5, got ${stats.max}`);
assert(stats.median === 3, `median: expected 3, got ${stats.median}`);

// Even-count median
const even = [1, 2, 3, 4];
const evenStats = computeUnivariate(even);
assert(nearlyEqual(evenStats.median, 2.5), `even median: expected 2.5, got ${evenStats.median}`);

// n=1: variance and stddev should be null
const single = computeUnivariate([42]);
assert(single.n === 1, "n=1: n should be 1");
assert(single.mean === 42, "n=1: mean should be 42");
assert(single.variance === null, "n=1: variance should be null");
assert(single.stddev === null, "n=1: stddev should be null");

// n=0: all null
const empty = computeUnivariate([]);
assert(empty.n === 0, "empty: n should be 0");
assert(empty.mean === null, "empty: mean should be null");

// ---- extractNumericValues ----

const rows = [
  { val: "1" },
  { val: "2" },
  { val: "" },      // missing
  { val: "na" },    // missing token
  { val: "3" },
  { val: "abc" },   // non-numeric → missing
  { val: "4" },
  { val: "5" }
];

const extracted = extractNumericValues(rows, "val");
assert(extracted.values.length === 5, `extractNumericValues: expected 5 values, got ${extracted.values.length}`);
assert(extracted.missingCount === 3, `extractNumericValues: expected 3 missing, got ${extracted.missingCount}`);
const extractedStats = computeUnivariate(extracted.values);
assert(nearlyEqual(extractedStats.mean, 3), `extracted mean: expected 3, got ${extractedStats.mean}`);

// ---- computeBivariate / extractNumericPairs ----

const pairRows = [
  { a: "1", b: "2" },
  { a: "2", b: "4" },
  { a: "", b: "6" },       // missing a -> excluded
  { a: "3", b: "abc" },    // non-numeric b -> excluded
  { a: "3", b: "6" },
  { a: "4", b: "8" }
];

const extractedPairs = extractNumericPairs(pairRows, "a", "b");
assert(extractedPairs.pairs.length === 4, `extractNumericPairs: expected 4 pairs, got ${extractedPairs.pairs.length}`);
assert(extractedPairs.excludedCount === 2, `extractNumericPairs: expected 2 excluded, got ${extractedPairs.excludedCount}`);

const bivariate = computeBivariate(extractedPairs.pairs);
assert(bivariate.n === 4, `bivariate n: expected 4, got ${bivariate.n}`);
assert(nearlyEqual(bivariate.covariance, 10 / 3), `covariance: expected ${10 / 3}, got ${bivariate.covariance}`);
assert(nearlyEqual(bivariate.pearson, 1), `pearson: expected 1, got ${bivariate.pearson}`);
assert(nearlyEqual(bivariate.rSquared, 1), `rSquared: expected 1, got ${bivariate.rSquared}`);

const bivariateSingle = computeBivariate([[1, 2]]);
assert(bivariateSingle.n === 1, "bivariate n=1: n should be 1");
assert(bivariateSingle.covariance === null, "bivariate n=1: covariance should be null");
assert(bivariateSingle.pearson === null, "bivariate n=1: pearson should be null");
assert(bivariateSingle.rSquared === null, "bivariate n=1: rSquared should be null");

const zeroVariance = computeBivariate([[5, 1], [5, 2], [5, 3]]);
assert(zeroVariance.n === 3, "zero variance: n should be 3");
assert(nearlyEqual(zeroVariance.covariance, 0), `zero variance covariance: expected 0, got ${zeroVariance.covariance}`);
assert(zeroVariance.pearson === null, "zero variance: pearson should be null");
assert(zeroVariance.rSquared === null, "zero variance: rSquared should be null");

const filteredForPairs = applyRowFilter(
  [
    { a: "1", b: "2" },
    { a: "2", b: "4" },
    { a: "3", b: "6" },
    { a: "4", b: "8" }
  ],
  { start: 2, end: 4 }
);
const sampledForPairs = applySampleMode(filteredForPairs, "first_n", { n: 2 });
const orderedPairs = extractNumericPairs(sampledForPairs, "a", "b").pairs;
assert(orderedPairs.length === 2, `filtered/sampled pairs: expected 2, got ${orderedPairs.length}`);
assert(orderedPairs[0][0] === 2 && orderedPairs[0][1] === 4, "filtered/sampled pairs: first pair should be row 2");
assert(orderedPairs[1][0] === 3 && orderedPairs[1][1] === 6, "filtered/sampled pairs: second pair should be row 3");

// ---- applySampleMode ----

function makeRows(n) {
  return Array.from({ length: n }, (_, i) => ({ i }));
}

const tenRows = makeRows(10);

// first_n
const first3 = applySampleMode(tenRows, "first_n", { n: 3 });
assert(first3.length === 3, `first_n: expected 3, got ${first3.length}`);
assert(first3[0].i === 0, `first_n[0]: expected i=0, got ${first3[0].i}`);
assert(first3[2].i === 2, `first_n[2]: expected i=2, got ${first3[2].i}`);

// last_n
const last3 = applySampleMode(tenRows, "last_n", { n: 3 });
assert(last3.length === 3, `last_n: expected 3, got ${last3.length}`);
assert(last3[0].i === 7, `last_n[0]: expected i=7, got ${last3[0].i}`);
assert(last3[2].i === 9, `last_n[2]: expected i=9, got ${last3[2].i}`);

// row_range
const range = applySampleMode(tenRows, "row_range", { start: 3, end: 6 });
assert(range.length === 4, `row_range(3-6): expected 4, got ${range.length}`);
assert(range[0].i === 2, `row_range[0]: expected i=2, got ${range[0].i}`);
assert(range[3].i === 5, `row_range[3]: expected i=5, got ${range[3].i}`);

// row_range start > end → empty
const emptyRange = applySampleMode(tenRows, "row_range", { start: 7, end: 3 });
assert(emptyRange.length === 0, `row_range start>end: expected 0, got ${emptyRange.length}`);

// all
const all = applySampleMode(tenRows, "all");
assert(all.length === 10, `all: expected 10, got ${all.length}`);

// random_n seed fixed → reproducible
const rand1 = applySampleMode(tenRows, "random_n", { n: 4, seed: 42 });
const rand2 = applySampleMode(tenRows, "random_n", { n: 4, seed: 42 });
assert(rand1.length === 4, `random_n: expected 4, got ${rand1.length}`);
assert(
  rand1.every((row, i) => row.i === rand2[i].i),
  "random_n: seed=42 should be reproducible"
);

// random_n different seed → different result (highly likely for n=4 from 10)
const rand3 = applySampleMode(tenRows, "random_n", { n: 4, seed: 99 });
const sameAsSeed42 = rand3.every((row, i) => row.i === rand1[i].i);
assert(!sameAsSeed42, "random_n: different seed should (usually) produce different order");

// n too large → clamp to rows.length
const bigN = applySampleMode(tenRows, "first_n", { n: 9999 });
assert(bigN.length === 10, `n>rows.length: expected 10, got ${bigN.length}`);

// n < 1 → clamp to 1
const smallN = applySampleMode(tenRows, "first_n", { n: 0 });
assert(smallN.length === 1, `n=0: expected 1 (clamped), got ${smallN.length}`);

// negative n → clamp to 1
const negN = applySampleMode(tenRows, "last_n", { n: -5 });
assert(negN.length === 1, `n=-5: expected 1 (clamped), got ${negN.length}`);

// seededRandomSample: n >= rows.length → return all
const allSampled = seededRandomSample(tenRows, 10, 42);
assert(allSampled.length === 10, `seededRandomSample n>=rows: expected 10, got ${allSampled.length}`);
const allSampledBig = seededRandomSample(tenRows, 99, 42);
assert(allSampledBig.length === 10, `seededRandomSample n=99 from 10: expected 10, got ${allSampledBig.length}`);

// ---- hypothesis tests ----

// One-sample t-test: [2,3,4,5,6] vs mu0=3, two-sided
// n=5, mean=4, s²=2.5, t=√2≈1.4142, df=4, p≈0.2302
const r1 = runOneSampleT([2, 3, 4, 5, 6], 3, "two-sided", 0.05);
assert(!r1.error, `oneSampleT: unexpected error: ${r1.error}`);
assert(r1.nA === 5, `oneSampleT nA: expected 5, got ${r1.nA}`);
assert(nearlyEqual(r1.meanA, 4), `oneSampleT meanA: expected 4, got ${r1.meanA}`);
assert(nearlyEqual(r1.pValue, 0.2302, 1e-3), `oneSampleT p: expected ~0.2302, got ${r1.pValue}`);
assert(!r1.significant, "oneSampleT: should not be significant at alpha=0.05");
// When mean == mu0, t should be 0 and p should be 1.0
const r1b = runOneSampleT([2, 3, 4, 5, 6], 4, "two-sided", 0.05);
assert(nearlyEqual(r1b.statistic, 0, 1e-10), `oneSampleT t==0: expected 0, got ${r1b.statistic}`);
assert(nearlyEqual(r1b.pValue, 1.0, 1e-6), `oneSampleT p==1: expected 1.0, got ${r1b.pValue}`);
const r1c = runOneSampleT([5, 5, 5], 5, "two-sided", 0.05);
assert(r1c.error, "oneSampleT: should error when sample variance is zero and mean equals mu0");
const r1d = runOneSampleT([5, 5, 5], 4, "two-sided", 0.05);
assert(r1d.error, "oneSampleT: should error when sample variance is zero and mean differs from mu0");

// Independent t-test: A=[1,2,3,4,5] B=[3,4,5,6,7], p≈0.0805
const r2 = runIndependentT([1, 2, 3, 4, 5], [3, 4, 5, 6, 7], "two-sided", 0.05);
assert(!r2.error, `independentT: unexpected error: ${r2.error}`);
assert(r2.nA === 5 && r2.nB === 5, `independentT n: expected 5/5, got ${r2.nA}/${r2.nB}`);
assert(nearlyEqual(r2.meanA, 3) && nearlyEqual(r2.meanB, 5), `independentT means`);
assert(nearlyEqual(r2.pValue, 0.0805, 1e-3), `independentT p: expected ~0.0805, got ${r2.pValue}`);
assert(!r2.significant, "independentT: should not be significant at alpha=0.05");
// Effect size (Cohen's d) for equal means = 0
const r2b = runIndependentT([1, 2, 3], [1, 2, 3], "two-sided", 0.05);
assert(nearlyEqual(r2b.statistic, 0, 1e-10), `independentT t==0 when equal`);
const r2z = runIndependentT([2, 2, 2], [2, 2, 2], "two-sided", 0.05);
assert(r2z.error, "independentT: should error when pooled variance is zero and means are equal");
const r2zd = runIndependentT([2, 2, 2], [1, 1, 1], "two-sided", 0.05);
assert(r2zd.error, "independentT: should error when pooled variance is zero and means differ");

// Welch's t-test: same as independent when variances equal → p≈0.0805
const r3 = runWelchT([1, 2, 3, 4, 5], [3, 4, 5, 6, 7], "two-sided", 0.05);
assert(!r3.error, `welchT: unexpected error: ${r3.error}`);
assert(nearlyEqual(r3.pValue, 0.0805, 1e-3), `welchT p: expected ~0.0805, got ${r3.pValue}`);
// Welch df with unequal variances should differ from pooled df
const r3b = runWelchT([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]);
assert(typeof r3b.df === "number" && r3b.df > 0, `welchT df: should be numeric positive`);
const r3z = runWelchT([2, 2, 2], [2, 2, 2], "two-sided", 0.05);
assert(r3z.error, "welchT: should error when both groups have zero variance and means are equal");
const r3zd = runWelchT([2, 2, 2], [1, 1, 1], "two-sided", 0.05);
assert(r3zd.error, "welchT: should error when both groups have zero variance and means differ");

// Paired t-test: A=[3,5,7,9,11] B=[1,4,5,8,10], diffs=[2,1,2,1,1], mean_d=1.4, p≈0.0046
const r4 = runPairedT([3, 5, 7, 9, 11], [1, 4, 5, 8, 10], "two-sided", 0.05);
assert(!r4.error, `pairedT: unexpected error: ${r4.error}`);
assert(r4.nA === 5, `pairedT nA: expected 5, got ${r4.nA}`);
assert(nearlyEqual(r4.meanDiff, 1.4), `pairedT meanDiff: expected 1.4, got ${r4.meanDiff}`);
assert(nearlyEqual(r4.pValue, 0.0046, 1e-3), `pairedT p: expected ~0.0046, got ${r4.pValue}`);
assert(r4.significant, "pairedT: should be significant at alpha=0.05");
// Unequal lengths must return error
const r4e = runPairedT([1, 2, 3], [1, 2]);
assert(r4e.error, "pairedT: should error on unequal lengths");
const r4z = runPairedT([2, 3, 4], [1, 2, 3], "two-sided", 0.05);
assert(r4z.error, "pairedT: should error when paired differences have zero variance");

// F-test: A=[1,2,3,4,5] varA=2.5, B=[2,4,6,8,10] varB=10, F=0.25, df1=df2=4, p≈0.208
const r5 = runFTest([1, 2, 3, 4, 5], [2, 4, 6, 8, 10], "two-sided", 0.05);
assert(!r5.error, `fTest: unexpected error: ${r5.error}`);
assert(nearlyEqual(r5.statistic, 0.25), `fTest F: expected 0.25, got ${r5.statistic}`);
assert(nearlyEqual(r5.pValue, 0.208, 1e-2), `fTest p: expected ~0.208, got ${r5.pValue}`);
// Zero variance in B should error
const r5e = runFTest([1, 2, 3], [5, 5, 5]);
assert(r5e.error, "fTest: should error on zero variance in B");

// Correlation significance test: xs=[1,2,3,4,5] ys=[2,3,5,4,6] r=0.9, p≈0.0374
const r6 = runCorrelationTest([1, 2, 3, 4, 5], [2, 3, 5, 4, 6], "two-sided", 0.05);
assert(!r6.error, `corrTest: unexpected error: ${r6.error}`);
assert(nearlyEqual(r6.statistic, 0.9, 1e-6), `corrTest r: expected 0.9, got ${r6.statistic}`);
assert(nearlyEqual(r6.pValue, 0.0374, 1e-3), `corrTest p: expected ~0.0374, got ${r6.pValue}`);
assert(r6.significant, "corrTest: should be significant at alpha=0.05");
// Effect size should be r²
assert(nearlyEqual(r6.effectSize, 0.81, 1e-6), `corrTest r²: expected 0.81, got ${r6.effectSize}`);
// Unequal lengths must return error
const r6e = runCorrelationTest([1, 2, 3], [1, 2]);
assert(r6e.error, "corrTest: should error on unequal lengths");
const r6PerfectGreater = runCorrelationTest([1, 2, 3], [1, 2, 3], "greater", 0.05);
assert(!r6PerfectGreater.error, `corrTest perfect positive greater: unexpected error: ${r6PerfectGreater.error}`);
assert(nearlyEqual(r6PerfectGreater.pValue, 0), `corrTest perfect positive greater: expected p=0, got ${r6PerfectGreater.pValue}`);
assert(r6PerfectGreater.significant, "corrTest perfect positive greater: should be significant");
const r6PerfectLess = runCorrelationTest([1, 2, 3], [1, 2, 3], "less", 0.05);
assert(nearlyEqual(r6PerfectLess.pValue, 1), `corrTest perfect positive less: expected p=1, got ${r6PerfectLess.pValue}`);
assert(!r6PerfectLess.significant, "corrTest perfect positive less: should not be significant");
const r6PerfectNegativeGreater = runCorrelationTest([1, 2, 3], [3, 2, 1], "greater", 0.05);
assert(nearlyEqual(r6PerfectNegativeGreater.pValue, 1), `corrTest perfect negative greater: expected p=1, got ${r6PerfectNegativeGreater.pValue}`);
assert(!r6PerfectNegativeGreater.significant, "corrTest perfect negative greater: should not be significant");
const r6PerfectNegativeLess = runCorrelationTest([1, 2, 3], [3, 2, 1], "less", 0.05);
assert(nearlyEqual(r6PerfectNegativeLess.pValue, 0), `corrTest perfect negative less: expected p=0, got ${r6PerfectNegativeLess.pValue}`);
assert(r6PerfectNegativeLess.significant, "corrTest perfect negative less: should be significant");

// Paired/correlation values must preserve row pairs when gaps occur in different rows.
const gappedPairRows = [
  { a: "1", b: "2" },
  { a: "", b: "999" },
  { a: "2", b: "4" },
  { a: "999", b: "" },
  { a: "3", b: "6" }
];
const separateA = extractNumericValues(gappedPairRows, "a").values;
const separateB = extractNumericValues(gappedPairRows, "b").values;
assert(separateA.length === 4 && separateB.length === 4, "gapped pairs sanity: separate extraction stays length 4");
const alignedPairs = extractNumericPairs(gappedPairRows, "a", "b").pairs;
assert(alignedPairs.length === 3, `aligned pairs: expected 3, got ${alignedPairs.length}`);
assert(
  JSON.stringify(alignedPairs) === JSON.stringify([[1, 2], [2, 4], [3, 6]]),
  `aligned pairs: unexpected pairs ${JSON.stringify(alignedPairs)}`
);
const alignedA = alignedPairs.map(([a]) => a);
const alignedB = alignedPairs.map(([, b]) => b);
const r4Aligned = runPairedT(alignedA, alignedB, "two-sided", 0.05);
assert(!r4Aligned.error, `pairedT aligned gaps: unexpected error: ${r4Aligned.error}`);
assert(r4Aligned.nA === 3, `pairedT aligned gaps n: expected 3, got ${r4Aligned.nA}`);
assert(nearlyEqual(r4Aligned.meanDiff, -2), `pairedT aligned gaps meanDiff: expected -2, got ${r4Aligned.meanDiff}`);
const r6Aligned = runCorrelationTest(alignedA, alignedB, "two-sided", 0.05);
assert(!r6Aligned.error, `corrTest aligned gaps: unexpected error: ${r6Aligned.error}`);
assert(r6Aligned.nA === 3, `corrTest aligned gaps n: expected 3, got ${r6Aligned.nA}`);
assert(nearlyEqual(r6Aligned.statistic, 1, 1e-10), `corrTest aligned gaps r: expected 1, got ${r6Aligned.statistic}`);

// ---- report ----

if (failures.length === 0) {
  console.log(JSON.stringify({ status: "ok" }));
} else {
  console.error(JSON.stringify({ status: "fail", failures }));
  process.exit(1);
}
