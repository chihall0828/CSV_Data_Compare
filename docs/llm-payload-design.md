# LLM連携 payload設計メモ（Issue #26 の具体化）

Issue #26「Plan local LLM interpretation support」の Phase L1〜L3 を実装可能なレベルまで具体化した設計メモです。
Phase L1（payload生成）、Phase L2（Ollama接続確認UI）、Phase L3（考察生成の送信配線）まで実装済みです。

## 確定方針

- **第一候補: Ollama local API**（`http://localhost:11434`）
- **第二候補: WebLLM** — 重さ・WebGPU要件・依存追加リスクがあるため将来候補に留める
- **外部API方式: 原則不採用** — OpenAI / Claude / Codex などの外部API連携は**標準機能として実装しない**。どうしても必要になった場合のみ、将来 backend/proxy を用意する前提で再検討する

理由:

- OpenAI / Claude / Codex API は料金が発生する可能性がある
- GitHub Pagesやブラウザアプリに API key を置くのは危険（実質公開と同義）
- 研究データや統計結果を外部APIへ送信したくない
- OllamaならローカルPC上で処理でき、API key不要で使える
- Portable版（localhost配信）との相性がよい

## 実装順（確定）

1. LLM payload schema を確定（本ドキュメント） — **済**
2. Export JSONからLLM payloadを作る純関数 `buildLlmPayload()` を実装 — **済**（`src/exportUtils.js`、whitelist方式・fetchなし）
3. validation を追加 — **済**（`scripts/validate-export.mjs`）
4. Ollama接続UIの実装（Phase L2） — **済**（`src/ollamaUtils.js` / `src/OllamaSettings.jsx`、`GET /api/tags` による疎通確認のみ）
5. 考察生成の送信配線（Phase L3） — **済**（`generateInterpretation()` が `buildLlmPayload()` の出力を `POST {endpoint}/api/chat` に送信し、Markdown寄りのプレーンテキストで考察を受け取る。`assertLlmPayloadSafe()` による送信直前の安全チェックを追加）

Phase L3以降も本方針の禁止事項（API key・依存追加・生データ送信）を維持します。

## 設計原則

1. **生データを送らない。** LLMに渡すのは要約済み統計値のみ。行データ・セル値・座標値は一切含めない。`buildLlmPayload()` はwhitelist方式で許可キーだけを転記するため、入力に余分なフィールド（行データ等）が紛れても構造上payloadへ漏れない。
2. **Export JSONを唯一の情報源にする。** LLM payloadは `src/exportUtils.js` の
   `buildStatisticsExportPayload()` / `buildHypothesisExportPayload()` の出力（= Export JSONそのもの）を再利用する。
   二重定義を作らないことで、Export機能のvalidation（`scripts/validate-export.mjs`）がそのままLLM payloadの品質保証になる。
3. **完全optional。** Ollama未導入・未起動でもアプリの全機能が動作する。
4. **API keyを扱わない。** 外部API方式は採用しない（GitHub Pagesで安全に保持できないため）。

## LLM payload schema（案）

Export JSONを `results` として包み、依頼内容とガードレールをメタデータで付与する。

```jsonc
{
  "schemaVersion": 1,
  "app": "CSV Data Compare",
  "language": "ja",                 // 出力希望言語
  "task": "interpretation",         // 固定。将来 "comparison" 等を追加
  "results": [
    { /* buildStatisticsExportPayload() の出力そのまま */ },
    { /* buildHypothesisExportPayload() の出力そのまま（任意・複数可） */ }
  ],
  "userNote": ""                    // ユーザーが任意で書く背景メモ（例: 「block条件は遮蔽実験」）
}
```

- `results` に含まれるのは dataset名 / column名 / sample条件 / count / missing / mean / variance / stddev / min / max / median / covariance / Pearson r / R² / test name / statistic / df / p-value / alpha / significant / effect size / cautions のみ。
- `userNote` はユーザーが明示的に入力した文字列のみ。自動でファイル内容を差し込まない。

## プロンプトテンプレート

system message（Ollama `/api/chat`）。`src/ollamaUtils.js` の `LLM_SYSTEM_PROMPT` として実装済み:

```text
あなたは統計解析の補助者です。与えられた要約統計・検定結果だけに基づいて、
(1) 結果の読み方 (2) 比較ポイント (3) 注意点 (4) 考察のたたき台 を日本語で簡潔に書いてください。
数値の捏造をしない・p値だけで断定しない・効果量とサンプルサイズに言及する・
「これはAI生成の参考情報であり最終判断はユーザーが行う」と末尾に明記する、を必ず守ってください。
```

user message には `buildLlmPayload()` の出力JSONをそのまま貼る（`JSON.stringify(payload, null, 2)`）。応答はプレーンテキスト/Markdown寄りの文章を想定し、`Copy result` / `Download Markdown` でそのままレポートへ貼れる形で提供する。

## Ollama接続設定（Phase L2 実装案）

- 設定UI（Statisticsパネル下の折りたたみ `AI interpretation (optional)`）:
  - `Use local Ollama` トグル（デフォルトOFF。OFFなら一切fetchしない）
  - `Ollama endpoint`（デフォルト `http://localhost:11434`。localStorageに保存）
  - `Model name`（自由入力 + `llama3.2` / `gemma3` / `qwen3` のdatalist候補）
  - `Check connection` ボタン → `GET {endpoint}/api/tags` で疎通確認しモデル一覧を表示
- エラー表示（すべて他機能へ影響しない）:
  - 接続失敗: 「Ollamaに接続できません。インストール・起動・`OLLAMA_ORIGINS` の設定を確認してください。」
  - モデル未取得: 「モデルが見つかりません。`ollama pull <model>` を実行してください。」
- CORS: ユーザー側で `OLLAMA_ORIGINS` の設定が必要（例: `OLLAMA_ORIGINS=*` または配信origin）。READMEに手順を記載する。

## Portable版を一次ターゲットにする理由

- Portable版は `http://localhost:<port>` 配信のため、`http://localhost:11434` への fetch が
  mixed content にならず、Private Network Access (PNA) の制約も受けにくい。
- Web版（`https://chihall0828.github.io`）→ `http://localhost:11434` は
  ブラウザのPNA実装・バージョンに依存し、将来ブロックが強化されるリスクがある。
  Web版は「動作すればそのまま使える」扱いとし、失敗時はPortable版を案内する。

## WebLLMを後回しにする理由

- `@mlc-ai/web-llm` の dependency 追加が必要（現方針で禁止）
- WebGPU必須で研究室の共用PC・古いブラウザで動かない可能性が高い
- 初回モデルDLが数GB級で、軽量配布というアプリ設計と相性が悪い
- Phase L4 で feasibility prototype のみ別ブランチで検証する

## Phase L1 の実装内容（本リポジトリで実装済み）

1. `exportUtils.js` の `buildLlmPayload(results, { language, userNote })` — 純関数・fetchなし。
   Export JSON（statistics / hypothesis）を単体または配列で受け取り、whitelist方式でsanitizeして
   `{ schemaVersion, app, generatedAt, language, task, results, userNote }` を返す。
   未対応の `exportType` や空入力はエラー、`userNote` は2000文字でクランプ、非文字列cautionsは除去。
2. `scripts/validate-export.mjs` の payload schemaテスト — 要約値の保持、行データ様フィールドの除去、
   言語オプション、クランプ、エラー系を検証。
3. UIはまだ追加しない（Phase L2で接続確認UIから始める）

## Phase L3 の実装内容（本リポジトリで実装済み）

1. `ollamaUtils.js` の `generateInterpretation(endpoint, model, timeoutSeconds, payload)` —
   `checkOllamaConnection()` に続く、この module 内で2つ目かつ最後のfetch関数。
   引数は endpoint・model・timeout・**既にsanitize済みの `buildLlmPayload()` 出力**のみで、
   `dataset` や `rows` を受け取れないシグネチャにしている（型的に生データを混入不可能にする方針を維持）。
   送信前に必ず `assertLlmPayloadSafe()` を自分自身で呼び、呼び出し元がチェックを省略しても安全側に倒す。
   `POST {endpoint}/api/chat`（`stream: false`）で system message に `LLM_SYSTEM_PROMPT`、
   user message に payload JSON を渡し、`data.message.content` を考察テキストとして返す。
2. `ollamaUtils.js` の `assertLlmPayloadSafe(payload)` — `buildLlmPayload()` のwhitelist方式に対する
   二重チェック（defense in depth）。`task`/`results`の形状検証、`results[].exportType` の許可リスト検証、
   `rows` / `rawData` / `csv` 等のキー名を再帰的に走査して検出、payload全体のJSON文字列長の上限（20,000文字）
   検証を行い、いずれかに違反すると例外を投げる。`scripts/validate-ollama-config.mjs` でテスト済み。
3. `StatisticsPanel.jsx` / `HypothesisTestSection.jsx` — Hypothesis Testの計算結果を
   `onResultChange` コールバック経由で `StatisticsPanel` に伝播させ、Statistics結果とHypothesis Test結果の
   両方（計算済みのものだけ）を `OllamaSettings` へ渡せるようにした。
4. `OllamaSettings.jsx` に追加したUI:
   - `Generate interpretation` ボタン（endpoint不正・model未入力・送信対象結果なし・生成中は無効化）
   - 生成中は「Generating...」表示、失敗時はエラー理由別メッセージを表示
   - 生成成功時は考察テキストを表示し、`Copy result`（クリップボードへコピー）と
     `Download Markdown`（`ai-interpretation-YYYYMMDD.md` としてダウンロード）を提供
   - `Payload preview` は `<details>` で実装し、**デフォルト折りたたみ**。実際に送信されるJSONをそのまま表示する
   - 生成結果・payload・エラー内容はすべてReactのuseStateのみで保持し、**localStorageには一切保存しない**
     （保存されるのはPhase L2から変わらず endpoint・model・timeout・enabledトグルの4項目のみ）
5. UIでは `userNote` の入力欄はまだ追加していない（`buildLlmPayload()` は引き続きoptionとして受け付けるが、
   Phase L3では呼び出し側から常に空文字で呼んでいる。ユーザーメモ欄の追加はPhase L4以降で検討する）。

## セキュリティ注意点

- endpoint入力は `http://localhost` / `http://127.0.0.1` 系のみ許可するバリデーションを入れる
  （任意の外部URLへ統計値を送れないようにする）
- `userNote` を含め、payloadに個人情報を書かないよう入力欄に注意書きを表示する
- LLM応答は表示・コピーのみで、アプリの状態や計算結果には反映しない（実行系に接続しない）
- 応答の保存はユーザー操作（Copy / Export）のみで自動保存しない
