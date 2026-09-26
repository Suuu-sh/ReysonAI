import { ArrowRight, ChartBar, Target } from "@phosphor-icons/react";
import { useMemo } from "react";
import { analyzePlayer } from "./player-analysis.js";

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

export function PlayerAnalysis({ history, onStart }) {
  const analysis = useMemo(() => analyzePlayer(history), [history]);
  const { metrics } = analysis;
  return <div className="player-analysis">
    <header className="analysis-heading">
      <div><span className="analysis-eyebrow"><ChartBar size={16} /> PRACTICE INSIGHTS</span><h1>プレー分析</h1>
        <p>練習で選んだアクションを、同じ局面・同じハンドの保存済みAI推定方針と比べます。</p></div>
      <button type="button" className="analysis-start" onClick={onStart}>練習する<ArrowRight size={16} /></button>
    </header>

    <section className={`analysis-hero style-${analysis.style.key}`} aria-label="練習中のプレースタイル">
      <div><span className="analysis-kicker">現在の練習傾向</span><strong>{analysis.style.label}</strong><p>{analysis.style.explanation}</p></div>
      <dl><div><dt>回答履歴</dt><dd>{analysis.answered}<small>問</small></dd></div>
        <div><dt>重複を除いた問題</dt><dd>{analysis.samples}<small>問</small></dd></div>
        <div><dt>分析した局面</dt><dd>{analysis.distinctSpots}<small>局面</small></dd></div></dl>
    </section>

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
