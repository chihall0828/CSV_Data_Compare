import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { applyRowFilter } from "./dataUtils.js";
import {
  extractNumericValues,
  extractNumericPairs,
  computeUnivariate,
  computeBivariate,
  applySampleMode,
  formatStatValue
} from "./statisticsUtils.js";
import HypothesisTestSection from "./HypothesisTestSection.jsx";
import { HelpButton, HelpDialog } from "./HelpDialog.jsx";
import { UnivariateHelpContent, BivariateHelpContent } from "./statisticsHelpContent.jsx";
import {
  buildStatisticsExportPayload,
  statisticsPayloadToMarkdown,
  downloadTextFile,
  safeFileSlug,
  dateStamp
} from "./exportUtils.js";

const SAMPLE_MODES = [
  { value: "all", label: "All filtered rows" },
  { value: "first_n", label: "First n rows" },
  { value: "last_n", label: "Last n rows" },
  { value: "random_n", label: "Random n rows" },
  { value: "row_range", label: "Row range" }
];

function StatRow({ label, value, integer }) {
  const formatted = integer
    ? value === null
      ? "—"
      : value.toLocaleString()
    : formatStatValue(value);
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="stat-value">{formatted}</td>
    </tr>
  );
}

export default function StatisticsPanel({ datasets }) {
  const [datasetId, setDatasetId] = useState("");
  const [column, setColumn] = useState("");
  const [columnA, setColumnA] = useState("");
  const [columnB, setColumnB] = useState("");
  const [sampleMode, setSampleMode] = useState("all");
  const [sampleN, setSampleN] = useState("100");
  const [sampleSeed, setSampleSeed] = useState("42");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [result, setResult] = useState(null);
  const [computeError, setComputeError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [openHelp, setOpenHelp] = useState(null);

  const activeDataset =
    (datasetId ? datasets.find((d) => d.id === datasetId) : null) ?? datasets[0] ?? null;

  function handleDatasetChange(id) {
    setDatasetId(id);
    setColumn("");
    setColumnA("");
    setColumnB("");
    setResult(null);
    setComputeError("");
  }

  function handleColumnChange(col) {
    setColumn(col);
    setResult(null);
    setComputeError("");
  }

  function handleColumnAChange(col) {
    setColumnA(col);
    setResult(null);
    setComputeError("");
  }

  function handleColumnBChange(col) {
    setColumnB(col);
    setResult(null);
    setComputeError("");
  }

  function handleModeChange(mode) {
    setSampleMode(mode);
    setResult(null);
    setComputeError("");
  }

  function handleCompute() {
    if (!activeDataset) {
      setComputeError("No dataset loaded.");
      setResult(null);
      return;
    }

    const col = column || activeDataset.numericColumns[0] || "";
    const bivariateColumnA = columnA || activeDataset.numericColumns[0] || "";
    const bivariateColumnB =
      columnB || activeDataset.numericColumns[1] || activeDataset.numericColumns[0] || "";
    if (!col) {
      setComputeError("No numeric column available in this dataset.");
      setResult(null);
      return;
    }

    try {
      const filteredRows = applyRowFilter(activeDataset.rows, activeDataset.rowFilter);
      const filteredN = filteredRows.length;

      const n = Math.max(1, Math.floor(Number(sampleN) || 100));
      const seed = Math.floor(Number(sampleSeed) || 42);
      const start = Math.floor(Number(rangeStart) || 1);
      const end = Math.floor(Number(rangeEnd) || filteredN);

      const sampledRows = applySampleMode(filteredRows, sampleMode, { n, seed, start, end });
      const { values, missingCount } = extractNumericValues(sampledRows, col);
      const stats = computeUnivariate(values);
      const { pairs, excludedCount } = extractNumericPairs(
        sampledRows,
        bivariateColumnA,
        bivariateColumnB
      );
      const bivariateStats = computeBivariate(pairs);

      setResult({
        datasetName: activeDataset.name,
        column: col,
        filteredN,
        sampledN: sampledRows.length,
        missingCount,
        sampleMode,
        sampleParams: { n, seed, start, end },
        bivariate: {
          columnA: bivariateColumnA,
          columnB: bivariateColumnB,
          excludedCount,
          ...bivariateStats
        },
        ...stats
      });
      setComputeError("");
    } catch (err) {
      setComputeError(String(err?.message ?? err));
      setResult(null);
    }
  }

  function exportStatisticsJson() {
    if (!result) return;
    const payload = buildStatisticsExportPayload(result);
    downloadTextFile(
      `statistics-result-${safeFileSlug(result.datasetName)}-${dateStamp()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json"
    );
  }

  function exportStatisticsMarkdown() {
    if (!result) return;
    const payload = buildStatisticsExportPayload(result);
    downloadTextFile(
      `statistics-result-${safeFileSlug(result.datasetName)}-${dateStamp()}.md`,
      statisticsPayloadToMarkdown(payload),
      "text/markdown"
    );
  }

  const colOptions = activeDataset ? activeDataset.numericColumns : [];
  const showN = sampleMode === "first_n" || sampleMode === "last_n" || sampleMode === "random_n";
  const showSeed = sampleMode === "random_n";
  const showRange = sampleMode === "row_range";

  return (
    <section className="panel statistics-panel">
      <div className="stats-header-row">
        <button
          type="button"
          className="stats-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          <div className="section-heading">
            <h2>Statistics</h2>
            <BarChart3 size={18} />
          </div>
          <span className="stats-toggle-arrow">{collapsed ? "▸" : "▾"}</span>
        </button>
        <HelpButton
          open={openHelp === "univariate"}
          onToggle={() => setOpenHelp(openHelp === "univariate" ? null : "univariate")}
          dialogId="univariate-help-dialog"
          label="統計量の見方ヘルプを開く"
        />
      </div>
      <HelpDialog
        open={openHelp === "univariate"}
        onClose={() => setOpenHelp(null)}
        dialogId="univariate-help-dialog"
        title="統計量の見方"
      >
        <UnivariateHelpContent />
      </HelpDialog>
      <HelpDialog
        open={openHelp === "bivariate"}
        onClose={() => setOpenHelp(null)}
        dialogId="bivariate-help-dialog"
        title="2変数統計（Bivariate statistics）の見方"
      >
        <BivariateHelpContent />
      </HelpDialog>

      {!collapsed && (
        <div className="stats-body">
          {!activeDataset ? (
            <div className="empty-state">CSV/Excelを読み込んでから統計量を計算してください。</div>
          ) : (
            <>
              <div className="stats-form">
                <label className="field">
                  <span>Dataset</span>
                  <select
                    value={activeDataset.id}
                    onChange={(e) => handleDatasetChange(e.target.value)}
                  >
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Column</span>
                  <select
                    value={column || colOptions[0] || ""}
                    onChange={(e) => handleColumnChange(e.target.value)}
                  >
                    {colOptions.length === 0 && (
                      <option value="">— no numeric columns —</option>
                    )}
                    {colOptions.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </label>

                <div className="stats-form-heading">
                  Bivariate statistics
                  <HelpButton
                    open={openHelp === "bivariate"}
                    onToggle={() => setOpenHelp(openHelp === "bivariate" ? null : "bivariate")}
                    dialogId="bivariate-help-dialog"
                    label="2変数統計の見方ヘルプを開く"
                  />
                </div>

                <label className="field">
                  <span>Column A</span>
                  <select
                    value={columnA || colOptions[0] || ""}
                    onChange={(e) => handleColumnAChange(e.target.value)}
                  >
                    {colOptions.length === 0 && (
                      <option value="">no numeric columns</option>
                    )}
                    {colOptions.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Column B</span>
                  <select
                    value={columnB || colOptions[1] || colOptions[0] || ""}
                    onChange={(e) => handleColumnBChange(e.target.value)}
                  >
                    {colOptions.length === 0 && (
                      <option value="">no numeric columns</option>
                    )}
                    {colOptions.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Sample mode</span>
                  <select value={sampleMode} onChange={(e) => handleModeChange(e.target.value)}>
                    {SAMPLE_MODES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>

                {showN && (
                  <label className="field">
                    <span>n</span>
                    <input
                      type="number"
                      min="1"
                      className="stat-n-input"
                      value={sampleN}
                      onChange={(e) => setSampleN(e.target.value)}
                    />
                  </label>
                )}

                {showSeed && (
                  <label className="field">
                    <span>Seed</span>
                    <input
                      type="number"
                      min="0"
                      className="stat-n-input"
                      value={sampleSeed}
                      onChange={(e) => setSampleSeed(e.target.value)}
                    />
                  </label>
                )}

                {showRange && (
                  <>
                    <label className="field">
                      <span>Start row</span>
                      <input
                        type="number"
                        min="1"
                        className="stat-n-input"
                        placeholder="1"
                        value={rangeStart}
                        onChange={(e) => setRangeStart(e.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>End row</span>
                      <input
                        type="number"
                        min="1"
                        className="stat-n-input"
                        placeholder="(last)"
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(e.target.value)}
                      />
                    </label>
                  </>
                )}

                <button type="button" className="primary-button" onClick={handleCompute}>
                  Compute statistics
                </button>
              </div>

              {computeError && <p className="stat-error">{computeError}</p>}

              {result && (
                <div className="stat-result">
                  <div className="stat-meta">
                    <span className="stat-meta-name">{result.datasetName}</span>
                    <span>Column: <strong>{result.column}</strong></span>
                    <span>After row filter: {result.filteredN.toLocaleString()} rows</span>
                    <span>Statistics sample: {result.sampledN.toLocaleString()} rows</span>
                  </div>
                  <table className="stat-table">
                    <tbody>
                      <tr>
                        <th scope="row">Count (n)</th>
                        <td className="stat-value">{result.n.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <th scope="row">Missing</th>
                        <td className="stat-value">{result.missingCount.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <th scope="row">Mean</th>
                        <td className="stat-value">{formatStatValue(result.mean)}</td>
                      </tr>
                      <tr>
                        <th scope="row">Variance (unbiased)</th>
                        <td className="stat-value">
                          {result.n >= 2 ? formatStatValue(result.variance) : "— (n < 2)"}
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">Std dev</th>
                        <td className="stat-value">
                          {result.n >= 2 ? formatStatValue(result.stddev) : "— (n < 2)"}
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">Min</th>
                        <td className="stat-value">{formatStatValue(result.min)}</td>
                      </tr>
                      <tr>
                        <th scope="row">Max</th>
                        <td className="stat-value">{formatStatValue(result.max)}</td>
                      </tr>
                      <tr>
                        <th scope="row">Median</th>
                        <td className="stat-value">{formatStatValue(result.median)}</td>
                      </tr>
                    </tbody>
                  </table>

                  {result.bivariate && (
                    <div className="stat-subsection">
                      <h3>Bivariate statistics</h3>
                      <div className="stat-meta">
                        <span>Column A: <strong>{result.bivariate.columnA}</strong></span>
                        <span>Column B: <strong>{result.bivariate.columnB}</strong></span>
                      </div>
                      <table className="stat-table">
                        <tbody>
                          <tr>
                            <th scope="row">Valid pair count</th>
                            <td className="stat-value">{result.bivariate.n.toLocaleString()}</td>
                          </tr>
                          <tr>
                            <th scope="row">Excluded pairs</th>
                            <td className="stat-value">{result.bivariate.excludedCount.toLocaleString()}</td>
                          </tr>
                          <tr>
                            <th scope="row">Covariance (unbiased)</th>
                            <td className="stat-value">
                              {result.bivariate.n >= 2 ? formatStatValue(result.bivariate.covariance) : "N/A (n < 2)"}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">Pearson correlation</th>
                            <td className="stat-value">
                              {result.bivariate.pearson === null
                                ? result.bivariate.n < 2
                                  ? "N/A (n < 2)"
                                  : "N/A (zero variance)"
                                : formatStatValue(result.bivariate.pearson)}
                            </td>
                          </tr>
                          <tr>
                            <th scope="row">R squared</th>
                            <td className="stat-value">
                              {result.bivariate.rSquared === null
                                ? result.bivariate.n < 2
                                  ? "N/A (n < 2)"
                                  : "N/A (zero variance)"
                                : formatStatValue(result.bivariate.rSquared)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="export-actions">
                    <button type="button" onClick={exportStatisticsJson}>
                      Export statistics JSON
                    </button>
                    <button type="button" onClick={exportStatisticsMarkdown}>
                      Export statistics Markdown
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          <HypothesisTestSection datasets={datasets} />
        </div>
      )}
    </section>
  );
}
