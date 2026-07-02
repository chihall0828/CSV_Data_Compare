# LLM連携 payload設計メモ（Issue #26 の具体化）

Issue #26「Plan local LLM interpretation support」の Phase L1〜L2 を実装可能なレベルまで具体化した設計メモです。
**本メモは設計のみで、LLM呼び出しの実装・依存追加は行いません。**

## 設計原則

1. **生データを送らない。** LLMに渡すのは要約済み統計値のみ。行データ・セル値・座標値は一切含めない。
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

## プロンプトテンプレート（案）

system相当（Ollama `/api/chat` の system message）:

```text
あなたは統計解析の補助者です。与えられた要約統計・検定結果だけに基づいて、
(1) 結果の読み方 (2) 比較ポイント (3) 注意点 (4) 考察のたたき台 を日本語で簡潔に書いてください。
数値の捏造をしない・p値だけで断定しない・効果量とサンプルサイズに言及する・
「これはAI生成の参考情報であり最終判断はユーザーが行う」と末尾に明記する、を必ず守ってください。
```

user message には上記 payload JSON を貼る。応答は Markdown を要求し、`Copy as Markdown` でそのままレポートへ貼れる形にする。

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

## Phase L1 の最小実装範囲（次に実装するならここから）

1. `exportUtils.js` に `buildLlmPayload(results, { language, userNote })` を追加（純関数・fetchなし）
2. `scripts/validate-export.mjs` に payload schema のテストを追加
3. UIはまだ追加しない（Phase L2で接続確認UIから始める）

## セキュリティ注意点

- endpoint入力は `http://localhost` / `http://127.0.0.1` 系のみ許可するバリデーションを入れる
  （任意の外部URLへ統計値を送れないようにする）
- `userNote` を含め、payloadに個人情報を書かないよう入力欄に注意書きを表示する
- LLM応答は表示・コピーのみで、アプリの状態や計算結果には反映しない（実行系に接続しない）
- 応答の保存はユーザー操作（Copy / Export）のみで自動保存しない
