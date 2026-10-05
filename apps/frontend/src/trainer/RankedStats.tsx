import { CalendarBlank, ChartLineUp, Crosshair, Target } from "@phosphor-icons/react";
import { useState } from "react";
import { localized, localeTag } from "../locale.ts";
import { RankBadge } from "./RankBadge.tsx";
import { tierFor, TIER_EN } from "./rank-store.ts";

export function RankedStats({ rank, ready }: { rank: any; ready: boolean }) {
  const [period, setPeriod] = useState("all");
  if (!ready) return <section className="analysis-card analysis-welcome" role="status">
    <h2>{localized("Ranked stats unavailable", "ランク戦Statsは利用できません")}</h2>
    <p>{localized("Sign in and connect to the ranked server to view confirmed match results. Local records never award a rating.", "ログインしてランク戦サーバーに接続すると、確定した試合結果を表示します。ローカル記録からレートは付与しません。")}</p>
  </section>;
  const all = rank.matches ?? [];
  const matches = all.filter(match => period === "all" || match.at >= Date.now() - Number(period) * 86400000);
  const answered = matches.reduce((sum, match) => sum + match.answered, 0);
  const score = answered ? matches.reduce((sum, match) => sum + match.accuracy * match.answered, 0) / answered : null;
  const gain = matches.reduce((sum, match) => sum + match.after - match.before, 0);
  const tier = tierFor(rank.rating);
  return <div className="analysis-ranked-stats">
    <div className="stats-seg" role="group" aria-label={localized("Period", "期間")}>
      <CalendarBlank size={15} aria-hidden="true" />
      {[["all", localized("All time", "全期間")], ["30", localized("30 days", "30日")], ["7", localized("7 days", "7日")]].map(([value, label]) =>
        <button key={value} type="button" className={period === value ? "on" : ""} aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</button>)}
    </div>
    <div className="analysis-kpis">
      <div className="analysis-kpi accent"><span className="analysis-kpi-label"><Target size={16} />{localized("Current rating", "現在のレート")}</span><strong>{rank.rating.toLocaleString()}</strong><small><RankBadge name={tier.name} size={24} /> {localized(TIER_EN[tier.name], tier.name)} · {localized("Peak", "最高")} {rank.peak.toLocaleString()}</small></div>
      <div className="analysis-kpi"><span className="analysis-kpi-label"><Crosshair size={16} />{localized("Ranked practice score", "ランク戦練習スコア")}</span><strong>{score == null ? "—" : `${Math.round(score * 100)}%`}</strong><small>{localized(`${answered} confirmed answers`, `確定済み ${answered} 回答`)}</small></div>
      <div className="analysis-kpi"><span className="analysis-kpi-label"><CalendarBlank size={16} />{localized("Completed matches", "完了試合")}</span><strong>{matches.length}</strong><small>{localized("Selected period", "選択した期間")}</small></div>
      <div className="analysis-kpi"><span className="analysis-kpi-label"><ChartLineUp size={16} />{localized("Rating change", "レート増減")}</span><strong>{matches.length ? `${gain >= 0 ? "+" : ""}${gain}` : "—"}</strong><small>{localized("Selected period", "選択した期間")}</small></div>
    </div>
    <section className="analysis-card stats-breakdown">
      <header className="analysis-card-head"><h2>{localized("Confirmed ranked matches", "確定済みランク戦")}</h2></header>
      {matches.length ? <div className="stats-table-wrap"><table className="stats-table">
        <thead><tr><th scope="col">{localized("Date", "日時")}</th><th scope="col">{localized("Practice score", "練習スコア")}</th><th scope="col">{localized("Rating", "レート")}</th><th scope="col">{localized("Change", "増減")}</th></tr></thead>
        <tbody>{[...matches].reverse().map(match => <tr key={match.id ?? match.at}>
          <th scope="row">{new Date(match.at).toLocaleString(localeTag())}</th><td>{Math.round(match.accuracy * 100)}%</td><td>{match.after.toLocaleString()}</td><td>{match.after >= match.before ? "+" : ""}{match.after - match.before}</td>
        </tr>)}</tbody>
      </table></div> : <p className="analysis-empty">{localized("No confirmed matches in this period.", "この期間の確定済み試合はまだありません。")}</p>}
    </section>
    <section className="analysis-card analysis-guidance">
      <header className="analysis-card-head"><h2>{localized("Ranked play style", "ランク戦のプレイスタイル")}</h2></header>
      <p className="analysis-empty">{localized("The server currently returns match summaries, not individual actions. Animal styles and action analysis cannot be determined; drill or Agent records are not substituted.", "サーバーから取得できるのは試合概要のみです。個別アクションがないため動物スタイルと行動分析は判定できません。ドリル・Agent戦の記録は代用しません。")}</p>
    </section>
    <p className="analysis-footnote">{localized("Only server-confirmed matches (up to the latest 100) are included. Scores reflect the issued AI estimate, not GTO, EV or win rate. Current rating and peak are all-time values.", "直近100試合までのサーバー確定結果のみ集計します。スコアは出題時のAI推定との一致で、GTO・EV・勝率ではありません。現在レートと最高レートは全期間の値です。")}</p>
  </div>;
}
