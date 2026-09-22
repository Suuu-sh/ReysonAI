import { useMemo, useState } from "react";
import { AppFooter, Header } from "../components/layout.jsx";
import { StrategyMatrix } from "../components/StrategyMatrix.jsx";
import { ActionBars, Field, Panel, SectionHeading, StatList, StatusState } from "../components/primitives.jsx";
import source from "./preflop-ranges.json";
import openingSource from "./opening-ranges.json";
import { findOpeningSpot, openingMatrixModel, validateOpeningDataset } from "./opening-ranges.js";
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
let openingDataset;
let openingDataError;
try { openingDataset = validateOpeningDataset(openingSource); } catch (error) { openingDataError = error.message; }

function EstimatedRanges() {
  const [rangeType, setRangeType] = useState("response");
  const isOpening = rangeType === "open";
  const [opener, setOpener] = useState("BTN");
  const [hero, setHero] = useState("BB");
  const stackBb = 100;
  const openSizeBb = 2.5;
  const [selected, setSelected] = useState("AKo");
  const [filter, setFilter] = useState("all");
  const currentError = isOpening ? openingDataError : dataError;
  const spot = isOpening
    ? openingDataset ? findOpeningSpot(openingDataset, opener) : null
    : dataset ? findSpot(dataset, opener, hero) : null;
  const model = useMemo(() => spot ? (isOpening ? openingMatrixModel(spot) : matrixModel(spot)) : null, [spot, isOpening]);
  const hand = spot?.hands.find(row => row.hand === selected);
  const availableOpenerPositions = isOpening ? openingDataset?.spots.map(item => item.hero) ?? [] : availableOpeners(dataset);
  const availableHeroPositions = availableHeroes(opener).filter(position => hasSpot(dataset, opener, position));

  function changeOpener(value) {
    setOpener(value);
    const nextHeroes = availableHeroes(value).filter(position => hasSpot(dataset, value, position));
    if (!nextHeroes.includes(hero)) setHero(nextHeroes[0] ?? "");
    setFilter("all");
  }

  return <div className="shell">
    <Header activeSection="プリフロップ" onSectionChange={() => {}} />
    <main>
      {currentError ? <StatusState tone="error">{currentError}</StatusState> : <>
        <Panel className="estimate-settings">
          <div><h2>推定レンジ</h2><small>6max Cash · 100BB · Open 2.5BB</small></div>
          <Field label="局面">
            <select aria-label="局面" value={rangeType} onChange={e => { setRangeType(e.target.value); setFilter("all"); }}>
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
          <Field label={isOpening ? "Hero（オープナー）" : "Hero"}><select disabled={isOpening} value={isOpening ? opener : hero} onChange={e => { setHero(e.target.value); setFilter("all"); }}>
            {(isOpening ? [opener] : positions).map(position => {
              const available = isOpening ? position === opener : availableHeroPositions.includes(position);
              const isAfterOpener = availableHeroes(opener).includes(position);
              const suffix = available ? "" : isAfterOpener ? "（データなし）" : "（この局面では不可）";
              return <option key={position} value={position} disabled={!available}>{position}{suffix}</option>;
            })}
          </select></Field>
        </Panel>
        <div className="estimate-context">
          <strong>{isOpening ? `${opener} Open · 2.5BB` : `${hero} vs ${opener} · ${spot.hero_position_vs_opener}`}</strong>
          <span>{isOpening ? "全5ポジション" : "全15局面"} / 各169ハンド · 推定データ・GTO計算なし</span>
        </div>
        <div className="results estimate-results">
          <StrategyMatrix node={{ actingPosition: isOpening ? opener : hero }} aggregates={model.aggregates} actions={model.actions}
            selected={selected} filter={filter} onSelect={setSelected} onFilterChange={setFilter} />
          <div className="detail-column">
            <Panel>
              <SectionHeading title="選択ハンド" />
              <div className="hand-title"><strong>{selected}</strong><span>{model.aggregates.get(selected).comboCount} Combos</span></div>
              <ActionBars items={model.actions.map(action => ({ action, frequency: model.aggregates.get(selected).actions[action] }))} />
              <StatList items={[
                isOpening
                  ? { label: "オープンサイズ（合計）", value: hand.open_size_bb === null ? "—（オープンなし）" : `${hand.open_size_bb} BB` }
                  : { label: "3betサイズ（合計）", value: hand.three_bet_size_bb === null ? "—（3betなし）" : `${hand.three_bet_size_bb} BB` },
                { label: "頻度合計", value: `${isOpening ? hand.open + hand.fold : hand.fold + hand.call + hand.three_bet}%` },
              ]} />
            </Panel>
            <Panel className="ai-reason-copy"><SectionHeading title="この配分の理由" /><p>{hand.reason}</p></Panel>
            <Panel className="estimate-notes">
              <SectionHeading title="データの条件" />
              <small>{isOpening ? "Heroまで全員フォールドした未オープンポット。オープン／フォールドの推定です。" : "Heroまで他のプレイヤーは全員フォールド。対オープンではUTGはオープナーのみ。"}レーキ未調整・アンティ未モデル化。頻度は概算です。</small>
              {(isOpening ? opener : hero) === "SB" && <p><small>{isOpening ? "SBは2.5BBのraise-or-foldに簡略化し、リンプは含めません。" : "SBは3bet-or-foldに簡略化しています。"}</small></p>}
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
