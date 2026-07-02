import { useRef, useState } from "react";
import { cleanHeader } from "./dataUtils.js";
import { compileFormula, evaluateCompiledFormula, formulaHelpText } from "./formulaUtils.js";
import { HelpButton, HelpDialog } from "./HelpDialog.jsx";
import { FormulaHelpContent } from "./statisticsHelpContent.jsx";

const OPERATOR_SNIPPETS = ["+", "-", "*", "/", "^", "(", ")"];

const FUNCTION_NAMES = ["sqrt", "abs", "pow", "min", "max", "sin", "cos", "tan", "log", "exp"];

const PREVIEW_ROW_COUNT = 5;
const MAX_COLUMN_BUTTONS = 80;

function buildExamples(numericColumns) {
  const a = numericColumns[0];
  const b = numericColumns[1] ?? numericColumns[0];
  if (!a) return [];
  return [
    { label: "2列の差", formula: `[${a}] - [${b}]` },
    { label: "水平距離", formula: `sqrt([${a}]^2 + [${b}]^2)` },
    { label: "絶対値", formula: `abs([${a}])` },
    { label: "2列の平均", formula: `([${a}] + [${b}]) / 2` },
    { label: "単位変換 (×1000)", formula: `[${a}] * 1000` }
  ];
}

function buildPreview(dataset, trimmedFormula) {
  if (!trimmedFormula) return null;
  try {
    const compiled = compileFormula(trimmedFormula, dataset.columns);
    const rows = dataset.rows.slice(0, PREVIEW_ROW_COUNT).map((row, index) => {
      const value = evaluateCompiledFormula(compiled, row);
      return {
        rowNumber: index + 1,
        value: Number.isFinite(value) ? Number(value.toPrecision(8)) : null
      };
    });
    return { ok: true, referencedColumns: compiled.referencedColumns, rows };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

export default function CalculatedColumnsEditor({ dataset, onDraftChange, onAdd, onExport, onRemove }) {
  const formula = dataset.calculationFormula ?? "";
  const trimmedFormula = cleanHeader(formula);
  const preview = buildPreview(dataset, trimmedFormula);
  const examples = buildExamples(dataset.numericColumns);
  const textareaRef = useRef(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpDialogId = `formula-help-${dataset.id}`;

  // Insert at the textarea cursor (replacing any selection); cursorOffset
  // positions the caret within the snippet, e.g. inside "sqrt()".
  function insertSnippet(snippet, cursorOffset = snippet.length) {
    const current = dataset.calculationFormula ?? "";
    const textarea = textareaRef.current;
    const start = textarea ? textarea.selectionStart : current.length;
    const end = textarea ? textarea.selectionEnd : current.length;
    const next = current.slice(0, start) + snippet + current.slice(end);
    onDraftChange({ calculationFormula: next });
    const caret = start + cursorOffset;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <details className="calculated-columns">
      <summary>Calculated columns</summary>

      <div className="calc-block">
        <div className="calc-block-title">1. New column</div>
        <label className="calc-name-field">
          New column name
          <input
            type="text"
            value={dataset.calculationName ?? ""}
            onChange={(event) => onDraftChange({ calculationName: event.target.value })}
            placeholder="E_error_m"
          />
        </label>
      </div>

      <div className="calc-block">
        <div className="calc-block-title calc-block-title-row">
          2. Formula builder
          <HelpButton
            open={helpOpen}
            onToggle={() => setHelpOpen((v) => !v)}
            dialogId={helpDialogId}
            label="Formulaの書き方ヘルプを開く"
          />
        </div>
        <HelpDialog
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          dialogId={helpDialogId}
          title="Formulaの書き方"
        >
          <FormulaHelpContent />
        </HelpDialog>
        <label className="formula-field">
          Formula
          <textarea
            ref={textareaRef}
            value={formula}
            onChange={(event) => onDraftChange({ calculationFormula: event.target.value })}
            placeholder="sqrt(([KF_E_m] - [Relative_E_m])^2 + ([KF_N_m] - [Relative_N_m])^2)"
          />
        </label>
        <p className="field-note">
          列名は [Column name] のように角括弧で囲んで使います。例: sqrt([E_m]^2 + [N_m]^2)
        </p>
        <p className="field-note">{formulaHelpText()}</p>
        <div className="calc-toolbar">
          <span className="calc-toolbar-label">Insert column</span>
          <div className="column-insert-list" aria-label="Insert column reference">
            {dataset.columns.slice(0, MAX_COLUMN_BUTTONS).map((column) => (
              <button type="button" key={column} onClick={() => insertSnippet(`[${column}]`)}>
                [{column}]
              </button>
            ))}
          </div>
        </div>
        <div className="calc-toolbar">
          <span className="calc-toolbar-label">Operators</span>
          <div className="column-insert-list calc-operator-list" aria-label="Insert operator">
            {OPERATOR_SNIPPETS.map((operator) => (
              <button type="button" key={operator} onClick={() => insertSnippet(operator)}>
                {operator}
              </button>
            ))}
          </div>
        </div>
        <div className="calc-toolbar">
          <span className="calc-toolbar-label">Functions</span>
          <div className="column-insert-list calc-operator-list" aria-label="Insert function">
            {FUNCTION_NAMES.map((name) => (
              <button
                type="button"
                key={name}
                onClick={() => insertSnippet(`${name}()`, name.length + 1)}
              >
                {name}()
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="calc-block">
        <div className="calc-block-title">3. Preview / Validation</div>
        {!preview && (
          <p className="field-note">Formulaを入力すると、ここに式の確認と先頭行の計算例が表示されます。</p>
        )}
        {preview && !preview.ok && <p className="calc-preview-error">式を確認してください: {preview.message}</p>}
        {preview?.ok && (
          <>
            <p className="calc-preview-ok">
              式は計算可能です。参照列: {preview.referencedColumns.map((column) => `[${column}]`).join(", ") || "なし"}
            </p>
            <table className="calc-preview-table">
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td className="stat-value">{row.value === null ? "—（計算不可）" : row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {examples.length > 0 && (
        <div className="calc-block">
          <div className="calc-block-title">4. Examples</div>
          <p className="field-note">
            クリックするとFormula欄に式がセットされます。Examplesは現在のデータセットの数値列を使って作られます。
            意図と違う列名が入った場合は、Insert columnの列ボタンで置き換えてください。
          </p>
          <div className="calc-examples">
            {examples.map((example) => (
              <button
                type="button"
                key={example.label}
                onClick={() => onDraftChange({ calculationFormula: example.formula })}
              >
                <strong>{example.label}</strong>
                <code>{example.formula}</code>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="calculation-actions">
        <button
          type="button"
          onClick={onAdd}
          disabled={!cleanHeader(dataset.calculationName) || !trimmedFormula || preview?.ok !== true}
        >
          Add calculated column
        </button>
        <button type="button" onClick={onExport}>
          Export processed CSV
        </button>
      </div>

      {(dataset.calculatedColumns ?? []).length > 0 && (
        <div className="calculated-list">
          {(dataset.calculatedColumns ?? []).map((column) => (
            <div key={column.name}>
              <strong>{column.name}</strong>
              <span>{column.formula}</span>
              <small>{column.validCount.toLocaleString()} ok / {column.invalidCount.toLocaleString()} skipped</small>
              <button type="button" onClick={() => onRemove(column.name)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
