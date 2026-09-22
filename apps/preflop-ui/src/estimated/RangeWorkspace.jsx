import { useMemo, useState } from "react";
import { AppFooter, Header } from "../components/layout.jsx";
import { StrategyMatrix } from "../components/StrategyMatrix.jsx";
import { ActionBars, Field, Panel, SectionHeading, StatList, StatusState } from "../components/primitives.jsx";
import source from "./preflop-ranges.json";
import openingSource from "./opening-ranges.json";
import threeBetSource from "./three-bet-responses.json";
import { findThreeBetSpot, threeBetMatrixModel, validateThreeBetDataset } from "./three-bet-responses.js";
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
let threeBetDataset;
let threeBetDataError;
try {
  if (dataError || openingDataError) throw new Error(dataError || openingDataError);
  threeBetDataset = validateThreeBetDataset(threeBetSource, dataset, openingDataset);
} catch (error) { threeBetDataError = error.message; }

function HandDetails({ expandable, hero, hand, children }) {
  if (!expandable) return children;
  return <details className="comparison-details">
    <summary>{hero} · {hand.hand}：3bet {hand.three_bet}% / コール {hand.call}% / フォールド {hand.fold}% · 詳細</summary>
    {children}
  </details>;
}

function EstimatedRanges() {
  const [rangeType, setRangeType] = useState("response");
  const isOpening = rangeType === "open";
  const isThreeBet = rangeType === "three_bet";
  const isComparison = rangeType === "response";
  const [opener, setOpener] = useState("BTN");
  const [hero, setHero] = useState("BB");
  // `hero` is the later seat selector: the 3-bettor when the opener acts again.
  const actingHero = isOpening || isThreeBet ? opener : hero;
  const stackBb = 100;
  const openSizeBb = 2.5;
  const [selected, setSelected] = useState("AKo");
  const [filter, setFilter] = useState("all");
  const [openerFilter, setOpenerFilter] = useState("all");
  const currentError = isOpening ? openingDataError : isThreeBet ? threeBetDataError : dataError || openingDataError;
  const openerSpot = openingDataset ? findOpeningSpot(openingDataset, opener) : null;
  const openerModel = useMemo(() => openerSpot ? openingMatrixModel(openerSpot) : null, [openerSpot]);
  const openerHand = openerSpot?.hands.find(row => row.hand === selected);
  const spot = isOpening
    ? openingDataset ? findOpeningSpot(openingDataset, opener) : null
    : isThreeBet ? threeBetDataset ? findThreeBetSpot(threeBetDataset, opener, hero) : null
    : dataset ? findSpot(dataset, opener, hero) : null;
  const model = useMemo(() => spot ? (isOpening ? openingMatrixModel(spot) : isThreeBet ? threeBetMatrixModel(spot) : matrixModel(spot)) : null, [spot, isOpening, isThreeBet]);
  const hand = spot?.hands.find(row => row.hand === selected);
  const availableOpenerPositions = isOpening ? openingDataset?.spots.map(item => item.hero) ?? [] : availableOpeners(dataset);
  const availableHeroPositions = availableHeroes(opener).filter(position => hasSpot(dataset, opener, position));

  function changeOpener(value) {
    setOpener(value);
    const nextHeroes = availableHeroes(value).filter(position => hasSpot(dataset, value, position));
    if (!nextHeroes.includes(hero)) setHero(nextHeroes[0] ?? "");
    setFilter("all");
    setOpenerFilter("all");
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
          <Field label={isThreeBet ? "オープナー（Hero）" : "オープナー"}><select value={opener} onChange={e => changeOpener(e.target.value)}>
            {positions.map(position => <option key={position} value={position} disabled={!availableOpenerPositions.includes(position)}>
              {position}{availableOpenerPositions.includes(position) ? "" : "（データなし）"}
            </option>)}
          </select></Field>
          <Field label={isOpening ? "Hero（オープナー）" : isThreeBet ? "3bettor" : "Hero"}><select disabled={isOpening} value={isOpening ? opener : hero} onChange={e => { setHero(e.target.value); setFilter("all"); }}>
            {(isOpening ? [opener] : positions).map(position => {
              const available = isOpening ? position === opener : availableHeroPositions.includes(position);
              const isAfterOpener = availableHeroes(opener).includes(position);
              const suffix = available ? "" : isAfterOpener ? "（データなし）" : "（この局面では不可）";
              return <option key={position} value={position} disabled={!available}>{position}{suffix}</option>;
            })}
          </select></Field>
        </Panel>
        <div className="estimate-context">
          <strong>{isOpening ? `${opener} Open · 2.5BB` : isThreeBet ? `${opener}（Hero）Open 2.5BB → ${hero} 3bet ${spot.three_bet_size_bb}BB → ${opener}の応答 · ${spot.hero_position_vs_three_bettor}` : `${hero} vs ${opener} · ${spot.hero_position_vs_opener}`}</strong>
          <span>{isOpening ? "全5ポジション" : "全15局面"} / 各169ハンド · 推定データ・GTO計算なし</span>
        </div>
        <div className={`results estimate-results${isComparison ? " comparison-results" : ""}`}>
          {isComparison && <StrategyMatrix node={{ actingPosition: opener }}
            title={`${opener} · オープナーのオープンレンジ`} ariaLabel="オープナーのレンジ"
            aggregates={openerModel.aggregates} actions={openerModel.actions}
            selected={selected} filter={openerFilter} onSelect={setSelected} onFilterChange={setOpenerFilter}
            footer={<small className="comparison-hand">{selected}：オープン {openerHand.open}% / フォールド {openerHand.fold}%</small>} />}
          <StrategyMatrix node={{ actingPosition: actingHero }} aggregates={model.aggregates} actions={model.actions}
            title={isOpening ? undefined : `${actingHero} · Heroの${isThreeBet ? "3bet後の応答" : "対応レンジ"}`} ariaLabel={isOpening ? undefined : "Heroのレンジ"}
            footer={!isComparison ? undefined : <small className="comparison-hand">{selected}：3bet {hand.three_bet}% / コール {hand.call}% / フォールド {hand.fold}%</small>}
            selected={selected} filter={filter} onSelect={setSelected} onFilterChange={setFilter} />
          <HandDetails expandable={isComparison} hero={actingHero} hand={hand}>
          <div className="detail-column">
            <Panel>
              <SectionHeading title={isOpening ? "選択ハンド" : `${actingHero} · Heroの選択ハンド`} />
              <div className="hand-title"><strong>{selected}</strong><span>{model.aggregates.get(selected).comboCount} Combos</span></div>
              <ActionBars items={model.actions.map(action => ({ action, frequency: model.aggregates.get(selected).actions[action] }))} />
              <StatList items={[
                isOpening
                  ? { label: "オープンサイズ（合計）", value: hand.open_size_bb === null ? "—（オープンなし）" : `${hand.open_size_bb} BB` }
                  : isThreeBet ? { label: "4betサイズ（合計）", value: hand.four_bet_size_bb === null ? "—（4betなし）" : `${hand.four_bet_size_bb} BB` }
                  : { label: "3betサイズ（合計）", value: hand.three_bet_size_bb === null ? "—（3betなし）" : `${hand.three_bet_size_bb} BB` },
                ...(isThreeBet ? [{ label: "受ける3bet（合計）", value: `${spot.three_bet_size_bb} BB` }] : []),
                { label: "頻度合計", value: `${isOpening ? hand.open + hand.fold : hand.fold + hand.call + (isThreeBet ? hand.four_bet : hand.three_bet)}%` },
              ]} />
            </Panel>
            <Panel className="ai-reason-copy"><SectionHeading title="この配分の理由" /><p>{hand.reason}</p></Panel>
            <Panel className="estimate-notes">
              <SectionHeading title="データの条件" />
              <small>{isOpening ? "Heroまで全員フォールドした未オープンポット。オープン／フォールドの推定です。" : isThreeBet ? "Heroがオープン後、1人の3betを受け、他の全員がフォールドした局面。既にオープンした条件下の頻度です。" : "Heroまで他のプレイヤーは全員フォールド。対オープンではUTGはオープナーのみ。"}レーキ未調整・アンティ未モデル化。頻度は概算です。</small>
              {isThreeBet && <p><small>初回オープン0%のハンドは対象外（形式上フォールド100%）。コールド4bet・スクイーズ・4bet後の応答は含めません。</small></p>}
              {!isThreeBet && actingHero === "SB" && <p><small>{isOpening ? "SBは2.5BBのraise-or-foldに簡略化し、リンプは含めません。" : "SBは3bet-or-foldに簡略化しています。"}</small></p>}
              <details><summary>選択ハンドのJSON</summary><pre>{JSON.stringify(hand, null, 2)}</pre></details>
            </Panel>
          </div>
          </HandDetails>
        </div>
      </>}
      <AppFooter />
    </main>
  </div>;
}

export function RangeWorkspace() {
  return <EstimatedRanges />;
}
