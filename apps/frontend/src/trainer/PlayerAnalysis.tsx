import { ArrowRight, ChartBar, Info, Target, TrendDown, TrendUp } from "@phosphor-icons/react";
import { AgentAnalysis } from "../agent/AgentAnalysis.tsx";
import "../agent/agent.css";
import { useLayoutEffect, useMemo, useState } from "react";
import { analyzePlayer, scoreProgress } from "./player-analysis.ts";
import { practiceHighlights, summarize } from "./trainer-store.ts";
import "./analysis.css";
import { localized } from "../i18n.ts";

const pct = value => value == null ? "—" : `${Math.round(value * 100)}%`;
const points = value => value == null ? "—" : `${value >= 0 ? "+" : ""}${Math.round(value * 100)}pt`;
const deltaTone = value => value == null || Math.abs(value) < 0.05 ? "even" : value > 0 ? "up" : "down";
const STYLE_SAMPLE_TARGET = 30;
// ±10pt from the policy counts as "near the baseline" (see player-analysis.ts plot scale: 30pt → 38%).
const BASELINE_RADIUS = 10 / 30 * 38;

// Counts a number up once on mount. Server render and reduced motion show the final value.
function CountUp({ value, duration = 900 }) {
  const [shown, setShown] = useState(value);
  useLayoutEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    let frame;
    const start = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    setShown(0);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{shown}</>;
}

function ScoreRing({ value }) {
  return <svg className="analysis-kpi-ring" viewBox="0 0 36 36" aria-hidden="true">
    <circle className="track" cx="18" cy="18" r="15" />
    <circle className="fill" cx="18" cy="18" r="15" pathLength="1" style={{ "--ring": value ?? 0 }} />
  </svg>;
}

// Long method notes stay available but out of the way.
function InfoTip({ label = "説明", children }) {
  return <details className="analysis-info">
    <summary aria-label={label} title={label}><Info size={14} /></summary>
    <div className="analysis-info-body">{children}</div>
  </details>;
}

function Kpi({ label, value, sub, accent, children }) {
  return <div className={`analysis-kpi${accent ? " accent" : ""}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    {sub && <small>{sub}</small>}
    {children}
  </div>;
}

function StyleMap({ analysis }) {
  const { plot, metrics, ready } = analysis;
  const active = plot ? `${plot.y <= 50 ? (plot.x <= 50 ? "tag" : "lag") : (plot.x <= 50 ? "tp" : "lp")}` : null;
  return <section className="analysis-card analysis-map" aria-labelledby="analysis-map-title">
    <header className="analysis-card-head">
      <h2 id="analysis-map-title">プレイスタイルマップ</h2>
      <InfoTip label="マップの見方">
        <p>中心は「今回出た問題の平均方針」です。横軸はフォールド頻度の差（右ほど参加が多い）、縦軸は対オープンでの3bet頻度の差（上ほど多い）。NITはタイト側に付く追加ラベルです。</p>
        <p>点は重複を除いた10問以上（オープン3問・対オープン5問以上）で表示し、30問に届くまでは暫定です。実戦の絶対的なプレイスタイルではありません。</p>
      </InfoTip>
    </header>
    <figure className="analysis-map-figure">
      <span className="axis-y" aria-hidden="true"><span>3bet 多</span><span>3bet 少</span></span>
      <div className="analysis-map-grid">
        {[["tag", "TAG"], ["lag", "LAG"], ["tp", "タイト・パッシブ"], ["lp", "ルース・パッシブ"]].map(([key, label]) =>
          <div key={key} className={`analysis-quadrant q-${key}${active === key ? " is-active" : ""}`}><b>{label}</b></div>)}
        <span className="analysis-map-baseline" aria-hidden="true" style={{ "--r": `${BASELINE_RADIUS}%` }}><small>基準付近</small></span>
        <span className="analysis-map-center" aria-hidden="true" title="方針" />
        {plot && <svg className="analysis-map-trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="50" y1="50" x2={plot.x} y2={plot.y} pathLength="1" />
        </svg>}
        {plot ? <span className={`analysis-map-marker${plot.y > 70 ? " label-above" : ""}`} style={{ left: `${plot.x}%`, top: `${plot.y}%` }}
          role="img" aria-label={`あなたの練習位置。参加頻度は推定方針から${points(-metrics.fold.delta)}、3betは${points(metrics.threeBet.delta)}。${ready ? "" : "暫定表示。"}`}>
          <i /><b>あなた{ready ? "" : " · 暫定"}</b>
        </span> : <span className="analysis-map-wait">10問以上で表示</span>}
      </div>
      <figcaption className="axis-x"><span>← タイト</span><span>ルース →</span></figcaption>
    </figure>
  </section>;
}

// One track per action: your rate as a bar, the estimate as a tick.
function ActionRow({ title, detail, metric, index }) {
  const tone = deltaTone(metric.delta);
  return <li className="analysis-action" style={{ "--i": index }}>
    <div className="analysis-action-label"><strong>{title}</strong><small>{detail} · {metric.count}問</small></div>
    <div className="analysis-action-track" aria-hidden="true">
      <b style={{ width: `${(metric.actual ?? 0) * 100}%` }} />
      {metric.expected != null && <i style={{ left: `${metric.expected * 100}%` }} />}
    </div>
    <div className="analysis-action-values"><strong>{pct(metric.actual)}</strong><small>推定 {pct(metric.expected)}</small></div>
    <span className={`analysis-delta ${tone}`}>{points(metric.delta)}</span>
  </li>;
}

function ActionComparison({ analysis }) {
  const { metrics, bySpot } = analysis;
  return <section className="analysis-card analysis-actions" aria-labelledby="analysis-actions-title">
    <header className="analysis-card-head">
      <h2 id="analysis-actions-title">アクションの選び方</h2>
      <span className="analysis-legend"><b className="mine" />あなた<i className="policy" />推定方針</span>
      <InfoTip label="比較の方法">
        <p>出題された問題ごとの推定頻度を平均して、あなたの選択率と比べます。混合・境界ハンドを多めに出すため、実戦のVPIP・PFRとは一致しません。差分 = あなた − 推定方針。</p>
      </InfoTip>
    </header>
    <ul className="analysis-action-list">
      <ActionRow index={0} title="フォールド" detail="全局面" metric={metrics.fold} />
      <ActionRow index={1} title="オープン" detail="先に行動" metric={metrics.open} />
      <ActionRow index={2} title="コール" detail="vs オープン" metric={metrics.call} />
      <ActionRow index={3} title="3bet" detail="vs オープン" metric={metrics.threeBet} />
    </ul>
    {bySpot.length > 0 && <div className="analysis-spot-diff">
      <h3>フォールド差が大きい局面</h3>
      <ul>{bySpot.slice(0, 3).map((spot, index) => <li key={spot.id} style={{ "--i": index }}>
        <span>{spot.label}<small>{spot.count}問</small></span>
        <small>{pct(spot.actual)} / 推定 {pct(spot.expected)}</small>
        <b className={deltaTone(spot.delta)}>{points(spot.delta)}</b>
      </li>)}</ul>
    </div>}
  </section>;
}

function ScoreChart({ progress }) {
  const left = 28, right = 712, top = 8, bottom = 100;
  const x = index => left + (progress.series.length === 1 ? (right - left) / 2 : index * (right - left) / (progress.series.length - 1));
  const y = value => bottom - value * (bottom - top);
  const line = progress.series.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  return <section className="analysis-card analysis-score" aria-labelledby="analysis-score-title">
    <header className="analysis-card-head">
      <h2 id="analysis-score-title">ReysonAI Score の推移</h2>
      <span className="analysis-caption">保存済みレンジとの一致度</span>
      <InfoTip label="スコアの計算方法">
        <p>各回答を同じ局面・ハンドの推定頻度と比べ、「選んだ行動の頻度 ÷ 最頻行動の頻度」で採点します。線は直近10回答の移動平均です（復習の再回答も含む）。推定方針が更新されると過去分も再計算されます。</p>
      </InfoTip>
    </header>
    <svg className="analysis-score-chart" viewBox="0 0 720 112" preserveAspectRatio="none" role="img"
      aria-label={localized(`ReysonAI Score over time. ${progress.answered} answers; average of the last ${progress.recentCount} answers: ${pct(progress.current)}.`, `ReysonAI Score の推移。${progress.answered}回答、直近${progress.recentCount}回答の平均は${pct(progress.current)}。`)}>
      <defs><linearGradient id="score-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      {[1, 0.5, 0].map(level => <g key={level}><line className="grid" x1={left} x2={right} y1={y(level)} y2={y(level)} /><text x="0" y={y(level) + 3.5}>{level * 100}</text></g>)}
      {progress.series.length > 1 && <polygon className="area" points={`${left},${bottom} ${line} ${x(progress.series.length - 1)},${bottom}`} />}
      {progress.series.length > 1 && <polyline className="analysis-score-line" points={line} pathLength="1" />}
      <circle className="point-ring" cx={x(progress.series.length - 1)} cy={y(progress.current)} r="4" />
      <circle className="point" cx={x(progress.series.length - 1)} cy={y(progress.current)} r="4" />
    </svg>
    <div className="analysis-score-axis"><span>1回答目</span><span>{progress.answered}回答目</span></div>
  </section>;
}

function HighlightCard({ title, items, empty, tone, children }) {
  return <section className={`analysis-card analysis-highlight ${tone}`} aria-label={title}>
    <header className="analysis-card-head"><h2>{tone === "strength" ? <TrendUp size={15} weight="bold" /> : <TrendDown size={15} weight="bold" />}{title}</h2></header>
    {items.length ? <ul>{items.map((item, index) => <li key={`${item.kind}-${item.key}`} style={{ "--i": index }}>
      <span><small>{item.kind} · {item.answered}問{item.provisional ? " · 暫定" : ""}</small><strong>{item.label}</strong></span>
      <b>{pct(item.rate)}</b>
    </li>)}</ul> : <p className="analysis-empty">{empty}</p>}
    {children}
  </section>;
}

function guidanceNotes(metrics) {
  const notes = [];
  if (metrics.fold.delta >= 0.10) notes.push(localized("You fold more often than the estimate. Review borderline hands that can open or call in the range table.", "フォールドが多め。オープン・コールを選べる境界のハンドをレンジ表で確認。"));
  if (metrics.fold.delta <= -0.10) notes.push(localized("You participate more often than the estimate. Check whether you continue too often with high-fold-frequency hands.", "参加が広め。フォールド頻度の高いハンドを続けすぎていないか確認。"));
  if (metrics.threeBet.count >= 10 && metrics.threeBet.delta <= -0.10) notes.push(localized("You 3-bet less often. Review value and blocker 3-bet candidates in response-to-open drills.", "3betが少なめ。対オープンのドリルでバリューとブロッカーの3bet候補を復習。"));
  if (metrics.threeBet.count >= 10 && metrics.threeBet.delta >= 0.10) notes.push(localized("You 3-bet more often. Review hands that mix calls and folds.", "3betが多め。コールやフォールドを混ぜるハンドを見直し。"));
  if (metrics.call.count >= 10 && metrics.call.delta >= 0.10) notes.push(localized("You call more often. Check your position and the opponent's opening position before continuing.", "コールが多め。ポジションと相手のオープン位置を確認してから続ける。"));
  if (!notes.length) notes.push(localized("No major imbalance stands out. Keep practicing your weaker spots and hands.", "大きな偏りはありません。苦手な局面とハンドを中心に練習を続けましょう。"));
  return notes.slice(0, 3);
}

export function PlayerAnalysis({ history, onStart, onOpenWeakness }) {
  const analysis = useMemo(() => analyzePlayer(history), [history]);
  const progress = useMemo(() => scoreProgress(history), [history]);
  const stats = useMemo(() => summarize(history), [history]);
  const highlights = useMemo(() => practiceHighlights(stats), [stats]);
  const { metrics } = analysis;
  const scoreDelta = progress.series.length > progress.windowSize ? progress.current - progress.series.at(-1 - progress.windowSize) : null;
  const styleProgress = Math.min(1, analysis.samples / STYLE_SAMPLE_TARGET);

  return <div className="player-analysis">
    <header className="analysis-heading">
      <div>
        <span className="analysis-eyebrow"><ChartBar size={14} />PRACTICE INSIGHTS</span>
        <h1>プレー分析</h1>
      </div>
      <button type="button" className="analysis-start" onClick={onStart}>練習する<ArrowRight size={15} /></button>
    </header>

    <div className="analysis-kpis">
      <Kpi label="ReysonAI Score" accent value={progress.current == null ? "—" : <><CountUp value={Math.round(progress.current * 100)} /><small>%</small></>}
        sub={scoreDelta == null ? `直近${progress.recentCount || 10}回答の平均${progress.recentCount && progress.recentCount < progress.windowSize ? " · 暫定" : ""}` : <span className={deltaTone(scoreDelta)}>{points(scoreDelta)} · 10回答前比</span>}>
        <ScoreRing value={progress.current} />
      </Kpi>
      <Kpi label="正答率" value={stats.answered ? <><CountUp value={Math.round(stats.rate * 100)} /><small>%</small></> : "—"} sub={`${stats.answered}回答`} />
      <Kpi label="プレイスタイル" value={analysis.ready ? analysis.style.label : "判定中"} sub={analysis.ready ? "練習での傾向（暫定）" : `${analysis.samples} / ${STYLE_SAMPLE_TARGET}問`}>
        {!analysis.ready && <span className="analysis-kpi-bar" aria-hidden="true"><i style={{ width: `${styleProgress * 100}%` }} /></span>}
      </Kpi>
      <Kpi label="出題の内訳" value={<><CountUp value={analysis.openSamples} /><small>オープン</small> <CountUp value={analysis.responseSamples} /><small>vs オープン</small></>}
        sub={analysis.ready ? `${analysis.distinctSpots}局面` : "判定には各10問・3局面以上"} />
    </div>

    <div className="analysis-main">
      <StyleMap analysis={analysis} />
      {analysis.samples ? <ActionComparison analysis={analysis} /> : <section className="analysis-card analysis-welcome">
        <span className="analysis-welcome-icon"><Target size={22} weight="duotone" /></span>
        <h2>まずは練習から</h2>
        <p>オープン・コール・3bet・フォールドの選び方を記録し、推定方針との差からプレースタイルを見つけます。</p>
        <button type="button" className="analysis-start" onClick={onStart}>ドリルを選ぶ<ArrowRight size={15} /></button>
      </section>}
    </div>
    {analysis.samples > 0 && <>
      {progress.answered > 0 && <ScoreChart progress={progress} />}
      <div className="analysis-bottom" aria-label="練習結果の強みと弱点">
        <HighlightCard title="強み" tone="strength" items={highlights.strengths} empty="5問以上で正答率80%以上の項目はまだありません。" />
        <HighlightCard title="弱点" tone="weakness" items={highlights.weaknesses} empty="判定できる弱点データはまだありません。">
          {highlights.reviewCount > 0 && <p className="analysis-review"><strong>復習待ち {highlights.reviewCount}ハンド</strong>{highlights.review.map(item => item.label).join("、")}{highlights.reviewCount > highlights.review.length ? " など" : ""}</p>}
          <button type="button" className="analysis-link" onClick={onOpenWeakness}>弱点の詳細を見る<ArrowRight size={13} /></button>
        </HighlightCard>
        <section className="analysis-card analysis-guidance" aria-label="次の練習ポイント">
          <header className="analysis-card-head"><h2><Target size={15} weight="bold" />次の練習ポイント</h2></header>
          <ul>{guidanceNotes(metrics).map((note, index) => <li key={note} style={{ "--i": index }}>{note}</li>)}</ul>
        </section>
      </div>
    </>}

    <AgentAnalysis />

    <p className="analysis-footnote">
      練習問題での選択傾向です（強み・弱点は5問以上で80%以上／60%以下、3〜4問は暫定）。回答はこのブラウザ内だけに保存されます。
    </p>
  </div>;
}
