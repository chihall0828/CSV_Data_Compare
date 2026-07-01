import {
  extractNumericValues,
  extractNumericPairs,
  computeUnivariate,
  computeBivariate,
  applySampleMode,
  seededRandomSample,
  applyRowFilter
} from "../src/statisticsUtils.js";

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

// ---- report ----

if (failures.length === 0) {
  console.log(JSON.stringify({ status: "ok" }));
} else {
  console.error(JSON.stringify({ status: "fail", failures }));
  process.exit(1);
}
