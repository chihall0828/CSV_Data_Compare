export const PLOT_COLOR_AUTO = "auto";
export const PLOT_COLOR_CUSTOM = "custom";
export const PLOT_LINE_STYLE_AUTO = "auto";

export const PLOT_COLOR_OPTIONS = [
  { value: PLOT_COLOR_AUTO, label: "Auto", color: "" },
  { value: "blue", label: "Blue", color: "#2563eb" },
  { value: "red", label: "Red", color: "#dc2626" },
  { value: "green", label: "Green", color: "#059669" },
  { value: "purple", label: "Purple", color: "#9333ea" },
  { value: "orange", label: "Orange", color: "#ea580c" },
  { value: "cyan", label: "Cyan", color: "#0891b2" },
  { value: "gray", label: "Gray", color: "#64748b" },
  { value: PLOT_COLOR_CUSTOM, label: "Custom hex", color: "" }
];

export const PLOT_LINE_STYLE_OPTIONS = [
  { value: PLOT_LINE_STYLE_AUTO, label: "Auto", dash: null },
  { value: "solid", label: "Solid", dash: [] },
  { value: "dashed", label: "Dashed", dash: [6, 4] },
  { value: "dotted", label: "Dotted", dash: [2, 3] },
  { value: "dashdot", label: "Dash-dot", dash: [10, 4, 2, 4] }
];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value) {
  return typeof value === "string" && HEX_COLOR_RE.test(value.trim());
}

export function normalizeHexColor(value) {
  return isValidHexColor(value) ? value.trim().toUpperCase() : "";
}

export function normalizePlotColor(value) {
  return PLOT_COLOR_OPTIONS.some((option) => option.value === value) ? value : PLOT_COLOR_AUTO;
}

export function normalizePlotLineStyle(value) {
  return PLOT_LINE_STYLE_OPTIONS.some((option) => option.value === value) ? value : PLOT_LINE_STYLE_AUTO;
}

export function resolveDatasetColor(dataset, fallbackColor) {
  const plotColor = normalizePlotColor(dataset?.plotColor);
  if (plotColor === PLOT_COLOR_AUTO) return fallbackColor;
  if (plotColor === PLOT_COLOR_CUSTOM) {
    return normalizeHexColor(dataset?.customPlotColor) || fallbackColor;
  }
  return PLOT_COLOR_OPTIONS.find((option) => option.value === plotColor)?.color ?? fallbackColor;
}

export function resolveDatasetLineDash(dataset, fallbackDash) {
  const plotLineStyle = normalizePlotLineStyle(dataset?.plotLineStyle);
  if (plotLineStyle === PLOT_LINE_STYLE_AUTO) return fallbackDash;
  const dash = PLOT_LINE_STYLE_OPTIONS.find((option) => option.value === plotLineStyle)?.dash;
  return Array.isArray(dash) ? dash : fallbackDash;
}

export function plotStyleForStorage(dataset) {
  const plotColor = normalizePlotColor(dataset?.plotColor);
  const customPlotColor = normalizeHexColor(dataset?.customPlotColor);
  const plotLineStyle = normalizePlotLineStyle(dataset?.plotLineStyle);

  return {
    plotColor: plotColor === PLOT_COLOR_CUSTOM && !customPlotColor ? PLOT_COLOR_AUTO : plotColor,
    customPlotColor: plotColor === PLOT_COLOR_CUSTOM ? customPlotColor : "",
    plotLineStyle
  };
}

export function plotStyleFromStorage(saved = {}) {
  const plotColor = normalizePlotColor(saved.plotColor);
  const customPlotColor = normalizeHexColor(saved.customPlotColor);
  return {
    plotColor: plotColor === PLOT_COLOR_CUSTOM && !customPlotColor ? PLOT_COLOR_AUTO : plotColor,
    customPlotColor: plotColor === PLOT_COLOR_CUSTOM ? customPlotColor : "",
    customPlotColorDraft: plotColor === PLOT_COLOR_CUSTOM ? customPlotColor : "",
    plotLineStyle: normalizePlotLineStyle(saved.plotLineStyle)
  };
}
