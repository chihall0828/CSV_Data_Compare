import jstat from "jstat";

const { jStat } = jstat;

function sampleStats(values) {
  const n = values.length;
  if (n === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    n >= 2 ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : null;
  return { n, mean, variance };
}

function tPValue(t, df, alternative) {
  const cdf = jStat.studentt.cdf(t, df);
  if (alternative === "two-sided") return 2 * Math.min(cdf, 1 - cdf);
  if (alternative === "greater") return 1 - cdf;
  return cdf;
}

function fPValue(f, df1, df2, alternative) {
  const cdf = jStat.centralF.cdf(f, df1, df2);
  if (alternative === "two-sided") return 2 * Math.min(cdf, 1 - cdf);
  if (alternative === "greater") return 1 - cdf;
  return cdf;
}

function pearsonR(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sx2 = 0, sy2 = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sx2 += (xs[i] - mx) ** 2;
    sy2 += (ys[i] - my) ** 2;
  }
  const den = Math.sqrt(sx2 * sy2);
  return den === 0 ? null : sxy / den;
}

const CAUTION_NORMAL = "Assumes approximately normal data.";
const CAUTION_P = "p-value alone does not prove practical significance.";
const CAUTION_N = "Check sample size and effect size.";
const CAUTION_WELCH = "Use Welch's t-test when variances are unequal.";

export function runOneSampleT(values, mu0, alternative = "two-sided", alpha = 0.05) {
  const s = sampleStats(values);
  if (!s || s.n < 2) return { error: "Need at least 2 values." };
  const { n, mean, variance } = s;
  const t = (mean - mu0) / Math.sqrt(variance / n);
  const df = n - 1;
  return {
    testName: "One-sample t-test",
    nA: n, nB: null,
    meanA: mean, meanB: mu0,
    varianceA: variance, varianceB: null,
    statistic: t, df,
    pValue: tPValue(t, df, alternative),
    alpha,
    get significant() { return this.pValue < alpha; },
    meanDiff: mean - mu0,
    effectSize: (mean - mu0) / Math.sqrt(variance),
    cautions: [CAUTION_NORMAL, CAUTION_P, CAUTION_N, CAUTION_WELCH]
  };
}

export function runIndependentT(aValues, bValues, alternative = "two-sided", alpha = 0.05) {
  const sA = sampleStats(aValues);
  const sB = sampleStats(bValues);
  if (!sA || !sB || sA.n < 2 || sB.n < 2)
    return { error: "Need at least 2 values in each group." };
  const { n: nA, mean: meanA, variance: varA } = sA;
  const { n: nB, mean: meanB, variance: varB } = sB;
  const pooled = ((nA - 1) * varA + (nB - 1) * varB) / (nA + nB - 2);
  const t = (meanA - meanB) / Math.sqrt(pooled * (1 / nA + 1 / nB));
  const df = nA + nB - 2;
  return {
    testName: "Independent t-test (equal variance)",
    nA, nB, meanA, meanB,
    varianceA: varA, varianceB: varB,
    statistic: t, df,
    pValue: tPValue(t, df, alternative),
    alpha,
    get significant() { return this.pValue < alpha; },
    meanDiff: meanA - meanB,
    effectSize: (meanA - meanB) / Math.sqrt(pooled),
    cautions: [
      "Assumes equal population variances.",
      CAUTION_WELCH,
      CAUTION_NORMAL,
      CAUTION_P
    ]
  };
}

export function runWelchT(aValues, bValues, alternative = "two-sided", alpha = 0.05) {
  const sA = sampleStats(aValues);
  const sB = sampleStats(bValues);
  if (!sA || !sB || sA.n < 2 || sB.n < 2)
    return { error: "Need at least 2 values in each group." };
  const { n: nA, mean: meanA, variance: varA } = sA;
  const { n: nB, mean: meanB, variance: varB } = sB;
  const seA2 = varA / nA;
  const seB2 = varB / nB;
  const t = (meanA - meanB) / Math.sqrt(seA2 + seB2);
  const df = (seA2 + seB2) ** 2 / (seA2 ** 2 / (nA - 1) + seB2 ** 2 / (nB - 1));
  return {
    testName: "Welch's t-test",
    nA, nB, meanA, meanB,
    varianceA: varA, varianceB: varB,
    statistic: t, df,
    pValue: tPValue(t, df, alternative),
    alpha,
    get significant() { return this.pValue < alpha; },
    meanDiff: meanA - meanB,
    effectSize: (meanA - meanB) / Math.sqrt((varA + varB) / 2),
    cautions: [
      "Does not assume equal variances (Welch-Satterthwaite df).",
      "Robust to heteroscedasticity.",
      CAUTION_NORMAL,
      CAUTION_P
    ]
  };
}

export function runPairedT(aValues, bValues, alternative = "two-sided", alpha = 0.05) {
  if (aValues.length !== bValues.length)
    return { error: "Paired t-test requires equal sample sizes." };
  const diffs = aValues.map((a, i) => a - bValues[i]);
  const s = sampleStats(diffs);
  if (!s || s.n < 2) return { error: "Need at least 2 paired observations." };
  const { n, mean: dMean, variance: dVar } = s;
  const t = dMean / Math.sqrt(dVar / n);
  const df = n - 1;
  const sA = sampleStats(aValues);
  const sB = sampleStats(bValues);
  return {
    testName: "Paired t-test",
    nA: n, nB: n,
    meanA: sA.mean, meanB: sB.mean,
    varianceA: sA.variance, varianceB: sB.variance,
    statistic: t, df,
    pValue: tPValue(t, df, alternative),
    alpha,
    get significant() { return this.pValue < alpha; },
    meanDiff: dMean,
    effectSize: dMean / Math.sqrt(dVar),
    cautions: [
      "Requires paired observations (matched pairs, same n).",
      "Assumes differences are approximately normally distributed.",
      CAUTION_P,
      CAUTION_N
    ]
  };
}

export function runFTest(aValues, bValues, alternative = "two-sided", alpha = 0.05) {
  const sA = sampleStats(aValues);
  const sB = sampleStats(bValues);
  if (!sA || !sB || sA.n < 2 || sB.n < 2)
    return { error: "Need at least 2 values in each group." };
  const { n: nA, mean: meanA, variance: varA } = sA;
  const { n: nB, mean: meanB, variance: varB } = sB;
  if (!varB || varB === 0) return { error: "Sample B has zero variance; F-ratio is undefined." };
  const f = varA / varB;
  const df1 = nA - 1;
  const df2 = nB - 1;
  return {
    testName: "F-test (variance ratio)",
    nA, nB, meanA, meanB,
    varianceA: varA, varianceB: varB,
    statistic: f, df: `${df1}, ${df2}`,
    pValue: fPValue(f, df1, df2, alternative),
    alpha,
    get significant() { return this.pValue < alpha; },
    meanDiff: meanA - meanB,
    effectSize: null,
    cautions: [
      "Tests equality of variances, not means.",
      "Assumes approximately normal data.",
      "Sensitive to departures from normality.",
      CAUTION_P
    ]
  };
}

export function runCorrelationTest(aValues, bValues, alternative = "two-sided", alpha = 0.05) {
  if (aValues.length !== bValues.length)
    return { error: "Correlation test requires equal sample sizes." };
  const n = aValues.length;
  if (n < 3) return { error: "Need at least 3 paired observations." };
  const r = pearsonR(aValues, bValues);
  if (r === null) return { error: "Cannot compute correlation (zero variance in one variable)." };
  if (Math.abs(r) === 1) {
    const sA = sampleStats(aValues);
    const sB = sampleStats(bValues);
    return {
      testName: "Correlation significance test (Pearson r)",
      nA: n, nB: n,
      meanA: sA.mean, meanB: sB.mean,
      varianceA: sA.variance, varianceB: sB.variance,
      statistic: r, df: n - 2,
      pValue: 0,
      alpha, significant: true,
      meanDiff: null, effectSize: r * r,
      cautions: [
        "Perfect correlation detected (r = ±1).",
        "r² (coefficient of determination) shown as effect size.",
        "Correlation does not imply causation.",
        CAUTION_P
      ]
    };
  }
  const t = r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r);
  const df = n - 2;
  const sA = sampleStats(aValues);
  const sB = sampleStats(bValues);
  return {
    testName: "Correlation significance test (Pearson r)",
    nA: n, nB: n,
    meanA: sA.mean, meanB: sB.mean,
    varianceA: sA.variance, varianceB: sB.variance,
    statistic: r, df,
    pValue: tPValue(t, df, alternative),
    alpha,
    get significant() { return this.pValue < alpha; },
    meanDiff: null, effectSize: r * r,
    cautions: [
      "Tests whether Pearson r differs from zero.",
      "Assumes approximately bivariate normal data.",
      "r² (coefficient of determination) shown as effect size.",
      "Correlation does not imply causation."
    ]
  };
}
