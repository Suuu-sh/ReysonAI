import { expectedValue, totals } from "../data.js";
import { ActionBars, Panel, SectionHeading, StatList } from "./primitives.jsx";
import { ComboTable } from "./ComboTable.jsx";
import { StrategyMatrix } from "./StrategyMatrix.jsx";

export function ResultsView({ section, node, solution, combos, aggregates, selected, filter, actions, onSelect, onFilterChange }) {
  const chosen = combos.filter(combo => combo.hand === selected);
  const chosenMix = totals(chosen);
  const ev = expectedValue(chosen);
  const validation = solution?.validation;
  const showMatrix = section !== "ハンド詳細";

  return (
    <div className={`results ${showMatrix ? "" : "detail-only"} ${!showMatrix ? "has-combos" : ""}`}>
      {showMatrix && <StrategyMatrix node={node} aggregates={aggregates} selected={selected} filter={filter} actions={actions} onSelect={onSelect} onFilterChange={onFilterChange} />}

      {chosen.length > 0 && <div className="detail-column">
        <Panel>
          <SectionHeading title="選択ハンドの詳細" />
          <div className="hand-title"><strong>{selected}</strong><span>{chosen.length} Combos</span></div>
          <StatList items={[
            ...(ev !== null ? [{ label: "戦略加重EV", value: `${ev.toFixed(3)} BB` }] : []),
            { label: "継続価値", value: solution?.continuationModelVersion ?? "未指定" },
            { label: "評価状態", value: validation?.gtoVerified ? "GTO検証済み" : "暫定モデル" },
          ]} />
        </Panel>
        <Panel>
          <SectionHeading title="このハンドのアクション内訳" />
          <ActionBars items={chosenMix} />
        </Panel>
      </div>}

      <ComboTable selected={selected} combos={chosen} />
    </div>
  );
}
