import { useMemo } from "react";
import { Robot } from "@phosphor-icons/react";
import { localized } from "../i18n.ts";
import { agentTableById } from "./characters.ts";
import { loadAgentHands, summarizeAgentHands } from "./agent-stats.ts";
import { toPoints } from "./session.ts";

const pct = (value: number | null) => value == null ? "—" : `${Math.round(value * 100)}%`;
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString()}`;

function Trend({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const width = 520, height = 110, pad = 8;
  const min = Math.min(0, ...values), max = Math.max(0, ...values), span = max - min || 1;
  const x = (i: number) => pad + i * (width - pad * 2) / (values.length - 1);
  const y = (v: number) => height - pad - (v - min) / span * (height - pad * 2);
  return <svg className="agent-trend" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={localized("Cumulative result", "累計収支の推移")}>
    <line className="zero" x1={pad} x2={width - pad} y1={y(0)} y2={y(0)} />
    <polyline points={values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} />
  </svg>;
}

// Agent戦: results against Evion Agents, kept apart from the drill statistics.
export function AgentAnalysis() {
  const hands = useMemo(loadAgentHands, []);
  const s = useMemo(() => summarizeAgentHands(hands), [hands]);
  return <section className="analysis-card agent-analysis" aria-label="Agent戦">
    <header className="analysis-card-head">
      <h2><Robot size={15} weight="bold" />{localized("Agent games", "Agent戦")}</h2>
      <span className="analysis-caption">{localized("Hands at Evion Agent tables · separate from drills", "Evion Agent卓でのハンド · ドリルとは別集計")}</span>
    </header>
    {!s.hands ? <p className="agent-analysis-empty">{localized("Sit down at an Evion Agent table in the trainer to see your results here.", "トレーナーのEvion Agent卓で対戦すると、ここに成績が表示されます。")}</p> : <>
      <div className="agent-analysis-kpis">
        <div><span>{localized("Result", "収支")}</span><strong className={s.netBb >= 0 ? "up" : "down"}>{signed(toPoints(s.netBb))}<small>{localized("pts", "点")}</small></strong></div>
        <div><span>BB/100</span><strong className={(s.bbPer100 ?? 0) >= 0 ? "up" : "down"}>{s.bbPer100 == null ? "—" : `${s.bbPer100 > 0 ? "+" : ""}${s.bbPer100.toFixed(1)}`}</strong></div>
        <div><span>{localized("Hands", "ハンド数")}</span><strong>{s.hands.toLocaleString()}</strong></div>
      </div>
      <Trend values={s.trend} />
      <dl className="agent-analysis-stats">
        {[["VPIP", s.vpip], ["PFR", s.pfr], [localized("3bet", "3bet"), s.threeBet], [localized("Fold to 3bet", "3betにフォールド"), s.foldToThreeBet],
          ["WTSD", s.wtsd], ["W$SD", s.wsd]].map(([label, value]) => <div key={label as string}><dt>{label}</dt><dd>{pct(value as number | null)}</dd></div>)}
      </dl>
      <table className="agent-analysis-tables">
        <thead><tr><th>{localized("Table", "テーブル")}</th><th>{localized("Hands", "ハンド")}</th><th>{localized("Result", "収支")}</th><th>BB/100</th></tr></thead>
        <tbody>{s.tables.map(row => {
          const table = agentTableById(row.tableId);
          return <tr key={row.tableId}><td>{table ? localized(table.name.en, table.name.ja) : row.tableId}</td><td>{row.hands}</td>
            <td className={row.net >= 0 ? "up" : "down"}>{signed(toPoints(row.net))}</td><td>{row.bbPer100.toFixed(1)}</td></tr>;
        })}</tbody>
      </table>
      <p className="agent-analysis-note">{localized("Short samples swing a lot; results include rake. Agents play the saved AI estimate, not GTO.", "ハンド数が少ないうちは大きくぶれます。収支はレーキ込み。AgentはAI推定通りに打っており、GTOではありません。")}</p>
    </>}
  </section>;
}
