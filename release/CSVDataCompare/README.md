# CSV Data Compare

複数のCSVやExcelを読み込み、同じグラフ上で列・変化・XY軌跡を比較できるデータ可視化アプリです。研究データ、実験データ、センサーデータ、時系列データに使えます。GNSS/ENUデータ向けの自動推定とプリセットも残しています。

## できること

- 複数CSVまたはExcel `.xlsx` をドラッグ＆ドロップで読み込み
- Excelの複数シートをファイルカード内の `Sheet` で切り替え
- CSVごとに表示ON/OFF、削除、X column、XY X、XY Yを設定
- `epoch`、`time`、`timestamp`、`relative_time_s`、`時刻` などをX軸候補として推定
- `KF_E_m`、`KF_N_m`、`KF_U_m`、`Relative_E_m`、`fix_E_rov_m`、`E方向` などをENU列として推定
- Time Series Plotで複数Y列を重ね描き
- XY PlotでXY軌跡を表示
- 開始点・終了点をマーカー表示
- 等倍スケール表示
- 線幅、点表示ON/OFF、点サイズ、開始/終了点サイズを変更
- 表示スタイル設定をブラウザに保存
- 欠損値、NaN、数値と文字列の混在をできる範囲でスキップ
- 大きいCSVは系列あたり最大2500点に間引いて描画
- 同一CSVの二重読み込みを内容ハッシュで検出してスキップ
- ファイルごとにX重複、描画点数、トレース数、間引き有無を診断表示
- `Calculated columns` で `[列名]` を使った派生列を作成し、グラフに表示
- 計算列を含めた `Export processed CSV`
- グラフをPNGで保存

## 利用者向け: 配布版の起動方法

配布版フォルダを受け取った人は、Node.jsやnpmをインストールする必要はありません。

1. `release/CSVDataCompare` フォルダを開きます。
2. `Start CSV Data Compare.bat` をダブルクリックします。
3. ブラウザが開きます。
4. アプリを使っている間は、サーバー用のPowerShellウィンドウを閉じないでください。
5. 使い終わったら、そのPowerShellウィンドウを閉じます。

起動時に使われたURLは、同じフォルダの `last-started-url.txt` にも保存されます。

配布用zipは以下です。

```text
release/CSVDataCompare-portable.zip
```

このzipを他のWindows 10/11 PCに渡し、展開して `Start CSV Data Compare.bat` をダブルクリックすれば起動できます。

旧配布名 `ENUCSVCompare` は測位データ向けの印象が強かったため、Part3以降の新しい配布物は `CSVDataCompare` として生成します。

## Web版とPortable版の違い

このアプリには2つの利用形態があります。

| | Web版 | Portable版 |
|---|---|---|
| 起動方法 | ブラウザでURLを開く | `.bat` をダブルクリック |
| インストール | 不要 | 不要（zip展開のみ） |
| インターネット接続 | 必要 | 不要（完全オフライン） |
| 対応OS | ブラウザが動く環境 | Windows 10/11 |
| CSV/Excel処理場所 | ブラウザ内で完結 | ブラウザ内で完結 |
| データのサーバー送信 | **なし** | **なし** |

### Web版

GitHub Pagesでホストしています。URLを開くだけで使えます。インストール・展開は不要です。

公開URL: https://chihall0828.github.io/CSV_Data_Compare/

- **CSV/Excelはサーバーへアップロードされません。** 読み込んだファイルのデータはすべてブラウザ内で処理します。外部サーバーへの送信は一切行いません。
- ページを閉じると読み込んだCSV/Excelデータは消えます（グラフ設定などlocalStorageに保存した項目は残ります）。
- `main` ブランチへのpushで自動的に最新版が公開されます（GitHub Actions経由）。

### Portable版

Windows環境でオフライン利用したい場合や、インターネット接続なしで使いたい場合に使います。

- `release/CSVDataCompare-portable.zip` を展開し、`Start CSV Data Compare.bat` をダブルクリックで起動します。
- ローカルのNode.jsサーバー経由でブラウザが開きます。インターネット接続は不要です。
- **こちらもデータはサーバーへ送信しません。** すべてブラウザ内処理です（サーバーは静的ファイル配信のみ）。

## CSV/Excelの読み込み方法

通常利用では、画面上のドラッグ＆ドロップ領域にCSVまたはExcelを置きます。複数ファイルをまとめて置くこともできます。

ファイル選択ボタンから複数ファイルを選ぶこともできます。対応形式は `.csv` と `.xlsx` です。旧Excel形式の `.xls` は今回は未対応です。必要な場合はExcelなどで `.xlsx` に保存し直してください。

Excelは1行目をヘッダーとして扱います。複数シートがある場合は、初期状態では1枚目のシートを読み込み、読み込み済みファイルカードの `Sheet` で別シートへ切り替えられます。シートを切り替えると列候補、数値列、診断情報、プレビューも再解析されます。

動作確認用ボタン:

- `比較サンプル`: 小さいサンプルCSVを2件読み込みます。
- `サンプル実データを読み込む`: 同梱した実データ由来CSVを3件読み込みます。
- `Excelサンプル`: 複数シートを持つ小さい `.xlsx` を読み込みます。
- `異常系確認`: 欠損値、混在値、日本語ファイル名、大きめCSV、列計算確認用CSVなどを読み込みます。

既にデータを読み込んでいる状態でCSVサンプル読込ボタンを押すと、置換・追加・中止を選べます。

## 複数CSV/Excel比較の方法

1. 複数CSV/Excelを読み込みます。
2. 「読み込み済みファイル」で表示したいデータにチェックを入れます。
3. Time Series Plotでは、Y軸に表示したい列を選びます。
4. ファイルごとにX列が違う場合は、各ファイルカード内の `X column` を変更します。
5. 片方のファイルにない列を選んだ場合は、画面上に「このファイルにはありません」と表示されます。
6. 点が重なって見える場合は、各ファイルカードの `診断情報` を開き、X重複行数・描画点数・トレース数を確認します。

## 列計算・派生列

各ファイルカードの `Calculated columns` を開くと、読み込んだデータから新しい列を作成できます。元のCSV/Excelファイルは変更せず、ブラウザ上の一時列として追加します。

基本手順:

1. `New column name` に新しい列名を入力します。例: `horizontal_error_m`
2. `Formula` に数式を入力します。
3. 列名ボタンを押すと `[KF_E_m]` のような形式でFormula欄へ挿入できます。
4. `Add calculated column` を押します。
5. 作成した列はY列候補、XY X、XY Y候補、データプレビュー、診断情報に反映されます。

数式例:

```text
[KF_E_m] - [Relative_E_m]
[KF_N_m] - [Relative_N_m]
sqrt(([KF_E_m] - [Relative_E_m])^2 + ([KF_N_m] - [Relative_N_m])^2)
[E_m] * 100
[value] / 1000
```

列名にスペース、日本語、記号が含まれる場合は、必ず `[列名]` 形式で参照してください。スペースを含まない列名は `KF_E_m - Relative_E_m` のように書ける場合もありますが、確実なのは `[列名]` 形式です。

対応演算子:

- `+`
- `-`
- `*`
- `/`
- `^`
- `()`

対応関数:

- `sqrt()`
- `abs()`
- `pow()`
- `min()`
- `max()`
- `sin()`
- `cos()`
- `tan()`
- `log()`
- `exp()`

欠損値、空欄、NaN、非数値、0除算、計算結果が無限大になる行は、計算不能行としてスキップします。診断情報には `Calculated columns` と `Calculation warnings` が表示されます。

`Export processed CSV` を押すと、計算列を含めた現在のデータをCSVとして保存できます。

## 表示スタイルの変更

「グラフ設定」の「表示スタイル」で、見た目を調整できます。

- `Line width`: 折れ線やXY軌跡の線幅を1から5で変更します。初期値は2です。
- `Markers`: 点マーカーの表示をOff/Onで切り替えます。初期値はOffです。
- `Marker size`: 点マーカーの大きさを変更します。初期値は5です。
- `Start/end marker`: XY Plotの開始点・終了点マーカーの大きさを変更します。初期値は9です。

読み込み済みファイルカードの **Plot style** では、データセットごとに色と線種を指定できます。

- `Color`: `Auto`, `Blue`, `Red`, `Green`, `Purple`, `Orange`, `Cyan`, `Gray`, `Custom hex` から選びます。
- `Custom hex`: `#RRGGBB` 形式だけ使えます。不正な値は保存・適用されません。
- `Line style`: `Auto`, `Solid`, `Dashed`, `Dotted`, `Dash-dot` から選びます。
- `Auto` の場合は従来通り、ファイル順や `Group / Split column` のグループ値から自動で色・線種を決めます。

点を表示すると、大きいCSVでは描画が重くなる場合があります。重い場合は `Markers` をOffにするか、表示するCSVやY列を減らしてください。

これらの設定と等倍スケール設定はブラウザに保存され、次回起動時にも復元されます。

## GNSS/ENUデータ向け機能

Time Series Plotでは、`KF_E_m`、`KF_N_m`、`KF_U_m` などを複数選択すると同じグラフ上に重ねて表示できます。複数のENU系統がある場合、初期表示は複数ファイルで共通しやすい代表セットを優先します。必要な列は手動で追加できます。

XY Plotでは、ファイルごとの `XY X` と `XY Y` の列を使って平面軌跡を表示します。ENUデータの場合は、E方向を `XY X`、N方向を `XY Y` として使えます。

各ファイルカードの `ENU preset` から、`KF_E/KF_N/KF_U` または `Relative_E/Relative_N/Relative_U` をまとめて選べます。自動推定が外れた場合は、`XY X` と `XY Y` を手動で変更してください。

等倍スケールをONにすると、XYの縦横を同じスケールで表示します。

## ExcelヘッダーRow（B2）

読み込み済みExcelファイルカードに `Header row` 入力欄があります。1以上の整数を入力すると、その行をヘッダーとして再解析します。デフォルトは1行目です。

- 例：2行目がヘッダーの場合は `2` を入力します。
- 変更直後に列候補・数値列・プレビューが自動で更新されます。
- 不正な値（0以下・小数）は自動的に1にクランプされます。

## PNG保存

グラフが表示された状態で `PNGで保存` を押します。通常のブラウザではPNGファイルとして保存されます。

ブラウザやセキュリティ設定によっては、ダウンロード許可が必要な場合があります。

### PNG背景色と解像度（B3）

グラフ設定パネルの `PNG保存設定` で出力オプションを変更できます。

- **Background**: `White`（白背景、デフォルト）または `Transparent`（透過背景）
- **Scale**: `1×`（標準）・`2×`（推奨、高解像度）・`3×`（最高解像度）

2× や 3× を選ぶとオフスクリーンキャンバスで拡大描画するため、プレゼン資料やポスター向けの高品質PNGを出力できます。設定はエクスポート／インポートでも保存されます。

## よくあるエラーと対処

`CSVまたはExcel（.xlsx）ファイルを選択してください`
: 対応外のファイルを選んでいます。拡張子が `.csv` または `.xlsx` のファイルを選んでください。

`.xls は未対応です`
: 旧Excel形式の `.xls` は今回は読み込めません。Excelなどで `.xlsx` に保存し直してください。

`このファイルにはありません`
: 選択したY列が、そのCSVには存在しません。別の列を選ぶか、そのCSVの表示をOFFにしてください。

`数値列が見つからない`
: 選んだCSVにグラフ化できる数値列がありません。列名や中身を確認してください。

文字化けする
: UTF-8とShift-JISはできる範囲で判定しますが、特殊な文字コードでは文字化けすることがあります。CSVをUTF-8で保存し直してください。

グラフが重い
: 大きいCSVでは自動で間引きます。さらに軽くしたい場合は、表示するCSVやY列を減らすか、`Markers` をOffにしてください。

点が多すぎる、または重なって見える
: 同じCSVの二重読み込み、選択Y列の増えすぎ、X列の重複が主な原因です。アプリは同一CSVを既定でスキップし、X重複はグラフ上の警告とファイル別診断に表示します。

サンプルボタンを押しても読み込まれない（Consoleに `real-samples` / `test-samples` の404）
: 配信パスとサンプルパスの不一致が原因です。最新版では修正済みなので、ブラウザをスーパーリロード（Ctrl+Shift+R）して最新のアプリを読み込んでください。Portable版の場合はzipが古い可能性があります（下記参照）。

Consoleに `favicon.ico 404` が出る
: 旧バージョンの名残です。最新版ではfaviconを同梱しており表示されません。アプリの動作には影響しません。

Portable版に統計・ヘルプ・Exportが表示されない
: 配布zipが古いバージョンです。最新の `release/CSVDataCompare-portable.zip` を入手し直すか、[docs/portable-release-checklist.md](docs/portable-release-checklist.md) の手順でzipを再生成してください。

## 統計量パネル（Phase 1）

CSV/Excelを読み込んだ後、画面下部の **Statistics** パネルで選択した列の統計量を計算できます。

各セクション見出し横の丸い **?** ボタンから、初心者向けの日本語ヘルプを開けます。

- **Statistics** の `?`: 各統計量の意味と比較の見方
- **Bivariate statistics** の `?`: 共分散・相関係数・R²の見方と注意点
- **Hypothesis Test** の `?`: p-value・alphaの意味、6種の検定の使い分け、判断の流れ
- **Formula builder** の `?`（Calculated columns内）: 数式の書き方・使える演算子/関数・計算不能行の扱い

ヘルプはEscキー・背景クリック・Closeボタンで閉じられます。

### 基本操作

1. **Dataset** で対象ファイルを選びます。
2. **Column** で統計量を出したい数値列を選びます。計算列も選択できます。
3. **Sample mode** でサンプル抽出方法を選びます。
4. **Compute statistics** を押します。

### Sample mode

| モード | 説明 |
|---|---|
| All filtered rows | Row filter適用後の全行を使用（デフォルト） |
| First n rows | 先頭n行 |
| Last n rows | 末尾n行 |
| Random n rows | seed固定のランダムn行（seed=42がデフォルト） |
| Row range | 指定した行番号の範囲（ヘッダー行を除いたデータ行番号） |

- 既存の **Row filter** が先に適用されます。その後に Sample mode が追加で適用されます。
- 結果には「After row filter: N rows / Statistics sample: M rows」と両方の件数が表示されます。

### 出力される統計量

| 統計量 | 説明 |
|---|---|
| Count (n) | 有効な数値の件数 |
| Missing | 欠損・非数値として除外した件数 |
| Mean | 平均 |
| Variance (unbiased) | 不偏分散（n-1除算） |
| Std dev | 標準偏差 |
| Min | 最小値 |
| Max | 最大値 |
| Median | 中央値 |

- 分散と標準偏差は n ≥ 2 のときのみ計算します。n = 1 の場合は「— (n < 2)」と表示されます。
- 欠損値、空欄、数値に変換できない値はすべて Missing としてカウントし、統計計算から除外します。

### 2変量統計（Phase 2）

Statisticsパネルの **Bivariate statistics** セクションでは、**Column A** と **Column B** を選んで2列間の関係を確認できます。

| 統計量 | 説明 |
|---|---|
| Valid pair count | 2列とも数値として使える行の件数 |
| Covariance (unbiased) | 不偏共分散（n-1除算） |
| Pearson correlation | Pearsonの相関係数 |
| R squared | 相関係数の二乗（r²） |

- 既存の **Row filter** と **Sample mode** を適用した後の行を使います。
- 欠損値、空欄、非数値を含む行は有効ペアから除外します。
- 有効ペア数が2未満の場合、共分散・相関係数・R²は計算しません。
- 片方の列の分散が0の場合、相関係数とR²は計算しません。

### 統計結果のExport

計算した統計結果は、後からレポートや研究資料に使える形で保存できます。

- **Export statistics JSON** / **Export statistics Markdown** — Statistics結果の下に表示されます。単変量統計と2変量統計、サンプル条件（Sample mode・行数）を含みます。
- **Export hypothesis JSON** / **Export hypothesis Markdown** — Hypothesis Test結果の下に表示されます。検定名、Sample A/B（dataset・column・group）、statistic、自由度、p-value、alpha、判定、効果量、注意文を含みます。
- ファイル名には結果種別・dataset名・日付が入ります（例: `statistics-result-sample-20260702.json`）。
- Markdownはそのままレポートに貼り付けられる表形式です。

### AI interpretation（実験的・任意機能・Phase L3）

Statisticsパネル最下部の **AI interpretation (optional)** から、ローカルPCで動く [Ollama](https://ollama.com) への接続を設定し、統計・仮説検定結果の要約をもとにAIによる考察を生成できます。

- デフォルトで無効（`Use local Ollama` チェックボックスOFF）です。有効にしない限り、この機能は一切通信しません。
- **Ollama endpoint は `http://localhost` または `http://127.0.0.1` のみ指定できます。** それ以外のURLはブラウザ側で拒否され、外部サーバーへ通信することはありません。
- 事前に [Ollama](https://ollama.com) をインストールし、モデルを取得しておく必要があります（例: `ollama pull llama3.2`）。
- Web版（GitHub Pages）から接続する場合、Ollama起動時に `OLLAMA_ORIGINS` の設定が必要な場合があります。うまく接続できない場合はPortable版（localhost配信）でお試しください。
- 設定（endpoint・モデル名・timeout・有効/無効）だけがブラウザに保存されます。**CSV/Excelのデータや統計結果、AIの生成結果は保存・送信されません。**

**考察の生成方法（Phase L3）:**

1. 先に **Statistics** または **Hypothesis Test** で結果を計算します（両方計算済みなら両方まとめて送信されます）。
2. `Use local Ollama` をONにし、endpoint・Model name・Timeoutを設定します。
3. `Generate interpretation` を押すと、統計・検定結果の要約（件数・平均・分散・p値・効果量など）だけをローカルのOllamaへ送り、日本語の考察文（結果の読み方・比較ポイント・注意点・考察のたたき台）を生成します。
4. 生成結果は `Copy result` でクリップボードにコピー、または `Download Markdown` でMarkdownファイルとして保存できます。
5. 実際に送信される内容は `Payload preview`（デフォルト折りたたみ）で確認できます。CSVの生データ・全行データ・座標値は送信対象に含まれません。
6. 生成結果・送信payloadはブラウザに保存されません。ページを再読み込みすると消えます。
7. 生成された考察はAIによる参考情報です。数値の正しさや最終的な解釈はご自身で確認してください。

設計の詳細は [docs/llm-payload-design.md](docs/llm-payload-design.md) と [docs/phase-l2-ollama-plan.md](docs/phase-l2-ollama-plan.md) を参照してください。

### 実装状況

- 仮説検定（1標本/2標本t検定・Welch・対応あり・F検定・相関の有意性検定） — 実装済み（下記「仮説検定パネル」参照）
- 統計結果のエクスポート（JSON/Markdown） — 実装済み（上記「統計結果のExport」参照）
- Ollama接続確認（Phase L2） — 実装済み。接続設定・疎通確認（上記「AI interpretation」参照）
- LLMによる考察生成（Phase L3） — 実装済み。`buildLlmPayload()`（`src/exportUtils.js`）で作成した要約payloadを、`generateInterpretation()`（`src/ollamaUtils.js`）経由でローカルOllamaの `/api/chat` に送信し、考察文を生成します（上記「AI interpretation」参照）。

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
npm run validate:excel
```

外部の実データフォルダを検証したい場合:

```powershell
node scripts/validate-real-data.mjs --dir "CSVフォルダへのパス"
```

配布版作成:

```powershell
npm run package:portable
```

`scripts/create-portable-package.ps1` は、配布物を作る前にbuildを実行し、古い `release/CSVDataCompare` と `release/CSVDataCompare-portable.zip` を削除してから再生成します。`npm` がPATHにない検証環境では、同梱Nodeを指定して次のように実行できます。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/create-portable-package.ps1 -NodePath "node.exeへのパス"
```

release再生成の完全な手順・確認項目は [docs/portable-release-checklist.md](docs/portable-release-checklist.md) を参照してください。

## ファイル構成

```text
src/App.jsx                     アプリ本体
src/dataUtils.js                CSV解析・列推定・数値化ロジック
src/xlsxUtils.js                Excel .xlsx 読み込みロジック
src/formulaUtils.js             evalを使わない安全な列計算ロジック
src/styles.css                  画面デザイン
scripts/validate-real-data.mjs  実データ・異常系検証
scripts/validate-excel-and-calculation.mjs Excel/列計算検証
scripts/generate-test-samples.mjs 異常系CSV生成
scripts/create-portable-package.ps1 配布版作成
scripts/portable-server.ps1     Node不要のローカルサーバー
public/real-samples/            実データ確認用CSV
public/test-samples/            異常系確認用CSVとExcel/列計算サンプル
release/CSVDataCompare/         配布用フォルダ
release/CSVDataCompare-portable.zip 配布用zip
```

## 既知の制限

- 配布版はブラウザで動くローカルアプリです。起動中はPowerShellウィンドウを閉じないでください。
- 起動時は通常 `8765` を使います。埋まっている場合は、近い空きポートを探してブラウザを開きます。
- 非常に巨大なCSV/Excelでは読み込みに時間がかかることがあります。
- Shift-JIS以外の特殊な文字コードは完全には保証していません。
- `.xlsx` はブラウザ上で読める範囲の標準的なワークシートに対応します。マクロ、外部リンク、画像、ピボット、古い `.xls` は読み込み対象外です。
- ExcelのヘッダーRowはデフォルト1行目ですが、ファイルカードの `Header row` 入力で変更できます。
- 計算列はブラウザ上の一時列です。元ファイルは変更しません。
- `public/real-samples/` は確認用です。本番利用では自分のCSV/Excelをドラッグ＆ドロップしてください。

## Part6: Excel、列計算、配布物整合性

Part6では、配布物が古いbuildを含まないように `scripts/create-portable-package.ps1` を更新しました。通常フォルダ版 `release/CSVDataCompare` とzip版 `release/CSVDataCompare-portable.zip` は、build後の同じ成果物から再生成されます。配布物内の `app/build-info.json` で生成時刻、`index.html` hash、asset名を確認できます。

Excel対応:

- `.xlsx` をドラッグ＆ドロップまたはファイル選択で読み込めます。
- 複数シートは `Sheet` で切り替えられます。
- シート切替後は列候補、数値列、診断、プレビューを再解析します。
- `.xls` は未対応です。
- ヘッダー行はデフォルト1行目ですが、ファイルカードの `Header row` 入力で変更できます。

列計算:

- 各ファイルカードの `Calculated columns` から派生列を追加できます。
- `eval()` は使わず、許可した演算子と関数だけを安全に評価します。
- 推奨する列名参照は `[列名]` 形式です。
- 計算不能行は空欄扱いになり、`Calculation warnings` に件数を表示します。
- 計算列はTime Series PlotのY列、XY Plotの `XY X` / `XY Y`、プレビュー、診断に反映されます。
- `Export processed CSV` で計算列を含むCSVを保存できます。

追加サンプル:

- `public/test-samples/sample-excel.xlsx`
- `public/test-samples/column-calculation.csv`
- `public/test-samples/column-calculation.xlsx`

追加検証:

```powershell
node scripts/validate-excel-and-calculation.mjs
```

## Part4: グループ分割と行範囲フィルタ

`20260525_1Comparison_timeseries.csv` のように、同じ `epoch` が `condition` ごとに繰り返されるCSVでは、各ファイルカードの `Group / Split column` で `condition` を選んでください。凡例は `ファイル名 | condition=normal | KF_E_m` のように表示され、同じX値を平均化せず、条件ごとの系列として比較できます。

- `Group / Split column`: `condition`, `mode`, `case`, `trial`, `run`, `experiment`, `label`, `group`, `pattern`, `method`, `scenario` などを優先して候補表示します。
- `Visible groups`: グループ値ごとに表示ON/OFFを切り替えます。`Select all` と `Clear all` で一括変更できます。
- `Row filter`: CSVのデータ行番号で開始行と終了行を指定します。ヘッダー行は数えません。空欄に戻して `Clear` を押すと全行表示に戻ります。
- Time Series Plot: 複数Y列とグループを同時に使えます。
- XY Plot: グループ列が選ばれている場合、E-Nなどの軌跡もグループ別に分かれ、開始点と終了点もグループごとに表示されます。
- X重複警告: 重複Xが多く、グループ候補がある場合は `condition` などの選択を提案します。重複行の削除や平均化は行いません。

診断情報には、`Rows after filter`, `Row filter`, `Group column`, `Group count`, `Visible groups`, `Suggested group columns`, `Trace count` が表示されます。実データ確認には次のコマンドを使えます。

```powershell
node scripts/validate-real-data.mjs --dir "D:\2025\strawberry_experiment\2019techno_イチゴ_Rchange\Data\20260525_1" --no-tests
```

`npm` がPowerShellで認識されない環境では、Node.jsをインストールしてPATHを通すか、配布版の `release/CSVDataCompare/Start CSV Data Compare.bat` を使ってください。

## Part5: 凡例、色、保存設定、PNG、文字サイズ

系列数が多い実験CSVでも比較しやすいように、グラフ表示の整理機能を追加しています。

### Legend mode

`グラフ設定` の `Legend mode` で凡例の表示を切り替えられます。

- `Full`: ファイル名、グループ名、列名をできるだけ表示します。
- `Compact`: グループ名と列名を中心に短く表示します。初期値です。
- `Hidden`: 凡例を非表示にします。

CompactやHiddenでも、グラフ上の点や線にマウスを重ねるとtooltipでフル情報を確認できます。表示系列が20以上になると、グループフィルタやY列選択を減らす案内が表示されます。

### グループ色

`Group / Split column` を使う場合、同じグループ値からハッシュを作って色を決めます。そのため、`normal` や `block_az0_60_ele70` など同じグループ値は、再読み込み後も同じ色になりやすくなっています。Time Series Plotではグループを色で固定し、E/N/Uなどの列は線種と凡例で区別する方針です。

ファイルカードの **Plot style** でColorを明示指定した場合は、グループ色よりもデータセット指定色を優先します。Colorが`Auto`なら従来通りグループごとの色分けを維持します。Line styleも`Auto`なら従来の自動線種を使い、明示指定した場合はTime Series PlotとXY Plotに反映されます。XY PlotのStart/End markerとPNG保存にも同じ設定が反映されます。

### グループフィルタ

グループフィルタには以下の操作があります。

- `Select all`: 全グループを表示します。
- `Clear all`: 全グループを非表示にします。
- `Invert`: 表示/非表示を反転します。
- `Search groups`: グループ数が多い場合に表示され、グループ名で絞り込めます。

`Visible groups (3/7)` のように、現在表示しているグループ数も確認できます。

### 行範囲フィルタ

`Row filter` の `Start row` / `End row` は、CSVのデータ行番号です。ヘッダー行は数えません。

- `Apply`: 入力した範囲を適用します。
- `Clear` または `All rows`: 全行表示に戻します。
- `First 500`: 先頭500データ行を表示します。
- `First 1000`: 先頭1000データ行を表示します。

適用後は、現在の行範囲と表示対象行数がカード内に表示されます。不正な範囲では警告を表示し、アプリが落ちないようにしています。

### 表示設定の保存、Reset、Export/Import

同じブラウザでは、以下の設定をlocalStorageに保存します。

- Legend mode
- X column / Y columns / XY X / XY Y
- Group / Split column
- 表示ON/OFF中のグループ
- Row filter
- データセットごとのPlot style（Color、Custom hex、Line style）
- 線幅、Markers、Marker size、Start/end marker size
- Equal scale
- グラフタイトル、軸ラベル、表示範囲
- 文字サイズ設定

CSVファイル自体はブラウザの制限で自動再読み込みできません。同じCSVを読み込み直したとき、ファイル名と列構成が一致すれば、ファイル別設定を復元します。

- `Reset display settings`: 表示設定とファイル別フィルタを初期化します。CSVデータ自体は画面に残ります。
- `Export settings`: 現在の表示設定をJSONで保存します。
- `Import settings`: JSON設定を読み込みます。他のPCや研究室内で同じ表示条件を共有できます。

### Current view

グラフ上部に現在の表示条件が表示されます。

- X
- Y
- Group
- Visible groups
- Row filter
- Trace count

PNG保存前に、どの条件で表示しているかを確認できます。

### PNG保存

保存ボタン名は表示モードに応じて変わります。

- Time Series Plot: `Save Time Series PNG`
- XY Plot: `Save XY Plot PNG`

PNGファイル名には、アプリ名、Plot type、X列、Group列、日時が入ります。

例:

```text
CSVDataCompare_TimeSeries_epoch_condition_2026-06-17-20-30.png
CSVDataCompare_XYPlot_XY_condition_2026-06-17-20-30.png
```

Codex内蔵ブラウザではダウンロード完了確認が制限される場合があります。通常のChromeやEdgeで開いた場合は、ブラウザの通常ダウンロードとしてPNGを保存できます。

### グラフ文字サイズ

`Text Style` で、レポート・卒論・発表資料向けに文字サイズを変更できます。

- `Title font size`: グラフタイトル。初期値18px、範囲8-36px。
- `Axis label font size`: X/Y軸ラベル。初期値14px、範囲8-30px。
- `Tick font size`: 目盛り文字。初期値12px、範囲8-24px。
- `Legend font size`: 凡例文字。初期値12px、範囲8-24px。

空欄、文字列、0、負の値、極端に大きい値は、許容範囲内または初期値へ丸めます。PNG保存時にも現在の文字サイズが反映されます。

### 系列数が多い・大きいCSVで重い場合

- Legend modeを`Compact`または`Hidden`にします。
- 表示するY列を減らします。
- グループフィルタで必要な条件だけONにします。
- `Markers`をOffにします。
- 行範囲フィルタで表示範囲を絞ります。

アプリは表示を軽くするため、系列あたり最大2500点に間引いて描画します。元CSVのデータを削除・平均化する処理ではありません。
