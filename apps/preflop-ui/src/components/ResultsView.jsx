import { expectedValue, totals } from "../data.js";
import { ActionBars, Panel, SectionHeading, StatList } from "./primitives.jsx";
import { ComboTable } from "./ComboTable.jsx";
import { StrategyMatrix } from "./StrategyMatrix.jsx";

export function ResultsView({ section, tab, node, solution, combos, aggregates, selected, filter, actions, onSelect, onFilterChange }) {
  const chosen = combos.filter(combo => combo.hand === selected);
  const mix = totals(combos);
  const chosenMix = totals(chosen);
  const ev = expectedValue(chosen);
  const showMatrix = section !== "ハンド詳細";

  return (
    <div className={`results ${showMatrix ? "" : "detail-only"} ${tab === "Combo別EV" || !showMatrix ? "has-combos" : ""}`}>
      {showMatrix && <StrategyMatrix node={node} aggregates={aggregates} selected={selected} filter={filter} actions={actions} onSelect={onSelect} onFilterChange={onFilterChange} />}

      <div className="summary-column">
        <Panel>
          <SectionHeading title="アクション頻度（全Combo）" />
          <ActionBars items={mix} />
          <small>保存されたComboを等重みで集計。到達レンジ加重ではありません。</small>
        </Panel>
        <Panel>
          <SectionHeading title="レンジの概要" />
          <StatList items={[
            { label: "保存Combo数", value: `${combos.length} / 1326` },
            { label: "ハンドクラス", value: `${[...aggregates.values()].filter(hand => hand.comboCount > 0).length} / 169` },
            { label: "Iterations", value: solution?.iterations },
          ]} />
        </Panel>
      </div>

      {chosen.length > 0 && <div className="detail-column">
        <Panel>
          <SectionHeading title="選択ハンドの詳細" />
          <div className="hand-title"><strong>{selected}</strong><span>{chosen.length} Combos</span></div>
          <StatList items={[
            ...(ev !== null ? [{ label: "戦略加重EV", value: `${ev.toFixed(3)} BB` }] : []),
            { label: "評価モデル", value: "実験モデル" },
          ]} />
        </Panel>
        <Panel>
          <SectionHeading title="このハンドのアクション内訳" />
          <ActionBars items={chosenMix} />
        </Panel>
      </div>}

      <ComboTable selected={selected} combos={chosen} tab={tab} section={section} />
    </div>
  );
}
