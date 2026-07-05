# Phase L2 実装計画: Ollama接続設定UI

[docs/llm-payload-design.md](llm-payload-design.md) の実装順で定義した Phase L2 を実装可能なレベルまで具体化した計画です。
**本ドキュメントは計画のみです。UI・fetch・接続コードはこの時点でまだ実装しません。**

## Phase L2 の目的

「AI interpretation」機能に向けて、**接続設定と疎通確認のUIだけ**を追加する。

- Ollama endpoint / model名 / timeout をユーザーが設定できる
- `GET {endpoint}/api/tags` で疎通確認し、利用可能なモデル一覧を表示する
- **プロンプト送信・考察生成は行わない**（Phase L3の範囲）
- 統計データは一切送信しない（疎通確認はモデル一覧取得のみで、payloadを伴わない）
- Ollama未導入・未起動でもアプリ本体が壊れないことを保証する

## Phase L2 の対象外（Phase L3以降）

- `buildLlmPayload()` の出力をOllamaへ送信すること
- 「考察を生成」ボタン
- 生成結果の表示・Markdown化
- ストリーミング応答の処理

## 実装対象ファイル（案）

| ファイル | 内容 |
|---|---|
| `src/ollamaUtils.js`（新規） | 純関数のみ: endpoint検証 (`isLocalOllamaEndpoint`)、設定のlocalStorage読み書き、`checkOllamaConnection(endpoint, timeoutMs)`（fetchを含む唯一の関数） |
| `src/OllamaSettings.jsx`（新規） | 設定UIコンポーネント。`HelpButton`/`HelpDialog`（既存 `src/HelpDialog.jsx`）を再利用してヘルプを追加 |
| `src/StatisticsPanel.jsx` | `OllamaSettings` を末尾（Hypothesis Testセクションの下）に追加。折りたたみ式、デフォルト折りたたみ |
| `scripts/validate-ollama-config.mjs`（新規） | `isLocalOllamaEndpoint()` のみをテスト（ネットワークI/Oなし、CIで実行可能） |
| `README.md` | 「AI interpretation（実験的・任意機能）」節を追加し、Ollama導入手順・`OLLAMA_ORIGINS` 設定を案内 |

## UIに追加する項目

新セクション「**AI interpretation (optional)**」（デフォルト折りたたみ、`?` ヘルプ付き）:

| 項目 | 種別 | デフォルト |
|---|---|---|
| `Use local Ollama` | トグル | **OFF**（明示的にONにするまで一切fetchしない） |
| `Ollama endpoint` | テキスト入力 | `http://localhost:11434` |
| `Model name` | テキスト入力 + datalist候補（`llama3.2` / `gemma3` / `qwen3`） | 空 |
| `Timeout (seconds)` | 数値入力（3〜60の範囲でクランプ） | `10` |
| `Check connection` | ボタン | — |
| 接続ステータス表示 | テキスト（未確認 / 確認中… / 接続済み: モデルN件 / 失敗: 理由） | 未確認 |

## Ollama endpoint / model名 / timeout / 接続テストの扱い

- **endpoint検証**: `isLocalOllamaEndpoint(url)` で `http://localhost:<port>` `http://127.0.0.1:<port>` `http://[::1]:<port>` のみ許可。それ以外（外部ホスト・`https://`含む）は**クライアント側で弾き、fetchを一切発行しない**。任意の外部サーバーへ統計値が送られる経路を構造的に塞ぐ。
- **接続テスト**: `GET {endpoint}/api/tags` のみ。リクエストボディなし・統計データを含まない。`AbortController` で `Timeout (seconds)` を強制する。
- **model名**: Phase L2では自由入力を保存するだけで、実際にモデルが存在するかの検証はしない（`/api/tags` のレスポンスにモデル一覧が含まれるので、UIでは「取得したモデル一覧に含まれるか」の目安表示に留める。存在チェックの強制はPhase L3で検討）。

## localStorageに保存する設定と保存しない情報

**保存する（新規キー、既存の `DISPLAY_SETTINGS_KEY` 等とは別キーにする）:**
- `Use local Ollama` トグル状態
- endpoint文字列
- model名文字列
- timeout秒数

**保存しないもの:**
- 接続確認で取得したモデル一覧（毎回取得し直す。古い一覧が残って誤解を招くのを防ぐ）
- 統計結果・検定結果・`buildLlmPayload()` の出力
- 生成された考察文（Phase L3以降の話だが、方針として明記しておく）
- CSV/Excelのデータそのもの（そもそも本機能の設定に含まれ得ない）

保存前に必ず `isLocalOllamaEndpoint()` を通し、不正な値（外部ホスト等）はlocalStorageにも書き込まない。

## エラー表示

| 状況 | 表示文言（案） |
|---|---|
| endpointがlocalhost系でない | 「Ollama endpointはlocalhostまたは127.0.0.1のみ指定できます。」（fetch前にブロック） |
| fetch失敗（ネットワークエラー） | 「Ollamaに接続できません。インストール・起動状況、`OLLAMA_ORIGINS` の設定を確認してください。」 |
| タイムアウト | 「接続がタイムアウトしました（{timeout}秒）。Ollamaが起動しているか確認してください。」 |
| HTTPエラー（4xx/5xx） | 「Ollamaがエラーを返しました（HTTP {status}）。」 |
| レスポンス形式が不正（`models` 配列が無い等） | 「Ollamaからの応答が想定した形式ではありませんでした。」 |

いずれのエラーもアプリ本体（CSV読込・グラフ・統計・仮説検定・Export）の動作には影響させない。エラーは本セクション内に閉じて表示する。

## LLMに送るpayloadの範囲

**Phase L2では何も送らない。** `GET /api/tags` にはリクエストボディがなく、統計データも含まれない。
Phase L3で初めて `buildLlmPayload()`（`src/exportUtils.js`、既存・実装済み・whitelist方式）の出力を送信対象にする。Phase L2のUIはPhase L3のための「配線の受け口」を用意するだけに留める。

## 生CSVデータを不用意に送らないための安全設計

- Ollamaへの通信を発生させる関数を `ollamaUtils.js` の `checkOllamaConnection()` 一箇所に限定し、`fetch` 呼び出しをこの1関数に閉じ込める（レビューしやすくする）
- `checkOllamaConnection()` は引数に endpoint と timeout のみを取り、`dataset` や `rows` を一切受け取れないシグネチャにする（型的に混入不可能にする）
- Phase L3実装時も、Ollamaへ送るペイロードは必ず `buildLlmPayload()` の戻り値のみとし、`dataset.rows` や生CSV文字列を直接渡す経路を作らない（コードレビューでの必須チェック項目として明記）
- endpoint allowlistにより、設定ミスや将来の改変で外部ホストに送信される事故を構造的に防止

## Validation方針

- `isLocalOllamaEndpoint()` の純関数テストを `scripts/validate-ollama-config.mjs` に追加し、`npm run validate` に組み込む（ネットワークI/Oなし、CIで常に実行可能）
  - 許可: `http://localhost:11434`, `http://127.0.0.1:11434`, `http://localhost:1`, `http://[::1]:11434`
  - 拒否: `https://localhost:11434`（別プロトコル）, `http://example.com:11434`, `http://192.168.1.10:11434`, 空文字, 不正なURL文字列
- `checkOllamaConnection()` はfetchを含むため自動テスト対象外（Ollamaが常時起動しているCI環境ではないため）。手動ブラウザ確認でカバーする。
- 既存の `scripts/validate-export.mjs` は変更しない（`buildLlmPayload()` は今回変更しないため）。

## 手動ブラウザ確認項目

- [ ] デフォルト状態（`Use local Ollama` OFF）でアプリの全既存機能が今まで通り動作する
- [ ] トグルON、デフォルトendpoint、Ollama未起動状態で `Check connection` → 「接続できません」系エラーが表示され、コンソールに未処理エラーが出ない
- [ ] endpointに外部ホスト（例: `http://example.com:11434`）を入力 → 保存・送信されず、インライン検証エラーが表示される（devtoolsのNetworkタブでリクエストが発生しないことを確認）
- [ ] （Ollama導入済み環境があれば）実際に起動した状態で `Check connection` → モデル一覧が表示される
- [ ] ページリロード後、endpoint/model/timeout/トグル状態が復元される
- [ ] トグルをOFFに戻すと、それ以降 `Check connection` を押しても外部fetchが発生しない（ボタン自体を無効化するか、セクションごと折りたたむ）
- [ ] Statistics / Hypothesis Test / Calculated columns / Export など既存機能に影響がないこと、コンソールエラーがないこと

## Phase L2実装時の禁止事項・注意点

**禁止:**
- プロンプト送信・考察生成の実装（Phase L3）
- `buildLlmPayload()` の呼び出し配線（Phase L3で行う）
- 外部API（OpenAI等）の追加
- API keyを扱うコード
- package dependencyの追加（`fetch`は標準APIのみで実装する）
- localhost/127.0.0.1以外への通信を許可する設計
- 統計計算ロジックの変更
- 機能のデフォルトON化（必ずOFFで出荷する）
- mainへの直接push・force push

**注意:**
- `OLLAMA_ORIGINS` の設定要否をREADMEで明確に案内する（ユーザーがハマりやすい箇所）
- Web版（GitHub Pages）とPortable版で挙動が変わり得る（[docs/llm-payload-design.md](llm-payload-design.md) の「Portable版を一次ターゲットにする理由」を参照）ことをUIの説明文にも簡潔に記載する
- 接続確認ボタンの連打でリクエストが積み上がらないよう、確認中は再度のクリックを無効化する
