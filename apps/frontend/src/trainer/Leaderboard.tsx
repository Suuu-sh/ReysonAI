import { RankBadge, RankLadder } from "./RankBadge.tsx";
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
    <section className="leaderboard-summary">
      <div className="ranked-identity"><RankBadge name={tierFor(rank.rating).name} size={80} /><div><small>{localized("Your standing", "あなたの記録")}</small><h2>{name}</h2><span>{tierLabel(rank.rating)}</span></div></div>
      <dl className="ranked-metrics"><div><dt>{localized("Rating", "レート")}</dt><dd>{rank.rating.toLocaleString()}</dd></div><div><dt>{localized("Matches in period", "期間内の試合")}</dt><dd>{me?.matches ?? 0}<small> / {LEADERBOARD_MIN_MATCHES}</small></dd></div><div><dt>{localized("Place", "順位")}</dt><dd>{rows.find(row => row.self)?.place ?? "—"}</dd></div></dl>
      <p>{!me || me.matches < LEADERBOARD_MIN_MATCHES ? localized(`${Math.max(0, LEADERBOARD_MIN_MATCHES - (me?.matches ?? 0))} more matches to establish your position.`, `あと${Math.max(0, LEADERBOARD_MIN_MATCHES - (me?.matches ?? 0))}試合で順位が確定します。`) : localized("Your position is established for this period.", "この期間の順位が確定しています。")}</p>
    </section>
    <div className="leaderboard-tabs" role="group" aria-label={localized("Ranking period", "ランキング期間")}>

      {PERIODS.map(item => <button key={item.value} type="button" aria-pressed={period === item.value}
        className={period === item.value ? "on" : ""} onClick={() => setPeriod(item.value)}>{item.label}</button>)}
    </div>
    {rows.length ? <div className="sessions-table-scroll"><table className="leaderboard-table">
      <thead><tr><th>順位</th><th>プレイヤー</th><th>ランク</th><th>レート</th><th>{period === "week" ? "今週の増減" : "増減"}</th><th>試合</th><th>正答率</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index} className={row.self ? "self" : ""}>
        <td className="place">{row.place ?? "—"}</td>
        <td><span className="leaderboard-player">{row.name}{row.self && <small>{localized("You", "あなた")}</small>}</span></td>
        <td><span className="leaderboard-rank"><RankBadge name={tierFor(row.rating).name} size={36} />{tierLabel(row.rating)}</span></td>
        <td><b>{row.rating}</b></td>
        <td className={row.gain >= 0 ? "up" : "down"}>{row.gain >= 0 ? "+" : "−"}{Math.abs(row.gain)}</td>
        <td>{row.matches}</td>
        <td>{pct(row.accuracy)}</td>
      </tr>)}</tbody>
    </table></div>
      : <section className="leaderboard-empty"><Trophy size={40} /><h2>{localized("Your climb starts here", "最初の一歩を踏み出そう")}</h2><p>{period === "week" ? localized("No ranked matches this week yet.", "今週はまだランク戦をプレイしていません。") : localized("No ranked matches yet.", "まだランク戦をプレイしていません。")}</p><button type="button" className="setup-secondary" onClick={onBack}>{localized("Back to ranked arena", "ランクアリーナへ")}</button></section>}
    <p className="leaderboard-note">{localized("Other players will appear here once accounts are available.", "アカウント機能の公開後、ほかのプレイヤーもここに並びます。")}</p>
    <RankLadder rating={rank.rating} />
    {recent.length > 0 && <section className="leaderboard-history">
      <h2>自分の試合履歴</h2>
      <div className="sessions-table-scroll"><table className="leaderboard-table">
        <thead><tr><th>日時</th><th>正答率</th><th>レート</th><th>増減</th></tr></thead>
        <tbody>{recent.map(match => <tr key={match.at}>
          <td>{dateLabel(match.at)}</td><td>{pct(match.accuracy)}</td><td>{match.after}</td>
          <td className={match.after >= match.before ? "up" : "down"}>{match.after >= match.before ? "+" : "−"}{Math.abs(match.after - match.before)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </div>;
}
