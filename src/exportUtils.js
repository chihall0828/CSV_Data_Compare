const APP_NAME = "CSV Data Compare";

export function safeFileSlug(name) {
  const slug = String(name ?? "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "dataset";
}

export function dateStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function downloadTextFile(filename, text, mimeType = "application/json") {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function describeSampleMode(sampleMode, sampleParams = {}) {
  switch (sampleMode) {
    case "first_n":
      return { mode: "first_n", n: sampleParams.n ?? null };
    case "last_n":
      return { mode: "last_n", n: sampleParams.n ?? null };
    case "random_n":
      return { mode: "random_n", n: sampleParams.n ?? null, seed: sampleParams.seed ?? null };
    case "row_range":
      return { mode: "row_range", start: sampleParams.start ?? null, end: sampleParams.end ?? null };
    default:
      return { mode: "all" };
  }
}

export function buildStatisticsExportPayload(result) {
  return {
    exportType: "statistics-result",
    app: APP_NAME,
    exportedAt: new Date().toISOString(),
    dataset: result.datasetName,
    column: result.column,
    sample: {
      ...describeSampleMode(result.sampleMode, result.sampleParams),
      rowsAfterFilter: result.filteredN,
      rowsInSample: result.sampledN
    },
    univariate: {
      count: result.n,
      missing: result.missingCount,
      mean: result.mean,
      variance: result.variance,
      stddev: result.stddev,
      min: result.min,
      max: result.max,
      median: result.median
    },
    bivariate: result.bivariate
      ? {
          columnA: result.bivariate.columnA,
          columnB: result.bivariate.columnB,
          validPairCount: result.bivariate.n,
          excludedPairs: result.bivariate.excludedCount,
          covariance: result.bivariate.covariance,
          pearsonCorrelation: result.bivariate.pearson,
          rSquared: result.bivariate.rSquared
        }
      : null
  };
}

export function buildHypothesisExportPayload(result, context = {}) {
  return {
    exportType: "hypothesis-test-result",
    app: APP_NAME,
    exportedAt: new Date().toISOString(),
    testName: result.testName,
    sampleA: context.sampleA ?? null,
    sampleB: context.sampleB ?? null,
    alternative: context.alternative ?? null,
    result: {
      nA: result.nA,
      nB: result.nB,
      meanA: result.meanA,
      meanB: result.meanB,
      varianceA: result.varianceA,
      varianceB: result.varianceB,
      statistic: result.statistic,
      degreesOfFreedom: result.df,
      pValue: result.pValue,
      alpha: result.alpha,
      significant: result.significant,
      meanDifference: result.meanDiff,
      effectSize: result.effectSize
    },
    cautions: result.cautions ?? []
  };
}

function mdValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return String(Number(value.toPrecision(10)));
  }
  return String(value);
}

function sampleModeLabel(sample) {
  if (!sample) return "all";
  switch (sample.mode) {
    case "first_n":
      return `First ${mdValue(sample.n)} rows`;
    case "last_n":
      return `Last ${mdValue(sample.n)} rows`;
    case "random_n":
      return `Random ${mdValue(sample.n)} rows (seed ${mdValue(sample.seed)})`;
    case "row_range":
      return `Row range ${mdValue(sample.start)}–${mdValue(sample.end)}`;
    default:
      return "All filtered rows";
  }
}

export function statisticsPayloadToMarkdown(payload) {
  const lines = [
    "# Statistics result",
    "",
    `- App: ${payload.app}`,
    `- Exported: ${payload.exportedAt}`,
    `- Dataset: ${payload.dataset}`,
    `- Column: ${payload.column}`,
    `- Sample mode: ${sampleModeLabel(payload.sample)}`,
    `- Rows after row filter: ${mdValue(payload.sample?.rowsAfterFilter)}`,
    `- Rows in statistics sample: ${mdValue(payload.sample?.rowsInSample)}`,
    "",
    "| Statistic | Value |",
    "|---|---|",
    `| Count (n) | ${mdValue(payload.univariate.count)} |`,
    `| Missing | ${mdValue(payload.univariate.missing)} |`,
    `| Mean | ${mdValue(payload.univariate.mean)} |`,
    `| Variance (unbiased) | ${mdValue(payload.univariate.variance)} |`,
    `| Std dev | ${mdValue(payload.univariate.stddev)} |`,
    `| Min | ${mdValue(payload.univariate.min)} |`,
    `| Max | ${mdValue(payload.univariate.max)} |`,
    `| Median | ${mdValue(payload.univariate.median)} |`
  ];

  if (payload.bivariate) {
    lines.push(
      "",
      "## Bivariate statistics",
      "",
      `- Column A: ${payload.bivariate.columnA}`,
      `- Column B: ${payload.bivariate.columnB}`,
      "",
      "| Statistic | Value |",
      "|---|---|",
      `| Valid pair count | ${mdValue(payload.bivariate.validPairCount)} |`,
      `| Excluded pairs | ${mdValue(payload.bivariate.excludedPairs)} |`,
      `| Covariance (unbiased) | ${mdValue(payload.bivariate.covariance)} |`,
      `| Pearson correlation | ${mdValue(payload.bivariate.pearsonCorrelation)} |`,
      `| R squared | ${mdValue(payload.bivariate.rSquared)} |`
    );
  }

  lines.push("");
  return lines.join("\n");
}

function sampleLine(label, sample) {
  if (!sample) return `- ${label}: —`;
  const parts = [sample.dataset, sample.column].filter(Boolean).join(" / ");
  const group = sample.group ? ` (group: ${sample.group})` : "";
  return `- ${label}: ${parts}${group}`;
}

export function hypothesisPayloadToMarkdown(payload) {
  const r = payload.result;
  const lines = [
    "# Hypothesis test result",
    "",
    `- App: ${payload.app}`,
    `- Exported: ${payload.exportedAt}`,
    `- Test: ${payload.testName}`,
    sampleLine("Sample A", payload.sampleA),
    sampleLine("Sample B", payload.sampleB),
    `- Alternative hypothesis: ${payload.alternative ?? "—"}`,
    "",
    "| Item | Value |",
    "|---|---|",
    `| Sample A n | ${mdValue(r.nA)} |`,
    `| Sample B n | ${mdValue(r.nB)} |`,
    `| Sample A mean | ${mdValue(r.meanA)} |`,
    `| Sample B mean | ${mdValue(r.meanB)} |`,
    `| Sample A variance | ${mdValue(r.varianceA)} |`,
    `| Sample B variance | ${mdValue(r.varianceB)} |`,
    `| Statistic | ${mdValue(r.statistic)} |`,
    `| Degrees of freedom | ${mdValue(r.degreesOfFreedom)} |`,
    `| p-value | ${mdValue(r.pValue)} |`,
    `| Alpha | ${mdValue(r.alpha)} |`,
    `| Judgement | ${r.significant ? "Significant" : "Not significant"} |`,
    `| Mean difference | ${mdValue(r.meanDifference)} |`,
    `| Effect size | ${mdValue(r.effectSize)} |`,
    "",
    "## Cautions",
    ""
  ];
  for (const caution of payload.cautions) {
    lines.push(`- ${caution}`);
  }
  lines.push("");
  return lines.join("\n");
}
