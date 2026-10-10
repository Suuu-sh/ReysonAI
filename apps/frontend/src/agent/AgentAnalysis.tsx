import { useMemo } from "react";
import { localized } from "../i18n.ts";
import { AGENT_TABLE } from "./characters.ts";
import { loadAgentHands, summarizeAgentHands, type AgentHandRecord } from "./agent-stats.ts";
import { AGENT_BASELINE } from "./player-read.ts";
import { Cards, ChartLineUp, Coins } from "@phosphor-icons/react";
import { ffCopy as t } from "../trainer/fastfold-api.ts";
import { DivergingBars, lastDays, PanelHead, rollingRate, Sparkline, StatPanel, thin, TimeSeries } from "../trainer/stats-charts.tsx";
import { AgentAvatar } from "./AgentAvatar.tsx";
import { toPoints } from "./session.ts";

const pct = (value: number | null) => value == null ? "—" : `${Math.round(value * 100)}%`;
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString()}`;
const toneOf = (value: number) => value > 0 ? "up" : value < 0 ? "down" : "";

const STAT_HINTS: Record<string, [string, string]> = {
  VPIP: ["Hands you put money in voluntarily", "自分から参加したハンドの割合"],
  PFR: ["Hands you raised preflop", "プリフロップでレイズした割合"],
  "3bet": ["3bets when facing one raise", "1回レイズを受けた場面での3bet率"],
  F3B: ["Folds after your open was 3bet", "自分のオープンが3betされたときのフォールド率"],
  WTSD: ["Showdowns among flops seen", "フロップを見たハンドのうちショーダウンまで行った割合"],
  WSD: ["Showdowns won", "ショーダウンで勝った割合"],
};

const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const AGENT_SUMMARY = (): [string, string, string, string] => [t("Min", "最小", "最小", "Mín."), t("Avg", "平均", "平均", "Media"), t("Max", "最大", "最大", "Máx."), t("Last", "現在", "当前", "Actual")];

// Net bb/100 per seat the human played, most-played order kept fixed by table position.
function byPosition(hands: AgentHandRecord[]) {
  const rows = new Map<string, { hands: number; net: number }>();
  for (const hand of hands) {
    const row = rows.get(hand.pos) ?? { hands: 0, net: 0 };
    row.hands++; row.net += hand.returnBb;
    rows.set(hand.pos, row);
  }
  return [...rows.entries()].sort(([a], [b]) => (POSITIONS.indexOf(a) + 1 || 99) - (POSITIONS.indexOf(b) + 1 || 99))
    .map(([pos, row]) => ({ id: pos, label: pos, value: row.net / row.hands * 100, note: localized(`${row.hands} hands`, `${row.hands}ハンド`) }));
}

// Agent戦: results against Reyson Agents, kept apart from the drill statistics.
export function AgentAnalysis() {
  const hands = useMemo(loadAgentHands, []);
  const s = useMemo(() => summarizeAgentHands(hands), [hands]);
  const net = toPoints(s.netBb);
  const cumulative = useMemo(() => s.trend.map(toPoints), [s]);
  const bbRate = useMemo(() => rollingRate(hands, hand => hand.returnBb, 100).map(value => value * 100), [hands]);
  const vpip = useMemo(() => rollingRate(hands, hand => +hand.vpip, 100), [hands]);
  const pfr = useMemo(() => rollingRate(hands, hand => +hand.pfr, 100), [hands]);
  const threeBet = useMemo(() => rollingRate(hands.filter(hand => hand.threeBetOpp), hand => +hand.threeBet, 50), [hands]);
  const perDay = useMemo(() => lastDays(14).map(day => hands.filter(hand => hand.at >= day.start && hand.at < day.end).length), [hands]);
  const positions = useMemo(() => byPosition(hands), [hands]);
  const base = (value: number) => t(`Agent baseline ${pct(value)}`, `Agent基準 ${pct(value)}`, `Agent基准 ${pct(value)}`, `Referencia Agent ${pct(value)}`);
  return <section className="agent-analysis stats-agent" aria-label={localized("Agent games", "Agent戦")}>
    <header className="agent-analysis-head stats-source">
      <span className="agent-analysis-faces" aria-hidden="true">{AGENT_TABLE.agents.map(agent => <AgentAvatar key={agent.id} id={agent.id} color={agent.color} size={22} />)}</span>
      <h2>{localized("Agent games", "Agent戦")}</h2>
      <small>{localized("Your hands at the Reyson Agent table · counted separately from drills", "Reyson Agent卓でのあなたのハンド · ドリルとは別に集計")}</small>
    </header>
    {!s.hands ? <div className="analysis-card agent-analysis-empty">
        <p>{localized("No Agent games yet. Sit down at an Reyson Agent table in the trainer to see your results here.", "まだAgent戦の記録がありません。トレーナーのReyson Agent卓で対戦すると、ここに成績が表示されます。")}</p>
      </div> : <>
      <div className="analysis-kpis stats-panels agent-analysis-kpis">
        <StatPanel label={localized("Result", "収支")} icon={Coins} accent value={<span className={toneOf(net)}>{signed(net)}<small>{localized("pts", "点")}</small></span>}
          sub={t("Cumulative, rake included", "累計・レーキ込み", "累计·含抽水", "Acumulado, con rake")} spark={<Sparkline values={thin(cumulative)} />} />
        <StatPanel label="BB/100" icon={ChartLineUp} value={<span className={toneOf(s.bbPer100 ?? 0)}>{s.bbPer100 == null ? "—" : `${s.bbPer100 > 0 ? "+" : ""}${s.bbPer100.toFixed(1)}`}</span>}
          sub={t("Rolling 100 hands", "直近100ハンドの移動値", "最近100手滚动", "Media móvil de 100 manos")} spark={<Sparkline values={thin(bbRate)} />} />
        <StatPanel label={localized("Hands", "ハンド数")} icon={Cards} value={s.hands.toLocaleString()}
          sub={t(`${perDay.slice(-7).reduce((a, b) => a + b, 0)} in the last 7 days`, `直近7日 ${perDay.slice(-7).reduce((a, b) => a + b, 0)}ハンド`, `最近7天 ${perDay.slice(-7).reduce((a, b) => a + b, 0)}手`, `${perDay.slice(-7).reduce((a, b) => a + b, 0)} en 7 días`)}
          spark={<Sparkline kind="bars" values={perDay} min={0} />} />
        <StatPanel label="VPIP" value={pct(s.vpip)} sub={base(AGENT_BASELINE.vpip)} spark={<Sparkline values={thin(vpip)} min={0} max={1} />} />
        <StatPanel label="PFR" value={pct(s.pfr)} sub={base(AGENT_BASELINE.pfr)} spark={<Sparkline values={thin(pfr)} min={0} max={1} />} />
        <StatPanel label="3bet" value={pct(s.threeBet)} sub={base(AGENT_BASELINE.threeBet)} spark={<Sparkline values={thin(threeBet)} min={0} />} />
      </div>
      <div className="stats-grid">
        <section className="analysis-card stats-span-8" aria-labelledby="agent-trend-title">
          <PanelHead id="agent-trend-title" title={t("Cumulative result", "累計収支", "累计收益", "Resultado acumulado")} caption={localized("pts", "点")} />
          <TimeSeries series={[{ id: "net", label: localized("Result", "収支"), values: cumulative }]} zero height={168}
            format={value => signed(Math.round(value))} summaryLabels={AGENT_SUMMARY()}
            xLabel={index => localized(`Hand ${index + 1}`, `${index + 1}ハンド目`)}
            ariaLabel={localized(`Cumulative result over ${cumulative.length} hands: ${signed(net)} points`, `${cumulative.length}ハンドの累計収支：${signed(net)}点`)} />
        </section>
        <section className="analysis-card stats-span-4" aria-labelledby="agent-position-title">
          <PanelHead id="agent-position-title" title={t("BB/100 by position", "ポジション別 BB/100", "按位置 BB/100", "BB/100 por posición")} />
          <DivergingBars rows={positions} format={value => `${value > 0 ? "+" : ""}${value.toFixed(1)}`} ariaLabel={t("BB/100 by position", "ポジション別 BB/100", "按位置 BB/100", "BB/100 por posición")} />
          <dl className="agent-analysis-stats">
            {([["F3B", s.foldToThreeBet], ["WTSD", s.wtsd], ["WSD", s.wsd]] as [string, number | null][]).map(([key, value]) =>
              <div key={key} title={localized(STAT_HINTS[key][0], STAT_HINTS[key][1])}>
                <dt>{key === "F3B" ? localized("Fold to 3bet", "3betにフォールド") : key === "WSD" ? "W$SD" : key}</dt>
                <dd>{pct(value)}</dd>
              </div>)}
          </dl>
        </section>
      </div>
      <p className="agent-analysis-note">{localized("Small samples swing a lot, and results include rake. Agents play the saved AI estimate (not GTO).", "ハンド数が少ないうちは大きくぶれます。収支はレーキ込みです。AgentはAI推定通りに打っており、GTOではありません。")}</p>
    </>}
  </section>;
}
