import { useMemo, useState } from "react";
import { createDefaultAiPreflopRanges } from "../../../../packages/solveagto-sdk-ts/src/preflop-ranges.ts";
import { color, hands, sortActions } from "../data.js";
import { ActionBars, Panel, SectionHeading, StatList } from "./primitives.jsx";
import { StrategyMatrix } from "./StrategyMatrix.jsx";

const DISPLAY_ACTIONS = {
  open: "raise_2.5",
  fold: "fold",
  call: "call",
  three_bet: "raise_10",
};

const HAND_COMBO_COUNTS = new Map(hands.map(hand => [
  hand,
  hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12,
]));

export function AiRangeView({ activeSpot, onSpotChange }) {
  const [selected, setSelected] = useState("AKs");
  const [filter, setFilter] = useState("all");
  const ranges = useMemo(() => createDefaultAiPreflopRanges(), []);
  const range = ranges[activeSpot];
  const actions = sortActions(range.actions.map(action => DISPLAY_ACTIONS[action]));
  const aggregates = new Map(range.hands.map(item => [item.hand, {
    hand: item.hand,
    comboCount: HAND_COMBO_COUNTS.get(item.hand) ?? 0,
    reason: item.reason,
    actions: Object.fromEntries(range.actions.map(action => [
      DISPLAY_ACTIONS[action], (item.frequencies[action] ?? 0) / 100,
    ])),
  }]));
  const chosen = aggregates.get(selected) ?? aggregates.get(range.hands[0]?.hand);
  const changeSpot = nextSpot => {
    setFilter("all");
    onSpotChange(nextSpot);
  };
  const chosenMix = actions.map((action, index) => ({
    action,
    frequency: chosen?.actions[action] ?? 0,
    count: chosen?.actions[action] ?? 0,
    color: color(action, index),
  }));
  const node = {
    actingPosition: activeSpot === "btn_open" ? "BTN" : "BB",
  };

  return (
    <>
      <Panel className="ai-range-settings">
        <div>
          <SectionHeading title="AI推定レンジ" />
          <small>Cash · 6max · Effective Stack 100BB · BTN open 2.5BB</small>
        </div>
        <div className="ai-range-toggle" role="group" aria-label="AI推定レンジの局面">
          <button aria-pressed={activeSpot === "btn_open"} onClick={() => changeSpot("btn_open")}>BTN Open</button>
          <button aria-pressed={activeSpot === "bb_vs_btn_open"} onClick={() => changeSpot("bb_vs_btn_open")}>BB vs BTN Open</button>
        </div>
        <small className="ai-range-provider">
          Provider: {range.provider.name} / {activeSpot === "bb_vs_btn_open" ? `3bet: ${range.spot.threeBetSizeBb}BB固定` : "open: 2.5BB固定"}
        </small>
      </Panel>

      <div className="results ai-range-results">
        <StrategyMatrix
          node={node}
          aggregates={aggregates}
          selected={selected}
          filter={filter}
          actions={actions}
          onSelect={setSelected}
          onFilterChange={setFilter}
        />

        <div className="summary-column">
          <Panel>
            <SectionHeading title="レンジの概要" />
            <StatList items={[
              { label: "ハンドクラス", value: "169 / 169" },
              { label: "Provider", value: range.provider.name },
              { label: "ステータス", value: "AI推定" },
            ]} />
          </Panel>
        </div>

        <div className="detail-column">
          <Panel>
            <SectionHeading title="選択ハンドの詳細" />
            <div className="hand-title"><strong>{selected}</strong><span>{HAND_COMBO_COUNTS.get(selected) ?? 0} Combos</span></div>
            <StatList items={[
              { label: "局面", value: range.spot.label },
              { label: "評価状態", value: "AI推定レンジ" },
            ]} />
          </Panel>
          <Panel className="ai-reason-panel">
            <SectionHeading title="このハンドの理由" />
            <div className="ai-reason-copy">
              <strong>{selected}の考え方</strong>
              <p>{chosen?.reason ?? "このハンドの理由データはありません。"}</p>
              <small>AI知識ベースによる初心者向けの説明です。GTO証明ではありません。</small>
            </div>
          </Panel>
          <Panel>
            <SectionHeading title="このハンドのアクション内訳" />
            <ActionBars items={chosenMix} />
          </Panel>
        </div>
      </div>
    </>
  );
}
