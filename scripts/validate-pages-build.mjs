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

console.log(
  JSON.stringify({
    status: "ok",
    baseUrl,
    assets: assetMatches.map((assetUrl) => assetUrl.slice(baseUrl.length)).sort()
  })
);
