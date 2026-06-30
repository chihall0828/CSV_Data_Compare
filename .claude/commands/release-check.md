# /release-check — リリース成果物の確認

AGENTS.md に定められたリリース成果物が正しく存在するかを確認します。
再生成は行わず、現状の確認のみを行います。再生成が必要な場合はユーザーに確認してから進めてください。

## 確認手順

### 1. 必須成果物の存在確認

以下のファイル・フォルダが存在することを確認してください。

```
release/CSVDataCompare/                    （必須フォルダ）
release/CSVDataCompare-portable.zip        （必須 ZIP）
release/CSVGraphViewer/                    （参照用）
release/ENUCSVCompare/                     （参照用）
```

`ls -lh release/` で一覧とサイズを確認する。

### 2. CSVDataCompare フォルダ内の構成確認

```
release/CSVDataCompare/
  ├── app/
  │   ├── index.html
  │   ├── assets/          （JS・CSS バンドル）
  │   ├── real-samples/    （実験データ CSV）
  │   ├── test-samples/    （テスト用 CSV・XLSX）
  │   └── sample-gnss*.csv
  ├── Start CSV Data Compare.bat
  ├── server.ps1
  ├── README.md
  └── README.txt
```

### 3. ZIP 整合性の確認

```
unzip -l release/CSVDataCompare-portable.zip | head -30
```

ZIP 内に `CSVDataCompare/app/index.html` が含まれていることを確認する。

### 4. 実験データの保護確認

リリースフォルダ内の実験データが `public/real-samples/` と一致しているかを確認する。

```
diff public/real-samples/20260525_1KF_result_ENU_normal.csv \
     release/CSVDataCompare/app/real-samples/20260525_1KF_result_ENU_normal.csv
```

差分がなければ OK。

### 5. build-info.json の確認（存在する場合）

```
cat release/CSVDataCompare/app/build-info.json
```

ビルド日時・バージョンを確認する。

## 報告フォーマット

| 項目 | 状態 |
|---|---|
| `release/CSVDataCompare/` 存在 | OK / なし |
| `release/CSVDataCompare-portable.zip` 存在 | OK / なし |
| フォルダ内の必須ファイル | OK / 欠損あり |
| ZIP 内に index.html | OK / なし |
| 実験データの整合性 | 一致 / 差分あり |
| build-info.json | （内容） |

## リリース成果物を再生成する場合

ユーザーから明示的な指示があった場合のみ、以下の手順を実行する。

1. `npm run build` でビルド
2. `node scripts/create-portable-package.ps1` または対応するスクリプトでパッケージ作成
3. 再度 `/release-check` を実行して整合性を確認
4. `release/CSVDataCompare/` と `release/CSVDataCompare-portable.zip` の**両方**が正常であることを確認してからコミット

**注意**: 再生成せずに削除・上書きするだけの操作は禁止。必ず再生成→確認の順で行うこと。
