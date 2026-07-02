export function UnivariateHelpContent() {
  return (
    <>
      <h4>各統計量の意味</h4>
      <dl className="help-term-list">
        <div>
          <dt>Count (n)</dt>
          <dd>計算に使えた数値データの個数です。</dd>
        </div>
        <div>
          <dt>Missing</dt>
          <dd>空欄、NaN、非数値などで計算から除外された個数です。</dd>
        </div>
        <div>
          <dt>Mean（平均値）</dt>
          <dd>全体の代表値ですが、外れ値に影響されやすい点に注意してください。</dd>
        </div>
        <div>
          <dt>Variance（分散）</dt>
          <dd>値のばらつきを表します。大きいほど散らばりが大きいことを意味します。</dd>
        </div>
        <div>
          <dt>Std dev（標準偏差）</dt>
          <dd>分散の平方根です。元のデータに近い単位でばらつきを見られます。</dd>
        </div>
        <div>
          <dt>Min / Max</dt>
          <dd>最小値と最大値です。外れ値や異常値の確認にも使えます。</dd>
        </div>
        <div>
          <dt>Median（中央値）</dt>
          <dd>値を並べたときの真ん中の値です。外れ値に強い代表値です。</dd>
        </div>
      </dl>

      <h4>比較の見方</h4>
      <ul>
        <li>平均が違う → 全体の水準が違う可能性があります。</li>
        <li>標準偏差が大きい → データが不安定・ばらつきが大きい可能性があります。</li>
        <li>平均と中央値が大きく違う → 外れ値や偏った分布の可能性があります。</li>
        <li>Missingが多い → 結果の信頼性に注意してください。</li>
        <li>Sample modeを変えると、どの範囲のデータを見るかを切り替えられます。</li>
      </ul>
    </>
  );
}

export function BivariateHelpContent() {
  return (
    <>
      <h4>各項目の意味</h4>
      <dl className="help-term-list">
        <div>
          <dt>Valid pair count</dt>
          <dd>2列とも数値として使えた行数です。</dd>
        </div>
        <div>
          <dt>Excluded pairs</dt>
          <dd>片方または両方が欠損・非数値のため除外された行数です。</dd>
        </div>
        <div>
          <dt>Covariance（共分散）</dt>
          <dd>
            2つの値が同じ方向に動きやすいかを見る値です。正なら同じ方向、負なら逆方向の傾向があります。
            単位に依存するため、強さの比較には相関係数の方が見やすいです。
          </dd>
        </div>
        <div>
          <dt>Pearson correlation（相関係数）</dt>
          <dd>
            -1から1の範囲で線形関係の強さを見ます。1に近いほど同じ方向、-1に近いほど逆方向、
            0に近いほど線形関係が弱いことを意味します。
          </dd>
        </div>
        <div>
          <dt>R squared（決定係数）</dt>
          <dd>相関係数を2乗した値です。2つの変数の線形関係の強さを0から1で見る目安になります。</dd>
        </div>
      </dl>

      <h4>注意</h4>
      <ul>
        <li>相関が高くても因果関係があるとは限りません。</li>
        <li>外れ値に影響されます。</li>
        <li>非線形な関係はPearson相関では見えにくいです。</li>
        <li>時系列データでは、同じ時刻・同じ行で比較しているかが重要です。</li>
      </ul>
    </>
  );
}

export function HypothesisHelpContent() {
  return (
    <>
      <h4>基本</h4>
      <ul>
        <li>仮説検定は「差がありそうか」を数値的に判断するための方法です。</li>
        <li>p-value は「差がないと仮定したときに、今のような結果が出る珍しさ」です。</li>
        <li>alpha は判定基準です。よく使うのは 0.05 です。</li>
        <li>p-value &lt; alpha なら Significant（有意）と表示されます。</li>
        <li>p-value &gt;= alpha なら Not significant と表示されます。</li>
        <li>Significant は「実用上大きな差がある」と同じ意味ではありません。</li>
      </ul>

      <h4>各検定の使い分け</h4>
      <dl className="help-term-list">
        <div>
          <dt>One-sample t-test</dt>
          <dd>1つの列の平均が基準値 μ₀ と違うかを見ます。例: 誤差平均が0と違うか。</dd>
        </div>
        <div>
          <dt>Independent t-test</dt>
          <dd>独立した2グループの平均を比較します。等分散を仮定します。</dd>
        </div>
        <div>
          <dt>Welch&#39;s t-test</dt>
          <dd>
            独立した2グループの平均を比較します。分散が違っても使いやすく、
            迷ったらこちらを優先してよいです。
          </dd>
        </div>
        <div>
          <dt>Paired t-test</dt>
          <dd>同じ対象・同じ時刻・同じ行で対応する2列を比較します。例: 補正前と補正後。</dd>
        </div>
        <div>
          <dt>F-test</dt>
          <dd>2グループの分散が違うかを見ます。平均差を見る検定ではありません。</dd>
        </div>
        <div>
          <dt>Correlation significance test</dt>
          <dd>Pearson相関が0と違うかを見ます。ただし相関は因果を意味しません。</dd>
        </div>
      </dl>

      <h4>使い方の流れ</h4>
      <ol>
        <li>まずグラフを見る</li>
        <li>平均・中央値・標準偏差・欠損数を見る</li>
        <li>比較したい目的を決める</li>
        <li>平均差なら t-test / Welch</li>
        <li>対応のある比較なら Paired t-test</li>
        <li>ばらつき比較なら F-test</li>
        <li>2列の関係なら Correlation</li>
        <li>p-valueだけでなく、平均差・効果量・グラフも一緒に見る</li>
      </ol>

      <h4>注意</h4>
      <ul>
        <li>サンプル数が少ないと判断は不安定です。</li>
        <li>外れ値に注意してください。</li>
        <li>正規性などの仮定を完全には自動確認していません。</li>
        <li>検定結果は判断材料の1つであり、最終判断ではありません。</li>
      </ul>
    </>
  );
}
