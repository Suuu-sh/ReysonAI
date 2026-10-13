import type { AgentHandRecord } from "../agent/agent-stats.ts";
import { SessionCards } from "./SessionCards.tsx";
import { ffCopy as t, ffNumber } from "./fastfold-api.ts";
import { useState } from "react";
import { Bookmark } from "@phosphor-icons/react";
import { setAgentHandBookmarked } from "../agent/agent-stats.ts";

const handName = (category: number) => [
  t("High card", "ハイカード", "高牌", "Carta alta"), t("One pair", "ワンペア", "一对", "Pareja"),
  t("Two pair", "ツーペア", "两对", "Doble pareja"), t("Three of a kind", "スリーカード", "三条", "Trío"),
  t("Straight", "ストレート", "顺子", "Escalera"), t("Flush", "フラッシュ", "同花", "Color"),
  t("Full house", "フルハウス", "葫芦", "Full"), t("Four of a kind", "フォーカード", "四条", "Póker"),
  t("Straight flush", "ストレートフラッシュ", "同花顺", "Escalera de color"),
][category] ?? "—";
const streets = ["preflop", "flop", "turn", "river"];
const labels = () => [t("Preflop", "プリフロップ", "翻牌前", "Preflop"), t("Flop", "フロップ", "翻牌", "Flop"), t("Turn", "ターン", "转牌", "Turn"), t("River", "リバー", "河牌", "River")];
const policyLabel = (policy: Record<string, number>) => Object.entries(policy).filter(([, frequency]) => frequency > 0)
  .sort((a, b) => b[1] - a[1]).map(([action, frequency]) => `${actionLabel(action)} ${Math.round(frequency * 100)}%`).join(" · ") || "—";
function actionLabel(action: string) {
  if (action === "fold") return t("Fold", "フォールド", "弃牌", "Retirarse");
  if (action === "check") return t("Check", "チェック", "过牌", "Pasar");
  if (action === "call" || action === "limp") return t("Call", "コール", "跟注", "Igualar");
  if (action === "allin" || action === "all_in") return t("All-in", "オールイン", "全下", "All-in");
  if (action.startsWith("bet")) return t("Bet", "ベット", "下注", "Apostar");
  return t("Raise", "レイズ", "加注", "Subir");
}
export function AgentHandHistory({ record }: { record: AgentHandRecord }) {
  const [bookmarked, setBookmarked] = useState(Boolean(record.bookmarked));
  const history = record.history;
  if (!history) return null;
  const name = (seat: string) => `${history.names?.[seat] ?? seat}${history.names?.[seat] ? ` · ${seat}` : ""}`;
  return <section className="sessions-history">
    <div className="sessions-history-head"><h2>{t("Hand history", "ハンド履歴", "手牌历史", "Historial de manos")}{history.handNo ? ` #${history.handNo}` : ""}</h2><button type="button" className="config-edit" aria-pressed={bookmarked} onClick={() => {
      const value = !bookmarked;
      const saved = setAgentHandBookmarked({ ...(record.session ? { sessionId: record.session.id, handNo: history.handNo } : { at: record.at }), tableId: record.tableId, pos: record.pos }, value);
      const current = saved.find(hand => record.session ? hand.session?.id === record.session.id && hand.history?.handNo === history.handNo : hand.at === record.at && hand.tableId === record.tableId && hand.pos === record.pos);
      setBookmarked(Boolean(current?.bookmarked));
    }}><Bookmark size={14} weight={bookmarked ? "fill" : "regular"} />{bookmarked ? t("Bookmarked", "復習に保存済み", "已收藏", "Guardada") : t("Bookmark for review", "復習用に保存", "收藏复习", "Guardar para revisar")}</button></div>
    <p className="sessions-source-note">{t("Only your cards and opponents revealed at showdown are saved. Folded opponents remain hidden.", "自分のカードとショーダウンで公開された相手のカードのみ保存します。フォールドした相手のカードは非公開です。", "仅保存你的牌与摊牌时公开的对手牌。弃牌对手的牌不公开。", "Solo se guardan tus cartas y las reveladas en showdown. Las cartas de rivales retirados siguen ocultas.")}</p>
    <p className="sessions-source-note">{t("Exact saved preflop policy frequencies are shown only where the engine exposed that decision. Postflop comparisons are not supported yet. No EV is inferred. Older or unsupported decisions remain unavailable; replay is unavailable because no seed was saved.", "エンジンが取得できたプリフロップ判断のみ、保存済み方針の正確な頻度を表示します。ポストフロップ比較には未対応です。EVは推定しません。旧記録や未対応の判断は確認できず、シード未保存のため再プレイもできません。", "仅当引擎提供时显示精确保存的翻前策略频率，暂不支持翻后对比。不推算EV。旧记录或不支持的决策不可用；未保存种子，因此无法重放。", "Solo se muestran frecuencias exactas de la política preflop guardada cuando el motor expuso esa decisión. Aún no se admiten comparaciones postflop. No se infiere EV. Las decisiones antiguas o no compatibles no están disponibles; no se puede reproducir sin semilla.")}</p>
    <dl className="sessions-flags">{Object.entries(history.holeCards).map(([seat, hole]) => <div key={seat}><dt translate="no">{name(seat)}</dt><dd><SessionCards cards={hole} />{history.handRanks?.[seat] != null && <small> · {handName(history.handRanks[seat])}</small>}</dd></div>)}</dl>
    {streets.map((street, index) => {
      const log = history.log.filter(entry => entry.street === street);
      if (!log.length) return null;
      return <div key={street} className="sessions-saved-street"><h3>{labels()[index]} {index > 0 && <SessionCards cards={history.board.slice(0, index + 2)} />}</h3>
        <div className="sessions-table-scroll"><table className="leaderboard-table sessions-table"><thead><tr><th>{t("Player", "プレイヤー", "玩家", "Jugador")}</th><th>{t("Action", "アクション", "行动", "Acción")}</th><th>{t("Saved policy", "保存済み方針", "已保存策略", "Política guardada")}</th><th>{t("Pot", "ポット", "底池", "Bote")}</th></tr></thead><tbody>{log.map((entry, i) => {
          const decision = history.reviewDecisions?.find(item => item.logIndex === history.log.indexOf(entry));
          const comparison = entry.pos !== record.pos ? "—" : decision ? policyLabel(decision.policy) : history.reviewPolicyVersion === 1 ? t("Unavailable for this decision", "この判断では利用できません", "此决策不可用", "No disponible para esta decisión") : t("Not saved in this history", "この履歴には未保存", "此历史未保存", "No guardada en este historial");
          return <tr key={i}><td translate="no">{name(entry.pos)}</td><td>{actionLabel(entry.action)}{entry.to != null ? ` ${ffNumber(entry.to)} bb` : ""}</td><td>{comparison}</td><td>{ffNumber(entry.pot)} bb</td></tr>;
        })}</tbody></table></div>
      </div>;
    })}
    {history.board.length > 0 && <p>{t("Board", "ボード", "公共牌", "Mesa")} · <SessionCards cards={history.board} /></p>}
    <p>{t("Winner", "勝者", "赢家", "Ganador")} · <span translate="no">{history.winners.map(name).join(" / ") || "—"}</span></p>
    <dl className="sessions-flags">{Object.entries(history.returns).filter(([seat]) => seat === record.pos || history.log.some(entry => entry.pos === seat && entry.action !== "fold")).map(([seat, value]) => <div key={seat}><dt translate="no">{name(seat)}</dt><dd>{ffNumber(value, true)} bb</dd></div>)}{history.pot != null && <div><dt>{t("Final pot", "最終ポット", "最终底池", "Bote final")}</dt><dd>{ffNumber(history.pot)} bb</dd></div>}{history.rake != null && <div><dt>{t("Rake", "レーキ", "抽水", "Rake")}</dt><dd>{ffNumber(history.rake)} bb</dd></div>}</dl>
  </section>;
}
