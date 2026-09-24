import { useMemo, useState, useEffect, useRef } from "react";
import { hands } from "../data.js";
import { Sidebar } from "../components/layout.jsx";
import { StrategyMatrix } from "../components/StrategyMatrix.jsx";
import { ActionBars, Panel, SectionHeading, StatList, StatusState } from "../components/primitives.jsx";
import source from "./preflop-ranges.json";
import openingSource from "./opening-ranges.json";
import { findFourBetSpot, fourBetMatrixModel, loadFourBetDataset } from "./four-bet-responses.js";
import threeBetSource from "./three-bet-responses.json";
import { findThreeBetSpot, threeBetMatrixModel, validateThreeBetDataset } from "./three-bet-responses.js";
import { findOpeningSpot, openingMatrixModel, validateOpeningDataset } from "./opening-ranges.js";
import { nextActorsAfterRaise, responseActionTransition, rewindActionBlockTransition } from "./action-path.js";
import { displayModes } from "./display-mode.js";
import { displayModeKey } from "../profile.js";
import { useDetailedReasons } from "./detailed-reasons.js";
import { fiveBetMatrixModel, useFiveBetSpot } from "./five-bet-responses.js";
import {
  findSpot,
  matrixModel,
  positions,
  rangeTypes,
  validateDataset,
} from "./ranges.js";
import { ArrowCounterClockwise, PencilSimple } from "@phosphor-icons/react";
import { GameFormatDialog } from "./GameFormatDialog.jsx";
import { defaultFormat, formatLabel, isBuilt } from "./game-formats.js";
import tableAdjustments from "./table-profile-adjustments.json";
import { DEFAULT_PROFILE, adjustOpeningSpot, adjustmentReason, describeProfile, isDefaultProfile, markAdjustedModel, normalizeProfile } from "./table-profile.js";
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

const selectionStorageKey = "solveaai:estimated-selection:v1";
const displayModeStorageKey = displayModeKey;
const formatStorageKey = "solveaai:game-format:v1";
const tableProfileStorageKey = "solveaai:table-profile:v1";
const openingModelFor = spot => markAdjustedModel(openingMatrixModel(spot), spot);
const legacySelectionStorageKey = "solveagto:estimated-selection:v1";
function restoredSelection(initialRangeType) {
  const fallback = { rangeType: initialRangeType, opener: "BTN", hero: "BB", callers: [], foldedHero: false, pendingRaise: null, continuationAction: null, shoveResponse: null, selected: "AKo" };
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.sessionStorage.getItem(selectionStorageKey) ?? window.sessionStorage.getItem(legacySelectionStorageKey);
    const saved = JSON.parse(stored);
    if (!saved || !rangeTypes.some(item => item.value === saved.rangeType && item.available) ||
        !positions.slice(0, -1).includes(saved.opener) || !positions.includes(saved.hero) ||
        positions.indexOf(saved.hero) <= positions.indexOf(saved.opener) ||
        !Array.isArray(saved.callers) || saved.callers.some(position => !positions.includes(position) || positions.indexOf(position) <= positions.indexOf(saved.opener)) ||
        new Set(saved.callers).size !== saved.callers.length) return fallback;
    const pendingRaise = saved.pendingRaise === "all_in" && saved.rangeType === "four_bet" ? "all_in" : saved.pendingRaise === "squeeze" && saved.rangeType === "response" && saved.callers.length ? "squeeze" : null;
    const continuationAction = (saved.rangeType === "three_bet" || saved.rangeType === "four_bet") && ["fold", "call"].includes(saved.continuationAction) ? saved.continuationAction : null;
    const shoveResponse = pendingRaise === "all_in" && ["fold", "call"].includes(saved.shoveResponse) ? saved.shoveResponse : null;
    return { ...fallback, ...saved, pendingRaise, continuationAction, shoveResponse, selected: hands.includes(saved.selected) ? saved.selected : fallback.selected };
  } catch { return fallback; }
}

function HandHeader({ position, hand, comboCount, onClose }) {
  return <div className="hand-header">
    <strong>{hand}</strong>
    <span>{position} · {comboCount} Combos</span>
    {onClose && <button type="button" className="hand-close" aria-label="詳細を閉じる" title="詳細を閉じる" onClick={onClose}>×</button>}
  </div>;
}

function AiReason({ hand, spotId, inlineFacts }) {
  const { data, loading, error } = useDetailedReasons(spotId);
  const detailed = data?.hands[hand.hand];
  const facts = detailed
    ? data.fact_labels.map(({ key, label, scope }) => ({ label, value: scope === "spot" ? data.spot_facts[key] : detailed.facts[key] }))
    : inlineFacts ?? [];
  const shown = facts.filter(fact => fact.value !== null && fact.value !== undefined);
  return <div className="ai-reason">
    <span>AIの考え方</span>
    <p>{detailed?.reason ?? (loading ? "読み込み中…" : error ? "理由を読み込めませんでした。" : hand.reason)}</p>
    {shown.length > 0 && <dl className="reason-facts">
      {shown.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{Number(fact.value).toFixed(1)}%</dd></div>)}
    </dl>}
    {detailed && <small className="reason-note">{data.equity_note}</small>}
  </div>;
}

function HandBreakdown({ hand, model, isOpening, isThreeBet, isFourBet, isFiveBet, spot, position, onReturnToComparison, displayMode }) {
  const tableReason = adjustmentReason(hand, spot?.table_profile);
  const aggregate = model.aggregates.get(hand.hand);
  const totalFrequency = isOpening
    ? hand.open + hand.fold
    : hand.fold + hand.call + (isFiveBet ? 0 : isFourBet ? hand.all_in : isThreeBet ? hand.four_bet : hand.three_bet);
  const inlineFacts = isFiveBet ? [
    { label: "勝率（対オールインレンジ）", value: hand.equity_vs_shove_pct },
    { label: "コールに必要な勝率", value: spot.call_break_even_equity_pct },
  ] : null;

  return <div className={`detail-column${onReturnToComparison ? " comparison-focus-details" : ""}`}>
    <Panel>
      <HandHeader position={position} hand={hand.hand} comboCount={aggregate.comboCount} onClose={onReturnToComparison} />
      {aggregate.unreachable ? <StatusState title="対象外（到達不能）">{isFiveBet ? "既存4bet" : "既存3bet"}頻度が0%のため、この経路の推奨頻度はありません。保存上のfold=100は形式上の値です。</StatusState> : <>
      {tableReason && <p className="adjustment-reason">{tableReason}</p>}
      {!tableReason && <AiReason hand={hand} spotId={spot?.id} inlineFacts={inlineFacts} />}
      {displayMode === "standard" && <>
      {isFourBet && <small>オールイン = 5bet（合計100BB）</small>}
      <ActionBars items={model.actions.map(action => ({ action, frequency: aggregate.actions[action] }))} labels={model.actionLabels} />
      <StatList items={[
        isFiveBet ? { label: "受けるオールイン（合計）", value: "100 BB" }
          : isOpening
          ? { label: "オープンサイズ（合計）", value: hand.open_size_bb === null ? "—（オープンなし）" : `${hand.open_size_bb} BB` }
          : isFourBet ? { label: "5betオールイン（合計）", value: hand.all_in_size_bb === null ? "—（5betなし）" : `${hand.all_in_size_bb} BB` }
          : isThreeBet ? { label: "4betサイズ（合計）", value: hand.four_bet_size_bb === null ? "—（4betなし）" : `${hand.four_bet_size_bb} BB` }
          : { label: "3betサイズ（合計）", value: hand.three_bet_size_bb === null ? "—（3betなし）" : `${hand.three_bet_size_bb} BB` },
        ...(isFourBet ? [{ label: "受ける4bet（合計）", value: `${spot.four_bet_size_bb} BB` }, { label: "元の3bet（合計）", value: `${spot.three_bet_size_bb} BB` }] : []),
        ...(isThreeBet ? [{ label: "受ける3bet（合計）", value: `${spot.three_bet_size_bb} BB` }] : []),
        ...(isFiveBet ? [{ label: "自分の4bet（合計）", value: `${spot.four_bet_size_bb} BB` }, { label: "相手の元の3bet（合計）", value: `${spot.three_bet_size_bb} BB` }] : []),
        { label: "頻度合計", value: `${totalFrequency}%` },
      ]} />
      </>}
      </>}
      {aggregate.unreachable && <AiReason hand={hand} spotId={spot?.id} inlineFacts={inlineFacts} />}
    </Panel>
  </div>;
}

function LocalHandBreakdown({ entry, selected, onClose, displayMode }) {
  const aggregate = entry.model.aggregates.get(selected);
  return <div className="detail-column comparison-focus-details"><Panel>
    <HandHeader position={entry.position} hand={selected} comboCount={aggregate.comboCount} onClose={onClose} />
    {displayMode === "standard" && <><ActionBars items={entry.model.actions.map(action => ({ action, frequency: aggregate.actions[action] }))} labels={entry.model.actionLabels} />
    <StatList items={entry.allInSizeBb ? [
      { label: "受ける5betオールイン（合計）", value: `${entry.allInSizeBb} BB` },
      { label: "直前の4bet（合計）", value: `${entry.fourBetSizeBb} BB` },
      { label: "直前の3bet（合計）", value: `${entry.threeBetSizeBb} BB` },
      { label: "頻度合計", value: "100%" },
    ] : [{ label: "レイズ先（合計）", value: `${entry.raiseToBb} BB` }, { label: "頻度合計", value: "100%" }]} /></>}
    <small>ローカルで生成したAIソリューションです。</small>
  </Panel></div>;
}

function InlineGenerationControl({ description, status, error, onGenerate }) {
  const label = status === "checking" ? "保存状態を確認中…"
    : status === "loading" ? "Codexで生成中…"
    : status === "cached" ? "保存済みレンジを表示中"
    : "CodexでAI推定レンジを生成";
  return <>
    <div className="inline-generation-control">
      <small>{description}</small>
      <button type="button" disabled={status === "loading" || status === "checking" || status === "cached"} onClick={onGenerate}>{label}</button>
    </div>
    {error && <p className="inline-generation-error" role="alert">{error}</p>}
  </>;
}

const startingContribution = { SB: 0.5, BB: 1 };
const formatBb = value => value === null || value === undefined ? "—" : String(Math.round(value * 100) / 100);

// Builds the seat blocks in acting order; each later block's options depend on the choices before it.
export function buildActionBlocks({ rangeType, opener, hero, spot, callers = [], foldedHero, raiseToBb, pendingRaise, continuationAction, shoveResponse = null, raiseSizeFor = () => null }) {
  const opening = rangeType === "open";
  const openerIndex = positions.indexOf(opener);
  const heroIndex = opening ? openerIndex : positions.indexOf(hero);
  const reraised = rangeType === "three_bet" || rangeType === "four_bet";
  const threeBetSizeBb = reraised ? spot?.three_bet_size_bb : raiseSizeFor(hero);
  const contribution = { ...startingContribution };
  const stackOf = position => formatBb(100 - (contribution[position] ?? 0));
  const blocks = [];
  const lastIndex = opening ? openerIndex : positions.length - 1;
  for (let index = 0; index <= lastIndex; index += 1) {
    const position = positions[index];
    const stack = stackOf(position);
    if (index <= openerIndex) {
      const acting = opening && index === openerIndex;
      const chosen = acting ? null : index === openerIndex ? "raise" : "fold";
      const options = [
        { action: "fold", label: "Fold", disabled: positions[index + 1] === "BB" },
        { action: "raise", label: "Raise 2.5", disabled: position === "BB" },
      ];
      if (index === openerIndex && !acting) contribution[position] = 2.5;
      blocks.push({ key: position, position, stack, active: acting, chosen, options, kind: "seat", rangeRef: { kind: "opening", position } });
      continue;
    }
    const earlierCallers = callers.filter(caller => positions.indexOf(caller) < index);
    const raiseLabel = earlierCallers.length
      ? `Raise ${index === heroIndex && raiseToBb ? formatBb(raiseToBb) : ""}`.trim()
      : `Raise ${formatBb(index === heroIndex ? threeBetSizeBb : raiseSizeFor(position))}`;
    const options = [{ action: "fold", label: "Fold" }, { action: "call", label: "Call 2.5" }, { action: "raise", label: raiseLabel }];
    if (index > heroIndex && (reraised || pendingRaise === "squeeze")) {
      blocks.push({ key: position, position, stack, active: false, chosen: "fold", options: [{ action: "fold", label: "Fold", disabled: true }], kind: "forced", rangeRef: { kind: "pending", position, reason: reraised ? "3bet後の応答データはまだ保存されていません。" : "スクイーズ後の応答データはまだ保存されていません。" } });
      continue;
    }
    let chosen = null;
    if (callers.includes(position)) { chosen = "call"; contribution[position] = 2.5; }
    else if (index < heroIndex || foldedHero) chosen = "fold";
    else if (reraised || pendingRaise === "squeeze") { chosen = "raise"; contribution[position] = raiseToBb ?? threeBetSizeBb ?? 0; }
    const hasEarlierCaller = callers.some(caller => positions.indexOf(caller) < index);
    const rangeRef = pendingRaise === "squeeze" || hasEarlierCaller
      ? { kind: "pending", position, reason: pendingRaise === "squeeze" ? "スクイーズ後の応答データはまだ保存されていません。" : "このマルチウェイ局面の応答データはまだ保存されていません。" }
      : reraised && index > heroIndex
        ? { kind: "pending", position, reason: "3bet後の応答データはまだ保存されていません。" }
        : { kind: "response", position };
    blocks.push({ key: position, position, stack, active: index === heroIndex && chosen === null, chosen, options, kind: "seat", rangeRef });
  }
  if (reraised) {
    const fourBetSizeBb = spot?.four_bet_size_bb;
    const openerChosen = rangeType === "four_bet" ? "raise" : continuationAction;
    blocks.push({ key: `continuation-${opener}`, position: opener, stack: stackOf(opener), kind: "continuation", rangeRef: { kind: "three_bet", position: opener, opponent: hero }, active: rangeType === "three_bet" && !continuationAction, chosen: openerChosen, options: [
      { action: "fold", label: "Fold" }, { action: "call", label: `Call ${formatBb(threeBetSizeBb)}` }, { action: "raise", label: `Raise ${formatBb(fourBetSizeBb)}` },
    ] });
    if (rangeType === "four_bet") {
      contribution[opener] = fourBetSizeBb ?? 0;
      blocks.push({ key: `continuation-${hero}`, position: hero, stack: stackOf(hero), kind: "continuation", rangeRef: { kind: "four_bet", position: hero, opponent: opener }, active: !continuationAction && !pendingRaise, chosen: pendingRaise === "all_in" ? "all_in" : continuationAction, options: [
        { action: "fold", label: "Fold" }, { action: "call", label: `Call ${formatBb(fourBetSizeBb)}` }, { action: "all_in", label: "Allin 100" },
      ] });
      if (pendingRaise === "all_in") contribution[hero] = 100;
    }
  }
  // The opener's call/fold vs the 5bet all-in is a saved range, so it is a normal acting block.
  if (pendingRaise === "all_in") {
    blocks.push({ key: `shove-response-${opener}`, position: opener, stack: stackOf(opener), kind: "shove-response", rangeRef: { kind: "five_bet", position: opener, opponent: hero }, active: !shoveResponse, chosen: shoveResponse, options: [
      { action: "fold", label: "Fold" }, { action: "call", label: `Call ${formatBb(100 - (contribution[opener] ?? 0))}` },
    ] });
    if (shoveResponse === "call") contribution[opener] = 100;
  }
  const end = handResult({ rangeType, opener, hero, callers, foldedHero, pendingRaise, continuationAction, shoveResponse, contribution, threeBetSizeBb, spot });
  if (end) blocks.push({ key: "end", position: "終了", stack: "", kind: "end", active: false, chosen: null, options: [], ...end });
  const pendingActors = pendingRaise === "squeeze" ? nextActorsAfterRaise(hero, [opener, ...callers]) : [];
  for (const position of pendingActors) {
    blocks.push({ key: `pending-${position}`, position, stack: stackOf(position), kind: "pending", rangeRef: { kind: "pending", position, reason: "スクイーズ後の応答データはまだ保存されていません。" }, active: true, chosen: null, options: [
      { action: "fold", label: "Fold", disabled: true }, { action: "call", label: "Call", disabled: true },
    ] });
  }
  return blocks;
}

export function prioritizeParticipantRanges(rangeEntries, selectedActionEntries) {
  if (!selectedActionEntries) return rangeEntries;
  const prioritizedPositions = new Set(selectedActionEntries.map(entry => entry.position));
  return [...selectedActionEntries, ...rangeEntries.filter(entry => !prioritizedPositions.has(entry.position))];
}

// The hand's outcome once the last decision closes the action, with the final pot.
function handResult({ rangeType, opener, hero, callers, foldedHero, pendingRaise, continuationAction, shoveResponse, contribution, threeBetSizeBb, spot }) {
  // An uncalled bet is returned, so the largest contribution only counts up to the next largest.
  const pot = () => {
    const values = Object.values(contribution).sort((x, y) => y - x);
    const counted = values.length > 1 ? [Math.min(values[0], values[1]), ...values.slice(1)] : values;
    return `ポット ${formatBb(counted.reduce((acc, value) => acc + value, 0))}bb`;
  };
  if (pendingRaise === "all_in") {
    if (!shoveResponse) return null;
    return shoveResponse === "call" ? { result: "オールイン・ショウダウン", pot: pot() } : { result: `${hero}の勝ち`, pot: pot() };
  }
  if (rangeType === "three_bet" && continuationAction) {
    if (continuationAction === "call") { contribution[opener] = threeBetSizeBb ?? 0; return { result: "2人でフロップへ", pot: pot() }; }
    return { result: `${hero}の勝ち`, pot: pot() };
  }
  if (rangeType === "four_bet" && continuationAction) {
    if (continuationAction === "call") { contribution[hero] = spot?.four_bet_size_bb ?? 0; return { result: "2人でフロップへ", pot: pot() }; }
    return { result: `${opener}の勝ち`, pot: pot() };
  }
  if (rangeType === "response" && foldedHero && hero === "BB") {
    const players = [opener, ...callers];
    return players.length > 1 ? { result: `${players.length}人でフロップへ`, pot: pot() } : { result: `${opener}の勝ち`, pot: pot() };
  }
  return null;
}

export function ActionPath({ leading, expanded, blocks: providedBlocks, selectedRangeBlock = null, onSelectRangeBlock = () => {}, onRewindActionBlock = null, onAct = () => {}, onContinuationAction = () => {}, onFourBet = () => {}, onAllIn = () => {}, onShoveResponse = () => {}, ...state }) {
  const blocks = providedBlocks ?? buildActionBlocks(state);
  const seatsRef = useRef(null);
  useEffect(() => {
    const seats = seatsRef.current;
    if (seats) seats.scrollTo({ left: seats.scrollWidth, behavior: "smooth" });
  }, [blocks.length]);
  const select = (block, action) => {
    if (block.kind === "seat") onAct(block.position, action);
    else if (block.kind === "shove-response") onShoveResponse(action);
    else if (block.kind === "continuation" && block.position === state.opener && state.rangeType === "three_bet") action === "raise" ? onFourBet() : onContinuationAction(action);
    else if (block.kind === "continuation" && block.position === state.opener && action !== "raise") { onAct(state.hero, "raise"); onContinuationAction(action); }
    else if (block.kind === "continuation") action === "all_in" ? onAllIn() : onContinuationAction(action);
  };

  return <div className={`action-path ${expanded ? "expanded" : "collapsed"}`} aria-label="アクション履歴">
    <div className="action-path-seats" ref={seatsRef}>
      {leading}
      {blocks.map(block => {
        const chosenOption = block.options.find(option => option.action === block.chosen);
        if (block.kind === "end") return <div className="action-seat action-seat-end" key={block.key}>
          <div className="action-seat-heading"><strong>終了</strong></div>
          <p className="action-seat-result">{block.result}</p>
          <small>{block.pot}</small>
        </div>;
        const activateBlock = () => onRewindActionBlock
          ? onRewindActionBlock(block)
          : onSelectRangeBlock(selectedRangeBlock === block.key ? null : block.key);
        return <div className={`action-seat action-seat-${block.kind}${block.active ? " active" : ""}${selectedRangeBlock === block.key ? " range-selected" : ""}${onRewindActionBlock ? " action-seat-clickable" : ""}`} key={block.key} onClick={onRewindActionBlock ? activateBlock : undefined} title={onRewindActionBlock ? "ブロック全体をクリックしてこのアクションに戻る" : undefined}>
          <div className="action-seat-heading"><button type="button" className="action-seat-position" aria-pressed={selectedRangeBlock === block.key} aria-label={`${block.position}のアクションに戻り、レンジ表を表示`} title="このアクションに戻り、関連するレンジ表を表示" onClick={event => { event.stopPropagation(); activateBlock(); }}>{block.position}</button><span>{block.stack}</span></div>
          {expanded ? <div className="action-seat-options">
            {block.options.map(option => {
              const selected = option.action === block.chosen;
              const disabled = option.disabled || block.kind === "forced" || block.kind === "pending";
              return <button type="button" key={option.action} className={selected ? "chosen" : ""} aria-pressed={selected} disabled={disabled} title={selected && onRewindActionBlock ? "クリックしてこのアクション前に戻る" : undefined} onClick={event => { event.stopPropagation(); selected && onRewindActionBlock ? onRewindActionBlock(block) : select(block, option.action); }}>{option.label}</button>;
            })}
            {block.kind === "pending" && <small className="action-path-pending">推定レンジ準備中</small>}
          </div> : <span className={`action-seat-summary${block.kind === "pending" ? " action-path-pending" : ""}`}>{chosenOption?.label ?? (block.kind === "pending" ? "推定レンジ準備中" : "—")}</span>}
        </div>;
      })}
    </div>
  </div>;
}

export function EstimatedRanges({ initialRangeType = "response", fourBet = fourBetState, profile = null, onEditProfile }) {
  const [initialSelection] = useState(() => restoredSelection(initialRangeType));
  const [rangeType, setRangeType] = useState(initialSelection.rangeType);
  const isOpening = rangeType === "open";
  const isThreeBet = rangeType === "three_bet";
  const isFourBet = rangeType === "four_bet";
  const isComparison = rangeType === "response";
  const [opener, setOpener] = useState(initialSelection.opener);
  const [hero, setHero] = useState(initialSelection.hero);
  const [focusedRange, setFocusedRange] = useState(null);
  const [selectedRangeBlock, setSelectedRangeBlock] = useState(null);
  const [callers, setCallers] = useState(initialSelection.callers);
  const [foldedHero, setFoldedHero] = useState(initialSelection.foldedHero);
  const [pendingRaise, setPendingRaise] = useState(initialSelection.pendingRaise);
  const [continuationAction, setContinuationAction] = useState(initialSelection.continuationAction);
  const [shoveResponse, setShoveResponse] = useState(initialSelection.shoveResponse);
  const [format, setFormat] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(formatStorageKey));
      return saved && isBuilt(saved) ? saved : defaultFormat;
    } catch { return defaultFormat; }
  });
  const [tableProfile, setTableProfile] = useState(() => {
    try { return normalizeProfile(JSON.parse(window.localStorage.getItem(tableProfileStorageKey)) ?? DEFAULT_PROFILE); } catch { return DEFAULT_PROFILE; }
  });
  const [formatOpen, setFormatOpen] = useState(false);
  function saveFormat(value, profileValue = tableProfile) {
    setFormat(value);
    setTableProfile(profileValue);
    setFormatOpen(false);
    try {
      window.localStorage.setItem(formatStorageKey, JSON.stringify(value));
      window.localStorage.setItem(tableProfileStorageKey, JSON.stringify(profileValue));
    } catch {}
  }
  const openingSpotFor = position => openingDataset ? adjustOpeningSpot(findOpeningSpot(openingDataset, position), tableAdjustments, tableProfile) : null;
  const openingTitle = position => `${position} · オープンレンジ${isDefaultProfile(tableProfile) ? "" : "（卓に合わせて調整）"}`;
  const [localEstimate, setLocalEstimate] = useState(null);
  const [localEstimateRequestKey, setLocalEstimateRequestKey] = useState(null);
  const [localStatus, setLocalStatus] = useState(
    initialSelection.rangeType === "response" && initialSelection.callers.length > 0 && !initialSelection.foldedHero ||
    initialSelection.rangeType === "four_bet" && initialSelection.pendingRaise === "all_in" ? "checking" : "idle",
  );
  const [localError, setLocalError] = useState("");
  // `hero` is the later seat selector: the 3-bettor when the opener acts again.
  const [selected, setSelected] = useState(initialSelection.selected);
  const [displayMode, setDisplayMode] = useState(() => {
    try { return window.localStorage.getItem(displayModeStorageKey) === "simple" ? "simple" : "standard"; } catch { return "standard"; }
  });
  function changeDisplayMode(value) {
    setDisplayMode(value);
    try { window.localStorage.setItem(displayModeStorageKey, value); } catch {}
  }
  const currentError = isFourBet ? fourBet.error : isOpening ? openingDataError : isThreeBet ? threeBetDataError : dataError || openingDataError;
  const openerSpot = useMemo(() => openingSpotFor(opener), [opener, tableProfile]);
  const openerModel = useMemo(() => openerSpot ? openingModelFor(openerSpot) : null, [openerSpot]);
  const spot = isOpening
    ? openerSpot
    : isFourBet ? fourBet.data ? findFourBetSpot(fourBet.data, opener, hero) : null
    : isThreeBet ? threeBetDataset ? findThreeBetSpot(threeBetDataset, opener, hero) : null
    : dataset ? findSpot(dataset, opener, hero) : null;
  const model = useMemo(() => spot ? (isOpening ? openingModelFor(spot) : isFourBet ? fourBetMatrixModel(spot, findSpot(dataset, opener, hero)) : isThreeBet ? threeBetMatrixModel(spot) : matrixModel(spot)) : null, [spot, isOpening, isThreeBet, isFourBet, opener, hero]);
  function resetPath() {
    setRangeType("response");
    setOpener("BTN");
    setHero("BB");
    setCallers([]);
    setFoldedHero(false);
    setPendingRaise(null);
    setContinuationAction(null); setShoveResponse(null);
    setFocusedRange(null);
    setSelectedRangeBlock(null);
    setSelected("AKo");
    setLocalEstimate(null);
    setLocalEstimateRequestKey(null);
    setLocalStatus("idle");
    setLocalError("");
  }
  function changeOpener(value) {
    setOpener(value);
    setRangeType("open");
    setPendingRaise(null);
    setContinuationAction(null); setShoveResponse(null);
    setFocusedRange(null);
    setSelectedRangeBlock(null);
    setHero(positions[positions.indexOf(value) + 1] ?? "");
    setCallers([]);
    setFoldedHero(false);
  }

  function actAt(position, action) {
    const index = positions.indexOf(position);
    const next = positions[index + 1];
    setPendingRaise(null);
    setContinuationAction(null); setShoveResponse(null);
    setFocusedRange(null);
    if (index <= positions.indexOf(opener)) {
      if (action === "raise" && next) {
        setSelectedRangeBlock(null);
        setOpener(position); setRangeType("response"); setHero(next); setCallers([]); setFoldedHero(false);
      } else if (action === "fold" && position === opener && next && next !== "BB") {
        changeOpener(next);
      }
      return;
    }
    const transition = responseActionTransition({ opener, callers, position, action });
    if (!transition) return;
    // Recompute the complete participant view after each action; block focus is explicit.
    setSelectedRangeBlock(null);
    setRangeType(transition.rangeType);
    setHero(transition.hero);
    setCallers(transition.callers);
    setFoldedHero(transition.foldedHero);
    setPendingRaise(transition.pendingRaise);
  }

  function rewindToActionBlock(block) {
    const transition = rewindActionBlockTransition({ rangeType, opener, hero, callers, block });
    setFocusedRange(null);
    setSelectedRangeBlock(current => current === block.key ? null : block.key);
    if (!transition) return;
    setRangeType(transition.rangeType);
    setOpener(transition.opener);
    setHero(transition.hero);
    setCallers(transition.callers);
    setFoldedHero(transition.foldedHero);
    setPendingRaise(transition.pendingRaise);
    setContinuationAction(transition.continuationAction);
    setShoveResponse(transition.shoveResponse);
  }

  function selectFourBet() {
    setRangeType("four_bet");
    setPendingRaise(null);
    setContinuationAction(null); setShoveResponse(null);
    setFocusedRange(null);
    setSelectedRangeBlock(null);
  }

  const multiwayParticipants = [opener, ...callers, ...(!foldedHero && !callers.includes(hero) ? [hero] : [])];
  const showPendingRanges = isComparison && callers.some(position => position !== hero);
  const sortedCallers = [...callers].sort((a, b) => positions.indexOf(a) - positions.indexOf(b));
  // Hero's own call/fold is the decision being estimated, so it never counts as a prior caller.
  const priorCallers = sortedCallers.filter(position => positions.indexOf(position) < positions.indexOf(hero));
  const multiwayRequest = isComparison && priorCallers.length > 0 && priorCallers.length === sortedCallers.filter(position => position !== hero).length
    ? { opener, hero, callers: priorCallers }
    : null;
  const fiveBet = useFiveBetSpot(opener, hero, isFourBet && pendingRaise === "all_in");
  const fiveBetModel = useMemo(() => fiveBet.spot ? fiveBetMatrixModel(fiveBet.spot) : null, [fiveBet.spot]);
  // The persisted dataset wins; local generation is only a fallback when it has no such spot.
  const fiveBetRequest = isFourBet && pendingRaise === "all_in" && spot && !fiveBet.spot && !fiveBet.loading
    ? { scenario: "five_bet_all_in_response", opener, hero, callers: [], three_bet_size_bb: spot.three_bet_size_bb, four_bet_size_bb: spot.four_bet_size_bb, all_in_size_bb: 100 }
    : null;
  const activeGenerationRequest = fiveBetRequest ?? multiwayRequest;
  const canGenerate = Boolean(multiwayRequest);
  const canGenerateFiveBet = Boolean(fiveBetRequest);
  const requestKey = activeGenerationRequest ? JSON.stringify(activeGenerationRequest) : null;
  const currentRequestKey = useRef(requestKey);
  currentRequestKey.current = requestKey;
  useEffect(() => {
    window.sessionStorage.setItem(selectionStorageKey, JSON.stringify({ rangeType, opener, hero, callers, foldedHero, pendingRaise, continuationAction, shoveResponse, selected }));
  }, [rangeType, opener, hero, callers, foldedHero, pendingRaise, continuationAction, shoveResponse, selected]);
  useEffect(() => { setLocalEstimate(null); setLocalEstimateRequestKey(null); setLocalStatus(activeGenerationRequest ? "checking" : "idle"); setLocalError(""); }, [requestKey]);
  useEffect(() => {
    if (!activeGenerationRequest || !requestKey) return;
    let cancelled = false;
    let timer;
    async function refresh() {
      try {
        const response = await fetch(`/local-estimates?request=${encodeURIComponent(requestKey)}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "保存状態を確認できません。");
        if (cancelled) return;
        if (result.data) { setLocalEstimate(result.data); setLocalEstimateRequestKey(requestKey); setLocalStatus("cached"); return; }
        if (result.pending) { setLocalStatus("loading"); timer = window.setTimeout(refresh, 1500); return; }
        setLocalStatus(current => current === "loading" ? current : "idle");
      } catch (error) { if (!cancelled) { setLocalStatus("error"); setLocalError(error.message); } }
    }
    refresh();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [requestKey]);
  async function generateLocalEstimate() {
    if (!activeGenerationRequest || !requestKey) return;
    const submittedKey = requestKey;
    setLocalStatus("loading"); setLocalError("");
    try {
      const response = await fetch("/local-estimates", { method: "POST", headers: { "Content-Type": "application/json" }, body: requestKey });
      const result = await response.json();
      if (submittedKey !== currentRequestKey.current) return;
      if (!response.ok || !result.data) throw new Error(result.error || "ローカル生成に接続できません。画面を再読み込みしてください。");
      setLocalEstimate(result.data); setLocalEstimateRequestKey(submittedKey); setLocalStatus(result.cached ? "cached" : "generated");
    } catch (error) { if (submittedKey === currentRequestKey.current) { setLocalStatus("error"); setLocalError(error.message); } }
  }
  const localMatrix = range => ({ actions: range.available_actions ?? ["raise", "call", "fold"], actionLabels: range.raise_to_bb ? { raise: `レイズ ${range.raise_to_bb}BB` } : {}, aggregates: new Map(range.rows.map(([hand, fold, call, raise]) => [hand, {
    hand, comboCount: hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12,
    actions: { fold: fold / 100, call: call / 100, raise: raise / 100 },
  }])) });
  const currentLocalEstimate = localEstimateRequestKey === requestKey ? localEstimate : null;
  const raiseSizeFor = position => {
    const candidate = dataset && positions.indexOf(position) > positions.indexOf(opener) ? findSpot(dataset, opener, position) : null;
    return candidate?.hands.find(row => row.three_bet_size_bb !== null)?.three_bet_size_bb ?? null;
  };
  const actionState = { rangeType, opener, hero, spot, callers, foldedHero, raiseToBb: currentLocalEstimate?.ranges.find(range => range.position === hero)?.raise_to_bb, pendingRaise, continuationAction, shoveResponse, raiseSizeFor };
  const actionBlocks = buildActionBlocks(actionState);
  const responseSpot = !isOpening && dataset ? findSpot(dataset, opener, hero) : null;
  const responseModel = responseSpot ? matrixModel(responseSpot) : null;
  const threeBetSpot = (isThreeBet || isFourBet) && threeBetDataset ? findThreeBetSpot(threeBetDataset, opener, hero) : null;
  const threeBetModel = threeBetSpot ? threeBetMatrixModel(threeBetSpot) : null;
  const rangeEntries = [];
  const addSaved = (position, kind, savedSpot, savedModel, title) => rangeEntries.push({ position, kind, spot: savedSpot, model: savedModel, title, hand: savedSpot?.hands.find(row => row.hand === selected) });
  if (isOpening) {
    addSaved(opener, "opening", openerSpot, openerModel, openingTitle(opener));
  } else if (isComparison) {
    const activeSeats = positions.filter(position => multiwayParticipants.includes(position));
    const firstCaller = positions.find(position => callers.includes(position));
    for (const position of activeSeats) {
      if (pendingRaise === "squeeze" && position !== hero) {
        rangeEntries.push({ position, kind: "pending", title: `${position} · スクイーズへの応答`, statusTitle: "レンジ未収録", statusDescription: "スクイーズ後の応答データはまだ保存されていません。" });
      } else if (position === opener) addSaved(position, "opening", openerSpot, openerModel, openingTitle(position));
      else if (showPendingRanges && position === firstCaller) {
        const firstCallerSpot = dataset?.spots.find(candidate => candidate.opener === opener && candidate.hero === position);
        if (firstCallerSpot) addSaved(position, "response", firstCallerSpot, matrixModel(firstCallerSpot), `${position} · オープンへの応答`);
        else rangeEntries.push({ position, kind: "pending", title: `${position} · 推定レンジ準備中`, statusTitle: "レンジ未収録", statusDescription: "この履歴のレンジはまだ保存されていません。" });
      } else if (!showPendingRanges && position === hero) addSaved(position, "response", responseSpot, responseModel, `${position} · オープンへの応答`);
      else {
        const localRange = currentLocalEstimate?.ranges.find(range => range.position === position);
        rangeEntries.push(localRange ? { position, kind: "local", model: localMatrix(localRange), title: `${position} · ${pendingRaise === "squeeze" ? "スクイーズ選択" : position === hero ? "現在の応答" : "コール選択"}（AI推定・レイズ先 ${localRange.raise_to_bb}BB）`, raiseToBb: localRange.raise_to_bb } : { position, kind: "pending", title: `${position} · 推定レンジ準備中`, statusTitle: "レンジ未収録", statusDescription: pendingRaise === "squeeze" ? "この局面の推定レンジはまだ生成・保存されていません。" : "この履歴のレンジはまだ保存されていません。" });
      }
    }
  } else if (isThreeBet) {
    if (continuationAction !== "fold") addSaved(opener, "three_bet", spot, model, `${opener} · 3betへの応答`);
    addSaved(hero, "response", responseSpot, responseModel, `${hero} · オープンへの応答（3bet前）`);
  } else if (isFourBet) {
    if (pendingRaise === "all_in") {
      const allInRange = currentLocalEstimate?.scenario === "five_bet_all_in_response" && currentLocalEstimate.ranges?.find(range => range.position === opener);
      if (fiveBet.spot) addSaved(opener, "five_bet", fiveBet.spot, fiveBetModel, `${opener} · 5betオールインへの応答`);
      else if (fiveBet.loading) rangeEntries.push({ position: opener, kind: "pending", title: `${opener} · 5betオールインへの応答`, statusTitle: "読み込み中", statusDescription: "保存済みレンジを読み込んでいます。" });
      else rangeEntries.push(allInRange
        ? { position: opener, kind: "local", model: localMatrix(allInRange), title: `${opener} · 5betオールインへの応答（AI推定）`, allInSizeBb: 100, fourBetSizeBb: spot.four_bet_size_bb, threeBetSizeBb: spot.three_bet_size_bb }
        : { position: opener, kind: "pending", title: `${opener} · 5betオールインへの応答`, statusTitle: "レンジ未収録", statusDescription: "5betオールイン後の応答データはまだ保存されていません。" });
      addSaved(hero, "four_bet", spot, model, `${hero} · 4betへの応答（5bet選択）`);
    } else {
      addSaved(opener, "three_bet", threeBetSpot, threeBetModel, `${opener} · 3betへの応答（4bet前）`);
      if (continuationAction !== "fold") addSaved(hero, "four_bet", spot, model, `${hero} · 4betへの応答`);
    }
  }
  // The last raiser's table goes on the left.
  const aggressor = isThreeBet || pendingRaise ? hero : opener;
  rangeEntries.sort((a, b) => (b.position === aggressor) - (a.position === aggressor));
  const actionRangeEntry = (block, role) => {
    const ref = block?.rangeRef;
    if (!ref) return null;
    const labelContext = role === "previous" ? "前のポジション・履歴" : "選択位置";
    const withContext = entry => entry && ({ ...entry, title: `${entry.title}（${labelContext}）`, rangeBlockKey: block.key });
    const missing = (title, description = ref.reason || "この履歴のレンジはまだ保存されていません。", statusTitle = "レンジ未収録") => ({
      position: ref.position,
      kind: "pending",
      title: `${ref.position} · ${title}（${labelContext}）`,
      statusTitle,
      statusDescription: description,
      rangeBlockKey: block.key,
    });

    if (ref.kind === "opening") {
      const savedSpot = openingSpotFor(ref.position);
      return savedSpot ? withContext({ position: ref.position, kind: "opening", spot: savedSpot, model: openingModelFor(savedSpot), title: openingTitle(ref.position) }) : missing("オープンレンジ");
    }
    if (ref.kind === "response") {
      const savedSpot = dataset ? findSpot(dataset, opener, ref.position) : null;
      return savedSpot ? withContext({ position: ref.position, kind: "response", spot: savedSpot, model: matrixModel(savedSpot), title: `${ref.position} · オープンへの応答` }) : missing("オープンへの応答");
    }
    if (ref.kind === "three_bet") {
      const savedSpot = threeBetDataset ? findThreeBetSpot(threeBetDataset, opener, ref.opponent) : null;
      return savedSpot ? withContext({ position: ref.position, kind: "three_bet", spot: savedSpot, model: threeBetMatrixModel(savedSpot), title: `${ref.position} · 3betへの応答` }) : missing("3betへの応答");
    }
    if (ref.kind === "four_bet") {
      const savedSpot = fourBet.data ? findFourBetSpot(fourBet.data, opener, ref.position) : null;
      return savedSpot ? withContext({ position: ref.position, kind: "four_bet", spot: savedSpot, model: fourBetMatrixModel(savedSpot, dataset ? findSpot(dataset, opener, ref.position) : null), title: `${ref.position} · 4betへの応答` }) : missing("4betへの応答");
    }
    if (ref.kind === "five_bet") {
      if (fiveBet.spot) return withContext({ position: ref.position, kind: "five_bet", spot: fiveBet.spot, model: fiveBetMatrixModel(fiveBet.spot), title: `${ref.position} · 5betオールインへの応答` });
      if (fiveBet.loading) return missing("5betオールインへの応答", "保存済みレンジを読み込んでいます。", "読み込み中");
      const allInRange = currentLocalEstimate?.scenario === "five_bet_all_in_response" && currentLocalEstimate.ranges?.find(range => range.position === ref.position);
      return allInRange
        ? withContext({ position: ref.position, kind: "local", model: localMatrix(allInRange), title: `${ref.position} · 5betオールインへの応答（AI推定）`, allInSizeBb: 100, fourBetSizeBb: spot?.four_bet_size_bb, threeBetSizeBb: spot?.three_bet_size_bb })
        : missing("5betオールインへの応答", "5betオールイン後の応答データはまだ保存されていません。");
    }
    const localRange = currentLocalEstimate?.ranges.find(range => range.position === ref.position);
    if (localRange) return withContext({ position: ref.position, kind: "local", model: localMatrix(localRange), title: `${ref.position} · AI推定レンジ（レイズ先 ${localRange.raise_to_bb}BB）`, raiseToBb: localRange.raise_to_bb });
    return missing(ref.reason ? "推定レンジ準備中" : "この履歴のレンジ");
  };
  const selectedBlockIndex = actionBlocks.findIndex(block => block.key === selectedRangeBlock);
  const selectedActionEntries = selectedBlockIndex < 0 ? null : [
    ...(isOpening ? [] : [actionRangeEntry(actionBlocks[selectedBlockIndex - 1], "previous")]),
    actionRangeEntry(actionBlocks[selectedBlockIndex], "selected"),
  ].filter(Boolean);
  // Keep the focused action pair first, but never hide other active participants' ranges.
  const visibleRangeEntries = prioritizeParticipantRanges(rangeEntries, selectedActionEntries);
  const focusedEntry = visibleRangeEntries.find(entry => entry.position === focusedRange && entry.model);
  const displayedEntries = focusedEntry ? [focusedEntry] : visibleRangeEntries;

  return <div className="shell">
    <Sidebar activeSection="プリフロップ" onSectionChange={() => {}} profile={profile} onEditProfile={onEditProfile} />
    <main>
      <Panel className="estimate-settings">
        <ActionPath
          leading={<div className="action-seat action-seat-info">
            <div className="action-seat-heading">
              <strong>推定レンジ</strong>
              <div className="settings-actions">
                <button type="button" className="format-edit settings-icon-button" aria-label="ゲーム設定を編集" title="ゲーム設定を編集" onClick={() => setFormatOpen(true)}><PencilSimple size={14} aria-hidden="true" /></button>
                <button type="button" className="path-reset settings-icon-button" aria-label="アクションをリセット" title="アクションをリセット" onClick={resetPath}><ArrowCounterClockwise size={14} aria-hidden="true" /></button>
              </div>
            </div>
            <ul><li>{formatLabel("game", format.game)} · {formatLabel("table", format.table)} · {formatLabel("stack", format.stack)}</li><li>Open {formatLabel("openSize", format.openSize)} · レーキ {formatLabel("rake", format.rake)}</li>{!isDefaultProfile(tableProfile) && <li className="table-profile-summary">卓: {describeProfile(tableProfile)}</li>}</ul>
            <div className="display-mode-toggle" role="group" aria-label="表示モード">{displayModes.map(mode => <button type="button" key={mode.value} aria-pressed={displayMode === mode.value} onClick={() => changeDisplayMode(mode.value)}>{mode.label}</button>)}</div>
          </div>}
          expanded
          blocks={actionBlocks}
          selectedRangeBlock={selectedRangeBlock}
          {...actionState}
          onRewindActionBlock={rewindToActionBlock}
          onShoveResponse={action => { setFocusedRange(null); setSelectedRangeBlock(null); setShoveResponse(action); }}
          onAct={actAt}
          onFourBet={selectFourBet}
          onAllIn={() => { setContinuationAction(null); setShoveResponse(null); setFocusedRange(null); setSelectedRangeBlock(null); setPendingRaise("all_in"); }}
          onContinuationAction={action => { setPendingRaise(null); setFocusedRange(null); setShoveResponse(null); setSelectedRangeBlock(null); setContinuationAction(action); }}
        />
        </Panel>
        {currentError ? <StatusState tone="error">{currentError}</StatusState> : <>
        <div className={`results estimate-results participant-results${focusedEntry ? " comparison-focused" : ""}`} aria-label="参加中のレンジ" style={{ "--participant-count": displayedEntries.length }}>
          {displayedEntries.map(entry => entry.model ? <StrategyMatrix key={entry.position} node={{ actingPosition: entry.position }} title={entry.title} ariaLabel={`${entry.position}のレンジ`} aggregates={entry.model.aggregates} actions={entry.model.actions} actionLabels={entry.model.actionLabels} simplified={displayMode === "simple"} selected={selected} onSelect={value => { setSelected(value); setFocusedRange(entry.position); }} /> : <Panel key={entry.position} className="multiway-range-panel missing-range-panel" aria-label={`${entry.position}のレンジ`}><SectionHeading title={entry.title} /><StatusState title={entry.statusTitle || "レンジ未収録"}>{entry.statusDescription || "この履歴のレンジはまだ保存されていません。"}</StatusState>
            {canGenerate && isComparison && entry.kind === "pending" && <InlineGenerationControl description="マルチウェイのAIソリューションをローカルで生成します。保存済みデータは変更しません。" status={localStatus} error={localError} onGenerate={generateLocalEstimate} />}
            {canGenerateFiveBet && entry.position === opener && <InlineGenerationControl description="この分岐のAIソリューションをローカルで生成します。" status={localStatus} error={localError} onGenerate={generateLocalEstimate} />}
          </Panel>)}
          {focusedEntry && (focusedEntry.kind === "local" ? <LocalHandBreakdown entry={focusedEntry} selected={selected} displayMode={displayMode} onClose={() => setFocusedRange(null)} /> : <HandBreakdown hand={focusedEntry.hand} model={focusedEntry.model} isOpening={focusedEntry.kind === "opening"} isThreeBet={focusedEntry.kind === "three_bet"} isFourBet={focusedEntry.kind === "four_bet"} isFiveBet={focusedEntry.kind === "five_bet"} spot={focusedEntry.spot} position={focusedEntry.position} displayMode={displayMode} onReturnToComparison={() => setFocusedRange(null)} />)}
        </div>
      </>}
      {formatOpen && <GameFormatDialog format={format} tableProfile={tableProfile} onSave={saveFormat} onClose={() => setFormatOpen(false)} />}
    </main>
  </div>;
}

export function RangeWorkspace({ profile, onEditProfile }) {
  return <EstimatedRanges profile={profile} onEditProfile={onEditProfile} />;
}
