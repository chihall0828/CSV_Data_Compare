import { useState } from "react";
import { applyRowFilter } from "./dataUtils.js";
import { extractNumericPairs, extractNumericValues, formatStatValue } from "./statisticsUtils.js";
import {
  runOneSampleT,
  runIndependentT,
  runWelchT,
  runPairedT,
  runFTest,
  runCorrelationTest
} from "./hypothesisUtils.js";

const TEST_TYPES = [
  { value: "one_sample_t", label: "One-sample t-test", twoSample: false },
  { value: "independent_t", label: "Independent t-test", twoSample: true },
  { value: "welch_t", label: "Welch's t-test", twoSample: true },
  { value: "paired_t", label: "Paired t-test", twoSample: true },
  { value: "f_test", label: "F-test (variance ratio)", twoSample: true },
  { value: "correlation", label: "Correlation significance test", twoSample: true }
];

const ALTERNATIVES = [
  { value: "two-sided", label: "Two-sided (≠)" },
  { value: "greater", label: "Greater (A > B / μ > μ₀)" },
  { value: "less", label: "Less (A < B / μ < μ₀)" }
];

const ALPHA_PRESETS = ["0.10", "0.05", "0.01"];

function getUniqueGroupValues(rows, col) {
  if (!col) return [];
  const seen = new Set();
  for (const row of rows) {
    const v = row[col];
    if (v !== null && v !== undefined && v !== "") seen.add(String(v));
  }
  return [...seen].sort();
}

function SampleSelector({ label, datasets, datasetId, column, groupCol, groupVal, onDatasetChange, onColumnChange, onGroupColChange, onGroupValChange }) {
  const ds = datasets.find(d => d.id === datasetId) ?? datasets[0] ?? null;
  const numericCols = ds ? ds.numericColumns : [];
  const nonNumericCols = ds ? (ds.nonNumericColumns ?? []) : [];
  const filteredRows = ds ? applyRowFilter(ds.rows, ds.rowFilter) : [];
  const groupValues = getUniqueGroupValues(filteredRows, groupCol);

  return (
    <fieldset className="hyp-sample-fieldset">
      <legend>{label}</legend>
      <label className="field">
        <span>Dataset</span>
        <select value={ds ? ds.id : ""} onChange={e => onDatasetChange(e.target.value)}>
          {datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Column</span>
        <select value={column || numericCols[0] || ""} onChange={e => onColumnChange(e.target.value)}>
          {numericCols.length === 0 && <option value="">— no numeric columns —</option>}
          {numericCols.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Group column <em>(optional)</em></span>
        <select value={groupCol} onChange={e => { onGroupColChange(e.target.value); onGroupValChange(""); }}>
          <option value="">— none —</option>
          {nonNumericCols.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      {groupCol && (
        <label className="field">
          <span>Group value</span>
          <select value={groupVal} onChange={e => onGroupValChange(e.target.value)}>
            <option value="">— all groups —</option>
            {groupValues.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
      )}
    </fieldset>
  );
}

function HypResultRow({ label, value, formatted }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="stat-value">{formatted ?? formatStatValue(value)}</td>
    </tr>
  );
}

export default function HypothesisTestSection({ datasets }) {
  const [testType, setTestType] = useState("welch_t");
  const [aDatasetId, setADatasetId] = useState("");
  const [aColumn, setAColumn] = useState("");
  const [aGroupCol, setAGroupCol] = useState("");
  const [aGroupVal, setAGroupVal] = useState("");
  const [bDatasetId, setBDatasetId] = useState("");
  const [bColumn, setBColumn] = useState("");
  const [bGroupCol, setBGroupCol] = useState("");
  const [bGroupVal, setBGroupVal] = useState("");
  const [mu0, setMu0] = useState("0");
  const [alternative, setAlternative] = useState("two-sided");
  const [alphaPreset, setAlphaPreset] = useState("0.05");
  const [alphaCustom, setAlphaCustom] = useState("0.05");
  const [result, setResult] = useState(null);
  const [runError, setRunError] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  if (!datasets || datasets.length === 0) return null;

  const testDef = TEST_TYPES.find(t => t.value === testType);
  const isTwoSample = testDef?.twoSample ?? true;
  const isOneSample = testType === "one_sample_t";
  const alpha = alphaPreset === "custom"
    ? Math.max(0.0001, Math.min(0.9999, parseFloat(alphaCustom) || 0.05))
    : parseFloat(alphaPreset);

  function getSampleSelection(datasetId, column, groupCol, groupVal) {
    const ds = (datasetId ? datasets.find(d => d.id === datasetId) : null) ?? datasets[0];
    if (!ds) throw new Error("Dataset not found.");
    let rows = applyRowFilter(ds.rows, ds.rowFilter);
    if (groupCol && groupVal) {
      rows = rows.filter(row => String(row[groupCol]) === groupVal);
    }
    const col = column || ds.numericColumns[0] || "";
    if (!col) throw new Error("No numeric column available.");
    return { ds, rows, col };
  }

  function getValues(datasetId, column, groupCol, groupVal) {
    const { rows, col } = getSampleSelection(datasetId, column, groupCol, groupVal);
    const { values } = extractNumericValues(rows, col);
    return values;
  }

  function getPairedValues() {
    const a = getSampleSelection(aDatasetId, aColumn, aGroupCol, aGroupVal);
    const b = getSampleSelection(bDatasetId, bColumn, bGroupCol, bGroupVal);
    if (a.ds.id !== b.ds.id) {
      throw new Error("Paired tests and correlation require Sample A and Sample B from the same dataset.");
    }
    const sameRows =
      a.rows.length === b.rows.length && a.rows.every((row, index) => row === b.rows[index]);
    if (!sameRows) {
      throw new Error("Paired tests and correlation require the same filtered rows for Sample A and Sample B.");
    }
    const { pairs } = extractNumericPairs(a.rows, a.col, b.col);
    return {
      aVals: pairs.map(([aValue]) => aValue),
      bVals: pairs.map(([, bValue]) => bValue)
    };
  }

  function handleRun() {
    setRunError("");
    setResult(null);
    try {
      const aVals = getValues(aDatasetId, aColumn, aGroupCol, aGroupVal);
      let res;
      if (isOneSample) {
        const mu = parseFloat(mu0);
        if (!Number.isFinite(mu)) throw new Error("μ₀ must be a number.");
        res = runOneSampleT(aVals, mu, alternative, alpha);
      } else {
        const paired = testType === "paired_t" || testType === "correlation"
          ? getPairedValues()
          : null;
        const bVals = paired?.bVals ?? getValues(bDatasetId, bColumn, bGroupCol, bGroupVal);
        const effectiveAVals = paired?.aVals ?? aVals;
        if (testType === "independent_t") res = runIndependentT(aVals, bVals, alternative, alpha);
        else if (testType === "welch_t") res = runWelchT(aVals, bVals, alternative, alpha);
        else if (testType === "paired_t") res = runPairedT(effectiveAVals, bVals, alternative, alpha);
        else if (testType === "f_test") res = runFTest(aVals, bVals, alternative, alpha);
        else if (testType === "correlation") res = runCorrelationTest(effectiveAVals, bVals, alternative, alpha);
      }
      if (res?.error) { setRunError(res.error); return; }
      setResult(res);
    } catch (err) {
      setRunError(String(err?.message ?? err));
    }
  }

  function handleTestTypeChange(val) {
    setTestType(val);
    setResult(null);
    setRunError("");
  }

  const pFormatted = result
    ? (result.pValue < 0.0001 ? result.pValue.toExponential(3) : result.pValue.toFixed(6))
    : null;

  return (
    <div className="hyp-section">
      <button
        type="button"
        className="hyp-toggle"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <span className="hyp-toggle-title">Hypothesis Test</span>
        <span className="stats-toggle-arrow">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <div className="hyp-body">
          <div className="stats-form">
            <label className="field">
              <span>Test type</span>
              <select value={testType} onChange={e => handleTestTypeChange(e.target.value)}>
                {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>

            <SampleSelector
              label="Sample A"
              datasets={datasets}
              datasetId={aDatasetId || datasets[0]?.id}
              column={aColumn}
              groupCol={aGroupCol}
              groupVal={aGroupVal}
              onDatasetChange={id => { setADatasetId(id); setAColumn(""); setAGroupCol(""); setAGroupVal(""); setResult(null); }}
              onColumnChange={c => { setAColumn(c); setResult(null); }}
              onGroupColChange={setAGroupCol}
              onGroupValChange={setAGroupVal}
            />

            {isOneSample ? (
              <label className="field">
                <span>μ₀ (null hypothesis mean)</span>
                <input
                  type="number"
                  className="stat-n-input"
                  value={mu0}
                  onChange={e => { setMu0(e.target.value); setResult(null); }}
                />
              </label>
            ) : (
              <SampleSelector
                label="Sample B"
                datasets={datasets}
                datasetId={bDatasetId || datasets[0]?.id}
                column={bColumn}
                groupCol={bGroupCol}
                groupVal={bGroupVal}
                onDatasetChange={id => { setBDatasetId(id); setBColumn(""); setBGroupCol(""); setBGroupVal(""); setResult(null); }}
                onColumnChange={c => { setBColumn(c); setResult(null); }}
                onGroupColChange={setBGroupCol}
                onGroupValChange={setBGroupVal}
              />
            )}

            <label className="field">
              <span>Alternative hypothesis</span>
              <select value={alternative} onChange={e => { setAlternative(e.target.value); setResult(null); }}>
                {ALTERNATIVES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>

            <label className="field">
              <span>Alpha (α)</span>
              <select value={alphaPreset} onChange={e => { setAlphaPreset(e.target.value); setResult(null); }}>
                {ALPHA_PRESETS.map(a => <option key={a} value={a}>{a}</option>)}
                <option value="custom">Custom</option>
              </select>
            </label>

            {alphaPreset === "custom" && (
              <label className="field">
                <span>Custom α</span>
                <input
                  type="number"
                  min="0.0001"
                  max="0.9999"
                  step="0.01"
                  className="stat-n-input"
                  value={alphaCustom}
                  onChange={e => { setAlphaCustom(e.target.value); setResult(null); }}
                />
              </label>
            )}

            <button type="button" className="primary-button" onClick={handleRun}>
              Run test
            </button>
          </div>

          {runError && <p className="stat-error">{runError}</p>}

          {result && (
            <div className="stat-result hyp-result">
              <div className="stat-meta">
                <span className="stat-meta-name">{result.testName}</span>
                <span className={result.significant ? "hyp-significant" : "hyp-not-significant"}>
                  {result.significant ? "Significant" : "Not significant"} (α = {alpha})
                </span>
              </div>
              <table className="stat-table">
                <tbody>
                  <HypResultRow label="Sample A n" value={result.nA} formatted={result.nA != null ? result.nA.toLocaleString() : "—"} />
                  {result.nB != null && (
                    <HypResultRow label="Sample B n" value={result.nB} formatted={result.nB.toLocaleString()} />
                  )}
                  <HypResultRow label="Sample A mean" value={result.meanA} />
                  <HypResultRow label={isOneSample ? "μ₀" : "Sample B mean"} value={result.meanB} />
                  {result.varianceA != null && <HypResultRow label="Sample A variance" value={result.varianceA} />}
                  {result.varianceB != null && <HypResultRow label="Sample B variance" value={result.varianceB} />}
                  <HypResultRow
                    label={testType === "correlation" ? "Statistic (r)" : "Statistic (t or F)"}
                    value={result.statistic}
                  />
                  <HypResultRow
                    label="Degrees of freedom"
                    value={null}
                    formatted={typeof result.df === "number" ? result.df.toFixed(2) : String(result.df)}
                  />
                  <HypResultRow label="p-value" value={null} formatted={pFormatted} />
                  <HypResultRow label="Alpha (α)" value={null} formatted={String(alpha)} />
                  {result.meanDiff != null && <HypResultRow label="Mean difference (A − B)" value={result.meanDiff} />}
                  {result.effectSize != null && (
                    <HypResultRow
                      label={testType === "correlation" ? "Effect size (r²)" : "Effect size (Cohen's d)"}
                      value={result.effectSize}
                    />
                  )}
                </tbody>
              </table>
              <ul className="hyp-cautions">
                {result.cautions.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
