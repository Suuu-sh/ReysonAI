import { ArrowRight, ChartBar, Target } from "@phosphor-icons/react";
import { useMemo } from "react";
import { analyzePlayer, scoreProgress } from "./player-analysis.js";
import { practiceHighlights, summarize } from "./trainer-store.js";

const pct = value => value == null ? "—" : `${Math.round(value * 100)}%`;
const points = value => value == null ? "—" : `${value >= 0 ? "+" : ""}${Math.round(value * 100)}pt`;

function ComparisonRow({ title, detail, metric }) {
  return <div className="analysis-comparison-row">
    <div className="analysis-comparison-label"><strong>{title}</strong><small>{detail} · {metric.count}問</small></div>
    <div className="analysis-comparison-bars">
      <div><span>あなた</span><i aria-hidden="true"><b className="mine" style={{ width: `${(metric.actual ?? 0) * 100}%` }} /></i><strong>{pct(metric.actual)}</strong></div>
      <div><span>推定方針</span><i aria-hidden="true"><b className="policy" style={{ width: `${(metric.expected ?? 0) * 100}%` }} /></i><strong>{pct(metric.expected)}</strong></div>
    </div>
    <b className={`analysis-delta${metric.delta > 0.005 ? " up" : metric.delta < -0.005 ? " down" : ""}`}>{points(metric.delta)}</b>
  </div>;
}

function Guidance({ analysis }) {
  const { metrics } = analysis;
  const notes = [];
  if (metrics.fold.delta >= 0.10) notes.push("フォールドが多めです。オープン・コールを選べる境界のハンドを、レンジ表で確認しましょう。");
  if (metrics.fold.delta <= -0.10) notes.push("参加が広めです。フォールド頻度の高いハンドを続けすぎていないか確認しましょう。");
  if (metrics.threeBet.count >= 10 && metrics.threeBet.delta <= -0.10) notes.push("3betが少なめです。対オープンのドリルで、バリューとブロッカーを使う3bet候補を復習しましょう。");
  if (metrics.threeBet.count >= 10 && metrics.threeBet.delta >= 0.10) notes.push("3betが多めです。コールやフォールドを混ぜるハンドを見直しましょう。");
  if (metrics.call.count >= 10 && metrics.call.delta >= 0.10) notes.push("コールが多めです。ポジションと相手のオープン位置を確認してから続けましょう。");
  if (!notes.length) notes.push("大きな行動の偏りは見えていません。苦手な局面とハンドを確認し、練習を続けましょう。");
  return <section className="analysis-card analysis-guidance"><h2><Target size={19} />次の練習ポイント</h2>
    <ul>{notes.slice(0, 3).map(note => <li key={note}>{note}</li>)}</ul>
  </section>;
}

function StyleMap({ analysis }) {
  const { plot, metrics, ready } = analysis;
  return <section className="analysis-card analysis-map" aria-labelledby="analysis-map-title">
    <div className="analysis-section-heading"><div><h2 id="analysis-map-title">プレイスタイルマップ</h2>
      <p>同じ問題のAI推定方針を中心に、あなたの選び方がどちらへ寄るかを示します。</p></div></div>
    <figure className="analysis-map-figure">
      <div className="analysis-map-y-top">3betが多い · アグレッシブ</div>
      <div className="analysis-map-grid">
        <div className="analysis-quadrant"><b>TAG</b><small>タイト × アグレッシブ</small></div>
        <div className="analysis-quadrant"><b>LAG</b><small>ルース × アグレッシブ</small></div>
        <div className="analysis-quadrant"><b>タイト・パッシブ</b><small>参加を絞り、コール中心</small></div>
        <div className="analysis-quadrant"><b>ルース・パッシブ</b><small>コール過多はこの方向</small></div>
        <span className="analysis-map-center" aria-hidden="true" title="AI推定方針の中心" />
        {plot ? <span className={`analysis-map-marker${plot.y > 70 ? " label-above" : ""}`} style={{ left: `${plot.x}%`, top: `${plot.y}%` }}
          role="img" aria-label={`あなたの練習位置。参加頻度は推定方針から${points(-metrics.fold.delta)}、3betは${points(metrics.threeBet.delta)}。${ready ? "" : "暫定表示。"}`}>
          <i /><b>あなた{ready ? "" : " · 暫定"}</b>
        </span> : <span className="analysis-map-wait">回答が増えると、ここに点を表示します</span>}
      </div>
      <div className="analysis-map-y-bottom">3betが少ない · パッシブ</div>
      <figcaption className="analysis-map-x"><span>← タイト · 参加が少ない</span><span>ルース · 参加が多い →</span></figcaption>
    </figure>
    <p className="analysis-map-note">横軸はフォールドの差、縦軸は対オープンでの3betの差です。NITは主にタイト側に付く追加ラベルです。中心は「今回出た問題に対するAI推定方針」で、実戦の絶対的なプレイスタイルではありません。{!plot && "点は重複を除いた10問以上（オープン3問・対オープン5問以上）で表示します。"}</p>
  </section>;
}

function ScoreProgress({ progress }) {
  if (!progress.answered) return null;
  const left = 32, right = 700, top = 12, bottom = 138;
  const x = index => left + (progress.series.length === 1 ? (right - left) / 2 : index * (right - left) / (progress.series.length - 1));
  const y = value => bottom - value * (bottom - top);
  const points = progress.series.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const lastX = x(progress.series.length - 1), lastY = y(progress.current);
  return <section className="analysis-card analysis-score" aria-labelledby="analysis-score-title">
    <div className="analysis-score-heading">
      <div><span className="analysis-eyebrow">POLICY ALIGNMENT</span><h2 id="analysis-score-title">Solvea AI Score</h2>
        <p>保存済みAI推定方針との一致度の推移</p></div>
      <div className="analysis-score-value"><strong>{Math.round(progress.current * 100)}<small>%</small></strong><span>直近{progress.recentCount}回答の平均{progress.recentCount < progress.windowSize ? " · 暫定" : ""}</span></div>
    </div>
    <figure className="analysis-score-figure">
      <svg viewBox="0 0 720 168" role="img" aria-label={`Solvea AI Score の推移。${progress.answered}回答、直近${progress.recentCount}回答の平均は${Math.round(progress.current * 100)}%。`} preserveAspectRatio="none">
        <line className="analysis-score-grid" x1={left} x2={right} y1={top} y2={top} />
        <line className="analysis-score-grid" x1={left} x2={right} y1={y(0.5)} y2={y(0.5)} />
        <line className="analysis-score-grid" x1={left} x2={right} y1={bottom} y2={bottom} />
        <text x="0" y={top + 4}>100</text><text x="5" y={y(0.5) + 4}>50</text><text x="11" y={bottom + 4}>0</text>
        {progress.series.length > 1 && <polyline className="analysis-score-line" points={points} />}
        <circle className="analysis-score-point" cx={lastX} cy={lastY} r="5" />
      </svg>
      <figcaption><span>1回答目</span><span>{progress.answered}回答目</span></figcaption>
    </figure>
    <p className="analysis-score-note">各回答を同じ局面・ハンドの推定頻度と比較し、選んだ行動の頻度 ÷ 最頻行動の頻度で採点。線は直近10回答の移動平均です（復習の再回答も含む）。現在保存されている推定方針で再計算されます。GTOスコア・EV損失・勝率ではありません。</p>
  </section>;
}

function HighlightCard({ title, items, empty, tone, review, reviewCount, onOpenWeakness }) {
  return <section className={`analysis-card analysis-highlight-card ${tone}`} aria-label={title}>
    <h2>{title}</h2>
    {items.length ? <ul>{items.map(item => <li key={`${item.kind}-${item.key}`}>
      <span><small>{item.kind} · {item.answered}問{item.provisional ? " · 暫定" : ""}</small><strong>{item.label}</strong></span>
      <b>{pct(item.rate)}</b>
    </li>)}</ul> : <p className="analysis-empty">{empty}</p>}
    {tone === "weakness" && reviewCount > 0 && <div className="analysis-review">
      <strong>復習待ち {reviewCount}ハンド</strong>
      <p>{review.map(item => item.label).join("、")}{reviewCount > review.length ? " など" : ""}</p>
    </div>}
    {tone === "weakness" && onOpenWeakness && <button type="button" className="analysis-detail-link" onClick={onOpenWeakness}>弱点の詳細を見る<ArrowRight size={14} /></button>}
  </section>;
}

export function PlayerAnalysis({ history, onStart, onOpenWeakness }) {
  const analysis = useMemo(() => analyzePlayer(history), [history]);
  const progress = useMemo(() => scoreProgress(history), [history]);
  const highlights = useMemo(() => practiceHighlights(summarize(history)), [history]);
  const { metrics } = analysis;
  return <div className="player-analysis">
    <header className="analysis-heading">
      <div><span className="analysis-eyebrow"><ChartBar size={16} /> PRACTICE INSIGHTS</span><h1>プレー分析</h1>
        <p>練習で選んだアクションを、同じ局面・同じハンドの保存済みAI推定方針と比べます。</p></div>
      <button type="button" className="analysis-start" onClick={onStart}>練習する<ArrowRight size={16} /></button>
    </header>

    <StyleMap analysis={analysis} />

    <ScoreProgress progress={progress} />

    {!analysis.ready && <p className="analysis-notice" role="status">傾向判定には、重複を除いて30問以上（オープン・対オープン各10問以上、計3局面以上）が必要です。現在はオープン {analysis.openSamples}問・対オープン {analysis.responseSamples}問です。</p>}

    {!analysis.samples ? <section className="analysis-card analysis-welcome">
      <span className="analysis-welcome-icon"><Target size={25} weight="duotone" /></span>
      <h2>まずは練習から</h2>
      <p>オープン・コール・3bet・フォールドの選び方を記録し、推定方針との差からプレースタイルを見つけます。</p>
      <button type="button" className="analysis-start" onClick={onStart}>ドリルを選ぶ<ArrowRight size={16} /></button>
    </section> : <>
    <section className="analysis-card" aria-label="アクション傾向の比較">
      <div className="analysis-section-heading"><div><h2>アクションの選び方</h2><p>出題された問題ごとの推定頻度を平均して比較。出題範囲の違いによる偏りを抑えます。</p></div><span>差分 = あなた − 推定方針</span></div>
      <div className="analysis-comparisons">
        <ComparisonRow title="フォールド" detail="全局面" metric={metrics.fold} />
        <ComparisonRow title="オープン" detail="先に行動する局面" metric={metrics.open} />
        <ComparisonRow title="コール" detail="相手のオープンに対して" metric={metrics.call} />
        <ComparisonRow title="3bet" detail="相手のオープンに対して" metric={metrics.threeBet} />
      </div>
    </section>

    <div className="analysis-highlights" aria-label="練習結果の強みと弱点">
      <HighlightCard title="強み" tone="strength" items={highlights.strengths} empty="正答率80%以上の局面・ハンド種類は、まだありません。" />
      <HighlightCard title="弱点" tone="weakness" items={highlights.weaknesses} empty="まだ判定できる弱点データがありません。"
        review={highlights.review} reviewCount={highlights.reviewCount} onOpenWeakness={onOpenWeakness} />
    </div>
    <p className="analysis-highlight-note">強みは5問以上で正答率80%以上、弱点は5問以上で60%以下を目安に表示します。3～4問の弱点候補は「暫定」とし、実戦の実力評価ではありません。</p>

    <div className="analysis-bottom">
      <section className="analysis-card analysis-spots"><h2>差が大きい局面</h2><p>各局面で5種類以上のハンドを解いた場合のみ表示します。</p>
        {analysis.bySpot.length ? <ul>{analysis.bySpot.slice(0, 5).map(spot => <li key={spot.id}>
          <span><strong>{spot.label}</strong><small>{spot.count}問 · フォールド</small></span>
          <b>{points(spot.delta)}</b><small>{pct(spot.actual)} / 推定 {pct(spot.expected)}</small>
        </li>)}</ul> : <p className="analysis-empty">まだ比較できる局面がありません。</p>}
      </section>
      <Guidance analysis={analysis} />
    </div></>}
    <p className="analysis-footnote">これは練習問題での選択傾向です。実戦のVPIP・PFRや性格、勝率の判定ではありません。問題は混合・境界ハンドを多めに出し、比較先もGTO解ではなくAI推定です。SBのオープン練習では、提示される選択肢だけに条件づけて比較します。回答はこのブラウザ内だけに保存されます。</p>
  </div>;
}
