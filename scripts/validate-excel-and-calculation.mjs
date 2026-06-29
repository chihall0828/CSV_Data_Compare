import fs from "node:fs";
import path from "node:path";
import { analyzeParsedCsv } from "../src/dataUtils.js";
import { compileFormula, evaluateCompiledFormula } from "../src/formulaUtils.js";
import { parseXlsxWorkbook } from "../src/xlsxUtils.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function nearlyEqual(actual, expected, tolerance = 1e-9) {
  return Math.abs(actual - expected) <= tolerance;
}

async function readWorkbook(filePath) {
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return parseXlsxWorkbook(arrayBuffer, { headerRow: 1 });
}

function applyFormula(rows, columns, formula) {
  const compiled = compileFormula(formula, columns);
  const values = rows.map((row) => evaluateCompiledFormula(compiled, row));
  return {
    referencedColumns: compiled.referencedColumns,
    values,
    validCount: values.filter(Number.isFinite).length,
    invalidCount: values.filter((value) => !Number.isFinite(value)).length
  };
}

const sampleDir = path.resolve("public", "test-samples");
const sampleExcelPath = path.join(sampleDir, "sample-excel.xlsx");
const calculationExcelPath = path.join(sampleDir, "column-calculation.xlsx");

assert(fs.existsSync(sampleExcelPath), "sample-excel.xlsx should exist.");
assert(fs.existsSync(calculationExcelPath), "column-calculation.xlsx should exist.");

const workbook = await readWorkbook(sampleExcelPath);
assert(workbook.sheets.length >= 2, "sample-excel.xlsx should contain multiple sheets.");
assert(workbook.sheets.some((sheet) => sheet.name === "Experiment_1"), "Experiment_1 sheet should be detected.");
assert(workbook.sheets.some((sheet) => sheet.name === "Result"), "Result sheet should be detected.");

const experiment = workbook.sheets.find((sheet) => sheet.name === "Experiment_1");
const result = workbook.sheets.find((sheet) => sheet.name === "Result");
const experimentDataset = analyzeParsedCsv(experiment.parsed, "sample-excel.xlsx / Experiment_1", "#2563eb");
const resultDataset = analyzeParsedCsv(result.parsed, "sample-excel.xlsx / Result", "#dc2626");

assert(experimentDataset.numericColumns.includes("KF_E_m"), "KF_E_m should be numeric in Excel sample.");
assert(experimentDataset.numericColumns.includes("Relative_N_m"), "Relative_N_m should be numeric in Excel sample.");
assert(resultDataset.xCandidates.includes("time"), "time should be an X candidate after sheet switching.");
assert(resultDataset.numericColumns.includes("E_m"), "E_m should be numeric on Result sheet.");

const calculationWorkbook = await readWorkbook(calculationExcelPath);
const calculationSheet = calculationWorkbook.sheets.find((sheet) => sheet.name === "Calculation") ?? calculationWorkbook.sheets[0];
const calculationDataset = analyzeParsedCsv(calculationSheet.parsed, "column-calculation.xlsx / Calculation", "#059669");

const eDiff = applyFormula(
  calculationDataset.rows,
  calculationDataset.columns,
  "[KF_E_m] - [Relative_E_m]"
);
assert(eDiff.referencedColumns.includes("KF_E_m"), "Formula should reference KF_E_m.");
assert(eDiff.referencedColumns.includes("Relative_E_m"), "Formula should reference Relative_E_m.");
assert(nearlyEqual(eDiff.values[0], 0.2), "E difference row 1 should be 0.2.");
assert(eDiff.invalidCount === 1, "E difference should skip one non-numeric row.");

const horizontal = applyFormula(
  calculationDataset.rows,
  calculationDataset.columns,
  "sqrt(([KF_E_m] - [Relative_E_m])^2 + ([KF_N_m] - [Relative_N_m])^2)"
);
assert(nearlyEqual(horizontal.values[0], Math.sqrt(0.2 ** 2 + 0.1 ** 2)), "Horizontal error row 1 should match expected value.");
assert(horizontal.invalidCount === 1, "Horizontal error should skip one non-numeric row.");

const threeD = applyFormula(
  calculationDataset.rows,
  calculationDataset.columns,
  "sqrt(([KF_E_m] - [Relative_E_m])^2 + ([KF_N_m] - [Relative_N_m])^2 + ([KF_U_m] - [Relative_U_m])^2)"
);
assert(threeD.invalidCount === 2, "3D error should skip non-numeric and missing rows.");

const divisionByZero = applyFormula(calculationDataset.rows, calculationDataset.columns, "[KF_E_m] / 0");
assert(divisionByZero.invalidCount === calculationDataset.rowCount, "Division by zero should produce invalid results.");

console.log(
  JSON.stringify(
    {
      excel: {
        sampleExcel: path.relative(process.cwd(), sampleExcelPath),
        sheets: workbook.sheets.map((sheet) => ({
          name: sheet.name,
          columns: sheet.parsed.meta.fields,
          rows: sheet.parsed.data.length
        }))
      },
      calculation: {
        sample: path.relative(process.cwd(), calculationExcelPath),
        rows: calculationDataset.rowCount,
        formulas: {
          eDiff: {
            validCount: eDiff.validCount,
            invalidCount: eDiff.invalidCount,
            firstValue: eDiff.values[0]
          },
          horizontal: {
            validCount: horizontal.validCount,
            invalidCount: horizontal.invalidCount,
            firstValue: horizontal.values[0]
          },
          threeD: {
            validCount: threeD.validCount,
            invalidCount: threeD.invalidCount
          },
          divisionByZero: {
            validCount: divisionByZero.validCount,
            invalidCount: divisionByZero.invalidCount
          }
        }
      },
      status: "ok"
    },
    null,
    2
  )
);
