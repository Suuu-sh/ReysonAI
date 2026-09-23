import { useMemo, useState } from "react";
import { AppFooter, Header } from "../components/layout.jsx";
import { StrategyMatrix } from "../components/StrategyMatrix.jsx";
import { ActionBars, Field, Panel, SectionHeading, StatList, StatusState } from "../components/primitives.jsx";
import source from "./preflop-ranges.json";
import openingSource from "./opening-ranges.json";
import { findFourBetSpot, fourBetMatrixModel, loadFourBetDataset } from "./four-bet-responses.js";
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

// Raw glob keeps missing files and invalid JSON inside the explicit error boundary.
const fourBetFiles = import.meta.glob("./four-bet-responses.json", { eager: true, query: "?raw", import: "default" });
const fourBetState = loadFourBetDataset(fourBetFiles["./four-bet-responses.json"], dataset, threeBetDataset, openingDataset);

function HandBreakdown({ title, hand, model, isOpening, isThreeBet, isFourBet, spot, position, onReturnToComparison }) {
  const aggregate = model.aggregates.get(hand.hand);
  const totalFrequency = isOpening
    ? hand.open + hand.fold
    : hand.fold + hand.call + (isFourBet ? hand.all_in : isThreeBet ? hand.four_bet : hand.three_bet);

  return <div className={`detail-column${onReturnToComparison ? " comparison-focus-details" : ""}`}>
    <Panel>
      <SectionHeading title={title} action={onReturnToComparison && <button type="button" onClick={onReturnToComparison}>両方のレンジを表示</button>} />
      <div className="hand-title"><strong>{hand.hand}</strong><span>{aggregate.comboCount} Combos</span></div>
      {aggregate.unreachable ? <StatusState title="対象外（到達不能）">既存3bet頻度が0%のため、この経路の推奨頻度はありません。保存上のfold=100は形式上の値です。</StatusState> : <>
      {isFourBet && <small>オールイン = 5bet（合計100BB）</small>}
      <ActionBars items={model.actions.map(action => ({ action, frequency: aggregate.actions[action] }))} />
      <StatList items={[
        isOpening
          ? { label: "オープンサイズ（合計）", value: hand.open_size_bb === null ? "—（オープンなし）" : `${hand.open_size_bb} BB` }
          : isFourBet ? { label: "5betオールイン（合計）", value: hand.all_in_size_bb === null ? "—（5betなし）" : `${hand.all_in_size_bb} BB` }
          : isThreeBet ? { label: "4betサイズ（合計）", value: hand.four_bet_size_bb === null ? "—（4betなし）" : `${hand.four_bet_size_bb} BB` }
          : { label: "3betサイズ（合計）", value: hand.three_bet_size_bb === null ? "—（3betなし）" : `${hand.three_bet_size_bb} BB` },
        ...(isFourBet ? [{ label: "受ける4bet（合計）", value: `${spot.four_bet_size_bb} BB` }, { label: "元の3bet（合計）", value: `${spot.three_bet_size_bb} BB` }] : []),
        ...(isThreeBet ? [{ label: "受ける3bet（合計）", value: `${spot.three_bet_size_bb} BB` }] : []),
        { label: "頻度合計", value: `${totalFrequency}%` },
      ]} />
      </>}
    </Panel>
    <Panel className="ai-reason-copy"><SectionHeading title="この配分の理由" /><p>{hand.reason}</p></Panel>
    <Panel className="estimate-notes">
      <SectionHeading title="データの条件" />
      <small>{isOpening ? "Heroまで全員フォールドした未オープンポット。オープン／フォールドの推定です。" : isFourBet ? "Heroは元の3bettor。オープナーの4betに応答し、他の全員はフォールド。既に3betした条件下の頻度です。" : isThreeBet ? "Heroがオープン後、1人の3betを受け、他の全員がフォールドした局面。既にオープンした条件下の頻度です。" : "Heroまで他のプレイヤーは全員フォールド。対オープンではUTGはオープナーのみ。"}レーキ未調整・アンティなし。頻度は概算です。</small>
      {isThreeBet && <p><small>初回オープン0%のハンドは対象外（形式上フォールド100%）。この表はオープナーの判断です。4bet後の元の3bettorの応答は別局面で表示します。</small></p>}
      {isFourBet && <p><small>5betは合計100BBのオールインのみ。非オールイン5bet・コールド4bet・スクイーズは含みません。独立した推定であり、前段レンジとの同時均衡やEVは未計算です。</small></p>}
      {!isThreeBet && !isFourBet && position === "SB" && <p><small>{isOpening ? "SBは2.5BBのraise-or-foldに簡略化し、リンプは含めません。" : "SBは3bet-or-foldに簡略化しています。"}</small></p>}
      <details><summary>選択ハンドのJSON</summary><pre>{JSON.stringify(hand, null, 2)}</pre></details>
    </Panel>
  </div>;
}

export function EstimatedRanges({ initialRangeType = "response", fourBet = fourBetState }) {
  const [rangeType, setRangeType] = useState(initialRangeType);
  const isOpening = rangeType === "open";
  const isThreeBet = rangeType === "three_bet";
  const isFourBet = rangeType === "four_bet";
  const isComparison = rangeType === "response";
  const [opener, setOpener] = useState("BTN");
  const [hero, setHero] = useState("BB");
  const [focusedRange, setFocusedRange] = useState(null);
  // `hero` is the later seat selector: the 3-bettor when the opener acts again.
  const actingHero = isOpening || isThreeBet ? opener : hero;
  const stackBb = 100;
  const openSizeBb = 2.5;
  const [selected, setSelected] = useState("AKo");
  const [filter, setFilter] = useState("all");
  const [openerFilter, setOpenerFilter] = useState("all");
  const currentError = isFourBet ? fourBet.error : isOpening ? openingDataError : isThreeBet ? threeBetDataError : dataError || openingDataError;
  const openerSpot = openingDataset ? findOpeningSpot(openingDataset, opener) : null;
  const openerModel = useMemo(() => openerSpot ? openingMatrixModel(openerSpot) : null, [openerSpot]);
  const openerHand = openerSpot?.hands.find(row => row.hand === selected);
  const spot = isOpening
    ? openingDataset ? findOpeningSpot(openingDataset, opener) : null
    : isFourBet ? fourBet.data ? findFourBetSpot(fourBet.data, opener, hero) : null
    : isThreeBet ? threeBetDataset ? findThreeBetSpot(threeBetDataset, opener, hero) : null
    : dataset ? findSpot(dataset, opener, hero) : null;
  const model = useMemo(() => spot ? (isOpening ? openingMatrixModel(spot) : isFourBet ? fourBetMatrixModel(spot, findSpot(dataset, opener, hero)) : isThreeBet ? threeBetMatrixModel(spot) : matrixModel(spot)) : null, [spot, isOpening, isThreeBet, isFourBet, opener, hero]);
  const hand = spot?.hands.find(row => row.hand === selected);
  const availableOpenerPositions = isOpening ? openingDataset?.spots.map(item => item.hero) ?? [] : availableOpeners(dataset);
  const availableHeroPositions = availableHeroes(opener).filter(position => hasSpot(dataset, opener, position));

  function changeOpener(value) {
    setOpener(value);
    setFocusedRange(null);
    const nextHeroes = availableHeroes(value).filter(position => hasSpot(dataset, value, position));
    if (!nextHeroes.includes(hero)) setHero(nextHeroes[0] ?? "");
    setFilter("all");
    setOpenerFilter("all");
  }

  return <div className="shell">
    <Header activeSection="プリフロップ" onSectionChange={() => {}} />
    <main>
      <Panel className="estimate-settings">
          <div><h2>推定レンジ</h2><small>6max Cash · 100BB · Open 2.5BB · アンティなし</small></div>
          <Field label="局面">
            <select aria-label="局面" value={rangeType} onChange={e => { setRangeType(e.target.value); setFilter("all"); setFocusedRange(null); }}>
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
          <Field label={isOpening ? "Hero（オープナー）" : isThreeBet ? "3bettor" : isFourBet ? "Hero（元の3bettor）" : "Hero"}><select disabled={isOpening} value={isOpening ? opener : hero} onChange={e => { setHero(e.target.value); setFilter("all"); setFocusedRange(null); }}>
            {(isOpening ? [opener] : positions).map(position => {
              const available = isOpening ? position === opener : availableHeroPositions.includes(position);
              const isAfterOpener = availableHeroes(opener).includes(position);
              const suffix = available ? "" : isAfterOpener ? "（データなし）" : "（この局面では不可）";
              return <option key={position} value={position} disabled={!available}>{position}{suffix}</option>;
            })}
          </select></Field>
        </Panel>
        {currentError ? <StatusState tone="error">{currentError}</StatusState> : <>
        <div className="estimate-context">
          <strong>{isOpening ? `${opener} Open · 2.5BB` : isFourBet ? `${opener} Open 2.5BB → ${hero} 3bet ${spot.three_bet_size_bb}BB → ${opener} 4bet ${spot.four_bet_size_bb}BB → ${hero}（元の3bettor / Hero）の応答 · ${spot.hero_position_vs_opener}` : isThreeBet ? `${opener}（Hero）Open 2.5BB → ${hero} 3bet ${spot.three_bet_size_bb}BB → ${opener}の応答 · ${spot.hero_position_vs_three_bettor}` : `${hero} vs ${opener} · ${spot.hero_position_vs_opener}`}</strong>
          <span>{isOpening ? "全5ポジション" : "全15局面"} / 各169ハンド · 推定データ・GTO計算なし</span>
        </div>
        <div className={`results estimate-results${isComparison ? " comparison-results" : ""}${focusedRange ? " comparison-focused" : ""}`}>
          {isComparison && focusedRange !== "hero" && <StrategyMatrix node={{ actingPosition: opener }}
            title={`${opener} · オープナーのオープンレンジ`} ariaLabel="オープナーのレンジ"
            aggregates={openerModel.aggregates} actions={openerModel.actions}
            selected={selected} filter={openerFilter} onSelect={hand => { setSelected(hand); setFocusedRange("opener"); }} onFilterChange={setOpenerFilter}
            footer={<small className="comparison-hand">{selected}：オープン {openerHand.open}% / フォールド {openerHand.fold}%</small>} />}
          {(!isComparison || focusedRange !== "opener") && <StrategyMatrix node={{ actingPosition: actingHero }} aggregates={model.aggregates} actions={model.actions}
            title={isOpening ? undefined : `${actingHero} · Heroの${isFourBet ? "4bet後の応答（元の3bettor）" : isThreeBet ? "3bet後の応答" : "対応レンジ"}`} ariaLabel={isOpening ? undefined : "Heroのレンジ"}
            footer={!isComparison ? undefined : <small className="comparison-hand">{selected}：3bet {hand.three_bet}% / コール {hand.call}% / フォールド {hand.fold}%</small>}
            selected={selected} filter={filter} onSelect={hand => { setSelected(hand); if (isComparison) setFocusedRange("hero"); }} onFilterChange={setFilter} />}
          {isComparison && focusedRange && <HandBreakdown
            title={`${focusedRange === "opener" ? opener : actingHero} · ${focusedRange === "opener" ? "オープナー" : "Hero"}の選択ハンド`}
            hand={focusedRange === "opener" ? openerHand : hand}
            model={focusedRange === "opener" ? openerModel : model}
            isOpening={focusedRange === "opener"}
            isThreeBet={false}
            spot={spot}
            position={focusedRange === "opener" ? opener : actingHero}
            onReturnToComparison={() => setFocusedRange(null)} />}
          {!isComparison && <HandBreakdown
            title={isOpening ? "選択ハンド" : `${actingHero} · Heroの選択ハンド`}
            hand={hand} model={model} isOpening={isOpening} isThreeBet={isThreeBet} isFourBet={isFourBet} spot={spot} position={actingHero} />}
        </div>
      </>}
      <AppFooter />
    </main>
  </div>;
}

export function RangeWorkspace() {
  return <EstimatedRanges />;
}
