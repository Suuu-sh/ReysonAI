import { useMemo } from "react";
import { localized } from "../i18n.ts";
import { AGENT_TABLE } from "./characters.ts";
import { loadAgentHands, summarizeAgentHands } from "./agent-stats.ts";
import { AgentAvatar } from "./AgentAvatar.tsx";
import { toPoints } from "./session.ts";

const pct = (value: number | null) => value == null ? "—" : `${Math.round(value * 100)}%`;
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
const toneOf = (value: number) => value > 0 ? "up" : value < 0 ? "down" : "";

// Cumulative result in points, hand by hand, with a zero line.
function Trend({ values }: { values: number[] }) {
  const points = values.map(toPoints);
  if (points.length < 2) return <div className="agent-trend-empty">{localized("The trend appears after two hands.", "2ハンド以上で推移を表示します")}</div>;
  const width = 640, height = 150, padX = 6, padY = 14;
  const min = Math.min(0, ...points), max = Math.max(0, ...points), span = max - min || 1;
  const x = (i: number) => padX + i * (width - padX * 2) / (points.length - 1);
  const y = (v: number) => height - padY - (v - min) / span * (height - padY * 2);
  const line = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = points.at(-1)!;
  return <figure className="agent-trend">
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img"
      aria-label={localized(`Cumulative result over ${points.length} hands: ${signed(last)} points`, `${points.length}ハンドの累計収支：${signed(last)}点`)}>
      <defs><linearGradient id="agent-trend-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      <line className="zero" x1={padX} x2={width - padX} y1={y(0)} y2={y(0)} />
      <polygon className="area" points={`${x(0)},${y(0)} ${line} ${x(points.length - 1)},${y(0)}`} />
      <polyline points={line} vectorEffect="non-scaling-stroke" />
    </svg>
    <figcaption><span>{localized("Hand 1", "1ハンド目")}</span><span>{localized(`${points.length} hands`, `${points.length}ハンド`)}</span></figcaption>
  </figure>;
}

const STAT_HINTS: Record<string, [string, string]> = {
  VPIP: ["Hands you put money in voluntarily", "自分から参加したハンドの割合"],
  PFR: ["Hands you raised preflop", "プリフロップでレイズした割合"],
  "3bet": ["3bets when facing one raise", "1回レイズを受けた場面での3bet率"],
  F3B: ["Folds after your open was 3bet", "自分のオープンが3betされたときのフォールド率"],
  WTSD: ["Showdowns among flops seen", "フロップを見たハンドのうちショーダウンまで行った割合"],
  WSD: ["Showdowns won", "ショーダウンで勝った割合"],
};

// Agent戦: results against Reyson Agents, kept apart from the drill statistics.
export function AgentAnalysis() {
  const hands = useMemo(loadAgentHands, []);
  const s = useMemo(() => summarizeAgentHands(hands), [hands]);
  const net = toPoints(s.netBb);
  return <section className="analysis-card agent-analysis" aria-label={localized("Agent games", "Agent戦")}>
    <header className="agent-analysis-head">
      <div>
        <h2>{localized("Agent games", "Agent戦")}</h2>
        <small>{localized("Your hands at the Reyson Agent table · counted separately from drills", "Reyson Agent卓でのあなたのハンド · ドリルとは別に集計")}</small>
      </div>
      <span className="agent-analysis-faces" aria-hidden="true">{AGENT_TABLE.agents.map(agent => <AgentAvatar key={agent.id} id={agent.id} color={agent.color} size={30} />)}</span>
    </header>
    {!s.hands ? <div className="agent-analysis-empty">
        <p>{localized("No Agent games yet. Sit down at an Reyson Agent table in the trainer to see your results here.", "まだAgent戦の記録がありません。トレーナーのReyson Agent卓で対戦すると、ここに成績が表示されます。")}</p>
      </div> : <>
      <div className="agent-analysis-kpis">
        <div className="is-main"><span>{localized("Result", "収支")}</span><strong className={toneOf(net)}>{signed(net)}<small>{localized("pts", "点")}</small></strong></div>
        <div><span>BB/100</span><strong className={toneOf(s.bbPer100 ?? 0)}>{s.bbPer100 == null ? "—" : `${s.bbPer100 > 0 ? "+" : ""}${s.bbPer100.toFixed(1)}`}</strong></div>
        <div><span>{localized("Hands", "ハンド数")}</span><strong>{s.hands.toLocaleString()}</strong></div>
      </div>
      <Trend values={s.trend} />
      <dl className="agent-analysis-stats">
        {([["VPIP", s.vpip], ["PFR", s.pfr], ["3bet", s.threeBet], ["F3B", s.foldToThreeBet], ["WTSD", s.wtsd], ["WSD", s.wsd]] as [string, number | null][]).map(([key, value]) =>
          <div key={key} title={localized(STAT_HINTS[key][0], STAT_HINTS[key][1])}>
            <dt>{key === "F3B" ? localized("Fold to 3bet", "3betにフォールド") : key === "WSD" ? "W$SD" : key}</dt>
            <dd>{pct(value)}</dd>
            <small>{localized(STAT_HINTS[key][0], STAT_HINTS[key][1])}</small>
          </div>)}
      </dl>
      <p className="agent-analysis-note">{localized("Small samples swing a lot, and results include rake. Agents play the saved AI estimate (not GTO).", "ハンド数が少ないうちは大きくぶれます。収支はレーキ込みです。AgentはAI推定通りに打っており、GTOではありません。")}</p>
    </>}
  </section>;
}
