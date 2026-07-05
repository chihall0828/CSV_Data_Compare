import { useState } from "react";
import { HelpButton, HelpDialog } from "./HelpDialog.jsx";
import {
  DEFAULT_OLLAMA_ENDPOINT,
  OLLAMA_MODEL_SUGGESTIONS,
  checkOllamaConnection,
  clampOllamaTimeoutSeconds,
  isLocalOllamaEndpoint,
  readOllamaSettings,
  writeOllamaSettings
} from "./ollamaUtils.js";

const ERROR_MESSAGES = {
  invalid_endpoint: "Ollama endpointはlocalhostまたは127.0.0.1のみ指定できます。",
  network_error: "Ollamaに接続できません。インストール・起動状況、OLLAMA_ORIGINSの設定を確認してください。",
  timeout: "接続がタイムアウトしました。Ollamaが起動しているか確認してください。",
  http_error: "Ollamaがエラーを返しました。",
  malformed_response: "Ollamaからの応答が想定した形式ではありませんでした。"
};

function OllamaHelpContent() {
  return (
    <>
      <h4>これは何か</h4>
      <p>
        統計・仮説検定の結果をもとに、ローカルPC上で動く Ollama にAIによる考察の生成を依頼できる機能です（現在は接続確認まで）。
        研究データやCSVの内容そのものは一切送信しません。
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
        <li>この画面はOllamaへの接続確認のみを行います。統計データの送信はまだ実装されていません。</li>
        <li>設定（endpoint・モデル名・timeout）だけがブラウザに保存されます。CSVデータや統計結果は保存されません。</li>
      </ul>
    </>
  );
}

export default function OllamaSettings() {
  const [settings, setSettings] = useState(() => readOllamaSettings());
  const [status, setStatus] = useState({ state: "idle" });
  const [collapsed, setCollapsed] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [endpointError, setEndpointError] = useState("");

  function persist(next) {
    const saved = writeOllamaSettings(next);
    setSettings(saved);
    return saved;
  }

  function handleToggle() {
    persist({ ...settings, enabled: !settings.enabled });
    setStatus({ state: "idle" });
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

  const endpointValid = isLocalOllamaEndpoint(settings.endpoint);

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
            ローカルPCで動く Ollama への接続を設定できます。研究データやCSVの内容は送信しません。この画面では接続確認のみ行います。
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
        </div>
      )}
    </div>
  );
}
