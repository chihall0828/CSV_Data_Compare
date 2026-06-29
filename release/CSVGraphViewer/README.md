# CSV Graph Viewer

複数のCSVを読み込み、同じグラフ上で比較できるCSV可視化アプリです。GNSS/測位結果の確認を想定し、E/N/U時系列とE-N平面軌跡を表示できます。

## できること

- 複数CSVをドラッグ＆ドロップで読み込み
- CSVごとに表示ON/OFF、削除、X列、E列、N列を設定
- `epoch`、`time`、`timestamp`、`relative_time_s`、`時刻` などをX軸候補として推定
- `KF_E_m`、`KF_N_m`、`KF_U_m`、`Relative_E_m`、`fix_E_rov_m`、`E方向` などをENU列として推定
- E/N/U時系列を重ね描き
- E-N平面の軌跡を表示
- 開始点・終了点をマーカー表示
- 等倍スケール表示
- 欠損値、NaN、数値と文字列の混在をできる範囲でスキップ
- 大きいCSVは系列あたり最大2500点に間引いて描画
- グラフをPNGで保存

## 利用者向け: 配布版の起動方法

配布版フォルダを受け取った人は、Node.jsやnpmをインストールする必要はありません。

1. `release/CSVGraphViewer` フォルダを開きます。
2. `Start CSV Graph Viewer.bat` をダブルクリックします。
3. ブラウザが開きます。
4. アプリを使っている間は、サーバー用のPowerShellウィンドウを閉じないでください。
5. 使い終わったら、そのPowerShellウィンドウを閉じます。

配布用zipは以下です。

```text
release/CSVGraphViewer-portable.zip
```

このzipを他のWindows 10/11 PCに渡し、展開して `Start CSV Graph Viewer.bat` をダブルクリックすれば起動できます。

## CSVの読み込み方法

通常利用では、画面上のドラッグ＆ドロップ領域にCSVを置きます。複数CSVをまとめて置くこともできます。

ファイル選択ボタンから複数CSVを選ぶこともできます。

動作確認用ボタン:

- `比較サンプル`: 小さいサンプルCSVを2件読み込みます。
- `実データ確認`: 同梱した実データ由来CSVを3件読み込みます。
- `異常系確認`: 欠損値、混在値、日本語ファイル名、大きめCSVなどの確認用CSVを読み込みます。

## 複数CSV比較の方法

1. 複数CSVを読み込みます。
2. 「読み込み済みファイル」で表示したいCSVにチェックを入れます。
3. 時系列表示では、Y軸に表示したい列を選びます。
4. CSVごとにX列が違う場合は、各ファイルカード内の `X` を変更します。
5. 片方のCSVにない列を選んだ場合は、画面上に「このファイルにはありません」と表示されます。

## E/N/U列とE-N軌跡

時系列では、`KF_E_m`、`KF_N_m`、`KF_U_m` などを複数選択すると同じグラフ上に重ねて表示できます。

E-N軌跡では、ファイルごとの `E` と `N` の列を使って平面軌跡を表示します。自動推定が外れた場合は、各ファイルカード内の `E` と `N` を手動で変更してください。

等倍スケールをONにすると、E方向とN方向を同じスケールで表示します。

## PNG保存

グラフが表示された状態で `PNGで保存` を押します。通常のブラウザではPNGファイルとして保存されます。

ブラウザやセキュリティ設定によっては、ダウンロード許可が必要な場合があります。

## よくあるエラーと対処

`CSVファイルを選択してください`
: CSV以外のファイルを選んでいます。拡張子が `.csv` のファイルを選んでください。

`このファイルにはありません`
: 選択したY列が、そのCSVには存在しません。別の列を選ぶか、そのCSVの表示をOFFにしてください。

`数値列が見つからない`
: 選んだCSVにグラフ化できる数値列がありません。列名や中身を確認してください。

文字化けする
: UTF-8とShift-JISはできる範囲で判定しますが、特殊な文字コードでは文字化けすることがあります。CSVをUTF-8で保存し直してください。

グラフが重い
: 大きいCSVでは自動で間引きます。さらに軽くしたい場合は、表示するCSVやY列を減らしてください。

## 開発者向け

Node.js/npm が使える環境では、以下で開発起動できます。

```powershell
npm install
npm run dev
```

ビルド:

```powershell
npm run build
```

検証:

```powershell
npm run generate:test-samples
npm run validate:real
```

外部の実データフォルダを検証したい場合:

```powershell
node scripts/validate-real-data.mjs --dir "CSVフォルダへのパス"
```

配布版作成:

```powershell
npm run build
npm run package:portable
```

## ファイル構成

```text
src/App.jsx                     アプリ本体
src/dataUtils.js                CSV解析・列推定・数値化ロジック
src/styles.css                  画面デザイン
scripts/validate-real-data.mjs  実データ・異常系検証
scripts/generate-test-samples.mjs 異常系CSV生成
scripts/create-portable-package.ps1 配布版作成
scripts/portable-server.ps1     Node不要のローカルサーバー
public/real-samples/            実データ確認用CSV
public/test-samples/            異常系確認用CSV
release/CSVGraphViewer/         配布用フォルダ
release/CSVGraphViewer-portable.zip 配布用zip
```

## 既知の制限

- 配布版はブラウザで動くローカルアプリです。起動中はPowerShellウィンドウを閉じないでください。
- ポート `8765` を使います。他のアプリが使っている場合は起動できないことがあります。
- 非常に巨大なCSVでは読み込みに時間がかかることがあります。
- Shift-JIS以外の特殊な文字コードは完全には保証していません。
- `public/real-samples/` は確認用です。本番利用では自分のCSVをドラッグ＆ドロップしてください。
