import { cleanHeader, isMissingValue } from "./dataUtils.js";

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;

function readUInt16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32(bytes, offset) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readAttributes(tagText) {
  const attributes = {};
  const pattern = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = pattern.exec(tagText)) !== null) {
    attributes[match[1]] = decodeXml(match[2] ?? match[3] ?? "");
  }
  return attributes;
}

function findEndOfCentralDirectory(bytes) {
  const minOffset = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (readUInt32(bytes, offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  throw new Error("Excel workbook could not be read: ZIP directory was not found.");
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser does not support Excel ZIP decompression.");
  }

  const formats = ["deflate-raw", "deflate"];
  let lastError = null;
  for (const format of formats) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Excel ZIP decompression failed: ${lastError?.message ?? "unknown error"}`);
}

async function readZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const entryCount = readUInt16(bytes, eocdOffset + 10);
  let offset = readUInt32(bytes, eocdOffset + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(bytes, offset) !== ZIP_CENTRAL_SIGNATURE) {
      throw new Error("Excel workbook could not be read: invalid ZIP central directory.");
    }

    const compressionMethod = readUInt16(bytes, offset + 10);
    const compressedSize = readUInt32(bytes, offset + 20);
    const fileNameLength = readUInt16(bytes, offset + 28);
    const extraLength = readUInt16(bytes, offset + 30);
    const commentLength = readUInt16(bytes, offset + 32);
    const localHeaderOffset = readUInt32(bytes, offset + 42);
    const nameBytes = bytes.slice(offset + 46, offset + 46 + fileNameLength);
    const name = decodeUtf8(nameBytes).replace(/\\/g, "/");

    if (readUInt32(bytes, localHeaderOffset) !== ZIP_LOCAL_SIGNATURE) {
      throw new Error(`Excel workbook could not be read: invalid local file header for ${name}.`);
    }

    const localNameLength = readUInt16(bytes, localHeaderOffset + 26);
    const localExtraLength = readUInt16(bytes, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    let data;
    if (compressionMethod === 0) {
      data = compressed;
    } else if (compressionMethod === 8) {
      data = await inflateRaw(compressed);
    } else {
      throw new Error(`Excel workbook contains unsupported ZIP compression method ${compressionMethod}.`);
    }

    entries.set(name, data);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function entryText(entries, name) {
  const data = entries.get(name);
  return data ? decodeUtf8(data) : "";
}

function normalizeWorkbookTarget(target) {
  const normalized = target.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.startsWith("xl/")) return normalized;
  return `xl/${normalized}`.replace(/\/\.\//g, "/");
}

function parseWorkbookSheets(workbookXml, relationshipsXml) {
  const relationships = new Map();
  for (const match of relationshipsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const attrs = readAttributes(match[0]);
    if (attrs.Id && attrs.Target) {
      relationships.set(attrs.Id, normalizeWorkbookTarget(attrs.Target));
    }
  }

  const sheets = [];
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const attrs = readAttributes(match[0]);
    const relId = attrs["r:id"];
    const target = relId ? relationships.get(relId) : "";
    if (!target) continue;
    sheets.push({
      name: cleanHeader(attrs.name) || `Sheet${sheets.length + 1}`,
      id: attrs.sheetId || String(sheets.length + 1),
      path: target
    });
  }

  return sheets;
}

function parseSharedStrings(sharedStringsXml) {
  if (!sharedStringsXml) return [];
  const strings = [];
  for (const match of sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const block = match[1];
    const parts = [...block.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
    strings.push(parts.length ? parts.join("") : decodeXml(block.replace(/<[^>]+>/g, "")));
  }
  return strings;
}

function columnIndexFromRef(ref) {
  const letters = cleanHeader(ref).match(/^[A-Za-z]+/)?.[0];
  if (!letters) return null;
  let index = 0;
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

function parseCellValue(cellXml, attrs, sharedStrings) {
  if (attrs.t === "inlineStr") {
    const textParts = [...cellXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => decodeXml(part[1]));
    return textParts.join("");
  }

  const valueText = cellXml.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
  if (valueText === undefined) return "";
  const raw = decodeXml(valueText);

  if (attrs.t === "s") return sharedStrings[Number(raw)] ?? "";
  if (attrs.t === "b") return raw === "1" ? "TRUE" : "FALSE";
  return raw;
}

function parseWorksheetRows(sheetXml, sharedStrings) {
  const rowMap = new Map();
  let maxColumn = -1;
  let fallbackRowIndex = 0;

  for (const rowMatch of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = readAttributes(rowMatch[1]);
    const rowIndex = Number.isFinite(Number(rowAttrs.r)) ? Number(rowAttrs.r) - 1 : fallbackRowIndex;
    const row = [];
    let nextColumn = 0;

    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)(?:>([\s\S]*?)<\/c>|\/>)/g)) {
      const attrs = readAttributes(cellMatch[1]);
      const columnIndex = columnIndexFromRef(attrs.r) ?? nextColumn;
      const value = parseCellValue(cellMatch[2] ?? "", attrs, sharedStrings);
      row[columnIndex] = value;
      maxColumn = Math.max(maxColumn, columnIndex);
      nextColumn = columnIndex + 1;
    }

    rowMap.set(rowIndex, row);
    fallbackRowIndex += 1;
  }

  if (rowMap.size === 0 || maxColumn < 0) return [];
  const maxRow = Math.max(...rowMap.keys());
  const rows = [];
  for (let rowIndex = 0; rowIndex <= maxRow; rowIndex += 1) {
    const source = rowMap.get(rowIndex) ?? [];
    rows.push(Array.from({ length: maxColumn + 1 }, (_, columnIndex) => source[columnIndex] ?? ""));
  }
  return rows;
}

function makeUniqueHeaders(headerCells, usedColumnCount) {
  const counts = new Map();
  return Array.from({ length: usedColumnCount }, (_, index) => {
    const base = cleanHeader(headerCells[index]) || `Column_${index + 1}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function rowsToParsedData(rows, sheetName, headerRow = 1) {
  const headerIndex = Math.max(0, headerRow - 1);
  const headerCells = rows[headerIndex] ?? [];
  let usedColumnCount = 0;
  for (let rowIndex = headerIndex; rowIndex < rows.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < rows[rowIndex].length; columnIndex += 1) {
      if (!isMissingValue(rows[rowIndex][columnIndex])) usedColumnCount = Math.max(usedColumnCount, columnIndex + 1);
    }
  }

  if (usedColumnCount === 0) {
    throw new Error(`${sheetName}: header row was not found.`);
  }

  const fields = makeUniqueHeaders(headerCells, usedColumnCount);
  const data = rows.slice(headerIndex + 1).map((row) => {
    const record = {};
    for (let columnIndex = 0; columnIndex < fields.length; columnIndex += 1) {
      record[fields[columnIndex]] = row[columnIndex] ?? "";
    }
    return record;
  });

  return {
    meta: { fields },
    data,
    errors: []
  };
}

export async function parseXlsxWorkbook(arrayBuffer, options = {}) {
  const headerRow = options.headerRow ?? 1;
  const entries = await readZipEntries(arrayBuffer);
  const workbookXml = entryText(entries, "xl/workbook.xml");
  const relationshipsXml = entryText(entries, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relationshipsXml) {
    throw new Error("Excel workbook could not be read: workbook metadata is missing.");
  }

  const sharedStrings = parseSharedStrings(entryText(entries, "xl/sharedStrings.xml"));
  const sheetRefs = parseWorkbookSheets(workbookXml, relationshipsXml);
  const sheets = [];
  const warnings = [];

  for (const sheet of sheetRefs) {
    const sheetXml = entryText(entries, sheet.path);
    if (!sheetXml) {
      warnings.push(`${sheet.name}: worksheet XML was not found.`);
      continue;
    }

    try {
      const rows = parseWorksheetRows(sheetXml, sharedStrings);
      const parsed = rowsToParsedData(rows, sheet.name, headerRow);
      sheets.push({ ...sheet, parsed, headerRow });
    } catch (error) {
      warnings.push(error.message);
    }
  }

  if (sheets.length === 0) {
    throw new Error(`Excel workbook has no readable sheets.${warnings.length ? ` ${warnings.join(" ")}` : ""}`);
  }

  return { sheets, warnings };
}
