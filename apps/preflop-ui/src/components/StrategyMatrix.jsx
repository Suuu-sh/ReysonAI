import { hands, label, color, pct } from "../data.js";
import { Panel, SectionHeading } from "./primitives.jsx";

export function StrategyMatrix({ node, aggregates, selected, filter, actions, onSelect, onFilterChange, title, ariaLabel, footer }) {
  return (
    <Panel className="matrix-panel" aria-label={ariaLabel}>
      <SectionHeading
        title={title ?? `${node.actingPosition ?? "終端"} の戦略`}
        action={<select aria-label={ariaLabel ? `${ariaLabel}の表示アクション` : "表示アクション"} value={filter} onChange={event => onFilterChange(event.target.value)}>
          <option value="all">すべてのアクション</option>
          {actions.map(action => <option key={action} value={action}>{label(action)}</option>)}
        </select>}
      />
      <div className="matrix-scroll">
        <div className="matrix" aria-label="169ハンド">
          {hands.map(hand => {
            const aggregate = aggregates.get(hand);
            if (!aggregate) return <div className="empty-hand" key={hand} />;
            return (
              <button
                key={hand}
                aria-pressed={selected === hand}
                aria-label={hand}
                className={`${selected === hand ? "picked" : ""}${aggregate.unreachable ? " unreachable-hand" : ""}`}
                title={aggregate.unreachable ? `${hand}：対象外（既存3bet頻度0%）` : undefined}
                onClick={() => onSelect(hand)}
                disabled={!aggregate.comboCount}
              >
                <strong>{hand}</strong>
                {aggregate.unreachable && <small>対象外</small>}
                {!aggregate.unreachable && filter !== "all" && <small>{aggregate.comboCount && Number.isFinite(aggregate.actions[filter]) ? pct(aggregate.actions[filter]) : ""}</small>}
                {!aggregate.unreachable && <div className="cell-mix" aria-hidden="true">
                  {actions.map(action => <span key={action} style={{ width: pct(aggregate.actions[action] ?? 0), background: color(action), opacity: filter === "all" || filter === action ? 1 : 0.15 }} />)}
                </div>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="legend">
        {actions.map(action => <span key={action}><i style={{ background: color(action) }} />{label(action)}</span>)}
      </div>
      {footer}
    </Panel>
  );
}
