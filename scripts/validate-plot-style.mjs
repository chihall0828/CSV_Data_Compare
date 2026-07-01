import {
  normalizeHexColor,
  plotStyleForStorage,
  plotStyleFromStorage,
  resolveDatasetColor,
  resolveDatasetLineDash
} from "../src/plotStyleUtils.js";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function sameArray(actual, expected) {
  return Array.isArray(actual) && Array.isArray(expected) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

const fallbackColor = "#111111";
const fallbackDash = [9, 9];

assert(resolveDatasetColor({ plotColor: "auto" }, fallbackColor) === fallbackColor, "auto color should use fallback");
assert(resolveDatasetColor({}, fallbackColor) === fallbackColor, "missing color setting should use fallback");
assert(resolveDatasetColor({ plotColor: "red" }, fallbackColor) === "#dc2626", "red should resolve to palette color");
assert(resolveDatasetColor({ plotColor: "custom", customPlotColor: "#12abEF" }, fallbackColor) === "#12ABEF", "valid custom hex should normalize and apply");
assert(resolveDatasetColor({ plotColor: "custom", customPlotColor: "#12abE" }, fallbackColor) === fallbackColor, "invalid custom hex should not apply");

assert(sameArray(resolveDatasetLineDash({ plotLineStyle: "auto" }, fallbackDash), fallbackDash), "auto line style should use fallback");
assert(sameArray(resolveDatasetLineDash({}, fallbackDash), fallbackDash), "missing line style should use fallback");
assert(sameArray(resolveDatasetLineDash({ plotLineStyle: "solid" }, fallbackDash), []), "solid should resolve to no dash");
assert(sameArray(resolveDatasetLineDash({ plotLineStyle: "dashed" }, fallbackDash), [6, 4]), "dashed pattern mismatch");
assert(sameArray(resolveDatasetLineDash({ plotLineStyle: "dotted" }, fallbackDash), [2, 3]), "dotted pattern mismatch");
assert(sameArray(resolveDatasetLineDash({ plotLineStyle: "dashdot" }, fallbackDash), [10, 4, 2, 4]), "dash-dot pattern mismatch");

assert(normalizeHexColor("#abcdef") === "#ABCDEF", "hex should normalize to uppercase");
assert(normalizeHexColor("abcdef") === "", "hex without # should be invalid");
assert(normalizeHexColor("#abcdex") === "", "non-hex character should be invalid");
assert(normalizeHexColor("#abcd") === "", "short hex should be invalid");

const validStorage = plotStyleForStorage({
  plotColor: "custom",
  customPlotColor: "#00cc99",
  plotLineStyle: "dashdot"
});
assert(validStorage.plotColor === "custom", "valid custom color should be stored as custom");
assert(validStorage.customPlotColor === "#00CC99", "stored custom color should be normalized");
assert(validStorage.plotLineStyle === "dashdot", "line style should be stored");

const invalidStorage = plotStyleForStorage({
  plotColor: "custom",
  customPlotColor: "#nothex",
  plotLineStyle: "unknown"
});
assert(invalidStorage.plotColor === "auto", "invalid custom color should store as auto");
assert(invalidStorage.customPlotColor === "", "invalid custom color value should not be stored");
assert(invalidStorage.plotLineStyle === "auto", "unknown line style should store as auto");

const restored = plotStyleFromStorage({
  plotColor: "custom",
  customPlotColor: "#00cc99",
  plotLineStyle: "dotted"
});
assert(restored.plotColor === "custom", "stored custom color mode should restore");
assert(restored.customPlotColor === "#00CC99", "stored custom hex should restore normalized");
assert(restored.customPlotColorDraft === "#00CC99", "custom hex draft should restore from valid saved value");
assert(restored.plotLineStyle === "dotted", "stored line style should restore");

if (failures.length === 0) {
  console.log(JSON.stringify({ status: "ok" }));
} else {
  console.error(JSON.stringify({ status: "fail", failures }));
  process.exit(1);
}
