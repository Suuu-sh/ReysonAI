import type { CSSProperties, ReactNode } from "react";
import type { Icon } from "@phosphor-icons/react";
import type { AnswerEntry, RankState } from "./types.ts";
type PlayerAnalysisModel = ReturnType<typeof analyzePlayer>;
interface BreakdownCounts { total: number; best: number; mixed: number; miss: number; score: number }
interface BreakdownRow extends BreakdownCounts { key: string; label: string }
import { ArrowRight, Barbell, CalendarBlank, ChartLineUp, Cards, Crosshair, Info, Robot, Trophy, Target, TrendDown, TrendUp } from "@phosphor-icons/react";
import { AgentAnalysis } from "../agent/AgentAnalysis.tsx";
import { PlayStyleDashboard, StyleZones, type StyleZone } from "../agent/PlayStyleDashboard.tsx";
import { StyleAvatar } from "../agent/StyleAvatar.tsx";
import { STYLES } from "../agent/player-read.ts";
import { practiceAnimal, PRACTICE_EXPLANATIONS } from "./practice-style.ts";
import { RankedStats } from "./RankedStats.tsx";
import { playerRead } from "../agent/player-read.ts";
import { loadAgentHands } from "../agent/agent-stats.ts";
import "../agent/agent.css";
import { useLayoutEffect, useMemo, useState } from "react";
import { analyzePlayer, scoreProgress } from "./player-analysis.ts";
import { practiceHighlights, summarize } from "./trainer-store.ts";
import { CATEGORY_LABELS, handCategory, spotById } from "./trainer-data.ts";
import "./analysis.css";
import { localized } from "../i18n.ts";

const pct = (value: number | null | undefined) => value == null ? "—" : `${Math.round(value * 100)}%`;
const points = (value: number | null | undefined) => value == null ? "—" : `${value >= 0 ? "+" : ""}${Math.round(value * 100)}pt`;
const deltaTone = (value: number | null | undefined) => value == null || Math.abs(value) < 0.05 ? "even" : value > 0 ? "up" : "down";
const STYLE_SAMPLE_TARGET = 30;
// ±10pt from the policy counts as "near the baseline" (see player-analysis.ts plot scale: 30pt → 38%).
const BASELINE_RADIUS = 10 / 30 * 38;

// Counts a number up once on mount. Server render and reduced motion show the final value.
function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  useLayoutEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
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

// Long method notes stay available but out of the way.
function InfoTip({ label = "説明", children }: { label?: string; children: ReactNode }) {
  return <details className="analysis-info">
    <summary aria-label={label} title={label}><Info size={14} /></summary>
    <div className="analysis-info-body">{children}</div>
  </details>;
}

function Kpi({ label, icon: Icon, value, sub, accent, compact, children }: { label: ReactNode; icon?: Icon; value: ReactNode; sub?: ReactNode; accent?: boolean; compact?: boolean; children?: ReactNode }) {
  return <div className={`analysis-kpi${accent ? " accent" : ""}${compact ? " compact" : ""}`}>
    <span className="analysis-kpi-label">{Icon && <i aria-hidden="true"><Icon size={16} /></i>}{label}</span>
    <strong>{value}</strong>
    {sub && <small>{sub}</small>}
    {children}
  </div>;
}

// Practice style zones, in map percent. They mirror analyzePlayer's rules: x = 50 - fold delta / 0.30 * 38,
// y = 50 - 3bet delta / 0.30 * 38 (fold 0.10 → 37.3, 0.15 → 31; 3bet 0.10 → 37.3, 0.05 → 43.7). The
// calling-heavy style also needs more calls, which the map doesn't plot; it sits on the loose, non-3bet side.
const PX = { nit: 31, tight: 37.3, loose: 62.7 }, PY = { more: 37.3, nit: 43.7, less: 62.7 };
const PRACTICE_ZONES: StyleZone[] = [
  { id: "tag", x: [0, PX.tight], y: [0, PY.more] },
  { id: "tight_passive", x: [PX.nit, PX.tight], y: [PY.more, 100] },
  { id: "tight_passive", x: [0, PX.nit], y: [PY.more, PY.nit], label: false },
  { id: "nit", x: [0, PX.nit], y: [PY.nit, 100] },
  { id: "aggressive", x: [PX.tight, PX.loose], y: [0, PY.more] },
  { id: "balanced", x: [PX.tight, PX.loose], y: [PY.more, PY.less] },
  { id: "passive", x: [PX.tight, PX.loose], y: [PY.less, 100] },
  { id: "lag", x: [PX.loose, 100], y: [0, PY.more] },
  { id: "station", x: [PX.loose, 100], y: [PY.more, 100] },
];

function StyleMap({ analysis }: { analysis: PlayerAnalysisModel }) {
  const { plot, metrics, ready } = analysis;
  const animal = practiceAnimal(analysis);
  return <section className="analysis-card analysis-map" aria-labelledby="analysis-map-title">
    <header className="analysis-card-head">
      <h2 id="analysis-map-title">プレイスタイルマップ</h2>
      <InfoTip label="マップの見方">
        <p>中心は「今回出た問題の平均方針」です。横軸はフォールド頻度の差（右ほど参加が多い）、縦軸は対オープンでの3bet頻度の差（上ほど多い）。NITはタイト側に付く追加ラベルです。</p>
        <p>点は重複を除いた10問以上（オープン3問・対オープン5問以上）で表示し、30問に届くまでは暫定です。実戦の絶対的なプレイスタイルではありません。</p>
      </InfoTip>
    </header>
    <figure className="analysis-map-figure">
      <span className="axis-y" aria-hidden="true"><span>↑<br />3bet 多</span><span>3bet 少<br />↓</span></span>
      <div className="analysis-map-grid">
        <StyleZones zones={PRACTICE_ZONES} current={analysis.ready ? animal.id : null} />
        <span className="analysis-map-baseline" aria-hidden="true" style={{ "--r": `${BASELINE_RADIUS}%` } as CSSProperties}><small>基準付近</small></span>
        <span className="analysis-map-center" aria-hidden="true" title="方針" />
        {plot && <svg className="analysis-map-trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="50" y1="50" x2={plot.x} y2={plot.y} pathLength="1" />
        </svg>}
        {plot ? <span className={`analysis-map-marker${ready ? " with-animal" : ""}${plot.y > 70 ? " label-above" : ""}`} style={{ left: `${plot.x}%`, top: `${plot.y}%` } as CSSProperties}
          role="img" aria-label={`あなたの練習位置。参加頻度は推定方針から${points(-metrics.fold.delta!)}、3betは${points(metrics.threeBet.delta)}。${ready ? "" : "暫定表示。"}`}>
          <>{ready ? <StyleAvatar id={animal.id} color={animal.color} size={36} /> : <i />}</><b>あなた{ready ? "" : " · 暫定"}</b>
        </span> : <span className="analysis-map-wait">10問以上で表示</span>}
      </div>
      <figcaption className="axis-x"><span>← タイト</span><span>ルース →</span></figcaption>
    </figure>
  </section>;
}

// One track per action: your rate as a bar, the estimate as a tick.
function ActionRow({ title, detail, metric, index }: { title: string; detail: string; metric: PlayerAnalysisModel["metrics"]["fold"]; index: number }) {
  const tone = deltaTone(metric.delta);
  return <li className="analysis-action" style={{ "--i": index } as CSSProperties}>
    <div className="analysis-action-label"><strong>{title}</strong><small>{detail} · {metric.count}問</small></div>
    <div className="analysis-action-track" aria-hidden="true">
      <b style={{ width: `${(metric.actual ?? 0) * 100}%` } as CSSProperties} />
      {metric.expected != null && <i style={{ left: `${metric.expected * 100}%` } as CSSProperties} />}
    </div>
    <div className="analysis-action-values"><strong>{pct(metric.actual)}</strong><small>推定 {pct(metric.expected)}</small></div>
    <span className={`analysis-delta ${tone}`}>{points(metric.delta)}</span>
  </li>;
}

function ActionComparison({ analysis }: { analysis: PlayerAnalysisModel }) {
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
      <ul>{bySpot.slice(0, 3).map((spot, index) => <li key={spot.id} style={{ "--i": index } as CSSProperties}>
        <span>{spot.label}<small>{spot.count}問</small></span>
        <small>{pct(spot.actual)} / 推定 {pct(spot.expected)}</small>
        <b className={deltaTone(spot.delta)}>{points(spot.delta)}</b>
      </li>)}</ul>
    </div>}
  </section>;
}

function ScoreChart({ progress }: { progress: ReturnType<typeof scoreProgress> }) {
  const left = 28, right = 712, top = 8, bottom = 100;
  const x = (index: number) => left + (progress.series.length === 1 ? (right - left) / 2 : index * (right - left) / (progress.series.length - 1));
  const y = (value: number | null) => bottom - value! * (bottom - top);
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

function HighlightCard({ title, items, empty, tone, children }: { title: string; items: ReturnType<typeof practiceHighlights>["strengths"]; empty: string; tone: string; children?: ReactNode }) {
  return <section className={`analysis-card analysis-highlight ${tone}`} aria-label={title}>
    <header className="analysis-card-head"><h2>{tone === "strength" ? <TrendUp size={15} weight="bold" /> : <TrendDown size={15} weight="bold" />}{title}</h2></header>
    {items.length ? <ul>{items.map((item, index) => <li key={`${item.kind}-${item.key}`} style={{ "--i": index } as CSSProperties}>
      <span><small>{item.kind} · {item.answered}問{item.provisional ? " · 暫定" : ""}</small><strong>{item.label}</strong></span>
      <b>{pct(item.rate)}</b>
    </li>)}</ul> : <p className="analysis-empty">{empty}</p>}
    {children}
  </section>;
}

const PERIODS: [string, string, number | null][] = [["all", "全期間", null], ["30d", "30日", 30], ["7d", "7日", 7]];
const KINDS = [["all", "すべて"], ["open", "オープン"], ["response", "vs オープン"]];
const BREAKDOWNS = [["spot", "局面"], ["position", "ポジション"], ["category", "ハンド種類"]];

// Answers grouped by spot, the hero's position or hand category, with the best / mixed / miss split.
function breakdownRows(history: AnswerEntry[], by: string) {
  const rows = new Map<string, BreakdownRow>();
  for (const entry of history) {
    const spot = spotById.get(entry.spotId);
    if (!spot) continue;
    const key = by === "position" ? spot.hero : by === "category" ? handCategory(entry.hand) : spot.id;
    const label = by === "position" ? spot.hero : by === "category" ? CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS] : spot.kind === "open" ? `${spot.hero} オープン` : `${spot.hero} vs ${spot.opener}`;
    const row = rows.get(key) ?? { key, label, total: 0, best: 0, mixed: 0, miss: 0, score: 0 };
    row.total++; row[entry.result] = (row[entry.result] ?? 0) + 1; row.score += entry.score;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

function Breakdown({ history }: { history: AnswerEntry[] }) {
  const [by, setBy] = useState("spot");
  const rows = useMemo(() => breakdownRows(history, by), [history, by]);
  const all = useMemo(() => breakdownRows(history, "all"), [history]);
  const share = (row: BreakdownCounts, key: "best" | "mixed" | "miss") => row.total ? Math.round(row[key] / row.total * 1000) / 10 : 0;
  const line = (row: BreakdownCounts & { key?: string }, label: string, strong?: boolean) => <tr key={row.key ?? label} className={strong ? "is-total" : ""}>
    <th scope="row">{label}</th>
    <td>{row.total}</td>
    <td className="tone-best">{share(row, "best")}</td>
    <td className="tone-mixed">{share(row, "mixed")}</td>
    <td className="tone-miss">{share(row, "miss")}</td>
    <td>{row.total ? Math.round(row.score / row.total * 100) : 0}</td>
  </tr>;
  const total = all.reduce((sum, row) => ({ total: sum.total + row.total, best: sum.best + row.best, mixed: sum.mixed + row.mixed, miss: sum.miss + row.miss, score: sum.score + row.score }), { total: 0, best: 0, mixed: 0, miss: 0, score: 0 });
  return <section className="analysis-card stats-breakdown" aria-labelledby="stats-breakdown-title">
    <h2 id="stats-breakdown-title" className="stats-sr">回答の内訳</h2>
    <div className="stats-tabs" role="tablist" aria-label="内訳の切り口">
      {BREAKDOWNS.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={by === value} className={by === value ? "on" : ""} onClick={() => setBy(value)}>{label}</button>)}
    </div>
    <div className="stats-table-wrap">
      <table className="stats-table">
        <thead><tr><th scope="col" /><th scope="col">回答</th><th scope="col" className="tone-best">ベスト %</th><th scope="col" className="tone-mixed">混合で可 %</th><th scope="col" className="tone-miss">ミス %</th><th scope="col">スコア</th></tr></thead>
        <tbody>
          {line(total, "すべて", true)}
          {rows.map(row => line(row, row.label))}
        </tbody>
      </table>
    </div>
  </section>;
}

function guidanceNotes(metrics: PlayerAnalysisModel["metrics"]) {
  const notes = [];
  if (metrics.fold.delta! >= 0.10) notes.push(localized("You fold more often than the estimate. Review borderline hands that can open or call in the range table.", "フォールドが多め。オープン・コールを選べる境界のハンドをレンジ表で確認。"));
  if (metrics.fold.delta! <= -0.10) notes.push(localized("You participate more often than the estimate. Check whether you continue too often with high-fold-frequency hands.", "参加が広め。フォールド頻度の高いハンドを続けすぎていないか確認。"));
  if (metrics.threeBet.count >= 10 && metrics.threeBet.delta! <= -0.10) notes.push(localized("You 3-bet less often. Review value and blocker 3-bet candidates in response-to-open drills.", "3betが少なめ。対オープンのドリルでバリューとブロッカーの3bet候補を復習。"));
  if (metrics.threeBet.count >= 10 && metrics.threeBet.delta! >= 0.10) notes.push(localized("You 3-bet more often. Review hands that mix calls and folds.", "3betが多め。コールやフォールドを混ぜるハンドを見直し。"));
  if (metrics.call.count >= 10 && metrics.call.delta! >= 0.10) notes.push(localized("You call more often. Check your position and the opponent's opening position before continuing.", "コールが多め。ポジションと相手のオープン位置を確認してから続ける。"));
  if (!notes.length) notes.push(localized("No major imbalance stands out. Keep practicing your weaker spots and hands.", "大きな偏りはありません。苦手な局面とハンドを中心に練習を続けましょう。"));
  return notes.slice(0, 3);
}

export function PlayerAnalysis({ history: allHistory, onStart, onOpenWeakness, rank = null, rankedReady = false, initialView = "drills" }: { history: AnswerEntry[]; onStart: () => void; onOpenWeakness: () => void; rank?: RankState | null; rankedReady?: boolean; initialView?: string }) {
  const [period, setPeriod] = useState("all");
  const [kind, setKind] = useState("all");
  const history = useMemo(() => {
    const days = PERIODS.find(([value]) => value === period)?.[2];
    const since = days ? Date.now() - days * 86400000 : null;
    return allHistory.filter(entry => (since == null || (entry.at ?? 0) >= since) &&
      (kind === "all" || spotById.get(entry.spotId)?.kind === kind));
  }, [allHistory, period, kind]);
  const analysis = useMemo(() => analyzePlayer(history), [history]);
  const progress = useMemo(() => scoreProgress(history), [history]);
  const stats = useMemo(() => summarize(history), [history]);
  const highlights = useMemo(() => practiceHighlights(stats), [stats]);
  const { metrics } = analysis;
  const scoreDelta = progress.series.length > progress.windowSize ? progress.current! - progress.series.at(-1 - progress.windowSize)! : null;
  const styleProgress = Math.min(1, analysis.samples / STYLE_SAMPLE_TARGET);
  const [view, setView] = useState(initialView);
  const animal = practiceAnimal(analysis);
  const agentRead = useMemo(() => view === "agent" ? playerRead(loadAgentHands()) : null, [view]);

  return <div className="player-analysis">
    <header className="trainer-home-head stats-page-head">
      <div><h1 className="trainer-home-eyebrow">STATS</h1>
        <p>{view === "agent" ? "Agent卓での収支と、Agentが読んでいるあなたの打ち方を振り返ります。" : view === "ranked" ? localized("Review server-confirmed ranked results separately from drills.", "サーバーで確定したランク戦の結果を、ドリルと分けて振り返ります。") : localized("Compare drill choices with the saved ranges for the same questions.", "ドリルでの選び方を、同じ問題の保存済みレンジと比べて振り返ります。")}</p></div>
      <button type="button" className="mode-primary analysis-start" onClick={onStart}>練習する<ArrowRight size={15} /></button>
    </header>
    <div className="stats-toolbar">
      <div className="stats-seg" role="group" aria-label="分析の対象">
        {([["drills", localized("Drills", "ドリル練習"), Barbell], ...(rankedReady ? [["ranked", localized("Ranked match", "ランク戦"), Trophy]] : []), ["agent", localized("Agent matches", "Agent戦"), Robot]] as [string, string, Icon][]).map(([value, label, Icon]) =>
          <button key={value} type="button" className={view === value ? "on" : ""} aria-pressed={view === value} onClick={() => setView(value)}><Icon size={15} />{label}</button>)}
      </div>
      {view === "drills" && <>
        <div className="stats-seg" role="group" aria-label="絞り込み">
          {KINDS.map(([value, label]) => <button key={value} type="button" className={kind === value ? "on" : ""} aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}
        </div>
        <div className="stats-seg stats-seg-period" role="group" aria-label="期間">
          <CalendarBlank size={15} aria-hidden="true" />
          {PERIODS.map(([value, label]) => <button key={value} type="button" className={period === value ? "on" : ""} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}
        </div>
      </>}
    </div>

    {view === "agent" ? <div className="analysis-agent">
      <AgentAnalysis />
      {agentRead && <div className="analysis-card analysis-agent-read"><PlayStyleDashboard read={agentRead} /></div>}
    </div> : view === "ranked" ? <RankedStats rank={rank!} ready={rankedReady} /> : <>

    <div className="analysis-kpis">
      <Kpi label="ReysonAI Score" icon={ChartLineUp} accent value={progress.current == null ? "—" : <><CountUp value={Math.round(progress.current * 100)} /><small>%</small></>}
        sub={scoreDelta == null ? `直近${progress.recentCount || 10}回答の平均${progress.recentCount && progress.recentCount < progress.windowSize ? " · 暫定" : ""}` : <span className={deltaTone(scoreDelta)}>{points(scoreDelta)}{localized(" · versus 10 answers ago", " · 10回答前比")}</span>}>
      </Kpi>
      <Kpi label="正答率" icon={Crosshair} value={stats.answered ? <><CountUp value={Math.round(stats.rate * 100)} /><small>%</small></> : "—"} sub={`${stats.answered}回答`} />
      <Kpi label="プレイスタイル" icon={Target} value={<span className="analysis-animal-kpi"><StyleAvatar id={animal.id} color={animal.color} size={40} />{analysis.ready ? analysis.style.label : "判定中"}</span>} sub={analysis.ready ? "練習での傾向（暫定）" : `${analysis.samples} / ${STYLE_SAMPLE_TARGET}問`}>
        {!analysis.ready && <span className="analysis-kpi-bar" aria-hidden="true"><i style={{ width: `${styleProgress * 100}%` } as CSSProperties} /></span>}
      </Kpi>
      <Kpi label="出題の内訳" icon={Cards} compact value={<><CountUp value={analysis.openSamples} /><small>オープン</small> <CountUp value={analysis.responseSamples} /><small>vs オープン</small></>}
        sub={analysis.ready ? `${analysis.distinctSpots}局面` : "判定には各10問・3局面以上"} />
    </div>

    <section className="analysis-card practice-animals" aria-label={localized("Drill play styles", "ドリルのプレイスタイル")}>
      <p>{localized("Animals describe deviations from the estimate for the same drill questions, not Agent-table VPIP/PFR or real-money play.", "動物は同じドリル問題の推定方針との差を表します。Agent卓のVPIP・PFRや実戦の打ち方の判定ではありません。")}</p>
      <ol className="style-roster">{(["nit", "tight_passive", "tag", "passive", "balanced", "aggressive", "station", "lag"] as const).map(id => {
        const style = STYLES[id], current = animal.id === id;
        return <li key={id} className={current ? "is-current" : ""} aria-current={current ? "true" : undefined} style={{ "--style": style.color } as CSSProperties}>
          <StyleAvatar id={id} color={style.color} size={40} dim={!current} /><span>{localized(style.mascot.en, style.mascot.ja)}</span>
        </li>;
      })}</ol>
      <p>{localized(PRACTICE_EXPLANATIONS[analysis.style.key], analysis.style.explanation)}</p>
    </section>

    {history.length > 0 && <Breakdown history={history} />}

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
          <ul>{guidanceNotes(metrics).map((note, index) => <li key={note} style={{ "--i": index } as CSSProperties}>{note}</li>)}</ul>
        </section>
      </div>
    </>}

    </>}

    {view === "drills" && <p className="analysis-footnote">
      練習問題での選択傾向です（強み・弱点は5問以上で80%以上／60%以下、3〜4問は暫定）。回答はこのブラウザ内だけに保存されます。
      <br />{localized("New ranked answers are excluded. Older untagged history may contain ranked answers and cannot be separated.", "今後のランク戦回答は除外します。種別のない旧履歴はランク戦回答が混在している可能性があり、分離できません。")}
    </p>}
  </div>;
}
