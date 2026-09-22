import { useMemo, useState } from "react";
import { AppFooter, Sidebar } from "../components/layout.jsx";
import { StrategyMatrix } from "../components/StrategyMatrix.jsx";
import { ActionBars, Field, Panel, SectionHeading, StatList, StatusState } from "../components/primitives.jsx";
import source from "./preflop-ranges.json";
import {
  availableHeroes,
  availableOpeners,
  findSpot,
  hasSpot,
  matrixModel,
  openSizeOptions,
  positions,
  rangeTypes,
  stackOptions,
  validateDataset,
} from "./ranges.js";
import "./ranges.css";

let dataset;
let dataError;
try { dataset = validateDataset(source); } catch (error) { dataError = error.message; }

function EstimatedRanges() {
  const rangeType = "response";
  const [opener, setOpener] = useState("BTN");
  const [hero, setHero] = useState("BB");
  const stackBb = 100;
  const openSizeBb = 2.5;
  const [selected, setSelected] = useState("AKo");
  const [filter, setFilter] = useState("all");
  const spot = dataset ? findSpot(dataset, opener, hero) : null;
  const model = useMemo(() => spot ? matrixModel(spot) : null, [spot]);
  const hand = spot?.hands.find(row => row.hand === selected);
  const availableOpenerPositions = availableOpeners(dataset);
  const availableHeroPositions = availableHeroes(opener).filter(position => hasSpot(dataset, opener, position));

  function changeOpener(value) {
    setOpener(value);
    const nextHeroes = availableHeroes(value).filter(position => hasSpot(dataset, value, position));
    if (!nextHeroes.includes(hero)) setHero(nextHeroes[0] ?? "");
    setFilter("all");
  }

  return <div className="shell">
    <Sidebar activeSection="プリフロップ" onSectionChange={() => {}} />
    <main>
      {dataError ? <StatusState tone="error">{dataError}</StatusState> : <>
        <Panel className="estimate-settings">
          <div><h2>推定レンジ</h2><small>6max Cash · 100BB · Open 2.5BB</small></div>
          <Field label="局面">
            <select aria-label="局面" defaultValue={rangeType}>
              {rangeTypes.map(option => <option key={option.value} value={option.value} disabled={!option.available}>
                {option.label}{option.available ? "" : "（データなし）"}
              </option>)}
            </select>
          </Field>
          <Field label="有効スタック">
            <select aria-label="有効スタック" defaultValue={stackBb}>
              {stackOptions.map(option => <option key={option.value} value={option.value} disabled={!option.available}>
                {option.label}{option.available ? "" : "（データなし）"}
              </option>)}
            </select>
          </Field>
          <Field label="オープンサイズ">
            <select aria-label="オープンサイズ" defaultValue={openSizeBb}>
              {openSizeOptions.map(option => <option key={option.value} value={option.value} disabled={!option.available}>
                {option.label}{option.available ? "" : "（データなし）"}
              </option>)}
            </select>
          </Field>
          <Field label="オープナー"><select value={opener} onChange={e => changeOpener(e.target.value)}>
            {positions.map(position => <option key={position} value={position} disabled={!availableOpenerPositions.includes(position)}>
              {position}{availableOpenerPositions.includes(position) ? "" : "（データなし）"}
            </option>)}
          </select></Field>
          <Field label="Hero"><select value={hero} onChange={e => { setHero(e.target.value); setFilter("all"); }}>
            {positions.map(position => {
              const available = availableHeroPositions.includes(position);
              const isAfterOpener = availableHeroes(opener).includes(position);
              const suffix = available ? "" : isAfterOpener ? "（データなし）" : "（この局面では不可）";
              return <option key={position} value={position} disabled={!available}>{position}{suffix}</option>;
            })}
          </select></Field>
        </Panel>
        <div className="estimate-context">
          <strong>{hero} vs {opener} · {spot.hero_position_vs_opener}</strong>
          <span>全15局面 / 各169ハンド · 推定データ・GTO計算なし</span>
        </div>
        <div className="results estimate-results">
          <StrategyMatrix node={{ actingPosition: hero }} aggregates={model.aggregates} actions={model.actions}
            selected={selected} filter={filter} onSelect={setSelected} onFilterChange={setFilter} />
          <div className="detail-column">
            <Panel>
              <SectionHeading title="選択ハンド" />
              <div className="hand-title"><strong>{selected}</strong><span>{model.aggregates.get(selected).comboCount} Combos</span></div>
              <ActionBars items={model.actions.map(action => ({ action, frequency: model.aggregates.get(selected).actions[action] }))} />
              <StatList items={[
                { label: "3betサイズ（合計）", value: hand.three_bet_size_bb === null ? "—（3betなし）" : `${hand.three_bet_size_bb} BB` },
                { label: "頻度合計", value: `${hand.fold + hand.call + hand.three_bet}%` },
              ]} />
            </Panel>
            <Panel className="ai-reason-copy"><SectionHeading title="この配分の理由" /><p>{hand.reason}</p></Panel>
            <Panel className="estimate-notes">
              <SectionHeading title="データの条件" />
              <small>Heroまで他のプレイヤーは全員フォールド。UTGはオープナーのみ。レーキ未調整・アンティ未モデル化。頻度は5%刻みの概算です。</small>
              {hero === "SB" && <p><small>SBは3bet-or-foldに簡略化しています。</small></p>}
              <details><summary>選択ハンドのJSON</summary><pre>{JSON.stringify(hand, null, 2)}</pre></details>
            </Panel>
          </div>
        </div>
      </>}
      <AppFooter />
    </main>
  </div>;
}

export function RangeWorkspace() {
  return <EstimatedRanges />;
}
