import type { CSSProperties, ReactNode } from "react";
import type { HandAggregate } from "../data.ts";
import { hands, label, color, pct } from "../data.ts";
import { dominantAction } from "../estimated/display-mode.ts";
import { productLocale } from "../i18n.ts";
import { combosOf } from "../../scripts/lib/equity.ts";
import { parseCards } from "../../scripts/postflop-ai/model.ts";
import { Panel, SectionHeading } from "./primitives.tsx";

const nodeKeys = new WeakMap<object, number>();
let nextNodeKey = 0;
const keyFor = (node: object | null) => {
  if (!node || typeof node !== "object") return "none";
  if (!nodeKeys.has(node)) nodeKeys.set(node, ++nextNodeKey);
  return nodeKeys.get(node);
};

const adjustedLabel = { add: "卓に合わせてオープンに追加", drop: "卓に合わせてオープンから除外" };

// Frequency segments read from the most aggressive action on the left to the most passive on the right
// (all-in, larger bets/raises, smaller bets, call, check, fold).
const AGGRESSION = ["all_in", "allin", "raise", "bet125", "bet75", "bet33", "limp", "call", "check", "fold"];
// Sized raises (raise_2_5, raise_12, raise_ai, …) sit with "raise", larger sizes first.
const rankOf = (action: string) => {
  if (action.startsWith("raise_")) {
    const size = Number(action.slice("raise_".length).replace("_", "."));
    return [AGGRESSION.indexOf("raise"), Number.isFinite(size) ? -size : 0];
  }
  const index = AGGRESSION.indexOf(action);
  return [index < 0 ? AGGRESSION.length : index, 0];
};
const stripOrder = (actions: string[]) => [...actions].sort((a, b) => {
  const [ra, sa] = rankOf(a), [rb, sb] = rankOf(b);
  return ra - rb || sa - sb;
});

type ComboMix = { cards: string; mix: Record<string, number>; weight?: number; reachWeight?: number };
type MatrixAggregate = HandAggregate & { combos?: readonly ComboMix[]; adjusted?: "add" | "drop" };

export function StrategyMatrix({ node, aggregates, selected, actions, onSelect, title, ariaLabel, footer, actionLabels = {}, simplified = false, unreachableReason = "既存3bet頻度0%、推奨なし", boardCards }: { node: { actingPosition?: string } | null; aggregates: Map<string, MatrixAggregate>; selected: string | null; actions: string[]; onSelect: (hand: string) => void; title?: ReactNode; ariaLabel?: string; footer?: ReactNode; actionLabels?: Record<string, string>; simplified?: boolean; unreachableReason?: string; boardCards?: string }) {
  const locale = productLocale();
  const reachLabel = locale === "ja" ? "到達重み" : locale === "zh-CN" ? "到达权重" : locale === "es" ? "alcance" : "reach weight";
  const blockedCards = boardCards ? new Set(parseCards(boardCards, boardCards.length / 2)) : null;
  return (
    <Panel className="matrix-panel" aria-label={ariaLabel}>
      <SectionHeading title={title ?? `${node!.actingPosition ?? "終端"} の戦略`} />
      <div className="matrix-scroll">
        <div className="matrix" aria-label="169ハンド" key={keyFor(node)}>
          {hands.map((hand, index) => {
            const aggregate = aggregates.get(hand);
            if (!aggregate) return <div className="empty-hand" key={hand} />;
            const primaryAction = aggregate.unreachable ? null : dominantAction(aggregate, actions);
            const mixedActions = actions.filter(action => (aggregate.actions[action] ?? 0) > 0);
            const reachableCombos = !aggregate.unreachable ? (aggregate.combos ?? []).flatMap(combo => {
              const weight = combo.reachWeight ?? combo.weight;
              return combo.cards && typeof weight === "number" && Number.isFinite(weight) && weight > 0 ? [{ combo, weight }] : [];
            }) : [];
            const availableComboCount = blockedCards ? combosOf(hand).filter(combo => !blockedCards.has(combo[0]) && !blockedCards.has(combo[1])).length : null;
            const reachMass = !aggregate.unreachable ? (aggregate.combos ?? []).reduce((total, combo) => {
              const weight = combo.reachWeight ?? combo.weight;
              return total + (typeof weight === "number" && Number.isFinite(weight) && weight > 0 ? weight : 0);
            }, 0) : 0;
            const reachHeight = availableComboCount === null ? 100 : availableComboCount > 0 ? (reachMass / availableComboCount) * 100 : 0;
            const comboSummary = reachableCombos.map(({ combo, weight }) =>
              `${combo.cards} · ${reachLabel} ${pct(weight)}: ${stripOrder(actions.filter(action => (combo.mix[action] ?? 0) > 0)).map(action => `${actionLabels[action] ?? label(action)} ${pct(combo.mix[action])}`).join(" / ")}`
            ).join("; ");
            return (
              <button
                key={hand}
                aria-pressed={selected === hand}
                aria-label={aggregate.unreachable ? `${hand}、${unreachableReason}` : aggregate.adjusted ? `${hand}、${adjustedLabel[aggregate.adjusted]}` : comboSummary ? `${hand}、${comboSummary}` : hand}
                className={`${selected === hand ? "picked" : ""}${aggregate.unreachable ? " unreachable-hand" : ""}${aggregate.adjusted ? ` adjusted-${aggregate.adjusted}` : ""}`}
                title={aggregate.unreachable ? `${hand}：${unreachableReason}` : aggregate.adjusted ? `${hand}：${adjustedLabel[aggregate.adjusted]}` : comboSummary || undefined}
                style={{ "--wave": (index % 13) + Math.floor(index / 13) } as CSSProperties}
                onClick={() => onSelect(hand)}
                disabled={!aggregate.comboCount}
              >
                {!aggregate.unreachable && reachHeight > 0 && <span className="cell-fill" style={{ height: `${reachHeight}%` }} aria-hidden="true">
                  {simplified ? primaryAction && <span style={{ width: "100%", background: color(primaryAction) } as CSSProperties} />
                    : stripOrder(mixedActions).map(action => <span key={action} style={{ width: pct(aggregate.actions[action]), background: color(action) } as CSSProperties} />)}
                </span>}
                <strong>{hand}</strong>
                <strong>{hand}</strong>
              </button>
            );
          })}
        </div>
      </div>
      <div className="legend">
        {actions.map(action => <span key={action}><i style={{ background: color(action) } as CSSProperties} />{actionLabels[action] ?? label(action)}</span>)}
      </div>
      {footer}
    </Panel>
  );
}
