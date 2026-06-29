export const MAX_POINTS_PER_SERIES = 2500;
export const MAX_PREVIEW_ROWS = 120;
export const MAX_GROUP_VALUES = 80;

const MISSING_TOKENS = new Set([
  "",
  "na",
  "n/a",
  "nan",
  "null",
  "none",
  "undefined",
  "-",
  "--"
]);

const X_NAME_PATTERNS = [
  "epoch",
  "relative_epoch",
  "time",
  "timestamp",
  "datetime",
  "date",
  "relative_time_s",
  "seconds",
  "second",
  "sec",
  "s",
  "gpst",
  "tow"
];

const GROUP_NAME_PATTERNS = [
  "condition",
  "mode",
  "case",
  "trial",
  "run",
  "experiment",
  "label",
  "group",
  "pattern",
  "method",
  "scenario"
];

const ENU_PRIORITY = {
  e: [
    "e",
    "e_m",
    "fix_e_rov_m",
    "relative_e_m",
    "kf_e_m",
    "kf_nobias_e_m",
    "single_e_m",
    "bias_e_m_per_epoch",
    "rms_e_m"
  ],
  n: [
    "n",
    "n_m",
    "fix_n_rov_m",
    "relative_n_m",
    "kf_n_m",
    "kf_nobias_n_m",
    "single_n_m",
    "bias_n_m_per_epoch",
    "rms_n_m"
  ],
  u: [
    "u",
    "u_m",
    "fix_u_rov_m",
    "relative_u_m",
    "kf_u_m",
    "kf_nobias_u_m",
    "single_u_m",
    "bias_u_m_per_epoch",
    "rms_u_m"
  ]
};

export function cleanHeader(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim();
}

export function normalizeColumnKey(value) {
  return cleanHeader(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

export function isMissingValue(value) {
  const text = cleanHeader(value);
  return MISSING_TOKENS.has(text.toLowerCase());
}

export function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = cleanHeader(value);
  if (isMissingValue(text)) return null;
  const normalized = text.replace(/,/g, "");
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
    return null;
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function parseDateLike(value) {
  const text = cleanHeader(value);
  if (isMissingValue(text)) return null;

  const slashParts = text.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T/](\d{1,2})[:/](\d{1,2})(?:[:/](\d{1,2}))?)?$/
  );
  if (slashParts) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] = slashParts;
    const timestamp = Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    );
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatTimestamp(ms) {
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

export function isLikelyXColumn(name) {
  const key = normalizeColumnKey(name);
  return (
    X_NAME_PATTERNS.some((pattern) => key === pattern || key.includes(pattern)) ||
    cleanHeader(name).includes("秒") ||
    cleanHeader(name).includes("時刻")
  );
}

export function getColumnStats(rows, columns) {
  return columns.map((name) => {
    let missingCount = 0;
    let numericCount = 0;
    let dateCount = 0;
    let filledCount = 0;
    let invalidNumericCount = 0;

    for (const row of rows) {
      const value = row[name];
      if (isMissingValue(value)) {
        missingCount += 1;
        continue;
      }
      filledCount += 1;
      const numeric = toNumber(value);
      if (numeric !== null) {
        numericCount += 1;
        continue;
      }
      if (parseDateLike(value) !== null) {
        dateCount += 1;
      }
    }

    const numericRatio = filledCount === 0 ? 0 : numericCount / filledCount;
    const dateRatio = filledCount === 0 ? 0 : dateCount / filledCount;
    const isNumeric = numericCount > 0 && numericRatio >= 0.65;
    const isDateLike = dateCount > 0 && dateRatio >= 0.65;
    if (isNumeric) {
      invalidNumericCount = Math.max(0, filledCount - numericCount);
    }

    return {
      name,
      key: normalizeColumnKey(name),
      filledCount,
      missingCount,
      numericCount,
      dateCount,
      invalidNumericCount,
      isNumeric,
      isDateLike,
      isXCandidate: isLikelyXColumn(name) || isNumeric || isDateLike
    };
  });
}

function scoreXColumn(name) {
  const key = normalizeColumnKey(name);
  if (key === "epoch") return 100;
  if (key === "relative_epoch") return 96;
  if (key === "relative_time_s") return 94;
  if (key === "time") return 92;
  if (key === "timestamp") return 90;
  if (key.includes("time")) return 82;
  if (key.includes("epoch")) return 80;
  if (key.includes("sec") || key.includes("second") || cleanHeader(name).includes("秒")) return 74;
  return 20;
}

export function sortXColumns(stats) {
  return stats
    .slice()
    .sort((a, b) => {
      const aScore = scoreXColumn(a.name) + (a.isDateLike ? 18 : 0) + (a.isNumeric ? 8 : 0);
      const bScore = scoreXColumn(b.name) + (b.isDateLike ? 18 : 0) + (b.isNumeric ? 8 : 0);
      return bScore - aScore || a.name.localeCompare(b.name);
    })
    .map((stat) => stat.name);
}

function scoreGroupColumnName(name) {
  const key = normalizeColumnKey(name);
  const exactIndex = GROUP_NAME_PATTERNS.indexOf(key);
  if (exactIndex >= 0) return 120 - exactIndex * 4;
  const partialIndex = GROUP_NAME_PATTERNS.findIndex((pattern) => key.includes(pattern));
  return partialIndex >= 0 ? 90 - partialIndex * 3 : 0;
}

export function summarizeColumnValues(rows, column, maxValues = MAX_GROUP_VALUES) {
  const counts = new Map();
  let missingCount = 0;
  let filledCount = 0;
  let truncated = false;

  for (const row of rows) {
    if (isMissingValue(row?.[column])) {
      missingCount += 1;
      continue;
    }

    filledCount += 1;
    const value = cleanHeader(row[column]);
    if (!counts.has(value) && counts.size >= maxValues) {
      truncated = true;
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const values = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  return {
    values,
    uniqueCount: values.length + (truncated ? 1 : 0),
    visibleUniqueCount: values.length,
    filledCount,
    missingCount,
    truncated
  };
}

export function getGroupColumnCandidates(dataset, rows = dataset.rows) {
  const candidates = [];

  for (const stat of dataset.columnStats) {
    const summary = summarizeColumnValues(rows, stat.name, MAX_GROUP_VALUES);
    if (summary.filledCount === 0 || summary.uniqueCount < 2) continue;

    const uniqueRatio = summary.uniqueCount / summary.filledCount;
    const nameScore = scoreGroupColumnName(stat.name);
    const isLowCardinality =
      summary.uniqueCount <= 30 ||
      (summary.uniqueCount <= MAX_GROUP_VALUES && uniqueRatio <= 0.25);
    const isCandidate =
      nameScore > 0 ||
      (!stat.isNumeric && isLowCardinality) ||
      (stat.isNumeric && isLowCardinality && uniqueRatio <= 0.12);

    if (!isCandidate) continue;

    const score =
      nameScore +
      (stat.isNumeric ? 0 : 24) +
      Math.max(0, 30 - summary.uniqueCount) +
      Math.round((1 - Math.min(uniqueRatio, 1)) * 20);

    candidates.push({
      name: stat.name,
      uniqueCount: summary.uniqueCount,
      visibleUniqueCount: summary.visibleUniqueCount,
      filledCount: summary.filledCount,
      missingCount: summary.missingCount,
      uniqueRatio,
      values: summary.values,
      truncated: summary.truncated,
      score,
      label: `${stat.name} (${summary.uniqueCount.toLocaleString()} groups)`
    });
  }

  return candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.uniqueCount - b.uniqueCount ||
      a.uniqueRatio - b.uniqueRatio ||
      a.name.localeCompare(b.name)
  );
}

export function makeGroupVisibility(values, current = {}) {
  const next = {};
  for (const item of values) {
    const value = typeof item === "string" ? item : item.value;
    next[value] = current[value] ?? true;
  }
  return next;
}

export function applyRowFilter(rows, rowFilter = {}) {
  const start = Number.isInteger(rowFilter.start) ? rowFilter.start : 1;
  const end = Number.isInteger(rowFilter.end) ? rowFilter.end : rows.length;
  return rows.slice(Math.max(0, start - 1), Math.min(rows.length, end));
}

export function rowFilterLabel(rowFilter = {}, rowCount = 0) {
  const start = Number.isInteger(rowFilter.start) ? rowFilter.start : 1;
  const end = Number.isInteger(rowFilter.end) ? rowFilter.end : rowCount;
  if (start <= 1 && end >= rowCount) return "All rows";
  return `${start.toLocaleString()}-${end.toLocaleString()}`;
}

export function splitRowsByGroup(rows, groupColumn, visibleGroups = {}) {
  if (!groupColumn) return [{ key: "", label: "", rows }];

  const groups = new Map();
  for (const row of rows) {
    const rawValue = isMissingValue(row?.[groupColumn]) ? "(blank)" : cleanHeader(row[groupColumn]);
    if (visibleGroups[rawValue] === false) continue;
    if (!groups.has(rawValue)) groups.set(rawValue, []);
    groups.get(rawValue).push(row);
  }

  return [...groups.entries()]
    .map(([value, groupRows]) => ({
      key: value,
      label: `${groupColumn}=${value}`,
      value,
      rows: groupRows
    }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

function tokenIncludesAxis(key, axis) {
  const tokens = key.split("_").filter(Boolean);
  return (
    tokens.includes(axis) ||
    key === axis ||
    key === `${axis}m` ||
    key.startsWith(`${axis}方向`) ||
    key.startsWith(`${axis}_direction`) ||
    key.startsWith(`${axis}_dir`)
  );
}

export function scoreEnuColumn(name, axis) {
  const key = normalizeColumnKey(name);
  const priority = ENU_PRIORITY[axis] ?? [];
  const exactIndex = priority.indexOf(key);
  if (exactIndex >= 0) return 100 - exactIndex * 3;
  if (!tokenIncludesAxis(key, axis)) return -1;
  let score = 48;
  if (key.endsWith(`_${axis}_m`) || key.includes(`_${axis}_m_`)) score += 18;
  if (key.includes("relative")) score += 12;
  if (key.startsWith("kf_")) score += 10;
  if (key.includes("fix")) score += 9;
  if (key.includes("single")) score += 4;
  if (key.includes("error")) score -= 18;
  if (key.includes("rms")) score -= 12;
  return score;
}

export function pickAxisColumn(stats, axis) {
  return stats
    .filter((stat) => stat.isNumeric)
    .map((stat) => ({ name: stat.name, score: scoreEnuColumn(stat.name, axis) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))[0]?.name ?? "";
}

function enuFamilyKey(name, axis) {
  const key = normalizeColumnKey(name);
  return key
    .replace(new RegExp(`(^|_)${axis}(_|$)`, "g"), "$1{axis}$2")
    .replace(new RegExp(`^${axis}方向`), "{axis}方向");
}

function getEnuFamilies(stats) {
  const families = new Map();
  for (const axis of ["e", "n", "u"]) {
    for (const stat of stats) {
      if (!stat.isNumeric) continue;
      const score = scoreEnuColumn(stat.name, axis);
      if (score < 0) continue;
      const key = enuFamilyKey(stat.name, axis);
      const family = families.get(key) ?? { key, axes: {}, score: 0 };
      const current = family.axes[axis];
      if (!current || score > current.score) {
        family.axes[axis] = { name: stat.name, score };
      }
      family.score += score;
      families.set(key, family);
    }
  }

  return [...families.values()].filter((family) => Object.keys(family.axes).length >= 2);
}

export function pickInitialYColumns(datasets) {
  const familyScores = new Map();
  for (const dataset of datasets) {
    for (const family of getEnuFamilies(dataset.columnStats)) {
      const current = familyScores.get(family.key) ?? {
        key: family.key,
        datasetCount: 0,
        axisCount: 0,
        score: 0,
        axes: {}
      };
      current.datasetCount += 1;
      current.axisCount += Object.keys(family.axes).length;
      current.score += family.score;
      for (const axis of ["e", "n", "u"]) {
        if (family.axes[axis] && !current.axes[axis]) current.axes[axis] = family.axes[axis].name;
      }
      familyScores.set(family.key, current);
    }
  }

  const bestFamily = [...familyScores.values()].sort(
    (a, b) =>
      b.datasetCount - a.datasetCount ||
      b.axisCount - a.axisCount ||
      b.score - a.score ||
      a.key.localeCompare(b.key)
  )[0];
  const representativeColumns = bestFamily ? ["e", "n", "u"].map((axis) => bestFamily.axes[axis]).filter(Boolean) : [];
  if (representativeColumns.length >= 2) return representativeColumns;

  const firstWithNumeric = datasets.find((dataset) => dataset.numericColumns.length > 0);
  if (!firstWithNumeric) return [];

  const e = pickAxisColumn(firstWithNumeric.columnStats, "e");
  const n = pickAxisColumn(firstWithNumeric.columnStats, "n");
  const u = pickAxisColumn(firstWithNumeric.columnStats, "u");
  const enu = [e, n, u].filter(Boolean);
  if (enu.length >= 2) return enu;

  return firstWithNumeric.numericColumns
    .slice()
    .sort((a, b) => scoreYColumn(b) - scoreYColumn(a) || a.localeCompare(b))
    .slice(0, 3);
}

export function scoreYColumn(name) {
  return Math.max(
    scoreEnuColumn(name, "e"),
    scoreEnuColumn(name, "n"),
    scoreEnuColumn(name, "u"),
    0
  );
}

export function inferXType(rows, column) {
  if (!column) return "category";
  let filled = 0;
  let numeric = 0;
  let date = 0;
  const limit = Math.min(rows.length, 1000);
  const step = Math.max(1, Math.floor(rows.length / Math.max(1, limit)));

  for (let index = 0; index < rows.length; index += step) {
    const value = rows[index]?.[column];
    if (isMissingValue(value)) continue;
    filled += 1;
    if (toNumber(value) !== null) {
      numeric += 1;
    } else if (parseDateLike(value) !== null) {
      date += 1;
    }
  }

  if (filled === 0) return "category";
  if (numeric / filled >= 0.65) return "number";
  if (date / filled >= 0.65) return "time";
  return "category";
}

export function parseXValue(value, type, fallbackIndex) {
  if (type === "number") {
    const numeric = toNumber(value);
    return numeric ?? null;
  }
  if (type === "time") {
    return parseDateLike(value);
  }
  const text = cleanHeader(value);
  return text || String(fallbackIndex + 1);
}

export function parseAxisLimit(value, type) {
  if (isMissingValue(value)) return undefined;
  if (type === "time") return parseDateLike(value) ?? undefined;
  if (type === "number") return toNumber(value) ?? undefined;
  return undefined;
}

export function downsamplePoints(points, maxPoints = MAX_POINTS_PER_SERIES) {
  if (points.length <= maxPoints) return points;
  const sampled = [];
  const lastIndex = points.length - 1;
  const stride = lastIndex / (maxPoints - 1);
  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(points[Math.round(index * stride)]);
  }
  return sampled;
}

export function summarizeXValuesFromRows(rows, xColumn, xType) {
  const counts = new Map();
  let validCount = 0;
  let missingCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const x = parseXValue(rows[index]?.[xColumn], xType, index);
    if (x === null || x === undefined || x === "") {
      missingCount += 1;
      continue;
    }

    const key = xType === "time" || xType === "number" ? String(x) : cleanHeader(x);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    validCount += 1;
  }

  let duplicateValueCount = 0;
  let duplicateRowCount = 0;
  for (const count of counts.values()) {
    if (count > 1) {
      duplicateValueCount += 1;
      duplicateRowCount += count - 1;
    }
  }

  return {
    validCount,
    missingCount,
    uniqueCount: counts.size,
    duplicateValueCount,
    duplicateRowCount
  };
}

export function summarizeXValues(dataset, xColumn, xType) {
  return summarizeXValuesFromRows(dataset.rows, xColumn, xType);
}

export function makeSeriesPointsFromRows(rows, xColumn, yColumn, xType, maxPoints) {
  const points = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const y = toNumber(row[yColumn]);
    if (y === null) continue;
    const x = parseXValue(row[xColumn], xType, index);
    if (x === null || x === undefined || x === "") continue;
    points.push({ x, y, sourceIndex: index });
  }
  return downsamplePoints(points, maxPoints);
}

export function makeSeriesPoints(dataset, xColumn, yColumn, xType, maxPoints) {
  return makeSeriesPointsFromRows(dataset.rows, xColumn, yColumn, xType, maxPoints);
}

export function makeEnuPointsFromRows(rows, eColumn, nColumn, maxPoints) {
  const points = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const x = toNumber(row[eColumn]);
    const y = toNumber(row[nColumn]);
    if (x === null || y === null) continue;
    points.push({ x, y, sourceIndex: index });
  }
  return downsamplePoints(points, maxPoints);
}

export function makeEnuPoints(dataset, eColumn, nColumn, maxPoints) {
  return makeEnuPointsFromRows(dataset.rows, eColumn, nColumn, maxPoints);
}

export function analyzeParsedCsv(results, fileName, color) {
  const rawColumns = (results.meta.fields ?? []).map(cleanHeader).filter(Boolean);
  const columns = [...new Set(rawColumns)];
  if (columns.length === 0) {
    throw new Error(`${fileName}: header row was not found.`);
  }

  const rows = (results.data ?? [])
    .map((row) => {
      const cleaned = {};
      for (const column of columns) cleaned[column] = row[column] ?? "";
      return cleaned;
    })
    .filter((row) => columns.some((column) => !isMissingValue(row[column])));

  if (rows.length === 0) {
    throw new Error(`${fileName}: no data rows were found.`);
  }

  const columnStats = getColumnStats(rows, columns);
  const numericColumns = columnStats.filter((stat) => stat.isNumeric).map((stat) => stat.name);
  const nonNumericColumns = columnStats.filter((stat) => !stat.isNumeric).map((stat) => stat.name);
  const xCandidates = sortXColumns(columnStats);
  const missingValueCount = columnStats.reduce((sum, stat) => sum + stat.missingCount, 0);
  const invalidNumericCount = columnStats.reduce((sum, stat) => sum + stat.invalidNumericCount, 0);
  const xColumn = xCandidates[0] ?? columns[0] ?? "";

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}-${fileName}`,
    name: fileName,
    color,
    active: true,
    rows,
    columns,
    columnStats,
    numericColumns,
    nonNumericColumns,
    xCandidates,
    xColumn,
    groupColumn: "",
    visibleGroups: {},
    groupFilterSearch: "",
    rowFilter: { start: null, end: null },
    rowFilterDraftStart: "",
    rowFilterDraftEnd: "",
    enuPreset: "",
    eColumn: pickAxisColumn(columnStats, "e"),
    nColumn: pickAxisColumn(columnStats, "n"),
    uColumn: pickAxisColumn(columnStats, "u"),
    rowCount: rows.length,
    columnCount: columns.length,
    missingValueCount,
    invalidNumericCount,
    parseWarnings: (results.errors ?? []).slice(0, 5).map((error) => error.message)
  };
}

export function unionColumns(datasets, selector) {
  const seen = new Set();
  for (const dataset of datasets) {
    for (const column of selector(dataset)) seen.add(column);
  }
  return [...seen].sort((a, b) => scoreYColumn(b) - scoreYColumn(a) || a.localeCompare(b));
}

export function getColumnStat(dataset, column) {
  return dataset.columnStats.find((stat) => stat.name === column);
}
