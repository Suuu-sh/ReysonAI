import { hands, label, color, pct } from "../data.js";
import { dominantAction } from "../estimated/display-mode.js";
import { Panel, SectionHeading } from "./primitives.jsx";

const nodeKeys = new WeakMap();
let nextNodeKey = 0;
const keyFor = node => {
  if (!node || typeof node !== "object") return "none";
  if (!nodeKeys.has(node)) nodeKeys.set(node, ++nextNodeKey);
  return nodeKeys.get(node);
};

const adjustedLabel = { add: "卓に合わせてオープンに追加", drop: "卓に合わせてオープンから除外" };

export function StrategyMatrix({ node, aggregates, selected, actions, onSelect, title, ariaLabel, footer, actionLabels = {}, simplified = false, unreachableReason = "既存3bet頻度0%、推奨なし" }) {
  return (
    <Panel className="matrix-panel" aria-label={ariaLabel}>
      <SectionHeading title={title ?? `${node.actingPosition ?? "終端"} の戦略`} />
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
                style={{ "--wave": (index % 13) + Math.floor(index / 13), ...(primaryAction ? { background: color(primaryAction) } : {}) }}
                onClick={() => onSelect(hand)}
                disabled={!aggregate.comboCount}
              >
                <strong>{hand}</strong>
                {!aggregate.unreachable && !simplified && mixedActions.length > 1 && <span className="cell-mix" aria-hidden="true">
                  {mixedActions.map(action => <span key={action} style={{ width: pct(aggregate.actions[action]), background: color(action) }} />)}
                </span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="legend">
        {actions.map(action => <span key={action}><i style={{ background: color(action) }} />{actionLabels[action] ?? label(action)}</span>)}
      </div>
      {footer}
    </Panel>
  );
}
