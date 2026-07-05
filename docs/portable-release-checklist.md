# Portable release 再生成チェックリスト

Portable版の配布物（`release/CSVDataCompare/` と `release/CSVDataCompare-portable.zip`）を更新するための手順です。

**前提: Windows 10/11 + PowerShell 環境で実行してください。**
`npm run package:portable` は PowerShell スクリプト（`scripts/create-portable-package.ps1`）のため、Linux/macOS では実行できません。

## いつ再生成が必要か

- `src/` 配下（アプリ本体）が変更された PR が main に merge されたとき
- `release/CSVDataCompare/app/build-info.json` の commit が main の最新と大きく乖離しているとき
- `npm run validate:portable-release` は「release フォルダと zip の整合性」を検査するもので、**main の最新コードと release が一致しているかは検査しない**点に注意

## 手順

### 1. 最新mainの取得とベースライン確認

```bash
git checkout main
git pull --ff-only origin main
npm ci
npm run validate
```

すべて `status: ok` であることを確認します。

### 2. ビルド確認

```bash
npm run build:web
npm run build:portable
```

両方成功することを確認します（`build:web` は `VITE_BASE_URL=/CSV_Data_Compare/` を付けると GitHub Pages 相当の確認もできます）。

### 3. Portable package生成

```powershell
npm run package:portable
```

### 4. 生成後のvalidation

```bash
npm run validate
```

`validate:portable-release` を含む全validationが `status: ok` であることを確認します。

### 5. zip更新の確認

- `release/CSVDataCompare-portable.zip` のタイムスタンプが更新されていること
- `release/CSVDataCompare/app/build-info.json` の commit / built日時が最新であること
- zip内の `app/assets/index-*.js` のハッシュ名が `release/CSVDataCompare/app/assets/` と一致していること

### 6. 展開・起動確認（Windows）

1. zipを一時フォルダへ展開する
2. `Start CSV Data Compare.bat` をダブルクリック
3. ブラウザでアプリが開くこと
4. PowerShellウィンドウが開いたままであること

### 7. アプリ動作確認

起動したブラウザで以下をすべて確認します。

- [ ] 比較サンプル読込
- [ ] サンプル実データ読込（既存データがある状態では確認モーダル → 置換/追加/中止/Esc が動作すること）
- [ ] Excelサンプル読込
- [ ] グラフ描画
- [ ] PNG保存（`PNGで保存` ボタンでファイルが保存できる。White/Transparent背景・1×/2×/3×解像度のいずれかで確認）
- [ ] Statistics help（`?`）が開く
- [ ] Bivariate help が開く
- [ ] Hypothesis help が開く
- [ ] Formula help が開く
- [ ] Calculated columns で計算列を追加できる
- [ ] Compute statistics → Export statistics JSON / Markdown が保存できる
- [ ] Run test → Export hypothesis JSON / Markdown が保存できる
- [ ] ブラウザConsoleにアプリ本体のエラーがない

### 8. 差分確認とPR

```bash
git status --short
git diff --stat
```

- 差分が `release/` 配下のみであることを確認します（`node_modules/`・`dist/`・`.log` が混ざっていないこと）
- 新しいbranchを作成してcommit・pushし、main向けPRを作成します

```bash
git switch -c claude/regenerate-portable-release
git add release/
git commit -m "Regenerate portable release"
git push -u origin claude/regenerate-portable-release
```

複数回にわたって再生成する場合は、branch名に日付や理由を足すなどして区別してください（例: `claude/regenerate-portable-release-20260705`）。

### 9. merge後

```bash
git checkout main
git pull --ff-only origin main
```

GitHub Actions の Validation が success になることを確認します。

## トラブルシューティング

- **PowerShellの実行ポリシーで止まる**: `powershell -ExecutionPolicy Bypass -File scripts/create-portable-package.ps1` を直接実行してください（`npm run package:portable` と同じ内容です）。
- **OneDrive配下でファイルコピーが失敗する**: スクリプトには一時的なファイル操作失敗のretryが入っていますが、繰り返し失敗する場合はOneDrive外のパスで実行してください。
- **zipと展開フォルダの内容が食い違う**: `npm run validate:portable-release` が検出します。`package:portable` を再実行してください。
