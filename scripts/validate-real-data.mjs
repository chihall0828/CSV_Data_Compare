import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import {
  analyzeParsedCsv,
  applyRowFilter,
  getGroupColumnCandidates,
  inferXType,
  makeEnuPoints,
  makeEnuPointsFromRows,
  makeSeriesPoints,
  makeSeriesPointsFromRows,
  pickInitialYColumns,
  splitRowsByGroup,
  summarizeXValues
} from "../src/dataUtils.js";

const colors = ["#2563eb", "#dc2626", "#059669", "#9333ea", "#ea580c"];

const defaultFiles = [
  "20260525_1KF_result_ENU_normal.csv",
  "20260525_1KF_result_ENU_block_az0_60_ele70.csv",
  "20260525_1Comparison_timeseries.csv"
];

function parseArgs(argv) {
  const args = {
    dir: path.resolve("public", "real-samples"),
    files: defaultFiles,
    includeTests: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--dir" && argv[index + 1]) {
      args.dir = path.resolve(argv[index + 1]);
      index += 1;
    } else if (item === "--files" && argv[index + 1]) {
      args.files = argv[index + 1].split(",").map((value) => value.trim()).filter(Boolean);
      index += 1;
    } else if (item === "--no-tests") {
      args.includeTests = false;
    }
  }

  return args;
}

function parseFile(baseDir, fileName, index) {
  const fullPath = path.join(baseDir, fileName);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing CSV: ${fullPath}`);
  }

  const buffer = fs.readFileSync(fullPath);
  const text = decodeBuffer(buffer);
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    delimitersToGuess: [",", "\t", ";", "|"]
  });
  return analyzeParsedCsv(parsed, fileName, colors[index % colors.length]);
}

function decodeBuffer(buffer) {
  for (const encoding of ["utf-8", "shift_jis"]) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(buffer);
    } catch {
      // Try next decoder.
    }
  }
  return new TextDecoder("utf-8").decode(buffer);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const { dir, files, includeTests } = parseArgs(process.argv.slice(2));
const datasets = files.map((fileName, index) => parseFile(dir, fileName, index));
const selectedY = pickInitialYColumns(datasets);

function summarizeGroups(dataset) {
  const candidates = getGroupColumnCandidates(dataset);
  const condition = candidates.find((candidate) => candidate.name.toLowerCase() === "condition");
  const preferred = condition ?? candidates[0];
  const groups = preferred
    ? splitRowsByGroup(dataset.rows, preferred.name, {})
    : [];

  return {
    candidates: candidates.slice(0, 8).map((candidate) => ({
      name: candidate.name,
      uniqueCount: candidate.uniqueCount,
      filledCount: candidate.filledCount,
      missingCount: candidate.missingCount
    })),
    preferredColumn: preferred?.name ?? "",
    groupCount: groups.length,
    groups: groups.map((group) => ({ value: group.value, rows: group.rows.length }))
  };
}

const groupReports = datasets.map((dataset) => ({
  file: dataset.name,
  ...summarizeGroups(dataset)
}));

const timeSeries = datasets.map((dataset) => {
  const xType = inferXType(dataset.rows, dataset.xColumn);
  const xSummary = summarizeXValues(dataset, dataset.xColumn, xType);
  const yColumns = selectedY.filter((column) => dataset.numericColumns.includes(column));
  const groupReport = groupReports.find((item) => item.file === dataset.name);
  const groupedRows = groupReport?.preferredColumn
    ? splitRowsByGroup(dataset.rows, groupReport.preferredColumn, {})
    : [{ value: "", rows: dataset.rows }];
  return {
    file: dataset.name,
    xColumn: dataset.xColumn,
    xType,
    xUniqueCount: xSummary.uniqueCount,
    xDuplicateRows: xSummary.duplicateRowCount,
    preferredGroupColumn: groupReport?.preferredColumn ?? "",
    groupTraceCount: groupedRows.reduce((sum, group) => sum + yColumns.filter((column) => makeSeriesPointsFromRows(group.rows, dataset.xColumn, column, xType, 2500).length > 0).length, 0),
    yColumns,
    pointCounts: Object.fromEntries(
      yColumns.map((column) => [column, makeSeriesPoints(dataset, dataset.xColumn, column, xType, 2500).length])
    )
  };
});

const enPlane = datasets.map((dataset) => ({
  file: dataset.name,
  eColumn: dataset.eColumn,
  nColumn: dataset.nColumn,
  points: dataset.eColumn && dataset.nColumn ? makeEnuPoints(dataset, dataset.eColumn, dataset.nColumn, 2500).length : 0,
  groupedPoints:
    dataset.eColumn && dataset.nColumn
      ? splitRowsByGroup(
          dataset.rows,
          groupReports.find((item) => item.file === dataset.name)?.preferredColumn ?? "",
          {}
        ).map((group) => ({
          group: group.value,
          points: makeEnuPointsFromRows(group.rows, dataset.eColumn, dataset.nColumn, 2500).length
        }))
      : []
}));

assert(datasets.length >= 2, "Expected at least two CSV files.");
assert(datasets.every((dataset) => dataset.rowCount > 0), "Every CSV must have rows.");
assert(datasets.some((dataset) => dataset.xColumn === "epoch"), "At least one CSV should detect epoch as X.");
assert(timeSeries.some((item) => item.yColumns.includes("KF_E_m")), "KF_E_m should be graphable.");
assert(enPlane.some((item) => item.eColumn && item.nColumn && item.points > 0), "E-N trajectory should be graphable.");

const comparisonDataset = datasets.find((dataset) => dataset.name === "20260525_1Comparison_timeseries.csv");
if (comparisonDataset) {
  const comparisonGroupReport = groupReports.find((item) => item.file === comparisonDataset.name);
  assert(
    comparisonGroupReport.candidates.some((candidate) => candidate.name === "condition"),
    "Comparison_timeseries should detect condition as a Group / Split candidate."
  );
  assert(
    comparisonGroupReport.groupCount >= 2,
    "Comparison_timeseries should split into multiple condition groups."
  );

  const rowFiltered = applyRowFilter(comparisonDataset.rows, { start: 1, end: 880 });
  assert(rowFiltered.length === Math.min(880, comparisonDataset.rowCount), "Row filter should keep the requested data row range.");
  const groupedFiltered = splitRowsByGroup(
    rowFiltered,
    "condition",
    {}
  );
  assert(groupedFiltered.length >= 2, "Group split should still work after row filtering.");
  assert(
    groupedFiltered.some((group) => makeSeriesPointsFromRows(group.rows, comparisonDataset.xColumn, "KF_E_m", inferXType(group.rows, comparisonDataset.xColumn), 2500).length > 0),
    "Grouped, row-filtered KF_E_m time series should be graphable."
  );
  assert(
    groupedFiltered.some((group) => makeEnuPointsFromRows(group.rows, "KF_E_m", "KF_N_m", 2500).length > 0),
    "Grouped E-N trajectory should be graphable from comparison data."
  );
}

let testSamples = [];
if (includeTests) {
  const testDir = path.resolve("public", "test-samples");
  if (fs.existsSync(testDir)) {
    const testFiles = fs.readdirSync(testDir).filter((file) => file.toLowerCase().endsWith(".csv")).sort();
    testSamples = testFiles.map((fileName, index) => {
      const dataset = parseFile(testDir, fileName, index);
      return {
        file: dataset.name,
        rows: dataset.rowCount,
        columns: dataset.columnCount,
        numericColumnCount: dataset.numericColumns.length,
        nonNumericColumnCount: dataset.nonNumericColumns.length,
        missingValueCount: dataset.missingValueCount,
        invalidNumericCount: dataset.invalidNumericCount,
        xColumn: dataset.xColumn,
        eColumn: dataset.eColumn,
        nColumn: dataset.nColumn,
        uColumn: dataset.uColumn
      };
    });
    assert(testSamples.some((sample) => sample.file === "missing-values.csv" && sample.missingValueCount > 0), "Missing-value sample should report missing values.");
    assert(testSamples.some((sample) => sample.file === "non-numeric-mixed.csv" && sample.invalidNumericCount > 0), "Mixed-value sample should report invalid numeric values.");
    assert(testSamples.some((sample) => sample.file === "large-sample.csv" && sample.rows === 6000), "Large sample should parse 6000 rows.");
  }
}

console.log(
  JSON.stringify(
    {
      sourceDir: dir,
      files: datasets.map((dataset) => ({
        file: dataset.name,
        rows: dataset.rowCount,
        columns: dataset.columnCount,
        numericColumnCount: dataset.numericColumns.length,
        nonNumericColumnCount: dataset.nonNumericColumns.length,
        missingValueCount: dataset.missingValueCount,
        xCandidates: dataset.xCandidates.slice(0, 8),
        eColumn: dataset.eColumn,
        nColumn: dataset.nColumn,
        uColumn: dataset.uColumn
      })),
      selectedY,
      groupReports,
      timeSeries,
      enPlane,
      testSamples,
      status: "ok"
    },
    null,
    2
  )
);
