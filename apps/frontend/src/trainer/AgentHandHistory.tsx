import type { AgentHandRecord } from "../agent/agent-stats.ts";
import { PlayingCard } from "../components/PlayingCard.tsx";
import { ffCopy as t, ffNumber } from "./fastfold-api.ts";

const streets = ["preflop", "flop", "turn", "river"];
const labels = () => [t("Preflop", "プリフロップ", "翻牌前", "Preflop"), t("Flop", "フロップ", "翻牌", "Flop"), t("Turn", "ターン", "转牌", "Turn"), t("River", "リバー", "河牌", "River")];
const cards = (values: string[]) => <span className="sessions-cards">{values.map((card, index) => <PlayingCard variant="text" card={card} key={`${card}-${index}`} />)}</span>;
function actionLabel(action: string) {
  if (action === "fold") return t("Fold", "フォールド", "弃牌", "Retirarse");
  if (action === "check") return t("Check", "チェック", "过牌", "Pasar");
  if (action === "call" || action === "limp") return t("Call", "コール", "跟注", "Igualar");
  if (action === "allin" || action === "all_in") return t("All-in", "オールイン", "全下", "All-in");
  if (action.startsWith("bet")) return t("Bet", "ベット", "下注", "Apostar");
  return t("Raise", "レイズ", "加注", "Subir");
}
export function AgentHandHistory({ record }: { record: AgentHandRecord }) {
  const history = record.history;
  if (!history) return null;
  const name = (seat: string) => `${history.names?.[seat] ?? seat}${history.names?.[seat] ? ` · ${seat}` : ""}`;
  return <section className="sessions-history">
    <h2>{t("Hand history", "ハンド履歴", "手牌历史", "Historial de manos")}{history.handNo ? ` #${history.handNo}` : ""}</h2>
    <p className="sessions-source-note">{t("Only your cards and opponents revealed at showdown are saved. Folded opponents remain hidden.", "自分のカードとショーダウンで公開された相手のカードのみ保存します。フォールドした相手のカードは非公開です。", "仅保存你的牌与摊牌时公开的对手牌。弃牌对手的牌不公开。", "Solo se guardan tus cartas y las reveladas en showdown. Las cartas de rivales retirados siguen ocultas.")}</p>
    <dl className="sessions-flags">{Object.entries(history.holeCards).map(([seat, hole]) => <div key={seat}><dt translate="no">{name(seat)}</dt><dd>{cards(hole)}</dd></div>)}</dl>
    {streets.map((street, index) => {
      const log = history.log.filter(entry => entry.street === street);
      if (!log.length) return null;
      return <div key={street} className="sessions-saved-street"><h3>{labels()[index]} {index > 0 && cards(history.board.slice(0, index + 2))}</h3>
        <div className="sessions-table-scroll"><table className="leaderboard-table sessions-table"><thead><tr><th>{t("Player", "プレイヤー", "玩家", "Jugador")}</th><th>{t("Action", "アクション", "行动", "Acción")}</th><th>{t("Pot", "ポット", "底池", "Bote")}</th></tr></thead><tbody>{log.map((entry, i) => <tr key={i}><td translate="no">{name(entry.pos)}</td><td>{actionLabel(entry.action)}{entry.to != null ? ` ${ffNumber(entry.to)} bb` : ""}</td><td>{ffNumber(entry.pot)} bb</td></tr>)}</tbody></table></div>
      </div>;
    })}
    {history.board.length > 0 && <p>{t("Board", "ボード", "公共牌", "Mesa")} · {cards(history.board)}</p>}
    <p>{t("Winner", "勝者", "赢家", "Ganador")} · <span translate="no">{history.winners.map(name).join(" / ") || "—"}</span></p>
    <dl className="sessions-flags">{Object.entries(history.returns).filter(([seat]) => seat === record.pos || history.log.some(entry => entry.pos === seat && entry.action !== "fold")).map(([seat, value]) => <div key={seat}><dt translate="no">{name(seat)}</dt><dd>{ffNumber(value, true)} bb</dd></div>)}{history.pot != null && <div><dt>{t("Final pot", "最終ポット", "最终底池", "Bote final")}</dt><dd>{ffNumber(history.pot)} bb</dd></div>}{history.rake != null && <div><dt>{t("Rake", "レーキ", "抽水", "Rake")}</dt><dd>{ffNumber(history.rake)} bb</dd></div>}</dl>
  </section>;
}
