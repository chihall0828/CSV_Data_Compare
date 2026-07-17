import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, Line, Scatter } from "react-chartjs-2";
import Papa from "papaparse";
import {
  AlertCircle,
  BarChart3,
  Download,
  FileSpreadsheet,
  Layers,
  LineChart,
  Route,
  ScatterChart,
  Settings2,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import {
  MAX_POINTS_PER_SERIES,
  MAX_PREVIEW_ROWS,
  analyzeParsedCsv,
  applyRowFilter,
  cleanHeader,
  formatTimestamp,
  getColumnStat,
  getColumnStats,
  getGroupColumnCandidates,
  inferXType,
  makeEnuPoints,
  makeEnuPointsFromRows,
  makeGroupVisibility,
  makeSeriesPointsFromRows,
  parseAxisLimit,
  pickAxisColumn,
  pickInitialYColumns,
  rowFilterLabel,
  splitRowsByGroup,
  sortXColumns,
  summarizeXValues,
  summarizeXValuesFromRows,
  unionColumns
} from "./dataUtils.js";
import { compileFormula, evaluateCompiledFormula } from "./formulaUtils.js";
import CalculatedColumnsEditor from "./CalculatedColumnsEditor.jsx";
import { parseXlsxWorkbook, rowsToParsedData } from "./xlsxUtils.js";
import StatisticsPanel from "./StatisticsPanel.jsx";
import {
  PLOT_COLOR_CUSTOM,
  PLOT_COLOR_OPTIONS,
  PLOT_LINE_STYLE_OPTIONS,
  isValidHexColor,
  normalizeHexColor,
  normalizePlotColor,
  normalizePlotLineStyle,
  plotStyleForStorage,
  plotStyleFromStorage,
  resolveDatasetColor,
  resolveDatasetLineDash
} from "./plotStyleUtils.js";

const APP_NAME = "CSV Data Compare";
const DISPLAY_SETTINGS_KEY = "csv-data-compare-display-settings";
const DATASET_SETTINGS_KEY = "csv-data-compare-dataset-settings";
const DEFAULT_DISPLAY_SETTINGS = {
  lineWidth: 2,
  showPointMarkers: false,
  markerSize: 5,
  endpointMarkerSize: 9,
  equalScale: true,
  legendMode: "compact",
  titleFontSize: 18,
  axisLabelFontSize: 14,
  tickFontSize: 12,
  legendFontSize: 12,
  pngBackground: "white",
  pngScale: 2,
  imageWidth: 1200,
  imageHeight: 700,
  xScaleType: "linear",
  yScaleType: "linear"
};

const LEGEND_MODES = [
  { value: "full", label: "Full" },
  { value: "compact", label: "Compact" },
  { value: "hidden", label: "Hidden" }
];

const CHART_TYPES = [
  { value: "line", label: "折れ線", icon: LineChart },
  { value: "scatter", label: "散布図", icon: ScatterChart },
  { value: "bar", label: "棒グラフ", icon: BarChart3 }
];

const GRAPH_MODES = [
  { value: "timeseries", label: "Time Series Plot", icon: Layers },
  { value: "enu", label: "XY Plot", icon: Route }
];

const AXIS_SCALE_TYPES = [
  { value: "linear", label: "線形" },
  { value: "logarithmic", label: "対数" }
];

const XY_SERIES_STYLE_KEY = "__xy__";

const SERIES_COLORS = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#be123c",
  "#4f46e5",
  "#64748b",
  "#ca8a04"
];

const DASH_PATTERNS = [[], [6, 4], [2, 3], [10, 4, 2, 4]];
const MAX_GROUP_CHECKBOXES = 80;
const TRACE_WARNING_THRESHOLD = 20;

// Bundled sample files live under the app's base path. On GitHub Pages the
// app is served from /CSV_Data_Compare/, so absolute "/..." URLs would 404.
function withBase(path) {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base.replace(/\/$/, "")}${path}`;
}

const COMPARISON_SAMPLE_FILES = ["/sample-gnss.csv", "/sample-gnss-2.csv"];

const REAL_SAMPLE_FILES = [
  "/real-samples/20260525_1KF_result_ENU_normal.csv",
  "/real-samples/20260525_1KF_result_ENU_block_az0_60_ele70.csv",
  "/real-samples/20260525_1Comparison_timeseries.csv"
];

const TEST_SAMPLE_FILES = [
  "/test-samples/missing-values.csv",
  "/test-samples/non-numeric-mixed.csv",
  "/test-samples/日本語ファイル名.csv",
  "/test-samples/no-enu-columns.csv",
  "/test-samples/large-sample.csv",
  "/test-samples/column-calculation.csv"
];

const ENU_PRESETS = {
  kf: {
    label: "Use KF_E/KF_N/KF_U",
    e: ["KF_E_m", "KF_E", "kf_e_m"],
    n: ["KF_N_m", "KF_N", "kf_n_m"],
    u: ["KF_U_m", "KF_U", "kf_u_m"]
  },
  relative: {
    label: "Use Relative_E/Relative_N/Relative_U",
    e: ["Relative_E_m", "Relative_E", "relative_e_m"],
    n: ["Relative_N_m", "Relative_N", "relative_n_m"],
    u: ["Relative_U_m", "Relative_U", "relative_u_m"]
  }
};

const PAPA_CONFIG = {
  header: true,
  skipEmptyLines: "greedy",
  dynamicTyping: false,
  delimitersToGuess: [",", "\t", ";", "|"]
};

function shortName(name) {
  return name.replace(/\.(csv|xlsx|xls)$/i, "");
}

function axisTitleFallback(mode, yColumns) {
  if (mode === "enu") return { title: "XY plot comparison", x: "XY X value", y: "XY Y value" };
  return {
    title: yColumns.length ? `${yColumns.join(", ")} comparison` : "CSV comparison",
    x: "X axis",
    y: yColumns.length === 1 ? yColumns[0] : "Y axis"
  };
}

function colorForIndex(index) {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

function stableHash(value) {
  const text = cleanHeader(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function colorForGroupValue(value) {
  return colorForIndex(stableHash(value) % SERIES_COLORS.length);
}

function lineStyle(index) {
  return DASH_PATTERNS[index % DASH_PATTERNS.length];
}

function getSeriesStyle(dataset, seriesKey) {
  const style = dataset.seriesStyles?.[seriesKey];
  return style && typeof style === "object" ? style : {};
}

function resolveSeriesStyleColor(dataset, seriesKey, fallbackColor) {
  return normalizeHexColor(getSeriesStyle(dataset, seriesKey).color) || resolveDatasetColor(dataset, fallbackColor);
}

function resolveSeriesPointColor(dataset, seriesKey, fallbackColor) {
  return normalizeHexColor(getSeriesStyle(dataset, seriesKey).pointColor) || resolveSeriesStyleColor(dataset, seriesKey, fallbackColor);
}

function resolveSeriesPointSize(dataset, seriesKey, fallbackSize) {
  const value = getSeriesStyle(dataset, seriesKey).pointSize;
  if (value === null || value === undefined || value === "") return fallbackSize;
  return clampNumber(value, 1, 30, fallbackSize);
}

function compactGroupValue(value) {
  return cleanHeader(value)
    .replace(/_ele\d+/gi, "")
    .replace(/_seed\d+/gi, "")
    .replace(/^condition=/i, "");
}

function fullTraceLabel({ fileName, groupLabel, column, role }) {
  return [shortName(fileName), groupLabel, column, role].filter(Boolean).join(" | ");
}

function displayTraceLabel(meta, legendMode) {
  if (legendMode === "full") return fullTraceLabel(meta);
  const group = meta.groupValue ? compactGroupValue(meta.groupValue) : "";
  return [group || shortName(meta.fileName), meta.column, meta.role].filter(Boolean).join(" / ");
}

function getFilteredRows(dataset) {
  return applyRowFilter(dataset.rows, dataset.rowFilter);
}

function getGroupEntries(dataset, rows) {
  return splitRowsByGroup(rows, dataset.groupColumn, dataset.visibleGroups);
}

function isFullRowFilter(rowFilter = {}) {
  return !Number.isInteger(rowFilter.start) && !Number.isInteger(rowFilter.end);
}

function datasetSettingsKey(dataset) {
  return `${dataset.name}::${dataset.columns.join("|")}`;
}

function readJsonStorage(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function parseRowRange(startText, endText, rowCount) {
  const startTrimmed = cleanHeader(startText);
  const endTrimmed = cleanHeader(endText);
  const start = startTrimmed ? Number(startTrimmed) : null;
  const end = endTrimmed ? Number(endTrimmed) : null;

  if ((startTrimmed && (!Number.isInteger(start) || start < 1)) || (endTrimmed && (!Number.isInteger(end) || end < 1))) {
    return { ok: false, message: "Row filter accepts positive integer row numbers." };
  }
  if (start !== null && end !== null && start > end) {
    return { ok: false, message: "Row filter start must be less than or equal to end." };
  }
  if ((start ?? 1) > rowCount) {
    return { ok: false, message: `Row filter start is beyond the ${rowCount.toLocaleString()} data rows.` };
  }

  return {
    ok: true,
    rowFilter: {
      start: start ?? null,
      end: end !== null ? Math.min(end, rowCount) : null
    }
  };
}

function findColumnByCandidateNames(dataset, names) {
  const lowered = names.map((name) => cleanHeader(name).toLowerCase());
  return dataset.numericColumns.find((column) => lowered.includes(cleanHeader(column).toLowerCase())) ?? "";
}

function buildExtent(seriesList) {
  const xs = [];
  const ys = [];
  for (const series of seriesList) {
    for (const point of series.data) {
      if (Number.isFinite(point.x)) xs.push(point.x);
      if (Number.isFinite(point.y)) ys.push(point.y);
    }
  }
  if (!xs.length || !ys.length) return null;
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function makeEqualScale(extent) {
  if (!extent) return {};
  const xCenter = (extent.minX + extent.maxX) / 2;
  const yCenter = (extent.minY + extent.maxY) / 2;
  const span = Math.max(extent.maxX - extent.minX, extent.maxY - extent.minY, 1e-9);
  const padding = span * 0.08;
  const half = span / 2 + padding;
  return {
    x: { min: xCenter - half, max: xCenter + half },
    y: { min: yCenter - half, max: yCenter + half }
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function readDisplaySettings() {
  if (typeof window === "undefined") return DEFAULT_DISPLAY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(DISPLAY_SETTINGS_KEY);
    if (!raw) return DEFAULT_DISPLAY_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      lineWidth: clampNumber(parsed.lineWidth, 1, 5, DEFAULT_DISPLAY_SETTINGS.lineWidth),
      showPointMarkers: Boolean(parsed.showPointMarkers),
      markerSize: clampNumber(parsed.markerSize, 2, 10, DEFAULT_DISPLAY_SETTINGS.markerSize),
      endpointMarkerSize: clampNumber(parsed.endpointMarkerSize, 6, 16, DEFAULT_DISPLAY_SETTINGS.endpointMarkerSize),
      equalScale: typeof parsed.equalScale === "boolean" ? parsed.equalScale : DEFAULT_DISPLAY_SETTINGS.equalScale,
      legendMode: LEGEND_MODES.some((item) => item.value === parsed.legendMode) ? parsed.legendMode : DEFAULT_DISPLAY_SETTINGS.legendMode,
      titleFontSize: clampNumber(parsed.titleFontSize, 8, 36, DEFAULT_DISPLAY_SETTINGS.titleFontSize),
      axisLabelFontSize: clampNumber(parsed.axisLabelFontSize, 8, 30, DEFAULT_DISPLAY_SETTINGS.axisLabelFontSize),
      tickFontSize: clampNumber(parsed.tickFontSize, 8, 24, DEFAULT_DISPLAY_SETTINGS.tickFontSize),
      legendFontSize: clampNumber(parsed.legendFontSize, 8, 24, DEFAULT_DISPLAY_SETTINGS.legendFontSize),
      graphMode: GRAPH_MODES.some((item) => item.value === parsed.graphMode) ? parsed.graphMode : "timeseries",
      chartType: CHART_TYPES.some((item) => item.value === parsed.chartType) ? parsed.chartType : "line",
      selectedYColumns: Array.isArray(parsed.selectedYColumns) ? parsed.selectedYColumns : [],
      globalXColumn: parsed.globalXColumn ?? "",
      title: parsed.title ?? "",
      xAxisLabel: parsed.xAxisLabel ?? "",
      yAxisLabel: parsed.yAxisLabel ?? "",
      xMin: parsed.xMin ?? "",
      xMax: parsed.xMax ?? "",
      yMin: parsed.yMin ?? "",
      yMax: parsed.yMax ?? "",
      xScaleType: AXIS_SCALE_TYPES.some((item) => item.value === parsed.xScaleType) ? parsed.xScaleType : DEFAULT_DISPLAY_SETTINGS.xScaleType,
      yScaleType: AXIS_SCALE_TYPES.some((item) => item.value === parsed.yScaleType) ? parsed.yScaleType : DEFAULT_DISPLAY_SETTINGS.yScaleType,
      imageWidth: clampNumber(parsed.imageWidth, 480, 3000, DEFAULT_DISPLAY_SETTINGS.imageWidth),
      imageHeight: clampNumber(parsed.imageHeight, 320, 2200, DEFAULT_DISPLAY_SETTINGS.imageHeight),
      pngBackground: ["white", "transparent"].includes(parsed.pngBackground) ? parsed.pngBackground : DEFAULT_DISPLAY_SETTINGS.pngBackground,
      pngScale: [1, 2, 3].includes(Number(parsed.pngScale)) ? Number(parsed.pngScale) : DEFAULT_DISPLAY_SETTINGS.pngScale
    };
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

function readDatasetSettings() {
  return readJsonStorage(DATASET_SETTINGS_KEY, {});
}

function applyStoredDatasetSettings(dataset, storedSettings = readDatasetSettings()) {
  const saved = storedSettings[datasetSettingsKey(dataset)];
  if (!saved) return dataset;
  const next = { ...dataset };
  if (dataset.columns.includes(saved.xColumn)) next.xColumn = saved.xColumn;
  if (dataset.numericColumns.includes(saved.eColumn)) next.eColumn = saved.eColumn;
  if (dataset.numericColumns.includes(saved.nColumn)) next.nColumn = saved.nColumn;
  if (dataset.numericColumns.includes(saved.uColumn)) next.uColumn = saved.uColumn;
  if (dataset.columns.includes(saved.groupColumn)) {
    const candidate = getGroupColumnCandidates(dataset).find((item) => item.name === saved.groupColumn);
    next.groupColumn = saved.groupColumn;
    next.visibleGroups = makeGroupVisibility(candidate?.values ?? [], saved.visibleGroups ?? {});
  }
  const start = Number.isInteger(saved.rowFilter?.start) ? Math.min(saved.rowFilter.start, dataset.rowCount) : null;
  const end = Number.isInteger(saved.rowFilter?.end) ? Math.min(saved.rowFilter.end, dataset.rowCount) : null;
  next.rowFilter = { start, end };
  next.rowFilterDraftStart = start ? String(start) : "";
  next.rowFilterDraftEnd = end ? String(end) : "";
  next.enuPreset = saved.enuPreset ?? "";
  next.seriesStyles = saved.seriesStyles && typeof saved.seriesStyles === "object" ? saved.seriesStyles : {};
  Object.assign(next, plotStyleFromStorage(saved));
  return next;
}

async function readCsvFileText(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const candidates = ["utf-8", "shift_jis"];

  for (const encoding of candidates) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: true });
      return { text: decoder.decode(bytes), encoding };
    } catch {
      // Try the next decoder.
    }
  }

  return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8-fallback" };
}

async function hashText(text) {
  if (globalThis.crypto?.subtle) {
    const buffer = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return `fallback-${hash.toString(16)}`;
}

async function hashBytes(buffer) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer.slice(0));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  const bytes = new Uint8Array(buffer);
  let hash = 0;
  for (const byte of bytes) hash = (hash * 31 + byte) >>> 0;
  return `fallback-${hash.toString(16)}`;
}

function fileFingerprint(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function findDuplicateDataset(existingDatasets, candidate) {
  return existingDatasets.find((dataset) => {
    if (candidate.contentHash && dataset.contentHash && candidate.contentHash === dataset.contentHash) return true;
    if (candidate.sourceFingerprint && dataset.sourceFingerprint === candidate.sourceFingerprint) return true;
    return false;
  });
}

function rebuildDatasetColumns(dataset, rows, columns, patch = {}) {
  const columnStats = getColumnStats(rows, columns);
  const numericColumns = columnStats.filter((stat) => stat.isNumeric).map((stat) => stat.name);
  const nonNumericColumns = columnStats.filter((stat) => !stat.isNumeric).map((stat) => stat.name);
  const xCandidates = sortXColumns(columnStats);
  const missingValueCount = columnStats.reduce((sum, stat) => sum + stat.missingCount, 0);
  const invalidNumericCount = columnStats.reduce((sum, stat) => sum + stat.invalidNumericCount, 0);

  return {
    ...dataset,
    ...patch,
    rows,
    columns,
    columnStats,
    numericColumns,
    nonNumericColumns,
    xCandidates,
    xColumn: columns.includes(dataset.xColumn) ? dataset.xColumn : xCandidates[0] ?? columns[0] ?? "",
    eColumn: numericColumns.includes(dataset.eColumn) ? dataset.eColumn : pickAxisColumn(columnStats, "e"),
    nColumn: numericColumns.includes(dataset.nColumn) ? dataset.nColumn : pickAxisColumn(columnStats, "n"),
    uColumn: numericColumns.includes(dataset.uColumn) ? dataset.uColumn : pickAxisColumn(columnStats, "u"),
    rowCount: rows.length,
    columnCount: columns.length,
    missingValueCount,
    invalidNumericCount
  };
}

function makeUniqueColumnName(columns, requestedName) {
  const base = cleanHeader(requestedName);
  if (!base) throw new Error("New column name is empty.");
  if (!columns.includes(base)) return base;

  let index = 2;
  let candidate = `${base}_calc`;
  while (columns.includes(candidate)) {
    candidate = `${base}_calc_${index}`;
    index += 1;
  }
  return candidate;
}

function safeFilePart(value) {
  return cleanHeader(value)
    .replace(/\.(csv|xlsx|xls)$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "dataset";
}

function xTypeLabel(type) {
  if (type === "time") return "時刻";
  if (type === "number") return "数値";
  return "文字列";
}

export default function App() {
  const initialDisplaySettings = useMemo(() => readDisplaySettings(), []);
  const [datasets, setDatasets] = useState([]);
  const [graphMode, setGraphMode] = useState(initialDisplaySettings.graphMode ?? "timeseries");
  const [chartType, setChartType] = useState(initialDisplaySettings.chartType ?? "line");
  const [selectedYColumns, setSelectedYColumns] = useState(initialDisplaySettings.selectedYColumns ?? []);
  const [globalXColumn, setGlobalXColumn] = useState(initialDisplaySettings.globalXColumn ?? "");
  const [title, setTitle] = useState(initialDisplaySettings.title ?? "");
  const [xAxisLabel, setXAxisLabel] = useState(initialDisplaySettings.xAxisLabel ?? "");
  const [yAxisLabel, setYAxisLabel] = useState(initialDisplaySettings.yAxisLabel ?? "");
  const [xMin, setXMin] = useState(initialDisplaySettings.xMin ?? "");
  const [xMax, setXMax] = useState(initialDisplaySettings.xMax ?? "");
  const [yMin, setYMin] = useState(initialDisplaySettings.yMin ?? "");
  const [yMax, setYMax] = useState(initialDisplaySettings.yMax ?? "");
  const [lineWidth, setLineWidth] = useState(initialDisplaySettings.lineWidth);
  const [showPointMarkers, setShowPointMarkers] = useState(initialDisplaySettings.showPointMarkers);
  const [markerSize, setMarkerSize] = useState(initialDisplaySettings.markerSize);
  const [endpointMarkerSize, setEndpointMarkerSize] = useState(initialDisplaySettings.endpointMarkerSize);
  const [equalScale, setEqualScale] = useState(initialDisplaySettings.equalScale);
  const [legendMode, setLegendMode] = useState(initialDisplaySettings.legendMode);
  const [titleFontSize, setTitleFontSize] = useState(initialDisplaySettings.titleFontSize);
  const [axisLabelFontSize, setAxisLabelFontSize] = useState(initialDisplaySettings.axisLabelFontSize);
  const [tickFontSize, setTickFontSize] = useState(initialDisplaySettings.tickFontSize);
  const [legendFontSize, setLegendFontSize] = useState(initialDisplaySettings.legendFontSize);
  const [previewDatasetId, setPreviewDatasetId] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [pngBackground, setPngBackground] = useState(initialDisplaySettings.pngBackground ?? DEFAULT_DISPLAY_SETTINGS.pngBackground);
  const [pngScale, setPngScale] = useState(initialDisplaySettings.pngScale ?? DEFAULT_DISPLAY_SETTINGS.pngScale);
  const [imageWidth, setImageWidth] = useState(initialDisplaySettings.imageWidth ?? DEFAULT_DISPLAY_SETTINGS.imageWidth);
  const [imageHeight, setImageHeight] = useState(initialDisplaySettings.imageHeight ?? DEFAULT_DISPLAY_SETTINGS.imageHeight);
  const [xScaleType, setXScaleType] = useState(initialDisplaySettings.xScaleType ?? DEFAULT_DISPLAY_SETTINGS.xScaleType);
  const [yScaleType, setYScaleType] = useState(initialDisplaySettings.yScaleType ?? DEFAULT_DISPLAY_SETTINGS.yScaleType);
  const [modal, setModal] = useState(null);
  const fileInputRef = useRef(null);
  const settingsInputRef = useRef(null);
  const chartRef = useRef(null);
  const modalResolveRef = useRef(null);

  function showModal(config) {
    return new Promise((resolve) => {
      modalResolveRef.current = resolve;
      setModal(config);
    });
  }

  function closeModal(result) {
    if (modalResolveRef.current) {
      modalResolveRef.current(result);
      modalResolveRef.current = null;
    }
    setModal(null);
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(
        DISPLAY_SETTINGS_KEY,
        JSON.stringify({
          graphMode,
          chartType,
          selectedYColumns,
          globalXColumn,
          title,
          xAxisLabel,
          yAxisLabel,
          xMin,
          xMax,
          yMin,
          yMax,
          lineWidth,
          showPointMarkers,
          markerSize,
          endpointMarkerSize,
          equalScale,
          legendMode,
          titleFontSize,
          axisLabelFontSize,
          tickFontSize,
          legendFontSize,
          xScaleType,
          yScaleType,
          imageWidth,
          imageHeight,
          pngBackground,
          pngScale
        })
      );
    } catch {
      // The app still works if browser storage is blocked.
    }
  }, [
    axisLabelFontSize,
    chartType,
    endpointMarkerSize,
    equalScale,
    globalXColumn,
    graphMode,
    imageHeight,
    imageWidth,
    legendFontSize,
    legendMode,
    lineWidth,
    markerSize,
    pngBackground,
    pngScale,
    selectedYColumns,
    showPointMarkers,
    tickFontSize,
    title,
    titleFontSize,
    xAxisLabel,
    xScaleType,
    xMax,
    xMin,
    yAxisLabel,
    yScaleType,
    yMax,
    yMin
  ]);

  useEffect(() => {
    if (datasets.length === 0) return;
    try {
      const stored = {};
      for (const dataset of datasets) {
        const plotStyle = plotStyleForStorage(dataset);
        stored[datasetSettingsKey(dataset)] = {
          sourceType: dataset.sourceType,
          fileName: dataset.fileName,
          sheetName: dataset.sheetName,
          xColumn: dataset.xColumn,
          eColumn: dataset.eColumn,
          nColumn: dataset.nColumn,
          uColumn: dataset.uColumn,
          groupColumn: dataset.groupColumn,
          visibleGroups: dataset.visibleGroups,
          rowFilter: dataset.rowFilter,
          enuPreset: dataset.enuPreset,
          seriesStyles: dataset.seriesStyles ?? {},
          ...plotStyle,
          calculatedColumns: dataset.calculatedColumns ?? []
        };
      }
      window.localStorage.setItem(DATASET_SETTINGS_KEY, JSON.stringify(stored));
    } catch {
      // Dataset settings are a convenience; plotting still works without them.
    }
  }, [datasets]);

  useEffect(() => {
    if (!modal) return;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (modalResolveRef.current) {
          modalResolveRef.current(null);
          modalResolveRef.current = null;
        }
        setModal(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modal]);

  const activeDatasets = useMemo(() => datasets.filter((dataset) => dataset.active), [datasets]);
  const allNumericColumns = useMemo(() => unionColumns(datasets, (dataset) => dataset.numericColumns), [datasets]);
  const allXColumns = useMemo(() => {
    const seen = new Set();
    const columns = [];
    for (const dataset of datasets) {
      for (const column of dataset.xCandidates) {
        if (!seen.has(column)) {
          seen.add(column);
          columns.push(column);
        }
      }
    }
    return columns;
  }, [datasets]);
  const allColumns = useMemo(() => unionColumns(datasets, (dataset) => dataset.columns), [datasets]);
  const previewDataset = datasets.find((dataset) => dataset.id === previewDatasetId) ?? datasets[0];
  const groupCandidatesByDataset = useMemo(() => {
    const map = new Map();
    for (const dataset of datasets) {
      map.set(dataset.id, getGroupColumnCandidates(dataset));
    }
    return map;
  }, [datasets]);
  const filteredRowsByDataset = useMemo(() => {
    const map = new Map();
    for (const dataset of datasets) {
      map.set(dataset.id, getFilteredRows(dataset));
    }
    return map;
  }, [datasets]);

  const totals = useMemo(() => {
    const numeric = new Set();
    const nonNumeric = new Set();
    let rows = 0;
    let missing = 0;
    for (const dataset of datasets) {
      rows += dataset.rowCount;
      missing += dataset.missingValueCount;
      dataset.numericColumns.forEach((column) => numeric.add(column));
      dataset.nonNumericColumns.forEach((column) => nonNumeric.add(column));
    }
    return { rows, numeric: numeric.size, nonNumeric: nonNumeric.size, missing };
  }, [datasets]);

  const missingSelectionMessages = useMemo(() => {
    if (graphMode !== "timeseries") return [];
    const notes = [];
    for (const dataset of activeDatasets) {
      for (const column of selectedYColumns) {
        if (!dataset.numericColumns.includes(column)) {
          notes.push(`${dataset.name}: ${column} はこのファイルにありません`);
        }
      }
    }
    return notes.slice(0, 8);
  }, [activeDatasets, graphMode, selectedYColumns]);

  const xAxisTypes = useMemo(() => {
    const map = new Map();
    for (const dataset of activeDatasets) {
      map.set(dataset.id, inferXType(filteredRowsByDataset.get(dataset.id) ?? dataset.rows, dataset.xColumn));
    }
    return map;
  }, [activeDatasets, filteredRowsByDataset]);

  const resolvedXAxisType = useMemo(() => {
    const types = [...xAxisTypes.values()];
    if (!types.length) return "category";
    if (types.every((type) => type === "number")) return "number";
    if (types.every((type) => type === "time")) return "time";
    if (types.every((type) => type === "number" || type === "time")) return "number";
    return "category";
  }, [xAxisTypes]);

  const datasetDiagnostics = useMemo(() => {
    const diagnostics = new Map();
    for (const dataset of datasets) {
      const rows = filteredRowsByDataset.get(dataset.id) ?? dataset.rows;
      const xType = xAxisTypes.get(dataset.id) ?? inferXType(rows, dataset.xColumn);
      const xSummary = summarizeXValuesFromRows(rows, dataset.xColumn, xType);
      const selectedPresentColumns = selectedYColumns.filter((column) => dataset.numericColumns.includes(column));
      const groupCandidates = groupCandidatesByDataset.get(dataset.id) ?? [];
      const selectedGroupCandidate = groupCandidates.find((candidate) => candidate.name === dataset.groupColumn);
      const groupEntries = getGroupEntries(dataset, rows).filter((entry) => entry.rows.length > 0);
      const visibleGroups = dataset.groupColumn ? groupEntries.map((entry) => entry.value) : [];
      let plottedPointCount = 0;
      let traceCount = 0;
      let sampled = false;

      if (dataset.active && graphMode === "enu") {
        if (dataset.eColumn && dataset.nColumn) {
          for (const entry of groupEntries) {
            const points = makeEnuPointsFromRows(entry.rows, dataset.eColumn, dataset.nColumn, MAX_POINTS_PER_SERIES);
            plottedPointCount += points.length;
            traceCount += points.length ? 1 + (points.length > 1 ? 2 : 1) : 0;
            sampled = sampled || (entry.rows.length > MAX_POINTS_PER_SERIES && points.length >= MAX_POINTS_PER_SERIES);
          }
        }
      } else if (dataset.active) {
        for (const entry of groupEntries) {
          for (const column of selectedPresentColumns) {
            const points = makeSeriesPointsFromRows(entry.rows, dataset.xColumn, column, xType, MAX_POINTS_PER_SERIES);
            plottedPointCount += points.length;
            traceCount += points.length ? 1 : 0;
            sampled = sampled || (entry.rows.length > MAX_POINTS_PER_SERIES && points.length >= MAX_POINTS_PER_SERIES);
          }
        }
      }

      diagnostics.set(dataset.id, {
        xType,
        xTypeLabel: xTypeLabel(xType),
        xSummary,
        selectedPresentColumns,
        rowsAfterFilter: rows.length,
        rowFilterLabel: rowFilterLabel(dataset.rowFilter, dataset.rowCount),
        rowFilterActive: !isFullRowFilter(dataset.rowFilter),
        groupColumn: dataset.groupColumn,
        groupCount: selectedGroupCandidate?.uniqueCount ?? (dataset.groupColumn ? groupEntries.length : 0),
        groupValues: selectedGroupCandidate?.values ?? groupEntries.map((entry) => ({ value: entry.value, count: entry.rows.length })),
        visibleGroups,
        suggestedGroupColumns: groupCandidates.slice(0, 6),
        plottedPointCount,
        traceCount,
        sampled
      });
    }
    return diagnostics;
  }, [datasets, filteredRowsByDataset, graphMode, groupCandidatesByDataset, selectedYColumns, xAxisTypes]);

  const xDuplicateWarnings = useMemo(() => {
    const warnings = [];
    for (const dataset of activeDatasets) {
      const diagnostic = datasetDiagnostics.get(dataset.id);
      if (diagnostic?.xSummary.duplicateRowCount > 0) {
        const suggestions = diagnostic.suggestedGroupColumns ?? [];
        const conditionCandidate = suggestions.find((candidate) => cleanHeader(candidate.name).toLowerCase() === "condition");
        const bestCandidate = conditionCandidate ?? suggestions[0];
        const groupingText = dataset.groupColumn
          ? ` Group / Split column = ${dataset.groupColumn} で分割表示中です。重複Xは削除・平均化せず、グループ別traceとして保持しています。`
          : bestCandidate
          ? ` Group / Split column で ${bestCandidate.name} を選ぶと、重複Xを平均化せずに系列を分けて比較できます。`
          : " 条件やモードを表す列がある場合は Group / Split column を選ぶと、重なった系列を分離できます。";
        warnings.push(
          `${dataset.name}: X列 ${dataset.xColumn} に重複が ${diagnostic.xSummary.duplicateRowCount.toLocaleString()} 行あります。${groupingText}`
        );
      }
    }
    return warnings.slice(0, 5);
  }, [activeDatasets, datasetDiagnostics]);

  const chartBuild = useMemo(() => {
    if (graphMode === "enu") {
      const chartDatasets = [];
      activeDatasets.forEach((dataset, datasetIndex) => {
        if (!dataset.eColumn || !dataset.nColumn) return;
        const rows = filteredRowsByDataset.get(dataset.id) ?? dataset.rows;
        const groups = getGroupEntries(dataset, rows);

        groups.forEach((group, groupIndex) => {
          const fallbackColor = dataset.groupColumn ? colorForGroupValue(group.value) : colorForIndex(datasetIndex * 17 + groupIndex);
          const seriesKey = XY_SERIES_STYLE_KEY;
          const color = resolveSeriesStyleColor(dataset, seriesKey, fallbackColor);
          const pointColor = resolveSeriesPointColor(dataset, seriesKey, color);
          const pointSize = resolveSeriesPointSize(dataset, seriesKey, markerSize);
          const dash = resolveDatasetLineDash(dataset, lineStyle(datasetIndex + groupIndex));
          const points = makeEnuPointsFromRows(group.rows, dataset.eColumn, dataset.nColumn, MAX_POINTS_PER_SERIES);
          if (!points.length) return;
          const traceMeta = {
            fileName: dataset.name,
            groupColumn: dataset.groupColumn,
            groupValue: group.value,
            groupLabel: group.label,
            column: `${dataset.eColumn}-${dataset.nColumn}`,
            role: "Trajectory"
          };

          chartDatasets.push({
            label: displayTraceLabel(traceMeta, legendMode),
            fullLabel: fullTraceLabel(traceMeta),
            data: points,
            borderColor: color,
            backgroundColor: `${color}26`,
            pointBackgroundColor: pointColor,
            pointBorderColor: pointColor,
            borderWidth: lineWidth,
            borderDash: dash,
            pointRadius: chartType === "scatter" ? pointSize : showPointMarkers ? pointSize : 0,
            pointHoverRadius: Math.max(pointSize + 2, 5),
            showLine: chartType !== "scatter",
            tension: 0.15
          });

          const start = points[0];
          const end = points[points.length - 1];
          const startMeta = { ...traceMeta, role: "Start" };
          const endMeta = { ...traceMeta, role: "End" };
          chartDatasets.push({
            label: displayTraceLabel(startMeta, legendMode),
            fullLabel: fullTraceLabel(startMeta),
            data: [start],
            borderColor: pointColor,
            backgroundColor: pointColor,
            pointStyle: "triangle",
            pointRadius: endpointMarkerSize,
            pointHoverRadius: endpointMarkerSize + 2,
            showLine: false
          });
          chartDatasets.push({
            label: displayTraceLabel(endMeta, legendMode),
            fullLabel: fullTraceLabel(endMeta),
            data: [end],
            borderColor: pointColor,
            backgroundColor: pointColor,
            pointStyle: "rectRot",
            pointRadius: endpointMarkerSize,
            pointHoverRadius: endpointMarkerSize + 2,
            showLine: false
          });
        });
      });
      return { labels: [], datasets: chartDatasets };
    }

    const chartDatasets = [];
    const categoryLabels = new Set();
    activeDatasets.forEach((dataset, datasetIndex) => {
      const rows = filteredRowsByDataset.get(dataset.id) ?? dataset.rows;
      const groups = getGroupEntries(dataset, rows);
      const xType = xAxisTypes.get(dataset.id) ?? "category";
      groups.forEach((group, groupIndex) => {
        selectedYColumns.forEach((column, columnIndex) => {
          if (!dataset.numericColumns.includes(column)) return;
          const points = makeSeriesPointsFromRows(group.rows, dataset.xColumn, column, xType, MAX_POINTS_PER_SERIES);
          if (!points.length) return;
          if (xType === "category") points.forEach((point) => categoryLabels.add(point.x));
          const fallbackColor = dataset.groupColumn
            ? colorForGroupValue(group.value)
            : colorForIndex(datasetIndex * Math.max(1, selectedYColumns.length) + columnIndex);
          const seriesKey = column;
          const color = resolveSeriesStyleColor(dataset, seriesKey, fallbackColor);
          const pointColor = resolveSeriesPointColor(dataset, seriesKey, color);
          const pointSize = resolveSeriesPointSize(dataset, seriesKey, markerSize);
          const dash = resolveDatasetLineDash(dataset, lineStyle(dataset.groupColumn ? columnIndex : groupIndex + columnIndex));
          const traceMeta = {
            fileName: dataset.name,
            groupColumn: dataset.groupColumn,
            groupValue: group.value,
            groupLabel: group.label,
            column
          };
          chartDatasets.push({
            label: displayTraceLabel(traceMeta, legendMode),
            fullLabel: fullTraceLabel(traceMeta),
            data: points,
            borderColor: color,
            backgroundColor: chartType === "bar" ? `${color}66` : `${color}33`,
            pointBackgroundColor: pointColor,
            pointBorderColor: pointColor,
            borderWidth: lineWidth,
            borderDash: dash,
            pointRadius: chartType === "bar" ? 0 : chartType === "scatter" || showPointMarkers ? pointSize : 0,
            pointHoverRadius: Math.max(pointSize + 2, 5),
            tension: 0.18,
            spanGaps: true
          });
        });
      });
    });

    return {
      labels: resolvedXAxisType === "category" ? [...categoryLabels] : [],
      datasets: chartDatasets
    };
  }, [
    activeDatasets,
    chartType,
    endpointMarkerSize,
    filteredRowsByDataset,
    graphMode,
    legendMode,
    lineWidth,
    markerSize,
    resolvedXAxisType,
    selectedYColumns,
    showPointMarkers,
    xAxisTypes
  ]);

  const axisFallback = axisTitleFallback(graphMode, selectedYColumns);
  const effectiveTitle = title.trim() || axisFallback.title;
  const effectiveXLabel = xAxisLabel.trim() || (graphMode === "enu" ? axisFallback.x : globalXColumn || axisFallback.x);
  const effectiveYLabel = yAxisLabel.trim() || axisFallback.y;

  const chartOptions = useMemo(() => {
    const isEnu = graphMode === "enu";
    const canUseEqualScale = isEnu && equalScale && xScaleType === "linear" && yScaleType === "linear";
    const extent = canUseEqualScale ? buildExtent(chartBuild.datasets.filter((dataset) => dataset.data.length > 1)) : null;
    const equal = canUseEqualScale ? makeEqualScale(extent) : {};
    const xType = isEnu ? "number" : resolvedXAxisType;
    const canUseLogX = isEnu || resolvedXAxisType === "number";
    const resolvedXScaleType = canUseLogX && xScaleType === "logarithmic"
      ? "logarithmic"
      : xType === "category"
        ? "category"
        : "linear";
    const xLimitMin = parseAxisLimit(xMin, xType);
    const xLimitMax = parseAxisLimit(xMax, xType);
    const yLimitMin = parseAxisLimit(yMin, "number");
    const yLimitMax = parseAxisLimit(yMax, "number");

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,
      interaction: {
        mode: "nearest",
        intersect: false
      },
      plugins: {
        title: {
          display: true,
          text: effectiveTitle,
          color: "#172033",
          font: { size: titleFontSize, weight: "700" }
        },
        legend: {
          display: legendMode !== "hidden",
          position: "top",
          labels: {
            boxWidth: 11,
            boxHeight: 11,
            usePointStyle: true,
            font: { size: legendFontSize }
          }
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const raw = items[0]?.raw;
              if (!raw) return "";
              if (!isEnu && resolvedXAxisType === "time") return formatTimestamp(raw.x);
              return `${effectiveXLabel}: ${raw.x}`;
            },
            label: (item) => {
              const label = item.dataset?.fullLabel || item.dataset?.label || "";
              return `${label}: ${item.raw?.y ?? ""}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: resolvedXScaleType,
          min: xLimitMin ?? equal.x?.min,
          max: xLimitMax ?? equal.x?.max,
          title: { display: true, text: effectiveXLabel, font: { size: axisLabelFontSize } },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 12,
            maxRotation: xType === "category" ? 45 : 0,
            font: { size: tickFontSize },
            callback: (value) => (xType === "time" ? formatTimestamp(Number(value)) : value)
          },
          grid: { color: "#e2e8f0" }
        },
        y: {
          type: yScaleType,
          min: yLimitMin ?? equal.y?.min,
          max: yLimitMax ?? equal.y?.max,
          title: { display: true, text: effectiveYLabel, font: { size: axisLabelFontSize } },
          ticks: {
            font: { size: tickFontSize }
          },
          grid: { color: "#e2e8f0" }
        }
      }
    };
  }, [
    axisLabelFontSize,
    chartBuild.datasets,
    effectiveTitle,
    effectiveXLabel,
    effectiveYLabel,
    equalScale,
    graphMode,
    legendFontSize,
    legendMode,
    resolvedXAxisType,
    tickFontSize,
    titleFontSize,
    xMax,
    xMin,
    xScaleType,
    yMax,
    yMin,
    yScaleType
  ]);

  const hasChart = chartBuild.datasets.length > 0;
  const isSampling = useMemo(
    () => activeDatasets.some((dataset) => datasetDiagnostics.get(dataset.id)?.sampled),
    [activeDatasets, datasetDiagnostics]
  );
  const hasManyTraces = chartBuild.datasets.length >= TRACE_WARNING_THRESHOLD;

  const currentViewSummary = useMemo(() => {
    const groupColumns = [...new Set(activeDatasets.map((dataset) => dataset.groupColumn).filter(Boolean))];
    const rowFilters = activeDatasets
      .map((dataset) => {
        const diagnostic = datasetDiagnostics.get(dataset.id);
        return diagnostic?.rowFilterActive ? `${shortName(dataset.name)}:${diagnostic.rowFilterLabel}` : "";
      })
      .filter(Boolean);
    const visibleGroups = activeDatasets.flatMap((dataset) => datasetDiagnostics.get(dataset.id)?.visibleGroups ?? []);
    return {
      x: graphMode === "enu" ? "XY X / XY Y" : globalXColumn || activeDatasets[0]?.xColumn || "File-specific",
      y: graphMode === "enu"
        ? activeDatasets.map((dataset) => `${shortName(dataset.name)}:${dataset.eColumn || "?"}-${dataset.nColumn || "?"}`).join(", ")
        : selectedYColumns.join(", ") || "None",
      group: groupColumns.join(", ") || "None",
      visibleGroups: [...new Set(visibleGroups)].slice(0, 8).join(", ") || "All / None",
      rowFilter: rowFilters.join("; ") || "All rows",
      traceCount: chartBuild.datasets.length
    };
  }, [activeDatasets, chartBuild.datasets.length, datasetDiagnostics, globalXColumn, graphMode, selectedYColumns]);

  async function parseCsvFile(file, color) {
    const { text, encoding } = await readCsvFileText(file);
    const contentHash = await hashText(text);
    const parsed = Papa.parse(text, {
      ...PAPA_CONFIG
    });
    const dataset = analyzeParsedCsv(parsed, file.name, color);
    return applyStoredDatasetSettings({
      ...dataset,
      sourceType: "csv",
      fileName: file.name,
      sheetName: "",
      sheetNames: [],
      encoding,
      fileSize: file.size,
      lastModified: file.lastModified,
      sourceFingerprint: fileFingerprint(file),
      contentHash
    });
  }

  async function parseExcelFile(file, color) {
    if (/\.xls$/i.test(file.name) && !/\.xlsx$/i.test(file.name)) {
      throw new Error(`${file.name}: .xls は未対応です。.xlsx に保存し直して読み込んでください。`);
    }

    const buffer = await file.arrayBuffer();
    const workbook = await parseXlsxWorkbook(buffer, { headerRow: 1 });
    const sheet = workbook.sheets[0];
    const dataset = analyzeParsedCsv(sheet.parsed, `${file.name} / ${sheet.name}`, color);
    const contentHash = await hashBytes(buffer);
    return applyStoredDatasetSettings({
      ...dataset,
      sourceType: "excel",
      fileName: file.name,
      sheetName: sheet.name,
      sheetNames: workbook.sheets.map((item) => item.name),
      workbookSheets: workbook.sheets,
      excelWarnings: workbook.warnings,
      headerRow: sheet.headerRow,
      fileSize: file.size,
      lastModified: file.lastModified,
      sourceFingerprint: fileFingerprint(file),
      contentHash
    });
  }

  async function parseUploadedFile(file, color) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".csv")) return parseCsvFile(file, color);
    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) return parseExcelFile(file, color);
    throw new Error(`${file.name}: 対応形式は .csv と .xlsx です。`);
  }

  async function addFiles(fileList) {
    const inputFiles = [...fileList].filter((file) => /\.(csv|xlsx|xls)$/i.test(file.name));
    if (inputFiles.length === 0) {
      setMessages([{ type: "error", text: "CSVまたはExcel（.xlsx）ファイルを選択してください。" }]);
      return;
    }

    setIsParsing(true);
    const nextMessages = [];
    const loaded = [];
    try {
      for (let index = 0; index < inputFiles.length; index += 1) {
        try {
          const dataset = await parseUploadedFile(inputFiles[index], colorForIndex(datasets.length + loaded.length));
          const duplicate = findDuplicateDataset([...datasets, ...loaded], dataset);
          if (duplicate) {
            nextMessages.push({
              type: "warning",
              text: `${dataset.name} は既に読み込み済みのデータ（${duplicate.name}）と同じため追加しませんでした。`
            });
            continue;
          }
          loaded.push(dataset);
          dataset.parseWarnings.forEach((warning) =>
            nextMessages.push({ type: "warning", text: `${dataset.name}: ${warning}` })
          );
          dataset.excelWarnings?.forEach((warning) =>
            nextMessages.push({ type: "warning", text: `${dataset.name}: ${warning}` })
          );
        } catch (error) {
          nextMessages.push({ type: "error", text: error.message });
        }
      }

      if (loaded.length > 0) {
        setDatasets((current) => {
          const merged = [...current, ...loaded];
          if (!previewDatasetId) setPreviewDatasetId(loaded[0].id);
          if (!selectedYColumns.length) setSelectedYColumns(pickInitialYColumns(merged));
          if (!globalXColumn) {
            const firstX = loaded[0].xColumn || merged[0]?.xColumn || "";
            setGlobalXColumn(firstX);
          }
          return merged;
        });
      }
      if (loaded.length > 0 && nextMessages.length === 0) {
        setMessages([{ type: "success", text: `${loaded.length} 件のファイルを読み込みました。` }]);
      } else if (loaded.length > 0) {
        setMessages([{ type: "success", text: `${loaded.length} 件のファイルを読み込みました。` }, ...nextMessages]);
      } else {
        setMessages(nextMessages.length ? nextMessages : [{ type: "warning", text: "追加できるCSV/Excelファイルはありませんでした。" }]);
      }
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function loadCsvUrls(urls, successText, label = "サンプルCSV") {
    const hadExisting = datasets.length > 0;
    let mode = "add";
    if (hadExisting) {
      const choice = await showModal({ type: "sampleLoad", label });
      if (!choice) {
        setMessages([{ type: "warning", text: `${label}の読み込みを中止しました。` }]);
        return;
      }
      mode = choice;
    }

    setIsParsing(true);
    const loaded = [];
    const nextMessages = [];
    const baseDatasets = mode === "replace" ? [] : datasets;
    try {
      for (let index = 0; index < urls.length; index += 1) {
        const response = await fetch(withBase(urls[index]));
        if (!response.ok) throw new Error(`${urls[index]} を読み込めませんでした。`);
        const text = await response.text();
        const name = urls[index].split("/").pop();
        const contentHash = await hashText(text);
        const parsed = Papa.parse(text, {
          ...PAPA_CONFIG
        });
        const dataset = {
          ...analyzeParsedCsv(parsed, name, colorForIndex(baseDatasets.length + loaded.length)),
          sourceType: "csv",
          fileName: name,
          sheetName: "",
          sheetNames: [],
          encoding: "utf-8",
          sourceFingerprint: `sample:${name}:${contentHash}`,
          contentHash
        };
        const restoredDataset = applyStoredDatasetSettings(dataset);
        const duplicate = findDuplicateDataset([...baseDatasets, ...loaded], restoredDataset);
        if (duplicate) {
          nextMessages.push({
            type: "warning",
            text: `${dataset.name} は既に読み込み済みのCSV（${duplicate.name}）と同じため追加しませんでした。`
          });
          continue;
        }
        loaded.push(restoredDataset);
      }
      if (loaded.length > 0) {
        setDatasets((current) => {
          const base = mode === "replace" ? [] : current;
          const merged = [...base, ...loaded];
          if (mode === "replace" || !previewDatasetId) setPreviewDatasetId(loaded[0].id);
          if (mode === "replace" || !selectedYColumns.length) setSelectedYColumns(pickInitialYColumns(merged));
          if (mode === "replace" || !globalXColumn) setGlobalXColumn(loaded[0].xColumn);
          return merged;
        });
      }

      const modeText = mode === "replace" ? "既存データを置き換えて" : hadExisting ? "既存データに追加して" : "";
      const messages =
        loaded.length > 0
          ? [{ type: "success", text: `${modeText}${successText}` }, ...nextMessages]
          : nextMessages.length
            ? nextMessages
            : [{ type: "warning", text: "追加できるサンプルCSVはありませんでした。" }];
      setMessages(messages);
    } catch (error) {
      nextMessages.push({ type: "error", text: error.message });
      setMessages(nextMessages);
    } finally {
      setIsParsing(false);
    }
  }

  function loadSamples() {
    return loadCsvUrls(COMPARISON_SAMPLE_FILES, "比較用サンプルCSVを2件読み込みました。", "比較サンプル");
  }

  function loadRealSamples() {
    return loadCsvUrls(REAL_SAMPLE_FILES, "サンプル実データCSVを3件読み込みました。", "サンプル実データ");
  }

  function loadTestSamples() {
    return loadCsvUrls(TEST_SAMPLE_FILES, "異常系確認用CSVを6件読み込みました。", "異常系確認データ");
  }

  async function loadExcelSample() {
    try {
      const response = await fetch(withBase("/test-samples/sample-excel.xlsx"));
      if (!response.ok) throw new Error("Excelサンプルを読み込めませんでした。");
      const blob = await response.blob();
      const file = new File([blob], "sample-excel.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        lastModified: 0
      });
      await addFiles([file]);
    } catch (error) {
      setMessages([{ type: "error", text: error.message }]);
    }
  }

  function applyGlobalX(column) {
    setGlobalXColumn(column);
    setDatasets((current) =>
      current.map((dataset) => ({
        ...dataset,
        xColumn: dataset.columns.includes(column) ? column : dataset.xColumn
      }))
    );
  }

  function applyEnuPreset(id, presetKey) {
    if (!presetKey) return;
    const dataset = datasets.find((item) => item.id === id);
    const preset = ENU_PRESETS[presetKey];
    if (!dataset || !preset) return;

    const nextColumns = {
      eColumn: findColumnByCandidateNames(dataset, preset.e),
      nColumn: findColumnByCandidateNames(dataset, preset.n),
      uColumn: findColumnByCandidateNames(dataset, preset.u),
      enuPreset: presetKey
    };

    if (!nextColumns.eColumn || !nextColumns.nColumn) {
      setMessages([{ type: "warning", text: `${dataset.name}: ${preset.label} に対応するXY列が見つかりませんでした。` }]);
      return;
    }

    updateDataset(id, nextColumns);
  }

  function setDatasetGroupColumn(id, column) {
    setDatasets((current) =>
      current.map((dataset) => {
        if (dataset.id !== id) return dataset;
        if (!column) return { ...dataset, groupColumn: "", visibleGroups: {}, groupFilterSearch: "" };

        const candidate = getGroupColumnCandidates(dataset).find((item) => item.name === column);
        return {
          ...dataset,
          groupColumn: column,
          visibleGroups: makeGroupVisibility(candidate?.values ?? [], dataset.visibleGroups),
          groupFilterSearch: ""
        };
      })
    );
  }

  function toggleGroupValue(id, value, checked) {
    setDatasets((current) =>
      current.map((dataset) =>
        dataset.id === id
          ? { ...dataset, visibleGroups: { ...dataset.visibleGroups, [value]: checked } }
          : dataset
      )
    );
  }

  function setAllGroups(id, checked) {
    setDatasets((current) =>
      current.map((dataset) => {
        if (dataset.id !== id || !dataset.groupColumn) return dataset;
        const candidate = getGroupColumnCandidates(dataset).find((item) => item.name === dataset.groupColumn);
        const visibleGroups = {};
        for (const item of candidate?.values ?? []) visibleGroups[item.value] = checked;
        return { ...dataset, visibleGroups };
      })
    );
  }

  function invertGroups(id) {
    setDatasets((current) =>
      current.map((dataset) => {
        if (dataset.id !== id || !dataset.groupColumn) return dataset;
        const candidate = getGroupColumnCandidates(dataset).find((item) => item.name === dataset.groupColumn);
        const visibleGroups = {};
        for (const item of candidate?.values ?? []) {
          visibleGroups[item.value] = dataset.visibleGroups?.[item.value] === false;
        }
        return { ...dataset, visibleGroups };
      })
    );
  }

  function updateGroupSearch(id, value) {
    updateDataset(id, { groupFilterSearch: value });
  }

  function setDatasetPlotColor(id, value) {
    const plotColor = normalizePlotColor(value);
    setDatasets((current) =>
      current.map((dataset) =>
        dataset.id === id
          ? {
              ...dataset,
              plotColor,
              customPlotColorDraft:
                plotColor === PLOT_COLOR_CUSTOM
                  ? dataset.customPlotColorDraft ?? dataset.customPlotColor ?? ""
                  : dataset.customPlotColorDraft ?? ""
            }
          : dataset
      )
    );
  }

  function setDatasetCustomPlotColor(id, value) {
    setDatasets((current) =>
      current.map((dataset) =>
        dataset.id === id
          ? {
              ...dataset,
              customPlotColorDraft: value,
              customPlotColor: normalizeHexColor(value)
            }
          : dataset
      )
    );
  }

  function setDatasetPlotLineStyle(id, value) {
    updateDataset(id, { plotLineStyle: normalizePlotLineStyle(value) });
  }

  function updateDatasetSeriesStyle(id, seriesKey, patch) {
    setDatasets((current) =>
      current.map((dataset) => {
        if (dataset.id !== id) return dataset;
        const existing = getSeriesStyle(dataset, seriesKey);
        return {
          ...dataset,
          seriesStyles: {
            ...(dataset.seriesStyles ?? {}),
            [seriesKey]: { ...existing, ...patch }
          }
        };
      })
    );
  }

  function clearDatasetSeriesStyleProperty(id, seriesKey, property) {
    setDatasets((current) =>
      current.map((dataset) => {
        if (dataset.id !== id) return dataset;
        const nextStyles = { ...(dataset.seriesStyles ?? {}) };
        const nextStyle = { ...getSeriesStyle(dataset, seriesKey) };
        delete nextStyle[property];
        if (Object.keys(nextStyle).length) nextStyles[seriesKey] = nextStyle;
        else delete nextStyles[seriesKey];
        return { ...dataset, seriesStyles: nextStyles };
      })
    );
  }

  function updateRowFilterDraft(id, patch) {
    setDatasets((current) =>
      current.map((dataset) => (dataset.id === id ? { ...dataset, ...patch } : dataset))
    );
  }

  function applyDatasetRowFilter(id) {
    const dataset = datasets.find((item) => item.id === id);
    if (!dataset) return;
    const result = parseRowRange(dataset.rowFilterDraftStart, dataset.rowFilterDraftEnd, dataset.rowCount);
    if (!result.ok) {
      setMessages([{ type: "error", text: `${dataset.name}: ${result.message}` }]);
      return;
    }

    updateDataset(id, { rowFilter: result.rowFilter });
    setMessages([{ type: "success", text: `${dataset.name}: Row filter applied (${rowFilterLabel(result.rowFilter, dataset.rowCount)}).` }]);
  }

  function clearDatasetRowFilter(id) {
    updateDataset(id, {
      rowFilter: { start: null, end: null },
      rowFilterDraftStart: "",
      rowFilterDraftEnd: ""
    });
  }

  function applyRowPreset(id, preset) {
    const dataset = datasets.find((item) => item.id === id);
    if (!dataset) return;
    if (preset === "all") {
      clearDatasetRowFilter(id);
      return;
    }
    const end = Math.min(dataset.rowCount, preset);
    updateDataset(id, {
      rowFilter: { start: 1, end },
      rowFilterDraftStart: "1",
      rowFilterDraftEnd: String(end)
    });
  }

  function setClampedNumber(setter, value, min, max, fallback) {
    setter(clampNumber(value, min, max, fallback));
  }

  async function resetDisplaySettings() {
    const ok = await showModal({ type: "resetConfirm" });
    if (!ok) return;
    try {
      window.localStorage.removeItem(DISPLAY_SETTINGS_KEY);
      window.localStorage.removeItem(DATASET_SETTINGS_KEY);
    } catch {
      // Reset still applies to the current session.
    }
    setGraphMode("timeseries");
    setChartType("line");
    setSelectedYColumns(pickInitialYColumns(datasets));
    setGlobalXColumn(datasets[0]?.xColumn ?? "");
    setTitle("");
    setXAxisLabel("");
    setYAxisLabel("");
    setXMin("");
    setXMax("");
    setYMin("");
    setYMax("");
    setLineWidth(DEFAULT_DISPLAY_SETTINGS.lineWidth);
    setShowPointMarkers(DEFAULT_DISPLAY_SETTINGS.showPointMarkers);
    setMarkerSize(DEFAULT_DISPLAY_SETTINGS.markerSize);
    setEndpointMarkerSize(DEFAULT_DISPLAY_SETTINGS.endpointMarkerSize);
    setEqualScale(DEFAULT_DISPLAY_SETTINGS.equalScale);
    setLegendMode(DEFAULT_DISPLAY_SETTINGS.legendMode);
    setTitleFontSize(DEFAULT_DISPLAY_SETTINGS.titleFontSize);
    setAxisLabelFontSize(DEFAULT_DISPLAY_SETTINGS.axisLabelFontSize);
    setTickFontSize(DEFAULT_DISPLAY_SETTINGS.tickFontSize);
    setLegendFontSize(DEFAULT_DISPLAY_SETTINGS.legendFontSize);
    setPngBackground(DEFAULT_DISPLAY_SETTINGS.pngBackground);
    setPngScale(DEFAULT_DISPLAY_SETTINGS.pngScale);
    setImageWidth(DEFAULT_DISPLAY_SETTINGS.imageWidth);
    setImageHeight(DEFAULT_DISPLAY_SETTINGS.imageHeight);
    setXScaleType(DEFAULT_DISPLAY_SETTINGS.xScaleType);
    setYScaleType(DEFAULT_DISPLAY_SETTINGS.yScaleType);
    setDatasets((current) =>
      current.map((dataset) => ({
        ...dataset,
        xColumn: dataset.xCandidates[0] ?? dataset.columns[0] ?? "",
        eColumn: pickAxisColumn(dataset.columnStats, "e"),
        nColumn: pickAxisColumn(dataset.columnStats, "n"),
        uColumn: pickAxisColumn(dataset.columnStats, "u"),
        groupColumn: "",
        visibleGroups: {},
        groupFilterSearch: "",
        rowFilter: { start: null, end: null },
        rowFilterDraftStart: "",
        rowFilterDraftEnd: "",
        enuPreset: "",
        plotColor: "auto",
        customPlotColor: "",
        customPlotColorDraft: "",
        plotLineStyle: "auto",
        seriesStyles: {}
      }))
    );
    setMessages([{ type: "success", text: "Display settings were reset." }]);
  }

  function collectSettingsSnapshot() {
    const display = readDisplaySettings();
    return {
      app: APP_NAME,
      version: 2,
      exportedAt: new Date().toISOString(),
      display: {
        ...display,
        graphMode,
        chartType,
        selectedYColumns,
        globalXColumn,
        title,
        xAxisLabel,
        yAxisLabel,
        xMin,
        xMax,
        yMin,
        yMax,
        lineWidth,
        showPointMarkers,
        markerSize,
        endpointMarkerSize,
        equalScale,
        legendMode,
        titleFontSize,
        axisLabelFontSize,
        tickFontSize,
        legendFontSize,
        xScaleType,
        yScaleType,
        imageWidth,
        imageHeight,
        pngBackground,
        pngScale
      },
      datasets: Object.fromEntries(
        datasets.map((dataset) => [
          datasetSettingsKey(dataset),
          {
            fileName: dataset.name,
            sourceType: dataset.sourceType,
            sourceFileName: dataset.fileName,
            sheetName: dataset.sheetName,
            xColumn: dataset.xColumn,
            eColumn: dataset.eColumn,
            nColumn: dataset.nColumn,
            uColumn: dataset.uColumn,
            groupColumn: dataset.groupColumn,
            visibleGroups: dataset.visibleGroups,
            rowFilter: dataset.rowFilter,
            enuPreset: dataset.enuPreset,
            seriesStyles: dataset.seriesStyles ?? {},
            ...plotStyleForStorage(dataset),
            calculatedColumns: dataset.calculatedColumns ?? []
          }
        ])
      )
    };
  }

  function exportSettings() {
    const blob = new Blob([JSON.stringify(collectSettingsSnapshot(), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${APP_NAME.replace(/\s+/g, "")}_settings_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importSettings(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const display = parsed.display ?? {};
      const datasetSettings = parsed.datasets ?? {};
      window.localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(display));
      window.localStorage.setItem(DATASET_SETTINGS_KEY, JSON.stringify(datasetSettings));
      setGraphMode(GRAPH_MODES.some((item) => item.value === display.graphMode) ? display.graphMode : "timeseries");
      setChartType(CHART_TYPES.some((item) => item.value === display.chartType) ? display.chartType : "line");
      setSelectedYColumns(Array.isArray(display.selectedYColumns) ? display.selectedYColumns : []);
      setGlobalXColumn(display.globalXColumn ?? "");
      setTitle(display.title ?? "");
      setXAxisLabel(display.xAxisLabel ?? "");
      setYAxisLabel(display.yAxisLabel ?? "");
      setXMin(display.xMin ?? "");
      setXMax(display.xMax ?? "");
      setYMin(display.yMin ?? "");
      setYMax(display.yMax ?? "");
      setLineWidth(clampNumber(display.lineWidth, 1, 5, DEFAULT_DISPLAY_SETTINGS.lineWidth));
      setShowPointMarkers(Boolean(display.showPointMarkers));
      setMarkerSize(clampNumber(display.markerSize, 2, 10, DEFAULT_DISPLAY_SETTINGS.markerSize));
      setEndpointMarkerSize(clampNumber(display.endpointMarkerSize, 6, 16, DEFAULT_DISPLAY_SETTINGS.endpointMarkerSize));
      setEqualScale(typeof display.equalScale === "boolean" ? display.equalScale : DEFAULT_DISPLAY_SETTINGS.equalScale);
      setLegendMode(LEGEND_MODES.some((item) => item.value === display.legendMode) ? display.legendMode : DEFAULT_DISPLAY_SETTINGS.legendMode);
      setTitleFontSize(clampNumber(display.titleFontSize, 8, 36, DEFAULT_DISPLAY_SETTINGS.titleFontSize));
      setAxisLabelFontSize(clampNumber(display.axisLabelFontSize, 8, 30, DEFAULT_DISPLAY_SETTINGS.axisLabelFontSize));
      setTickFontSize(clampNumber(display.tickFontSize, 8, 24, DEFAULT_DISPLAY_SETTINGS.tickFontSize));
      setLegendFontSize(clampNumber(display.legendFontSize, 8, 24, DEFAULT_DISPLAY_SETTINGS.legendFontSize));
      setXScaleType(AXIS_SCALE_TYPES.some((item) => item.value === display.xScaleType) ? display.xScaleType : DEFAULT_DISPLAY_SETTINGS.xScaleType);
      setYScaleType(AXIS_SCALE_TYPES.some((item) => item.value === display.yScaleType) ? display.yScaleType : DEFAULT_DISPLAY_SETTINGS.yScaleType);
      setImageWidth(clampNumber(display.imageWidth, 480, 3000, DEFAULT_DISPLAY_SETTINGS.imageWidth));
      setImageHeight(clampNumber(display.imageHeight, 320, 2200, DEFAULT_DISPLAY_SETTINGS.imageHeight));
      if (["white", "transparent"].includes(display.pngBackground)) setPngBackground(display.pngBackground);
      if ([1, 2, 3].includes(Number(display.pngScale))) setPngScale(Number(display.pngScale));
      setDatasets((current) => current.map((dataset) => applyStoredDatasetSettings(dataset, datasetSettings)));
      setMessages([{ type: "success", text: "Settings were imported. Reload the same CSV files to restore file-specific settings if needed." }]);
    } catch (error) {
      setMessages([{ type: "error", text: `Settings import failed: ${error.message}` }]);
    } finally {
      if (settingsInputRef.current) settingsInputRef.current.value = "";
    }
  }

  function slugPart(value) {
    return cleanHeader(value)
      .replace(/\.csv$/i, "")
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "none";
  }

  function buildPngFilename() {
    const plotType = graphMode === "enu" ? "XYPlot" : "TimeSeries";
    const xPart = graphMode === "enu" ? "XY" : currentViewSummary.x;
    const groupPart = currentViewSummary.group;
    const timestamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    return `${APP_NAME.replace(/\s+/g, "")}_${plotType}_${slugPart(xPart)}_${slugPart(groupPart)}_${timestamp}.png`;
  }

  function updateDataset(id, patch) {
    setDatasets((current) => current.map((dataset) => (dataset.id === id ? { ...dataset, ...patch } : dataset)));
  }

  function changeDatasetSheet(id, sheetName) {
    const currentDataset = datasets.find((dataset) => dataset.id === id);
    const sheet = currentDataset?.workbookSheets?.find((item) => item.name === sheetName);
    if (!currentDataset || currentDataset.sourceType !== "excel" || !sheet) return;

    const analyzed = analyzeParsedCsv(sheet.parsed, `${currentDataset.fileName} / ${sheet.name}`, currentDataset.color);
    const nextDataset = applyStoredDatasetSettings({
      ...analyzed,
      id: currentDataset.id,
      color: currentDataset.color,
      active: currentDataset.active,
      sourceType: "excel",
      fileName: currentDataset.fileName,
      sheetName: sheet.name,
      sheetNames: currentDataset.sheetNames,
      workbookSheets: currentDataset.workbookSheets,
      excelWarnings: currentDataset.excelWarnings,
      headerRow: sheet.headerRow,
      fileSize: currentDataset.fileSize,
      lastModified: currentDataset.lastModified,
      sourceFingerprint: currentDataset.sourceFingerprint,
      contentHash: currentDataset.contentHash
    });

    setDatasets((current) => {
      const nextDatasets = current.map((dataset) => (dataset.id === id ? nextDataset : dataset));
      setSelectedYColumns((currentY) => {
        const stillUsable = currentY.filter((column) => nextDatasets.some((dataset) => dataset.numericColumns.includes(column)));
        return stillUsable.length ? stillUsable : pickInitialYColumns(nextDatasets);
      });
      return nextDatasets;
    });
    if (globalXColumn && !nextDataset.columns.includes(globalXColumn)) {
      setGlobalXColumn(nextDataset.xColumn);
    }

    setMessages([{ type: "success", text: `Sheetを ${sheetName} に切り替えました。` }]);
  }

  function changeDatasetHeaderRow(id, draftValue) {
    const currentDataset = datasets.find((dataset) => dataset.id === id);
    if (!currentDataset || currentDataset.sourceType !== "excel") return;

    const parsed = Number(draftValue);
    const clamped = Number.isFinite(parsed) && parsed >= 1 ? Math.max(1, Math.floor(parsed)) : currentDataset.headerRow ?? 1;
    const sheet = currentDataset.workbookSheets?.find((item) => item.name === currentDataset.sheetName);
    if (!sheet?.rawRows) return;

    try {
      const reparsed = rowsToParsedData(sheet.rawRows, currentDataset.sheetName, clamped);
      const analyzed = analyzeParsedCsv(reparsed, currentDataset.name, currentDataset.color);
      const nextDataset = applyStoredDatasetSettings({
        ...analyzed,
        id: currentDataset.id,
        color: currentDataset.color,
        active: currentDataset.active,
        sourceType: "excel",
        fileName: currentDataset.fileName,
        sheetName: currentDataset.sheetName,
        sheetNames: currentDataset.sheetNames,
        workbookSheets: currentDataset.workbookSheets,
        excelWarnings: currentDataset.excelWarnings,
        headerRow: clamped,
        fileSize: currentDataset.fileSize,
        lastModified: currentDataset.lastModified,
        sourceFingerprint: currentDataset.sourceFingerprint,
        contentHash: currentDataset.contentHash
      });

      setDatasets((current) => {
        const nextDatasets = current.map((dataset) => (dataset.id === id ? nextDataset : dataset));
        setSelectedYColumns((currentY) => {
          const stillUsable = currentY.filter((column) => nextDatasets.some((dataset) => dataset.numericColumns.includes(column)));
          return stillUsable.length ? stillUsable : pickInitialYColumns(nextDatasets);
        });
        return nextDatasets;
      });
      if (globalXColumn && !nextDataset.columns.includes(globalXColumn)) {
        setGlobalXColumn(nextDataset.xColumn);
      }
    } catch (error) {
      setMessages([{ type: "error", text: `${currentDataset.name}: Header row ${clamped}: ${error.message}` }]);
    }
  }

  function removeDataset(id) {
    setDatasets((current) => current.filter((dataset) => dataset.id !== id));
    if (previewDatasetId === id) setPreviewDatasetId("");
  }

  function clearAll() {
    setDatasets([]);
    setSelectedYColumns([]);
    setGlobalXColumn("");
    setPreviewDatasetId("");
    setMessages([]);
    try {
      window.localStorage.removeItem(DATASET_SETTINGS_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  function toggleYColumn(column) {
    setSelectedYColumns((current) =>
      current.includes(column) ? current.filter((item) => item !== column) : [...current, column]
    );
  }

  function updateCalculationDraft(id, patch) {
    updateDataset(id, patch);
  }

  function addCalculatedColumn(id) {
    const dataset = datasets.find((item) => item.id === id);
    if (!dataset) return;

    try {
      const formula = cleanHeader(dataset.calculationFormula);
      const columnName = makeUniqueColumnName(dataset.columns, dataset.calculationName);
      const compiled = compileFormula(formula, dataset.columns);
      let invalidCount = 0;
      let validCount = 0;
      const rows = dataset.rows.map((row) => {
        const nextRow = { ...row };
        const value = evaluateCompiledFormula(compiled, row);
        if (Number.isFinite(value)) {
          nextRow[columnName] = Number(value.toPrecision(12));
          validCount += 1;
        } else {
          nextRow[columnName] = "";
          invalidCount += 1;
        }
        return nextRow;
      });

      const columns = [...dataset.columns, columnName];
      const calculatedColumns = [
        ...(dataset.calculatedColumns ?? []),
        {
          name: columnName,
          formula,
          referencedColumns: compiled.referencedColumns,
          validCount,
          invalidCount
        }
      ];
      const nextDataset = rebuildDatasetColumns(dataset, rows, columns, {
        calculatedColumns,
        calculationName: "",
        calculationFormula: ""
      });

      setDatasets((current) => current.map((item) => (item.id === id ? nextDataset : item)));
      if (validCount > 0) {
        setSelectedYColumns((current) => (current.includes(columnName) ? current : [...current, columnName]));
      }
      setMessages([
        {
          type: invalidCount > 0 ? "warning" : "success",
          text: `${dataset.name}: calculated column ${columnName} を追加しました。計算不可 ${invalidCount.toLocaleString()} 行。`
        }
      ]);
    } catch (error) {
      setMessages([{ type: "error", text: `${dataset.name}: ${error.message}` }]);
    }
  }

  function removeCalculatedColumn(id, column) {
    const dataset = datasets.find((item) => item.id === id);
    if (!dataset) return;
    const calculatedColumns = (dataset.calculatedColumns ?? []).filter((item) => item.name !== column);
    const columns = dataset.columns.filter((item) => item !== column);
    const rows = dataset.rows.map((row) => {
      const nextRow = { ...row };
      delete nextRow[column];
      return nextRow;
    });
    const nextDataset = rebuildDatasetColumns(dataset, rows, columns, { calculatedColumns });

    setDatasets((current) => {
      const nextDatasets = current.map((item) => (item.id === id ? nextDataset : item));
      setSelectedYColumns((currentY) =>
        currentY.filter((selectedColumn) => selectedColumn !== column || nextDatasets.some((item) => item.id !== id && item.numericColumns.includes(column)))
      );
      return nextDatasets;
    });
    setMessages([{ type: "success", text: `${dataset.name}: calculated column ${column} を削除しました。` }]);
  }

  function exportProcessedCsv(dataset) {
    const values = [
      dataset.columns,
      ...dataset.rows.map((row) => dataset.columns.map((column) => row[column] ?? ""))
    ];
    const csv = Papa.unparse(values);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${safeFilePart(dataset.name)}_processed.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function downloadChart() {
    const chart = chartRef.current;
    if (!chart) {
      setMessages([{ type: "error", text: "保存できるグラフがありません。" }]);
      return;
    }
    const srcCanvas = chart.canvas;
    const offscreen = document.createElement("canvas");
    offscreen.width = imageWidth * pngScale;
    offscreen.height = imageHeight * pngScale;
    const ctx = offscreen.getContext("2d");
    if (pngBackground === "white") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
    }
    ctx.drawImage(srcCanvas, 0, 0, offscreen.width, offscreen.height);
    const link = document.createElement("a");
    link.href = offscreen.toDataURL("image/png");
    link.download = buildPngFilename();
    link.click();
  }

  function onDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  const chartComponent =
    chartType === "bar" && graphMode !== "enu" ? (
      <Bar ref={chartRef} data={chartBuild} options={chartOptions} />
    ) : graphMode === "enu" || chartType === "scatter" ? (
      <Scatter ref={chartRef} data={chartBuild} options={chartOptions} />
    ) : (
      <Line ref={chartRef} data={chartBuild} options={chartOptions} />
    );

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">MULTI CSV / EXCEL COMPARISON</p>
          <h1>{APP_NAME}</h1>
          <p className="lead">
            CSVやExcelをドラッグ＆ドロップして、複数データの列・変化・XY軌跡を比較します。時系列やENU形式の研究データにも対応します。
          </p>
        </div>
        <div className="hero-status">
          <FileSpreadsheet size={22} />
          <span>{datasets.length ? `${datasets.length}件読み込み済み` : "CSV/Excel未読み込み"}</span>
        </div>
      </header>

      {messages.length > 0 && (
        <section className="message-stack" aria-live="polite">
          {messages.map((message, index) => (
            <div className={`alert ${message.type}`} key={`${message.text}-${index}`}>
              <AlertCircle size={18} />
              <span>{message.text}</span>
              <button type="button" onClick={() => setMessages((current) => current.filter((_, i) => i !== index))}>
                <X size={15} />
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="layout-grid">
        <section className="panel upload-panel">
          <div
            className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
          >
            <UploadCloud size={34} />
            <h2>CSV/Excelを複数ドラッグ＆ドロップ</h2>
            <p>CSVと.xlsxを読み込み、列名が少し違ってもX候補・数値列・XY/ENU列を自動判定します。</p>
            <div className="button-row">
              <button type="button" className="primary-button" onClick={() => fileInputRef.current?.click()}>
                ファイル選択
              </button>
              <button type="button" className="ghost-button" onClick={loadSamples}>
                比較サンプル
              </button>
              <button type="button" className="ghost-button" onClick={loadRealSamples}>
                サンプル実データを読み込む
              </button>
              <button type="button" className="ghost-button" onClick={loadExcelSample}>
                Excelサンプル
              </button>
              <button type="button" className="ghost-button" onClick={loadTestSamples}>
                異常系確認
              </button>
              {datasets.length > 0 && (
                <button type="button" className="danger-button" onClick={clearAll}>
                  全削除
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              multiple
              onChange={(event) => addFiles(event.target.files)}
            />
            {isParsing && <span className="loading">読み込み中...</span>}
          </div>

          <div className="summary-strip">
            <div>
              <span>データ件数</span>
              <strong>{totals.rows.toLocaleString()}</strong>
            </div>
            <div>
              <span>列名</span>
              <strong>{allColumns.length.toLocaleString()}</strong>
            </div>
            <div>
              <span>数値列</span>
              <strong>{totals.numeric.toLocaleString()}</strong>
            </div>
            <div>
              <span>非数値列</span>
              <strong>{totals.nonNumeric.toLocaleString()}</strong>
            </div>
            <div>
              <span>欠損値</span>
              <strong>{totals.missing.toLocaleString()}</strong>
            </div>
          </div>
        </section>

        <section className="panel files-panel">
          <div className="section-heading">
            <h2>読み込み済みファイル</h2>
            <span>{activeDatasets.length} / {datasets.length} 表示</span>
          </div>
          <div className="file-list">
            {datasets.length === 0 ? (
              <div className="empty-mini">CSV/Excelを読み込むとここにファイル別の設定が表示されます。</div>
            ) : (
              datasets.map((dataset) => {
                const diagnostic = datasetDiagnostics.get(dataset.id);
                const groupSearch = cleanHeader(dataset.groupFilterSearch).toLowerCase();
                const filteredGroupValues = (diagnostic?.groupValues ?? [])
                  .filter((item) => !groupSearch || cleanHeader(item.value).toLowerCase().includes(groupSearch))
                  .slice(0, MAX_GROUP_CHECKBOXES);
                const plotColorValue = normalizePlotColor(dataset.plotColor);
                const customPlotColorDraft = dataset.customPlotColorDraft ?? dataset.customPlotColor ?? "";
                const customPlotColorInvalid =
                  plotColorValue === PLOT_COLOR_CUSTOM &&
                  Boolean(customPlotColorDraft) &&
                  !isValidHexColor(customPlotColorDraft);
                const plotLineStyleValue = normalizePlotLineStyle(dataset.plotLineStyle);
                const plotPreviewColor = resolveDatasetColor(dataset, dataset.color);
                const styleSeriesEntries = graphMode === "enu"
                  ? dataset.eColumn && dataset.nColumn
                    ? [{ key: XY_SERIES_STYLE_KEY, label: `XY: ${dataset.eColumn} / ${dataset.nColumn}` }]
                    : []
                  : selectedYColumns
                      .filter((column) => dataset.numericColumns.includes(column))
                      .map((column) => ({ key: column, label: column }));
                return (
                <article className="dataset-card" key={dataset.id}>
                  <div className="dataset-main">
                    <label className="check-title">
                      <input
                        type="checkbox"
                        checked={dataset.active}
                        onChange={(event) => updateDataset(dataset.id, { active: event.target.checked })}
                      />
                      <span className="color-dot" style={{ background: dataset.color }} />
                      <strong title={dataset.name}>{dataset.name}</strong>
                    </label>
                    <button type="button" className="icon-button" onClick={() => removeDataset(dataset.id)} title="削除">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="dataset-stats">
                    <span>{dataset.rowCount.toLocaleString()} 行</span>
                    <span>{dataset.columnCount} 列</span>
                    <span>{dataset.numericColumns.length} 数値列</span>
                    <span>{dataset.missingValueCount ? "欠損あり" : "欠損なし"}</span>
                    <span>{dataset.sourceType === "excel" ? "Excel" : "CSV"}</span>
                    {dataset.sourceType === "excel" && dataset.sheetName && <span>Sheet: {dataset.sheetName}</span>}
                    {dataset.headerRow && <span>Header row: {dataset.headerRow}</span>}
                    {dataset.invalidNumericCount > 0 && <span>混在値あり</span>}
                    {dataset.encoding && <span>{dataset.encoding}</span>}
                  </div>
                  <details className="dataset-details" defaultOpen={datasets.length === 1}>
                    <summary>データ設定を開く</summary>
                    <div className="dataset-details-body">
                  {dataset.sourceType === "excel" && dataset.sheetNames?.length > 0 && (
                    <label className="preset-row">
                      Sheet
                      <select value={dataset.sheetName} onChange={(event) => changeDatasetSheet(dataset.id, event.target.value)}>
                        {dataset.sheetNames.map((sheetName) => (
                          <option key={sheetName} value={sheetName}>{sheetName}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {dataset.sourceType === "excel" && (
                    <label className="preset-row">
                      Header row
                      <input
                        type="number"
                        min="1"
                        className="header-row-input"
                        value={dataset.headerRow ?? 1}
                        onChange={(event) => changeDatasetHeaderRow(dataset.id, event.target.value)}
                      />
                    </label>
                  )}
                  <div className="dataset-selects">
                    <label>
                      X column
                      <select value={dataset.xColumn} onChange={(event) => updateDataset(dataset.id, { xColumn: event.target.value })}>
                        {dataset.xCandidates.map((column) => (
                          <option key={column} value={column}>{column}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      XY X
                      <select value={dataset.eColumn} onChange={(event) => updateDataset(dataset.id, { eColumn: event.target.value })}>
                        <option value="">なし</option>
                        {dataset.numericColumns.map((column) => (
                          <option key={column} value={column}>{column}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      XY Y
                      <select value={dataset.nColumn} onChange={(event) => updateDataset(dataset.id, { nColumn: event.target.value })}>
                        <option value="">なし</option>
                        {dataset.numericColumns.map((column) => (
                          <option key={column} value={column}>{column}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="preset-row">
                    ENU preset
                    <select
                      defaultValue=""
                      onChange={(event) => {
                        applyEnuPreset(dataset.id, event.target.value);
                        event.target.value = "";
                      }}
                    >
                      <option value="">Auto detect E/N/U or custom columns</option>
                      <option value="kf">{ENU_PRESETS.kf.label}</option>
                      <option value="relative">{ENU_PRESETS.relative.label}</option>
                    </select>
                  </label>
                  <div className="plot-style-controls">
                    <div className="plot-style-head">
                      <span>CSV全体の初期スタイル</span>
                      <span className={`plot-style-preview line-${plotLineStyleValue}`} aria-hidden="true">
                        <span className="plot-style-swatch" style={{ background: plotPreviewColor }} />
                        <span className="plot-style-line" style={{ borderTopColor: plotPreviewColor }} />
                      </span>
                    </div>
                    <div className="plot-style-grid">
                      <label>
                        Color
                        <select
                          value={plotColorValue}
                          onChange={(event) => setDatasetPlotColor(dataset.id, event.target.value)}
                        >
                          {PLOT_COLOR_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      {plotColorValue === PLOT_COLOR_CUSTOM && (
                        <label>
                          Custom hex
                          <input
                            type="text"
                            inputMode="text"
                            maxLength="7"
                            pattern="#[0-9A-Fa-f]{6}"
                            placeholder="#2563EB"
                            value={customPlotColorDraft}
                            onChange={(event) => setDatasetCustomPlotColor(dataset.id, event.target.value)}
                            aria-invalid={customPlotColorInvalid}
                          />
                        </label>
                      )}
                      <label>
                        Line style
                        <select
                          value={plotLineStyleValue}
                          onChange={(event) => setDatasetPlotLineStyle(dataset.id, event.target.value)}
                        >
                          {PLOT_LINE_STYLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {customPlotColorInvalid && (
                      <p className="field-note">Custom hex must use #RRGGBB. Invalid values are not saved or applied.</p>
                    )}
                    <p className="field-note">この設定はCSV全体の初期値です。下の系列別設定が優先されます。</p>
                  </div>
                  <div className="series-style-controls">
                    <div className="series-style-head">
                      <span>系列ごとの色・点</span>
                      <small>CSV内の列ごとに個別指定</small>
                    </div>
                    {styleSeriesEntries.length === 0 ? (
                      <p className="field-note">表示するY列またはXY列を選ぶと、系列別設定が表示されます。</p>
                    ) : (
                      <div className="series-style-list">
                        {styleSeriesEntries.map((entry) => {
                          const seriesStyle = getSeriesStyle(dataset, entry.key);
                          const resolvedLineColor = resolveSeriesStyleColor(dataset, entry.key, plotPreviewColor);
                          const resolvedPointColor = resolveSeriesPointColor(dataset, entry.key, resolvedLineColor);
                          return (
                            <div className="series-style-row" key={entry.key}>
                              <strong title={entry.label}>{entry.label}</strong>
                              <label>
                                系列色
                                <span className="color-control">
                                  <input
                                    type="color"
                                    value={resolvedLineColor}
                                    onChange={(event) => updateDatasetSeriesStyle(dataset.id, entry.key, { color: event.target.value })}
                                  />
                                  <button type="button" onClick={() => clearDatasetSeriesStyleProperty(dataset.id, entry.key, "color")}>自動</button>
                                </span>
                              </label>
                              {(chartType === "scatter" || showPointMarkers || graphMode === "enu") && (
                                <>
                                  <label>
                                    点の色
                                    <span className="color-control">
                                      <input
                                        type="color"
                                        value={resolvedPointColor}
                                        onChange={(event) => updateDatasetSeriesStyle(dataset.id, entry.key, { pointColor: event.target.value })}
                                      />
                                      <button type="button" onClick={() => clearDatasetSeriesStyleProperty(dataset.id, entry.key, "pointColor")}>自動</button>
                                    </span>
                                  </label>
                                  <label>
                                    点サイズ
                                    <input
                                      type="number"
                                      min="1"
                                      max="30"
                                      placeholder={`自動 (${markerSize})`}
                                      value={seriesStyle.pointSize ?? ""}
                                      onChange={(event) =>
                                        updateDatasetSeriesStyle(dataset.id, entry.key, {
                                          pointSize: event.target.value === "" ? null : clampNumber(event.target.value, 1, 30, markerSize)
                                        })
                                      }
                                    />
                                  </label>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <label className="preset-row">
                    Group / Split column
                    <select value={dataset.groupColumn} onChange={(event) => setDatasetGroupColumn(dataset.id, event.target.value)}>
                      <option value="">None</option>
                      {(groupCandidatesByDataset.get(dataset.id) ?? []).map((candidate) => (
                        <option key={candidate.name} value={candidate.name}>
                          {candidate.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {diagnostic?.groupColumn && (
                    <div className="group-filter">
                      <div className="group-filter-head">
                        <span>Visible groups ({diagnostic.visibleGroups.length}/{diagnostic.groupCount})</span>
                        <div>
                          <button type="button" onClick={() => setAllGroups(dataset.id, true)}>Select all</button>
                          <button type="button" onClick={() => setAllGroups(dataset.id, false)}>Clear all</button>
                          <button type="button" onClick={() => invertGroups(dataset.id)}>Invert</button>
                        </div>
                      </div>
                      {diagnostic.groupValues.length > 6 && (
                        <input
                          type="text"
                          value={dataset.groupFilterSearch}
                          onChange={(event) => updateGroupSearch(dataset.id, event.target.value)}
                          placeholder="Search groups"
                        />
                      )}
                      <div className="group-filter-list">
                        {filteredGroupValues.map((item) => (
                          <label className="checkbox-row compact" key={item.value}>
                            <input
                              type="checkbox"
                              checked={dataset.visibleGroups?.[item.value] !== false}
                              onChange={(event) => toggleGroupValue(dataset.id, item.value, event.target.checked)}
                            />
                            <span>{item.value}</span>
                            <small>{item.count?.toLocaleString?.() ?? ""}</small>
                          </label>
                        ))}
                      </div>
                      {diagnostic.groupValues.length > MAX_GROUP_CHECKBOXES && (
                        <p className="field-note">Only the first {MAX_GROUP_CHECKBOXES} groups are shown as toggles.</p>
                      )}
                    </div>
                  )}
                  <div className="row-filter">
                    <span>Row filter</span>
                    <input
                      type="text"
                      value={dataset.rowFilterDraftStart}
                      onChange={(event) => updateRowFilterDraft(dataset.id, { rowFilterDraftStart: event.target.value })}
                      placeholder="Start row"
                    />
                    <input
                      type="text"
                      value={dataset.rowFilterDraftEnd}
                      onChange={(event) => updateRowFilterDraft(dataset.id, { rowFilterDraftEnd: event.target.value })}
                      placeholder="End row"
                    />
                    <button type="button" onClick={() => applyDatasetRowFilter(dataset.id)}>Apply</button>
                    <button type="button" onClick={() => clearDatasetRowFilter(dataset.id)}>Clear</button>
                    <div className="row-filter-presets">
                      <button type="button" onClick={() => applyRowPreset(dataset.id, "all")}>All rows</button>
                      <button type="button" onClick={() => applyRowPreset(dataset.id, 500)}>First 500</button>
                      <button type="button" onClick={() => applyRowPreset(dataset.id, 1000)}>First 1000</button>
                    </div>
                    <small>
                      Data row numbers only; the header row is not counted. Current: {diagnostic?.rowFilterLabel ?? "All rows"},
                      rows after filter: {(diagnostic?.rowsAfterFilter ?? dataset.rowCount).toLocaleString()}.
                    </small>
                  </div>
                  {selectedYColumns.length > 0 && (
                    <div className="availability">
                      {selectedYColumns.map((column) => (
                        <span className={dataset.numericColumns.includes(column) ? "ok" : "missing"} key={column}>
                          {column}
                        </span>
                      ))}
                    </div>
                  )}
                  <CalculatedColumnsEditor
                    dataset={dataset}
                    onDraftChange={(patch) => updateCalculationDraft(dataset.id, patch)}
                    onAdd={() => addCalculatedColumn(dataset.id)}
                    onExport={() => exportProcessedCsv(dataset)}
                    onRemove={(column) => removeCalculatedColumn(dataset.id, column)}
                  />
                  {diagnostic && (
                    <details className="diagnostics">
                      <summary>診断情報</summary>
                      <dl>
                        <div>
                          <dt>総行数</dt>
                          <dd>{dataset.rowCount.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>Source type</dt>
                          <dd>{dataset.sourceType === "excel" ? "Excel" : "CSV"}</dd>
                        </div>
                        <div>
                          <dt>Sheet</dt>
                          <dd>{dataset.sheetName || "None"}</dd>
                        </div>
                        <div>
                          <dt>Rows after filter</dt>
                          <dd>{diagnostic.rowsAfterFilter.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>Row filter</dt>
                          <dd>{diagnostic.rowFilterLabel}</dd>
                        </div>
                        <div>
                          <dt>有効X行</dt>
                          <dd>{diagnostic.xSummary.validCount.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>描画点数</dt>
                          <dd>{diagnostic.plottedPointCount.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>間引き</dt>
                          <dd>{diagnostic.sampled ? "あり" : "なし"}</dd>
                        </div>
                        <div>
                          <dt>X列</dt>
                          <dd>{dataset.xColumn || "未選択"}</dd>
                        </div>
                        <div>
                          <dt>Xの解釈</dt>
                          <dd>{diagnostic.xTypeLabel}</dd>
                        </div>
                        <div>
                          <dt>Xユニーク数</dt>
                          <dd>{diagnostic.xSummary.uniqueCount.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>X重複行</dt>
                          <dd>{diagnostic.xSummary.duplicateRowCount.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>欠損値</dt>
                          <dd>{dataset.missingValueCount.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>数値混在</dt>
                          <dd>{dataset.invalidNumericCount.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>トレース数</dt>
                          <dd>{diagnostic.traceCount.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>Group column</dt>
                          <dd>{diagnostic.groupColumn || "None"}</dd>
                        </div>
                        <div>
                          <dt>Group count</dt>
                          <dd>{diagnostic.groupCount.toLocaleString()}</dd>
                        </div>
                        <div>
                          <dt>Visible groups</dt>
                          <dd>{diagnostic.visibleGroups.join(", ") || "None"}</dd>
                        </div>
                        <div>
                          <dt>E/N/U候補</dt>
                          <dd>{[dataset.eColumn, dataset.nColumn, dataset.uColumn].filter(Boolean).join(" / ") || "なし"}</dd>
                        </div>
                        <div className="wide">
                          <dt>Suggested group columns</dt>
                          <dd>{diagnostic.suggestedGroupColumns.map((candidate) => candidate.label).join(", ") || "None"}</dd>
                        </div>
                        <div className="wide">
                          <dt>表示Y列</dt>
                          <dd>{diagnostic.selectedPresentColumns.join(", ") || "このファイルには対象列がありません"}</dd>
                        </div>
                        <div className="wide">
                          <dt>Calculated columns</dt>
                          <dd>{(dataset.calculatedColumns ?? []).map((column) => column.name).join(", ") || "None"}</dd>
                        </div>
                        <div className="wide">
                          <dt>Calculation warnings</dt>
                          <dd>
                            {(dataset.calculatedColumns ?? [])
                              .filter((column) => column.invalidCount > 0)
                              .map((column) => `${column.name}: ${column.invalidCount.toLocaleString()} rows could not be calculated`)
                              .join("; ") || "None"}
                          </dd>
                        </div>
                      </dl>
                    </details>
                  )}
                    </div>
                  </details>
                </article>
                );
              })
            )}
          </div>
        </section>

        <aside className="panel settings-panel">
          <div className="section-heading">
            <h2>グラフ設定</h2>
            <Settings2 size={18} />
          </div>
          <p className="settings-intro">上から順に設定してください。高度な項目は折りたたんであります。</p>

          <details className="settings-group" defaultOpen>
            <summary><span className="step-number">1</span>グラフの種類</summary>
            <div className="settings-group-body">
              <div className="field">
                <span>表示モード</span>
                <div className="segmented two">
                  {GRAPH_MODES.map(({ value, label, icon: Icon }) => (
                    <button
                      type="button"
                      className={graphMode === value ? "active" : ""}
                      onClick={() => setGraphMode(value)}
                      key={value}
                    >
                      <Icon size={16} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <span>グラフ種類</span>
                <div className="segmented">
                  {CHART_TYPES.map(({ value, label, icon: Icon }) => (
                    <button
                      type="button"
                      className={chartType === value ? "active" : ""}
                      onClick={() => setChartType(value)}
                      disabled={graphMode === "enu" && value === "bar"}
                      key={value}
                    >
                      <Icon size={16} />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="field">
                <span>凡例</span>
                <select value={legendMode} onChange={(event) => setLegendMode(event.target.value)}>
                  {LEGEND_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>{mode.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </details>

          <details className="settings-group" defaultOpen>
            <summary><span className="step-number">2</span>表示するデータ</summary>
            <div className="settings-group-body">
              {graphMode === "timeseries" ? (
                <>
                  <label className="field">
                    <span>X軸列を一括適用</span>
                    <select value={globalXColumn} onChange={(event) => applyGlobalX(event.target.value)} disabled={!allXColumns.length}>
                      <option value="">ファイル別のX列を使用</option>
                      {allXColumns.map((column) => (
                        <option key={column} value={column}>{column}</option>
                      ))}
                    </select>
                  </label>

                  <div className="field">
                    <span>Y軸列（複数選択）</span>
                    <div className="checkbox-list">
                      {allNumericColumns.length === 0 ? (
                        <span className="muted">数値列が見つかると候補が表示されます。</span>
                      ) : (
                        allNumericColumns.map((column) => (
                          <label className="checkbox-row" key={column}>
                            <input
                              type="checkbox"
                              checked={selectedYColumns.includes(column)}
                              onChange={() => toggleYColumn(column)}
                            />
                            <span>{column}</span>
                            <small>{datasets.filter((dataset) => dataset.numericColumns.includes(column)).length}/{datasets.length}</small>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="field-note">XY X・XY Yは各ファイルカードの「データ設定を開く」で選択します。</p>
              )}
              <p className="field-note">系列ごとの色・点色・点サイズも各ファイルカード内で設定できます。</p>
            </div>
          </details>

          <details className="settings-group">
            <summary><span className="step-number">3</span>軸と見た目</summary>
            <div className="settings-group-body">
              <div className="field">
                <span>軸スケール</span>
                <div className="style-grid">
                  <label>
                    X軸
                    <select
                      value={xScaleType}
                      onChange={(event) => setXScaleType(event.target.value)}
                      disabled={graphMode !== "enu" && resolvedXAxisType !== "number"}
                    >
                      {AXIS_SCALE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Y軸
                    <select value={yScaleType} onChange={(event) => setYScaleType(event.target.value)}>
                      {AXIS_SCALE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                </div>
                {(xScaleType === "logarithmic" || yScaleType === "logarithmic") && (
                  <p className="field-note">対数軸では0以下の値は表示されません。</p>
                )}
              </div>

              {graphMode === "enu" && xScaleType === "linear" && yScaleType === "linear" && (
                <label className="toggle-row">
                  <input type="checkbox" checked={equalScale} onChange={(event) => setEqualScale(event.target.checked)} />
                  <span>XY軸を等倍にする</span>
                </label>
              )}

              <div className="field">
                <span>線と点</span>
                <div className="style-grid">
                  <label>
                    Line width
                    <select value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))}>
                      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>
                    Markers
                    <select value={showPointMarkers ? "on" : "off"} onChange={(event) => setShowPointMarkers(event.target.value === "on")}>
                      <option value="off">Off</option>
                      <option value="on">On</option>
                    </select>
                  </label>
                  <label>
                    既定の点サイズ
                    <select value={markerSize} onChange={(event) => setMarkerSize(Number(event.target.value))}>
                      {[2, 4, 5, 6, 8, 10, 12, 16].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  {graphMode === "enu" && (
                    <label>
                      Start/end marker
                      <select value={endpointMarkerSize} onChange={(event) => setEndpointMarkerSize(Number(event.target.value))}>
                        {[6, 8, 9, 10, 12, 14, 16].map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              </div>

              <div className="field">
                <span>ラベル編集</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={axisFallback.title} />
                <input value={xAxisLabel} onChange={(event) => setXAxisLabel(event.target.value)} placeholder={axisFallback.x} />
                <input value={yAxisLabel} onChange={(event) => setYAxisLabel(event.target.value)} placeholder={axisFallback.y} />
              </div>

              <div className="field">
                <span>表示範囲（任意）</span>
                <div className="range-grid">
                  <input value={xMin} onChange={(event) => setXMin(event.target.value)} placeholder="X min" />
                  <input value={xMax} onChange={(event) => setXMax(event.target.value)} placeholder="X max" />
                  <input value={yMin} onChange={(event) => setYMin(event.target.value)} placeholder="Y min" />
                  <input value={yMax} onChange={(event) => setYMax(event.target.value)} placeholder="Y max" />
                </div>
              </div>

              <details className="nested-settings">
                <summary>文字サイズ</summary>
                <div className="style-grid">
                  <label className="number-with-unit">Title font size<span><input type="number" min="8" max="36" value={titleFontSize} onChange={(event) => setClampedNumber(setTitleFontSize, event.target.value, 8, 36, DEFAULT_DISPLAY_SETTINGS.titleFontSize)} />px</span></label>
                  <label className="number-with-unit">Axis label font size<span><input type="number" min="8" max="30" value={axisLabelFontSize} onChange={(event) => setClampedNumber(setAxisLabelFontSize, event.target.value, 8, 30, DEFAULT_DISPLAY_SETTINGS.axisLabelFontSize)} />px</span></label>
                  <label className="number-with-unit">Tick font size<span><input type="number" min="8" max="24" value={tickFontSize} onChange={(event) => setClampedNumber(setTickFontSize, event.target.value, 8, 24, DEFAULT_DISPLAY_SETTINGS.tickFontSize)} />px</span></label>
                  <label className="number-with-unit">Legend font size<span><input type="number" min="8" max="24" value={legendFontSize} onChange={(event) => setClampedNumber(setLegendFontSize, event.target.value, 8, 24, DEFAULT_DISPLAY_SETTINGS.legendFontSize)} />px</span></label>
                </div>
              </details>
            </div>
          </details>

          <details className="settings-group">
            <summary><span className="step-number">4</span>画像保存・設定</summary>
            <div className="settings-group-body">
              <div className="field">
                <span>画像サイズ</span>
                <div className="style-grid">
                  <label className="number-with-unit">幅<span><input type="number" min="480" max="3000" value={imageWidth} onChange={(event) => setClampedNumber(setImageWidth, event.target.value, 480, 3000, DEFAULT_DISPLAY_SETTINGS.imageWidth)} />px</span></label>
                  <label className="number-with-unit">高さ<span><input type="number" min="320" max="2200" value={imageHeight} onChange={(event) => setClampedNumber(setImageHeight, event.target.value, 320, 2200, DEFAULT_DISPLAY_SETTINGS.imageHeight)} />px</span></label>
                  <label>
                    Background
                    <select value={pngBackground} onChange={(event) => setPngBackground(event.target.value)}>
                      <option value="white">White</option>
                      <option value="transparent">Transparent</option>
                    </select>
                  </label>
                  <label>
                    解像度倍率
                    <select value={pngScale} onChange={(event) => setPngScale(Number(event.target.value))}>
                      <option value={1}>1×</option>
                      <option value={2}>2×</option>
                      <option value={3}>3×</option>
                    </select>
                  </label>
                </div>
                <p className="field-note">保存PNG: {(imageWidth * pngScale).toLocaleString()} × {(imageHeight * pngScale).toLocaleString()} px</p>
              </div>

              <div className="field">
                <span>設定ファイル</span>
                <div className="settings-actions">
                  <button type="button" onClick={resetDisplaySettings}>Reset</button>
                  <button type="button" onClick={exportSettings}>Export</button>
                  <button type="button" onClick={() => settingsInputRef.current?.click()}>Import</button>
                </div>
                <input ref={settingsInputRef} type="file" accept="application/json,.json" onChange={(event) => importSettings(event.target.files?.[0])} hidden />
              </div>

              <button type="button" className="download-button" onClick={downloadChart} disabled={!hasChart}>
                <Download size={17} />
                {graphMode === "enu" ? "Save XY Plot PNG" : "Save Time Series PNG"}
              </button>
            </div>
          </details>
        </aside>

        <section className="panel chart-panel">
          <div className="section-heading">
            <h2>グラフ表示</h2>
            <span>{hasChart ? `${chartBuild.datasets.length} 系列` : "未表示"}</span>
          </div>
          <div className="current-view">
            <strong>Current view</strong>
            <span>X = {currentViewSummary.x}</span>
            <span>Y = {currentViewSummary.y}</span>
            <span>Group = {currentViewSummary.group}</span>
            <span>Visible groups = {currentViewSummary.visibleGroups}</span>
            <span>Row filter = {currentViewSummary.rowFilter}</span>
            <span>Trace count = {currentViewSummary.traceCount}</span>
          </div>
          {missingSelectionMessages.length > 0 && (
            <div className="warning-list">
              {missingSelectionMessages.map((message) => <span key={message}>{message}</span>)}
            </div>
          )}
          {xDuplicateWarnings.length > 0 && (
            <div className="warning-list">
              {xDuplicateWarnings.map((message) => <span key={message}>{message}</span>)}
            </div>
          )}
          {hasManyTraces && (
            <div className="warning-list">
              <span>表示系列が多くなっています。グループフィルタやY列選択を減らすと見やすくなります。</span>
            </div>
          )}
          {isSampling && (
            <div className="warning-list">
              <span>表示を軽くするため、系列あたり最大 {MAX_POINTS_PER_SERIES.toLocaleString()} 点に間引いています。</span>
            </div>
          )}
          <div
            className={`chart-frame ${graphMode === "enu" && equalScale && xScaleType === "linear" && yScaleType === "linear" ? "square" : ""}`}
            style={{ height: `${Math.min(imageHeight, 1100)}px` }}
          >
            {hasChart ? chartComponent : <div className="empty-state">CSV/Excelを読み込み、表示するファイルと列を選択してください。</div>}
          </div>
        </section>

        <section className="panel preview-panel">
          <div className="section-heading">
            <h2>データプレビュー</h2>
            {previewDataset && (
              <select value={previewDataset.id} onChange={(event) => setPreviewDatasetId(event.target.value)}>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                ))}
              </select>
            )}
          </div>
          {previewDataset ? (
            <>
              <div className="column-chips">
                {previewDataset.columnStats.map((stat) => (
                  <span className={stat.isNumeric ? "numeric" : "textual"} key={stat.name}>
                    {stat.name}
                    {stat.isNumeric ? ` (${stat.numericCount})` : ""}
                  </span>
                ))}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {previewDataset.columns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewDataset.rows.slice(0, MAX_PREVIEW_ROWS).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {previewDataset.columns.map((column) => {
                          const stat = getColumnStat(previewDataset, column);
                          return (
                            <td className={stat?.isNumeric ? "num" : ""} key={column}>
                              {cleanHeader(row[column]) || <span className="blank-cell">空欄</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewDataset.rowCount > MAX_PREVIEW_ROWS && <p className="preview-note">先頭 {MAX_PREVIEW_ROWS} 行を表示中です。</p>}
            </>
          ) : (
            <div className="empty-state">読み込んだCSV/Excelの中身がここに表示されます。</div>
          )}
        </section>
      </section>

      <StatisticsPanel datasets={datasets} />

      {modal && (
        <div className="modal-overlay" onClick={() => closeModal(null)}>
          <div className="modal-dialog" onClick={(event) => event.stopPropagation()}>
            {modal.type === "sampleLoad" && (
              <>
                <h3>サンプルデータの読み込み</h3>
                <p>{modal.label}を読み込む前に既存データがあります。</p>
                <div className="modal-actions">
                  <button type="button" onClick={() => closeModal("replace")}>置換</button>
                  <button type="button" onClick={() => closeModal("add")}>追加</button>
                  <button type="button" onClick={() => closeModal(null)}>中止</button>
                </div>
              </>
            )}
            {modal.type === "resetConfirm" && (
              <>
                <h3>設定リセット</h3>
                <p>Reset display settings and per-file filters? Loaded CSV data will stay open.</p>
                <div className="modal-actions">
                  <button type="button" onClick={() => closeModal(true)}>Reset</button>
                  <button type="button" onClick={() => closeModal(null)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
