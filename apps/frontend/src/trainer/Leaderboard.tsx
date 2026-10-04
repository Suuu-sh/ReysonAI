import { RankBadge, RankLadder, tierColor } from "./RankBadge.tsx";
import { useEffect, useState } from "react";
import { ArrowLeft, Trophy } from "@phosphor-icons/react";
import { LEADERBOARD_MIN_MATCHES, TIER_EN, displayTier, tierFor } from "./rank-store.ts";
import { rankedRequest } from "./ranked-api.ts";
import { localized } from "../i18n.ts";

const pct = value => `${Math.round(value * 100)}%`;
const PERIODS = [{ value: "week", label: ["Weekly", "週間"] }, { value: "all", label: ["All time", "通算"] }];
const tierLabel = (rating, place = null) => { const name = displayTier(rating, place); return localized(TIER_EN[name], name); };
const dateLabel = at => new Date(at).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const signed = value => `${value >= 0 ? "+" : "−"}${Math.abs(value)}`;
const initial = name => [...String(name)][0]?.toUpperCase() ?? "?";

function Podium({ rows }) {
  // 2nd · 1st · 3rd
  const order = [rows[1], rows[0], rows[2]].filter(Boolean);
  return <ol className="lb-podium" aria-label={localized("Top three", "上位3人")}>
    {order.map(row => {
      const tier = displayTier(row.rating, row.place);
      return <li key={row.id} className={`place-${row.place}${row.self ? " self" : ""}`} style={{ "--tier": tierColor(tier) }}>
        <span className="lb-podium-place">{row.place}</span>
        <RankBadge name={tier} size={row.place === 1 ? 76 : 60} />
        <strong><span translate="no">{row.name}</span>{row.self && <small>{localized("You", "あなた")}</small>}</strong>
        <span className="lb-podium-tier">{tierLabel(row.rating, row.place)}</span>
        <b>{row.rating.toLocaleString()}</b>
        <small className={row.gain >= 0 ? "up" : "down"}>{signed(row.gain)}</small>
      </li>;
    })}
  </ol>;
}

// Only server-assigned global placements determine Legend; never rerank a limited client list.
export function Leaderboard({ rank, onBack }) {
  const [period, setPeriod] = useState("week");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let canceled = false;
    setLoading(true); setError(false); setRows([]);
    rankedRequest(`leaderboard?period=${period}`).then(response => { if (!canceled) setRows(response.rows); })
      .catch(() => { if (!canceled) setError(true); }).finally(() => { if (!canceled) setLoading(false); });
    return () => { canceled = true; };
  }, [period]);
  const me = rows.find(row => row.self);
  const name = me?.name ?? localized("You", "あなた");
  const placed = rows.filter(row => row.place != null);
  const podium = placed.length >= 3 ? placed.slice(0, 3) : [];
  const listed = podium.length ? rows.filter(row => !podium.includes(row)) : rows;
  const recent = [...rank.matches].reverse().slice(0, 20);
  const tier = { ...tierFor(rank.rating), name: displayTier(rank.rating, me?.place ?? null) };
  const myRow = rows.find(row => row.self);
  const toGo = Math.max(0, LEADERBOARD_MIN_MATCHES - (me?.matches ?? 0));
  return <div className="leaderboard">
    <button type="button" className="config-edit lb-back" onClick={onBack}><ArrowLeft size={14} />{localized("Trainer", "トレーナー")}</button>
    <header className="trainer-home-head lb-head">
      <div>
        <h1 className="trainer-home-eyebrow"><Trophy size={12} weight="fill" /> LEADERBOARD</h1>
        <p>{localized(`Ranked by rating. Play ${LEADERBOARD_MIN_MATCHES} ranked matches in the period to be placed.`,
          `ランク戦のレート順です。期間内に${LEADERBOARD_MIN_MATCHES}試合以上プレイすると順位が付きます。`)}</p>
      </div>
      <div className="lb-head-tools">

        <div className="lb-period" role="group" aria-label={localized("Ranking period", "ランキング期間")}>
          {PERIODS.map(item => <button key={item.value} type="button" aria-pressed={period === item.value}
            className={period === item.value ? "on" : ""} onClick={() => setPeriod(item.value)}>{localized(item.label[0], item.label[1])}</button>)}
        </div>
      </div>
    </header>

    <section className="lb-me" style={{ "--mode-theme": tierColor(tier.name) }} aria-label={localized("Your standing", "あなたの記録")}>
      <div className="lb-me-id">
        <RankBadge name={tier.name} size={44} />
        <div><strong translate="no">{name}</strong><span>{tierLabel(rank.rating, me?.place ?? null)}</span></div>
      </div>
      <dl className="lb-me-stats">
        <div><dt>{localized("Rating", "レート")}</dt><dd>{rank.rating.toLocaleString()}</dd></div>
        <div><dt>{localized("Place", "順位")}</dt><dd>{myRow?.place ?? "—"}</dd></div>
        <div><dt>{localized("Matches", "試合")}</dt><dd>{me?.matches ?? 0}<small>/{LEADERBOARD_MIN_MATCHES}</small></dd></div>
      </dl>
      <span className="lb-me-note">{toGo ? localized(`${toGo} more to be placed`, `あと${toGo}試合で順位確定`) : localized("Placed this period", "順位確定")}</span>
    </section>

    {loading ? <p role="status">{localized("Loading server leaderboard…", "サーバーランキングを読み込み中…")}</p> : error ? <p role="alert">{localized("Leaderboard unavailable. No local or sample rankings are shown.", "ランキングを取得できませんでした。ローカル記録やダミーの順位は表示しません。")}</p> : rows.length ? <>
      {podium.length > 0 && <Podium rows={podium} />}
      <div className="sessions-table-scroll"><table className="leaderboard-table">
        <thead><tr><th>{localized("Place", "順位")}</th><th>{localized("Player", "プレイヤー")}</th><th>{localized("Rank", "ランク")}</th><th>{localized("Rating", "レート")}</th>
          <th>{period === "week" ? localized("This week", "今週の増減") : localized("Change", "増減")}</th><th>{localized("Matches", "試合")}</th><th>{localized("Accuracy", "正答率")}</th></tr></thead>
        <tbody>{listed.map((row, index) => {
          const rowTier = displayTier(row.rating, row.place);
          return <tr key={row.id} className={row.self ? "self" : ""} style={{ "--tier": tierColor(rowTier) }}>
            <td className="place">{row.place ?? "—"}</td>
            <td><span className="leaderboard-player"><span className="lb-avatar" aria-hidden="true">{initial(row.name)}</span><span translate="no">{row.name}</span>{row.self && <small>{localized("You", "あなた")}</small>}</span></td>
            <td><span className="leaderboard-rank"><RankBadge name={rowTier} size={26} />{tierLabel(row.rating, row.place)}</span></td>
            <td><b>{row.rating.toLocaleString()}</b></td>
            <td className={row.gain >= 0 ? "up" : "down"}>{signed(row.gain)}</td>
            <td>{row.matches}{row.place == null && <small className="lb-unplaced">{localized(" · unplaced", " · 順位なし")}</small>}</td>
            <td>{pct(row.accuracy)}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </> : <section className="leaderboard-empty"><Trophy size={40} /><h2>{localized("Your climb starts here", "最初の一歩を踏み出そう")}</h2><p>{period === "week" ? localized("No ranked matches this week yet.", "今週はまだランク戦をプレイしていません。") : localized("No ranked matches yet.", "まだランク戦をプレイしていません。")}</p><button type="button" className="setup-secondary" onClick={onBack}>{localized("Back to ranked arena", "ランクアリーナへ")}</button></section>}
    <p className="leaderboard-note">{localized("Server-confirmed matches only · weekly means the last 7 days. Legend: Master rating and a global top-10 placement in this period. AI-estimate alignment, not GTO or win rate.", "サーバーで確定した試合のみ集計 · 週間は直近7日間。レジェンドはマスターのレートかつ期間内の全体10位以内。AI推定との一致であり、GTOや勝率ではありません。")}</p>
    <section className="lb-ladder"><RankLadder rating={rank.rating} /></section>
    {recent.length > 0 && <section className="leaderboard-history">
      <h2>{localized("Your match history", "自分の試合履歴")}</h2>
      <div className="sessions-table-scroll"><table className="leaderboard-table">
        <thead><tr><th>{localized("Date", "日時")}</th><th>{localized("Accuracy", "正答率")}</th><th>{localized("Rating", "レート")}</th><th>{localized("Change", "増減")}</th></tr></thead>
        <tbody>{recent.map(match => <tr key={match.at}>
          <td>{dateLabel(match.at)}</td><td>{pct(match.accuracy)}</td><td>{match.after}</td>
          <td className={match.after >= match.before ? "up" : "down"}>{signed(match.after - match.before)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}
  </div>;
}
