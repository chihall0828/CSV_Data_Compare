import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const baseUrl = process.env.VITE_BASE_URL ?? "";
assert(baseUrl, "VITE_BASE_URL must be set when validating the GitHub Pages build.");
assert(baseUrl.startsWith("/") && baseUrl.endsWith("/"), `VITE_BASE_URL must start and end with "/": ${baseUrl}`);

const distDir = path.resolve("dist");
const indexPath = path.join(distDir, "index.html");

assert(fs.existsSync(indexPath), `Built index.html is missing: ${indexPath}`);

const indexHtml = fs.readFileSync(indexPath, "utf8");
const assetMatches = [...indexHtml.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/gu)].map((match) => match[1]);

assert(assetMatches.length > 0, "Built index.html does not reference any assets.");

for (const assetUrl of assetMatches) {
  assert(assetUrl.startsWith(baseUrl), `Asset URL does not use VITE_BASE_URL ${baseUrl}: ${assetUrl}`);
  const relativeAssetPath = assetUrl.slice(baseUrl.length);
  const assetPath = path.join(distDir, relativeAssetPath);
  assert(fs.existsSync(assetPath), `Referenced asset is missing from dist: ${relativeAssetPath}`);
  assert(fs.statSync(assetPath).size > 0, `Referenced asset is empty: ${relativeAssetPath}`);
}

const jsAssets = assetMatches.filter((assetUrl) => assetUrl.endsWith(".js"));
const cssAssets = assetMatches.filter((assetUrl) => assetUrl.endsWith(".css"));

assert(jsAssets.length > 0, "Built index.html must reference at least one JavaScript asset.");
assert(cssAssets.length > 0, "Built index.html must reference at least one CSS asset.");

// The in-app sample buttons fetch these bundled files at runtime; if any is
// missing from dist, the buttons 404 on the published site.
const SAMPLE_FILES = [
  "sample-gnss.csv",
  "sample-gnss-2.csv",
  "real-samples/20260525_1KF_result_ENU_normal.csv",
  "real-samples/20260525_1KF_result_ENU_block_az0_60_ele70.csv",
  "real-samples/20260525_1Comparison_timeseries.csv",
  "test-samples/missing-values.csv",
  "test-samples/non-numeric-mixed.csv",
  "test-samples/日本語ファイル名.csv",
  "test-samples/no-enu-columns.csv",
  "test-samples/large-sample.csv",
  "test-samples/column-calculation.csv",
  "test-samples/sample-excel.xlsx",
  "favicon.svg"
];

for (const sampleFile of SAMPLE_FILES) {
  const samplePath = path.join(distDir, sampleFile);
  assert(fs.existsSync(samplePath), `Bundled sample file is missing from dist: ${sampleFile}`);
  assert(fs.statSync(samplePath).size > 0, `Bundled sample file is empty: ${sampleFile}`);
}

console.log(
  JSON.stringify({
    status: "ok",
    baseUrl,
    assets: assetMatches.map((assetUrl) => assetUrl.slice(baseUrl.length)).sort(),
    sampleFilesChecked: SAMPLE_FILES.length
  })
);
