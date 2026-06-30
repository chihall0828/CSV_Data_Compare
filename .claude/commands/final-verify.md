# /final-verify — コミット前の最終確認

コミット・プッシュ前に AGENTS.md の全チェックを通すための最終ゲートです。

## 実行手順

以下をすべて順番に実行してください。

1. **ビルド確認**
   ```
   npm run build
   ```

2. **実データバリデーション**
   ```
   node scripts/validate-real-data.mjs
   ```

3. **Excel・数式バリデーション**
   ```
   node scripts/validate-excel-and-calculation.mjs
   ```

4. **クリーンアップ**
   ```
   bash scripts/cleanup-codex.sh
   ```
   （一時ファイル・ログ・.DS_Store などを削除）

5. **Gitステータス確認**
   ```
   git status --short
   ```

6. **コミット禁止ファイルの確認**

   以下がステージまたは変更済みに含まれていないことを確認する：
   - `node_modules/`
   - `dist/`
   - `.vite/` `.cache/`
   - `*.log`
   - `.env` `.env.*`
   - `tmp/` `temp/` `coverage/`

7. **実験データ保護の確認**

   以下のファイルが変更されていないことを確認する：
   - `public/real-samples/20260525_1Comparison_timeseries.csv`
   - `public/real-samples/20260525_1KF_result_ENU_block_az0_60_ele70.csv`
   - `public/real-samples/20260525_1KF_result_ENU_normal.csv`

## 合否判定

| チェック項目 | 状態 |
|---|---|
| npm run build | 通過 / 失敗 |
| validate-real-data.mjs | 通過 / 失敗 |
| validate-excel-and-calculation.mjs | 通過 / 失敗 |
| コミット禁止ファイルなし | OK / 要確認 |
| 実験データ変更なし | OK / 要確認 |
| git status クリーン or 意図した変更のみ | OK / 要確認 |

**すべて通過した場合のみ、コミット・プッシュを進めてください。**

一つでも失敗した場合は、原因を報告してユーザーの確認を取ってください。コミットは行わないでください。
