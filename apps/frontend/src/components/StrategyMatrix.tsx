import type { CSSProperties, ReactNode } from "react";
import type { HandAggregate } from "../data.ts";
import { hands, label, color, pct } from "../data.ts";
import { dominantAction } from "../estimated/display-mode.ts";
import { Panel, SectionHeading } from "./primitives.tsx";

const nodeKeys = new WeakMap<object, number>();
let nextNodeKey = 0;
const keyFor = (node: object | null) => {
  if (!node || typeof node !== "object") return "none";
  if (!nodeKeys.has(node)) nodeKeys.set(node, ++nextNodeKey);
  return nodeKeys.get(node);
};

const adjustedLabel = { add: "卓に合わせてオープンに追加", drop: "卓に合わせてオープンから除外" };

// Mix strips read from the most aggressive action on the left to the most passive on the right
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

export function StrategyMatrix({ node, aggregates, selected, actions, onSelect, title, ariaLabel, footer, actionLabels = {}, simplified = false, unreachableReason = "既存3bet頻度0%、推奨なし" }: { node: { actingPosition?: string } | null; aggregates: Map<string, HandAggregate & { adjusted?: "add" | "drop" }>; selected: string | null; actions: string[]; onSelect: (hand: string) => void; title?: ReactNode; ariaLabel?: string; footer?: ReactNode; actionLabels?: Record<string, string>; simplified?: boolean; unreachableReason?: string }) {
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
            return (
              <button
                key={hand}
                aria-pressed={selected === hand}
                aria-label={aggregate.unreachable ? `${hand}、${unreachableReason}` : aggregate.adjusted ? `${hand}、${adjustedLabel[aggregate.adjusted]}` : hand}
                className={`${selected === hand ? "picked" : ""}${aggregate.unreachable ? " unreachable-hand" : ""}${aggregate.adjusted ? ` adjusted-${aggregate.adjusted}` : ""}`}
                title={aggregate.unreachable ? `${hand}：${unreachableReason}` : aggregate.adjusted ? `${hand}：${adjustedLabel[aggregate.adjusted]}` : undefined}
                style={{ "--wave": (index % 13) + Math.floor(index / 13), ...(primaryAction ? { background: color(primaryAction) } : {}) } as CSSProperties}
                onClick={() => onSelect(hand)}
                disabled={!aggregate.comboCount}
              >
                <strong>{hand}</strong>
                {!aggregate.unreachable && !simplified && mixedActions.length > 1 && <span className="cell-mix" aria-hidden="true">
                  {stripOrder(mixedActions).map(action => <span key={action} style={{ width: pct(aggregate.actions[action]), background: color(action) } as CSSProperties} />)}
                </span>}
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
