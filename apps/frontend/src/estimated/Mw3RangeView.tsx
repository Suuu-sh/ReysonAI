import { useEffect, useMemo, useState } from "react";
import { X } from "@phosphor-icons/react";
import { ActionBars, Panel, SectionHeading, StatusState } from "../components/primitives.tsx";
import { StrategyMatrix } from "../components/StrategyMatrix.tsx";
import { hands } from "../data.ts";
import { productLocale } from "../i18n.ts";
import { combosOf } from "../../scripts/lib/equity.mjs";
import { cardText } from "../../scripts/postflop-ai/flop-isomorphism.mjs";
import { mw3HandExplanation } from "./mw3-explanation.ts";
import "./mw3-range.css";

const COPY = {
  en: { title: "Three-player pot", estimate: "AI estimate", current: "Current decision", reach: "Earlier path reach", average: "All combos (average)",
    noReach: "This hand has no reach in the saved action path.", close: "Close hand details", combo: "Exact combination", entire: "Entire range", pot: "Pot", callCost: "Call", required: "Required equity", done: "Betting complete", history: "Action history", origin: "This hand started as a three-player pot. Each player follows the saved three-player strategy.", pending: "Other players still have a response after this decision.", closing: "This response closes the current action if there is no raise.", ownReach: "Own-action path weight; not a new recommendation.", check: "Check", fold: "Fold", raise: "Raise to", bet: "Bet", allin: "All-in", play: "Take this action" },
  ja: { title: "3人ポット", estimate: "AI推定", current: "現在の判断", reach: "ここまでの到達レンジ", average: "すべてのコンボ（平均）",
    noReach: "このハンドは保存済みの行動履歴では到達しません。", close: "ハンド詳細を閉じる", combo: "正確な組み合わせ", entire: "レンジ全体", pot: "ポット", callCost: "コール額", required: "必要勝率", done: "このストリートの行動は終了", history: "行動履歴", origin: "3人ポットから始まったハンドです。各プレイヤーは保存済みの3人用方針で判断します。", pending: "この判断の後にも、他のプレイヤーの応答が残っています。", closing: "レイズがなければ、この応答で現在の行動が閉じます。", ownReach: "自分の過去の行動で重み付けした到達割合です。新しい推奨ではありません。", check: "チェック", fold: "フォールド", raise: "レイズ先", bet: "ベット", allin: "オールイン", play: "この行動を選ぶ" },
  "zh-CN": { title: "三人底池", estimate: "AI估算", current: "当前决策", reach: "此前路径范围", average: "全部组合（平均）",
    noReach: "已保存的行动路径无法到达这手牌。", close: "关闭手牌详情", combo: "具体组合", entire: "整体范围", pot: "底池", callCost: "跟注额", required: "所需胜率", done: "本轮行动结束", history: "行动记录", origin: "这手牌从三人底池开始。每位玩家使用已保存的三人策略。", pending: "此决策之后，仍有其他玩家需要回应。", closing: "如果没有加注，此回应将结束当前行动。", ownReach: "仅按自身此前行动加权的到达比例，并非新的行动建议。", check: "过牌", fold: "弃牌", raise: "加注至", bet: "下注", allin: "全下", play: "选择此行动" },
  es: { title: "Bote de tres jugadores", estimate: "Estimación de IA", current: "Decisión actual", reach: "Rango de la línea previa", average: "Todas las combinaciones (media)",
    noReach: "Esta mano no alcanza la secuencia de acciones guardada.", close: "Cerrar detalles de la mano", combo: "Combinación exacta", entire: "Rango completo", pot: "Bote", callCost: "Igualar", required: "Equidad necesaria", done: "Apuestas de esta calle completas", history: "Historial de acciones", origin: "La mano comenzó con tres jugadores. Cada jugador sigue la estrategia guardada para este bote.", pending: "Quedan respuestas de otros jugadores después de esta decisión.", closing: "Esta respuesta cierra la acción actual si no hay una subida.", ownReach: "Peso de las acciones propias previas; no es una nueva recomendación.", check: "Pasar", fold: "Retirarse", raise: "Subir a", bet: "Apostar", allin: "All-in", play: "Elegir esta acción" },
};
const number = (value: number) => Number(value.toFixed(2)).toString();
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
function labelFor(group: any, t: any) {
  if (group.action === "fold") return t.fold;
  if (group.action === "check") return t.check;
  if (group.action === "call") return `${t.callCost} ${number(group.amountBb)}BB${group.allIn ? ` (${t.allin})` : ""}`;
  if (group.allIn || group.action === "allin") return `${t.allin} ${number(group.toBb ?? group.amountBb)}BB`;
  if (group.action === "raise") return `${t.raise} ${number(group.toBb)}BB`;
  return `${t.bet} ${number(group.amountBb)}BB (${group.action.slice(3)}%)`;
}
function matrixModel(participant: any, board: number[]) {
  const rows = new Map<string, any>(participant.rows.map((row: any) => [row.hand, row]));
  return new Map(hands.map(hand => {
    const row = rows.get(hand), count = combosOf(hand).filter((combo: number[]) => combo.every(card => !board.includes(card))).length;
    return [hand, { hand, comboCount: count, unreachable: !row?.reachWeight, actions: row?.actions ?? {}, row }];
  }));
}

// Presentation only. A caller must supply a verified mw3DecisionView. Nothing here
// loads, generates, publishes, or invents a missing strategy or an opponent's action.
export function Mw3RangeView({ view, displayMode = "standard", locale = productLocale(), onAction, onRewind }: any) {
  const t = COPY[locale] ?? COPY.en;
  const [focus, setFocus] = useState<{ seat: string; hand: string } | null>(null);
  const [comboKey, setComboKey] = useState("all");
  const seats = view.participants.map((part: any) => part.seat).join(",");
  useEffect(() => { if (focus && !seats.split(",").includes(focus.seat)) setFocus(null); }, [seats, focus]);
  const historyKey = view.history.map((event: any) => `${event.street}:${event.index}:${event.action}`).join("|");
  useEffect(() => { setFocus(null); }, [view.spotId]);
  useEffect(() => { setComboKey("all"); }, [view.spotId, view.board.join(","), historyKey, focus?.seat, focus?.hand]);
  const groups = view.actionGroups ?? [], actions = groups.map((group: any) => group.action);
  const labels = Object.fromEntries(groups.map((group: any) => [group.action, labelFor(group, t)]));
  const models = useMemo(() => Object.fromEntries(view.participants.map((part: any) => [part.seat, matrixModel(part, view.board)])), [view]);
  const selectedPart = focus ? view.participants.find((part: any) => part.seat === focus.seat) : null;
  const selected = focus ? models[focus.seat]?.get(focus.hand) : null;
  const combo = selected?.row?.combos.find((item: any) => item.cards.join(",") === comboKey);
  const selectedMix = combo?.actions ?? selected?.row?.actions;
  const select = (seat: string, hand: string) => { setFocus({ seat, hand }); setComboKey("all"); };
  return <section className="mw3-range-view" aria-label={t.title} data-mw3-spot={view.spotId}>
    {onRewind && <div className="mw3-history" aria-label={t.history}>{view.history.map((event: any, index: number) =>
      <button key={`${event.street}-${event.index}`} type="button" onClick={() => onRewind(event.street, event.index)}>
        {event.seat} · {event.action === "check" ? t.check : event.action === "fold" ? t.fold : event.action === "call" ? t.callCost : event.amountBb >= event.stackBb ? t.allin : event.action === "raise" ? t.raise : t.bet}
        {event.amountBb > 0 && ` ${number(event.action === "raise" ? event.committedBb + event.amountBb : event.amountBb)}BB`}
      </button>)}</div>}
    {onAction && !view.decision.end && <div className="mw3-actions" aria-label={`${view.decision.seat} · ${t.current}`}>
      <strong>{view.decision.seat}</strong>{groups.map((group: any) => <button type="button" key={group.action} onClick={() => onAction(group.action)} aria-label={`${t.play}: ${labels[group.action]}`}>{labels[group.action]}</button>)}
    </div>}
    <div className={`mw3-tables${focus ? " has-detail" : ""}`}>
      {view.participants.map((part: any) => part.acting
        ? <StrategyMatrix key={part.seat} node={part} title={`${part.seat} · ${t.current}`} ariaLabel={`${part.seat} · ${t.current}`}
          aggregates={models[part.seat]} selected={focus?.seat === part.seat ? focus.hand : null} actions={actions} actionLabels={labels}
          simplified={displayMode === "simple"} unreachableReason={t.noReach} onSelect={(hand: string) => select(part.seat, hand)}
          />
        : <Panel key={part.seat} className="matrix-panel mw3-historical" aria-label={`${part.seat} · ${t.reach}`}>
          <SectionHeading title={`${part.seat} · ${t.reach}`} />
          <div className="matrix-scroll"><div className="matrix">{hands.map(hand => {
            const cell = models[part.seat].get(hand);
            return <button key={hand} type="button" disabled={!cell.comboCount} onClick={() => select(part.seat, hand)} aria-label={cell.unreachable ? `${hand}: ${t.noReach}` : `${hand}: ${t.reach}`}
              aria-pressed={focus?.seat === part.seat && focus?.hand === hand} className={`${cell.unreachable ? "unreachable-hand" : ""}${focus?.seat === part.seat && focus?.hand === hand ? " picked" : ""}`}><strong>{hand}</strong></button>;
          })}</div></div><small>{t.ownReach}</small>
        </Panel>)}
      {focus && selectedPart && <Panel className="mw3-hand-detail" aria-label={`${focus.seat} ${focus.hand}`}>
        <SectionHeading title={`${focus.seat} · ${focus.hand}`} action={<button type="button" className="icon-button" aria-label={t.close} onClick={() => setFocus(null)}><X size={18} /></button>} />
        {!selected?.row?.reachWeight ? <StatusState>{t.noReach}</StatusState> : <>
          {selectedPart.acting ? <>
            <label className="field"><span>{t.combo}</span><select value={comboKey} onChange={event => setComboKey(event.target.value)}>
              <option value="all">{t.average}</option>{selected.row.combos.map((item: any) => <option key={item.cards.join(",")} value={item.cards.join(",")}>{item.cards.map(cardText).join(" ")}</option>)}
            </select></label>
            <ActionBars labels={labels} items={actions.map((action: string) => ({ action, frequency: selectedMix?.[action] ?? 0 }))} />
            <p>{mw3HandExplanation({ tier: combo?.tier, tiers: selected.row.combos.map((item: any) => item.tier), street: view.decision.street, locale })}</p><small>{t.origin}</small>{view.decision.facing && <p>{view.decision.pendingBehind.length ? t.pending : t.closing}</p>}
            {view.decision.facing && <dl className="mw3-price"><dt>{t.callCost}</dt><dd>{number(view.decision.callBb)}BB</dd><dt>{t.required}</dt><dd>{percent(view.decision.callPrice)}</dd></dl>}
          </> : <><p>{t.ownReach}</p><strong>{percent(selected.row.reachWeight / selected.comboCount)}</strong></>}
        </>}
      </Panel>}
    </div>
    {view.decision.end && <small className="mw3-end">{t.done}</small>}
  </section>;
}
