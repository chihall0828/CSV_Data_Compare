import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const releaseDir = path.resolve("release", "CSVDataCompare");
const zipPath = path.resolve("release", "CSVDataCompare-portable.zip");
const packageRoot = "CSVDataCompare";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeZipPath(name) {
  return name.replace(/\\/g, "/").replace(/\/+$/u, "");
}

function sha256Hex(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function listFiles(root, current = root) {
  const entries = fs.readdirSync(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(root, fullPath));
    } else if (entry.isFile()) {
      files.push({
        fullPath,
        relativePath: path.relative(root, fullPath).replace(/\\/g, "/"),
        size: fs.statSync(fullPath).size
      });
    }
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function readZipCentralDirectory(filePath) {
  const buffer = fs.readFileSync(filePath);
  const minEocdSize = 22;
  const maxCommentLength = 0xffff;
  const start = Math.max(0, buffer.length - minEocdSize - maxCommentLength);
  let eocdOffset = -1;

  for (let i = buffer.length - minEocdSize; i >= start; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  assert(eocdOffset >= 0, "ZIP end of central directory was not found.");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  assert(centralDirOffset + centralDirSize <= buffer.length, "ZIP central directory points outside the file.");

  const entries = new Map();
  let offset = centralDirOffset;

  for (let i = 0; i < entryCount; i++) {
    assert(buffer.readUInt32LE(offset) === 0x02014b50, `Invalid central directory entry at offset ${offset}.`);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const name = normalizeZipPath(buffer.toString("utf8", fileNameStart, fileNameEnd));

    if (name && !name.endsWith("/")) {
      entries.set(name, uncompressedSize);
    }

    offset = fileNameEnd + extraLength + commentLength;
  }

  return entries;
}

assert(fs.existsSync(releaseDir), `Portable release folder is missing: ${releaseDir}`);
assert(fs.existsSync(zipPath), `Portable release zip is missing: ${zipPath}`);

const folderFiles = listFiles(releaseDir);
assert(folderFiles.length > 0, "Portable release folder has no files.");

const zipEntries = readZipCentralDirectory(zipPath);
assert(zipEntries.size > 0, "Portable release zip has no file entries.");

const buildInfoPath = path.join(releaseDir, "app", "build-info.json");
const indexPath = path.join(releaseDir, "app", "index.html");
assert(fs.existsSync(buildInfoPath), "build-info.json is missing from the portable app.");
assert(fs.existsSync(indexPath), "index.html is missing from the portable app.");

const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, "utf8").replace(/^\uFEFF/u, ""));
assert(buildInfo.app === "CSV Data Compare", `Unexpected app name in build-info.json: ${buildInfo.app}`);
assert(buildInfo.packageName === "CSVDataCompare", `Unexpected package name in build-info.json: ${buildInfo.packageName}`);
assert(Array.isArray(buildInfo.assets) && buildInfo.assets.length > 0, "build-info.json must list generated assets.");
assert(Number.isFinite(Date.parse(buildInfo.generatedAt)), "build-info.json generatedAt is not a valid date.");
assert(buildInfo.distIndexHash === sha256Hex(indexPath), "build-info distIndexHash does not match app/index.html.");

const indexHtml = fs.readFileSync(indexPath, "utf8");
const folderFileMap = new Map(folderFiles.map((file) => [file.relativePath, file.size]));

for (const asset of buildInfo.assets) {
  const assetPath = `app/assets/${asset}`;
  assert(folderFileMap.has(assetPath), `build-info asset is missing from release folder: ${assetPath}`);
  assert(indexHtml.includes(`assets/${asset}`), `index.html does not reference build-info asset: ${asset}`);
}

for (const file of folderFiles) {
  const zipName = `${packageRoot}/${file.relativePath}`;
  assert(zipEntries.has(zipName), `Zip is missing release file: ${zipName}`);
  const zipSize = zipEntries.get(zipName);
  assert(file.size > 0, `Release file is empty: ${file.relativePath}`);
  assert(zipSize > 0, `Zip entry is empty: ${zipName}`);
}

const zipAssetEntries = [...zipEntries.keys()]
  .filter((name) => name.startsWith(`${packageRoot}/app/assets/`))
  .map((name) => path.posix.basename(name))
  .sort();
const buildInfoAssets = [...buildInfo.assets].sort();

assert(
  JSON.stringify(zipAssetEntries) === JSON.stringify(buildInfoAssets),
  `Zip assets do not match build-info assets: ${zipAssetEntries.join(", ")} vs ${buildInfoAssets.join(", ")}`
);

console.log(
  JSON.stringify({
    status: "ok",
    folderFiles: folderFiles.length,
    zipEntries: zipEntries.size,
    assets: buildInfoAssets,
    zip: path.relative(process.cwd(), zipPath)
  })
);
