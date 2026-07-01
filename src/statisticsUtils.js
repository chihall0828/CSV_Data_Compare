import { toNumber, isMissingValue, applyRowFilter } from "./dataUtils.js";

function parseNumericCell(row, column) {
  const raw = row[column];
  if (raw === null || raw === undefined || isMissingValue(raw)) {
    return null;
  }
  return toNumber(raw);
}

export function extractNumericValues(rows, column) {
  const values = [];
  let missingCount = 0;
  for (const row of rows) {
    const num = parseNumericCell(row, column);
    if (num === null) {
      missingCount += 1;
      continue;
    }
    values.push(num);
  }
  return { values, missingCount };
}

export function computeUnivariate(values) {
  const n = values.length;
  if (n === 0) {
    return { n: 0, mean: null, variance: null, stddev: null, min: null, max: null, median: null };
  }

  let sum = 0;
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  let variance = null;
  let stddev = null;
  if (n >= 2) {
    let sumSq = 0;
    for (const v of values) {
      sumSq += (v - mean) ** 2;
    }
    variance = sumSq / (n - 1);
    stddev = Math.sqrt(variance);
  }

  return { n, mean, variance, stddev, min, max, median };
}

export function extractNumericPairs(rows, columnA, columnB) {
  const pairs = [];
  let excludedCount = 0;
  for (const row of rows) {
    const a = parseNumericCell(row, columnA);
    const b = parseNumericCell(row, columnB);
    if (a === null || b === null) {
      excludedCount += 1;
      continue;
    }
    pairs.push([a, b]);
  }
  return { pairs, excludedCount };
}

export function computeBivariate(pairs) {
  const n = pairs.length;
  if (n < 2) {
    return { n, covariance: null, pearson: null, rSquared: null };
  }

  let sumA = 0;
  let sumB = 0;
  for (const [a, b] of pairs) {
    sumA += a;
    sumB += b;
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let crossSum = 0;
  let sumSqA = 0;
  let sumSqB = 0;
  for (const [a, b] of pairs) {
    const deltaA = a - meanA;
    const deltaB = b - meanB;
    crossSum += deltaA * deltaB;
    sumSqA += deltaA ** 2;
    sumSqB += deltaB ** 2;
  }

  const covariance = crossSum / (n - 1);
  if (sumSqA === 0 || sumSqB === 0) {
    return { n, covariance, pearson: null, rSquared: null };
  }

  const pearson = crossSum / Math.sqrt(sumSqA * sumSqB);
  return { n, covariance, pearson, rSquared: pearson ** 2 };
}

export function seededRandomSample(rows, n, seed = 42) {
  if (n >= rows.length) return [...rows];
  // LCG (Knuth constants): reproducible pseudo-random sequence
  let state = (seed >>> 0) || 1;
  function nextUint() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  }
  // Reservoir sampling Algorithm R
  const reservoir = rows.slice(0, n);
  for (let i = n; i < rows.length; i += 1) {
    const j = nextUint() % (i + 1);
    if (j < n) reservoir[j] = rows[i];
  }
  return reservoir;
}

function safeInt(value, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

export function applySampleMode(rows, mode, options = {}) {
  const n = Math.max(1, safeInt(options.n, 100));
  const seed = safeInt(options.seed, 42);
  const start = Math.max(1, safeInt(options.start, 1));
  const end = Math.min(rows.length, safeInt(options.end, rows.length));

  switch (mode) {
    case "first_n":
      return rows.slice(0, Math.min(n, rows.length));
    case "last_n":
      return rows.slice(Math.max(0, rows.length - Math.min(n, rows.length)));
    case "random_n":
      return seededRandomSample(rows, Math.min(n, rows.length), seed);
    case "row_range":
      if (start > end) return [];
      return rows.slice(start - 1, end);
    default:
      return rows;
  }
}

export function formatStatValue(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const absVal = Math.abs(value);
  if (absVal === 0) return "0";
  if (absVal >= 0.001 && absVal < 1e7) {
    return parseFloat(value.toPrecision(8)).toString();
  }
  return value.toExponential(4);
}

export { applyRowFilter };
