import { useState } from "react";
import { ArrowLeft, Trophy } from "@phosphor-icons/react";
import { LEADERBOARD_MIN_MATCHES, TIER_EN, leaderboardRows, playerSummary, tierFor } from "./rank-store.ts";
import { localized } from "../i18n.ts";

const pct = value => `${Math.round(value * 100)}%`;
const PERIODS = [{ value: "week", label: "週間" }, { value: "all", label: "通算" }];
const tierLabel = rating => localized(TIER_EN[tierFor(rating).name], tierFor(rating).name);
const dateLabel = at => new Date(at).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

// Only this browser's player is known until accounts sync ranked results to the server.
export function Leaderboard({ rank, profile, onBack, others = [] }) {
  const [period, setPeriod] = useState("week");
  const me = playerSummary(rank, period);
  const name = profile?.nickname || localized("You", "あなた");
  const rows = leaderboardRows([...others, ...(me ? [{ ...me, name, self: true }] : [])]);
  const recent = [...rank.matches].reverse().slice(0, 20);
  return <div className="leaderboard">
    <div className="library-head">
      <div>
        <h1><Trophy size={24} weight="fill" /> ランキング</h1>
        <p>{localized(`Ranked by rating. Players need ${LEADERBOARD_MIN_MATCHES} ranked matches in the period to be placed.`,
          `ランク戦のレート順です。期間内に${LEADERBOARD_MIN_MATCHES}試合以上プレイすると順位が付きます。`)}</p>
      </div>
      <button type="button" className="config-edit" onClick={onBack}><ArrowLeft size={14} />一覧</button>
    </div>
    <div className="leaderboard-tabs" role="tablist">
      {PERIODS.map(item => <button key={item.value} type="button" role="tab" aria-selected={period === item.value}
        className={period === item.value ? "on" : ""} onClick={() => setPeriod(item.value)}>{item.label}</button>)}
    </div>
    {rows.length ? <div className="sessions-table-scroll"><table className="leaderboard-table">
      <thead><tr><th>順位</th><th>プレイヤー</th><th>ランク</th><th>レート</th><th>{period === "week" ? "今週の増減" : "増減"}</th><th>試合</th><th>正答率</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index} className={row.self ? "self" : ""}>
        <td className="place">{row.place ?? "—"}</td>
        <td>{row.name}</td>
        <td>{tierLabel(row.rating)}</td>
        <td><b>{row.rating}</b></td>
        <td className={row.gain >= 0 ? "up" : "down"}>{row.gain >= 0 ? "+" : "−"}{Math.abs(row.gain)}</td>
        <td>{row.matches}</td>
        <td>{pct(row.accuracy)}</td>
      </tr>)}</tbody>
    </table></div>
      : <p className="sessions-empty">{period === "week" ? "今週はまだランク戦をプレイしていません。" : "まだランク戦をプレイしていません。"}</p>}
    <p className="leaderboard-note">{localized("Other players will appear here once accounts are available.", "アカウント機能の公開後、ほかのプレイヤーもここに並びます。")}</p>
    {recent.length > 0 && <section className="leaderboard-history">
      <h2>自分の試合履歴</h2>
      <table className="leaderboard-table">
        <thead><tr><th>日時</th><th>正答率</th><th>レート</th><th>増減</th></tr></thead>
        <tbody>{recent.map(match => <tr key={match.at}>
          <td>{dateLabel(match.at)}</td><td>{pct(match.accuracy)}</td><td>{match.after}</td>
          <td className={match.after >= match.before ? "up" : "down"}>{match.after >= match.before ? "+" : "−"}{Math.abs(match.after - match.before)}</td>
        </tr>)}</tbody>
      </table>
    </section>}
  </div>;
}
