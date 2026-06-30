# /improve — コード改善ワークフロー

AGENTS.md のルールに従い、変更を安全に行うための標準ワークフローです。

引数: $ARGUMENTS（改善したい内容を自然文で指定。省略時は現状の問題点を調査して提案）

## 事前確認（変更前）

1. `bash scripts/setup-codex.sh` を実行し、ベースラインが通ることを確認する
2. `git status --short` でクリーンな状態であることを確認する
3. ベースラインが壊れている場合は改善を進める前にユーザーに報告して指示を仰ぐ

## 改善ルール（AGENTS.md より）

変更を行う際は以下を必ず守ること。

- `eval` を数式計算に使用しない（`formulaUtils.js` の安全な評価器を使う）
- `public/real-samples/` 内の実験データCSVは変更・削除しない
- 絶対パスをハードコードしない
- アプリ名 "CSV Data Compare" を変えない
- CSV読み込み・Excelサポート・グラフスタイル・グループ分割・行フィルタ・PNG出力・ポータブルリリース機能を壊さない

## 変更後の検証

変更完了後、以下を順番に実行してください。

1. `npm run build` — ビルドエラーがないことを確認
2. `node scripts/validate-real-data.mjs` — 実データのバリデーションが通ることを確認
3. `node scripts/validate-excel-and-calculation.mjs` — Excel・数式バリデーションが通ることを確認
4. `git status --short` — 変更対象ファイルを列挙して確認

## 報告フォーマット

| 項目 | 内容 |
|---|---|
| 変更内容の概要 | （何を・なぜ変えたか） |
| 変更ファイル一覧 | `git status --short` の出力 |
| ビルド結果 | 成功 / 失敗 |
| バリデーション結果 | 成功 / 失敗 |
| 次のステップ | `/final-verify` でコミット準備 or 追加修正の提案 |

## 注意

- `node_modules/`・`dist/`・`*.log` はコミットしない
- リリース成果物（`release/CSVDataCompare/`・`release/CSVDataCompare-portable.zip`）は明示的な指示がない限り変更しない
- 大きな変更は一度にまとめず、機能単位で分けて検証する
