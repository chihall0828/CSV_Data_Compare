import { useState } from "react";
import { HelpButton, HelpDialog } from "./HelpDialog.jsx";
import {
  DEFAULT_OLLAMA_ENDPOINT,
  OLLAMA_MODEL_SUGGESTIONS,
  checkOllamaConnection,
  clampOllamaTimeoutSeconds,
  generateInterpretation,
  isLocalOllamaEndpoint,
  readOllamaSettings,
  writeOllamaSettings
} from "./ollamaUtils.js";
import { buildLlmPayload, downloadTextFile, dateStamp } from "./exportUtils.js";

const ERROR_MESSAGES = {
  invalid_endpoint: "Ollama endpointはlocalhostまたは127.0.0.1のみ指定できます。",
  network_error: "Ollamaに接続できません。インストール・起動状況、OLLAMA_ORIGINSの設定を確認してください。",
  timeout: "接続がタイムアウトしました。Ollamaが起動しているか確認してください。",
  http_error: "Ollamaがエラーを返しました。",
  malformed_response: "Ollamaからの応答が想定した形式ではありませんでした。",
  missing_model: "Model nameを入力してください。",
  unsafe_payload: "送信内容の安全確認に失敗しました。ページを再読み込みしてやり直してください。",
  payload_build_failed: "送信内容の作成に失敗しました。先にStatisticsまたはHypothesis Testを計算し直してください。"
};

function OllamaHelpContent() {
  return (
    <>
      <h4>これは何か</h4>
      <p>
        統計・仮説検定の結果をもとに、ローカルPC上で動く Ollama にAIによる考察の生成を依頼できる機能です。
        研究データやCSVの内容そのものは一切送信せず、要約された統計値・検定結果だけを送ります。
      </p>
      <h4>Ollamaとは</h4>
      <p>
        <a href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a> は、ご自身のPC上でLLMを動かすための無料ツールです。
        事前にインストールし、モデル（例: <code>ollama pull llama3.2</code>）を取得しておく必要があります。
      </p>
      <h4>接続できない場合</h4>
      <ul>
        <li>Ollamaが起動しているか確認してください。</li>
        <li>
          Web版（GitHub Pages）から接続する場合、Ollama起動時に環境変数 <code>OLLAMA_ORIGINS</code> の設定が必要な場合があります。
        </li>
        <li>Portable版（localhost配信）の方が接続しやすい場合があります。</li>
      </ul>
      <h4>安全に関する注意</h4>
      <ul>
        <li>endpointは <code>localhost</code> / <code>127.0.0.1</code> のみ指定できます。外部サーバーへは送信できません。</li>
        <li>送信する内容は、統計・検定結果の要約値（件数・平均・分散・p値など）だけです。CSVの生データ・全行データ・座標値は送信しません。</li>
        <li>設定（endpoint・モデル名・timeout）だけがブラウザに保存されます。CSVデータ・統計結果・AIの生成結果は保存されません。ページを再読み込みすると生成結果は消えます。</li>
        <li>生成された考察はAIによる参考情報です。数値の正しさや解釈はご自身で確認してください。</li>
      </ul>
    </>
  );
}

export default function OllamaSettings({ statisticsPayload = null, hypothesisPayload = null }) {
  const [settings, setSettings] = useState(() => readOllamaSettings());
  const [status, setStatus] = useState({ state: "idle" });
  const [collapsed, setCollapsed] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [endpointError, setEndpointError] = useState("");
  const [generation, setGeneration] = useState({ state: "idle" });
  const [copyStatus, setCopyStatus] = useState("");

  const availableResults = [statisticsPayload, hypothesisPayload].filter(Boolean);
  let previewPayload = null;
  let previewError = "";
  if (availableResults.length > 0) {
    try {
      previewPayload = buildLlmPayload(availableResults);
    } catch (err) {
      previewError = String(err?.message ?? err);
    }
  }

  function persist(next) {
    const saved = writeOllamaSettings(next);
    setSettings(saved);
    return saved;
  }

  function handleToggle() {
    persist({ ...settings, enabled: !settings.enabled });
    setStatus({ state: "idle" });
    setGeneration({ state: "idle" });
  }

  function handleEndpointChange(value) {
    setSettings((current) => ({ ...current, endpoint: value }));
    setEndpointError(isLocalOllamaEndpoint(value) || value === "" ? "" : "localhostまたは127.0.0.1のURLのみ指定できます。");
    setStatus({ state: "idle" });
  }

  function handleEndpointBlur() {
    if (isLocalOllamaEndpoint(settings.endpoint)) {
      persist(settings);
      setEndpointError("");
    } else {
      setEndpointError("localhostまたは127.0.0.1のURLのみ指定できます。変更は保存されません。");
    }
  }

  function handleModelChange(value) {
    const next = { ...settings, model: value };
    setSettings(next);
    persist(next);
  }

  function handleTimeoutChange(value) {
    const next = { ...settings, timeoutSeconds: clampOllamaTimeoutSeconds(value) };
    setSettings(next);
    persist(next);
  }

  async function handleCheckConnection() {
    if (!isLocalOllamaEndpoint(settings.endpoint)) {
      setEndpointError("localhostまたは127.0.0.1のURLのみ指定できます。");
      return;
    }
    setStatus({ state: "checking" });
    const result = await checkOllamaConnection(settings.endpoint, settings.timeoutSeconds);
    if (result.ok) {
      setStatus({ state: "connected", models: result.models });
    } else {
      setStatus({ state: "failed", reason: result.reason, httpStatus: result.status });
    }
  }

  async function handleGenerateInterpretation() {
    if (!isLocalOllamaEndpoint(settings.endpoint)) {
      setEndpointError("localhostまたは127.0.0.1のURLのみ指定できます。");
      return;
    }
    if (!settings.model.trim()) {
      setGeneration({ state: "error", reason: "missing_model" });
      return;
    }
    if (!previewPayload) {
      setGeneration({ state: "error", reason: "payload_build_failed", message: previewError });
      return;
    }
    setCopyStatus("");
    setGeneration({ state: "loading" });
    const result = await generateInterpretation(
      settings.endpoint,
      settings.model,
      settings.timeoutSeconds,
      previewPayload
    );
    if (result.ok) {
      setGeneration({ state: "success", text: result.text });
    } else {
      setGeneration({
        state: "error",
        reason: result.reason,
        message: result.message,
        httpStatus: result.status
      });
    }
  }

  async function handleCopyResult() {
    if (generation.state !== "success") return;
    try {
      await navigator.clipboard.writeText(generation.text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  function handleDownloadMarkdown() {
    if (generation.state !== "success") return;
    const md = [
      "# AI interpretation (Ollama)",
      "",
      `- Generated: ${new Date().toISOString()}`,
      `- Model: ${settings.model}`,
      "",
      generation.text,
      ""
    ].join("\n");
    downloadTextFile(`ai-interpretation-${dateStamp()}.md`, md, "text/markdown");
  }

  const endpointValid = isLocalOllamaEndpoint(settings.endpoint);
  const generateDisabled =
    !endpointValid || !settings.model.trim() || availableResults.length === 0 || generation.state === "loading";

  return (
    <div className="ollama-section">
      <div className="stats-header-row">
        <button
          type="button"
          className="hyp-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          <span className="hyp-toggle-title">AI interpretation (optional)</span>
          <span className="stats-toggle-arrow">{collapsed ? "▸" : "▾"}</span>
        </button>
        <HelpButton
          open={helpOpen}
          onToggle={() => setHelpOpen((v) => !v)}
          dialogId="ollama-help-dialog"
          label="AI interpretation機能のヘルプを開く"
        />
      </div>
      <HelpDialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        dialogId="ollama-help-dialog"
        title="AI interpretation (Ollama) について"
      >
        <OllamaHelpContent />
      </HelpDialog>

      {!collapsed && (
        <div className="ollama-body">
          <p className="field-note">
            ローカルPCで動く Ollama への接続を設定し、統計・仮説検定結果の要約をもとにAIの考察を生成できます。研究データやCSVの内容そのものは送信しません。
          </p>
          <label className="ollama-toggle-label">
            <input type="checkbox" checked={settings.enabled} onChange={handleToggle} />
            <span>Use local Ollama</span>
          </label>

          {settings.enabled && (
            <div className="stats-form">
              <label className="field">
                <span>Ollama endpoint</span>
                <input
                  type="text"
                  value={settings.endpoint}
                  placeholder={DEFAULT_OLLAMA_ENDPOINT}
                  onChange={(e) => handleEndpointChange(e.target.value)}
                  onBlur={handleEndpointBlur}
                />
              </label>

              <label className="field">
                <span>Model name</span>
                <input
                  type="text"
                  list="ollama-model-suggestions"
                  value={settings.model}
                  placeholder="llama3.2"
                  onChange={(e) => handleModelChange(e.target.value)}
                />
                <datalist id="ollama-model-suggestions">
                  {OLLAMA_MODEL_SUGGESTIONS.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>

              <label className="field">
                <span>Timeout (seconds)</span>
                <input
                  type="number"
                  min="3"
                  max="60"
                  className="stat-n-input"
                  value={settings.timeoutSeconds}
                  onChange={(e) => handleTimeoutChange(e.target.value)}
                />
              </label>

              <button
                type="button"
                className="primary-button"
                onClick={handleCheckConnection}
                disabled={!endpointValid || status.state === "checking"}
              >
                {status.state === "checking" ? "Checking..." : "Check connection"}
              </button>
            </div>
          )}

          {endpointError && <p className="stat-error">{endpointError}</p>}

          {settings.enabled && status.state === "connected" && (
            <p className="ollama-status ollama-status-ok">
              接続済み: モデル{status.models.length}件
              {status.models.length > 0 ? `（${status.models.join(", ")}）` : ""}
            </p>
          )}
          {settings.enabled && status.state === "failed" && (
            <p className="ollama-status ollama-status-error">
              {ERROR_MESSAGES[status.reason] ?? "接続に失敗しました。"}
              {status.reason === "http_error" && status.httpStatus ? `（HTTP ${status.httpStatus}）` : ""}
            </p>
          )}

          {settings.enabled && (
            <div className="ollama-generate">
              <div className="stats-form-heading">Generate interpretation</div>

              {availableResults.length === 0 ? (
                <p className="field-note">
                  先に Statistics または Hypothesis Test を計算すると、ここから考察の生成を依頼できます。
                </p>
              ) : (
                <p className="field-note">
                  送信する結果の要約:{" "}
                  {availableResults
                    .map((r) => (r.exportType === "statistics-result" ? "Statistics" : "Hypothesis Test"))
                    .join(" + ")}
                </p>
              )}

              <button
                type="button"
                className="primary-button"
                onClick={handleGenerateInterpretation}
                disabled={generateDisabled}
              >
                {generation.state === "loading" ? "Generating..." : "Generate interpretation"}
              </button>

              {generation.state === "error" && (
                <p className="ollama-status ollama-status-error">
                  {ERROR_MESSAGES[generation.reason] ?? "考察の生成に失敗しました。"}
                  {generation.message ? `（${generation.message}）` : ""}
                  {generation.reason === "http_error" && generation.httpStatus
                    ? `（HTTP ${generation.httpStatus}）`
                    : ""}
                </p>
              )}

              {generation.state === "success" && (
                <div className="ollama-result">
                  <p className="ollama-result-disclaimer">
                    これはAI生成の参考情報です。最終的な判断はご自身で行ってください。ページを再読み込みするとこの結果は消えます。
                  </p>
                  <pre className="ollama-result-text">{generation.text}</pre>
                  <div className="export-actions">
                    <button type="button" onClick={handleCopyResult}>
                      {copyStatus === "copied" ? "Copied!" : copyStatus === "failed" ? "Copy failed" : "Copy result"}
                    </button>
                    <button type="button" onClick={handleDownloadMarkdown}>
                      Download Markdown
                    </button>
                  </div>
                </div>
              )}

              {previewPayload && (
                <details className="ollama-payload-preview">
                  <summary>Payload preview（送信内容を確認）</summary>
                  <pre>{JSON.stringify(previewPayload, null, 2)}</pre>
                </details>
              )}
              {!previewPayload && previewError && (
                <p className="stat-error">{previewError}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
