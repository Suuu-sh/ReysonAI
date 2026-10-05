import { stage3Copy } from "./stage3-copy.ts";
import { chooseStage3Action, normalizeStage3Selection, stage3RootForSelection, stage3LiveSeats } from "./stage3-flow.ts";
import { useStage3UiRuntime, withStage3Availability } from "./stage3-ranges.ts";
import { accountStorage } from "../account/session.ts";
import { dataset as publishedDataset } from "./datasets.ts";
import { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { hands } from "../data.ts";
import { RANGE_SECTION, Sidebar } from "../components/layout.tsx";
import { StrategyMatrix } from "../components/StrategyMatrix.tsx";
import { ActionBars, Panel, SectionHeading, StatList, StatusState } from "../components/primitives.tsx";
import { findFourBetSpot, fourBetMatrixModel, loadFourBetDataset } from "./four-bet-responses.ts";
import { findThreeBetSpot, threeBetMatrixModel, validateThreeBetDataset } from "./three-bet-responses.ts";
import { findOpeningSpot, openingMatrixModel, validateOpeningDataset } from "./opening-ranges.ts";
import { LIMP_FOUR_BET_RESPONSE_ID, findLimpDeepResponseSpot, limpFourBetMatrixModel, validateLimpDeepResponses } from "./limp-deep-responses.ts";
import { LIMP_RERAISE_RESPONSE_ID, findLimpResponseSpot, limpResponsesMatrixModel, validateLimpResponses } from "./limp-responses.ts";
import { extendedBreakdown, extendedModel, extendedUnreachableReason, findExtendedSpot, useExtendedDatasets } from "./extended-ranges.ts";
import { continuationCopy } from "./continuation-copy.ts";
import { chooseContinuationAction, continuationLiveSeats, continuationRootForSelection } from "./continuation-flow.ts";
import { continuationRangeBreakdown, useContinuationUiRuntime, withContinuationAvailability } from "./continuation-ranges.ts";
import { limpActionTransition, responseActionTransition, rewindActionBlockTransition } from "./action-path.ts";
import { displayModes } from "./display-mode.ts";
import { displayModeKey } from "../profile.ts";
import { useDetailedReasons } from "./detailed-reasons.ts";
import { localizedPreflopReason, localizedFactLabel, localizedEquityNote } from "./english-reasons.ts";
import { productLocale, translateProductCopy } from "../i18n.ts";
import { localized } from "../locale.ts";
import { fiveBetMatrixModel, useFiveBetSpot } from "./five-bet-responses.ts";
import {
  findSpot,
  matrixModel,
  positions,
  rangeTypes,
  validateDataset,
} from "./ranges.ts";
import { ArrowCounterClockwise, CaretDown, DotsThreeVertical, GearSix } from "@phosphor-icons/react";
import { RangeContextCard } from "./RangeContextCard.tsx";
import { GameFormatDialog } from "./GameFormatDialog.tsx";
import { FlopCardDialog, PostflopTrial, StreetCardDialog, suitLabels } from "./PostflopTrial.tsx";
import { useAccount } from "../account/AuthPanel.tsx";
import { LearningGate, learningAllowed } from "../account/LearningAccess.tsx";
import { Cards, ChatText, Path } from "@phosphor-icons/react";
import { nextPendingStreetCardDialog } from "./street-card-dialog-state.ts";
import { buildActionBlocks, encodeRangeUrl, multiwayContext, readRangeUrl, replaceRangeUrl } from "./range-url.ts";
export { buildActionBlocks } from "./range-url.ts";
import { PreflopCallEvBars } from "./PreflopCallEvBars.tsx";
import { buildFlopActionBlocks, buildLaterActionBlocks, completedFlopContext, laterStart, recognizedFlop } from "./postflop-trial.ts";
import { defaultFormat, formatLabel, isBuilt } from "./game-formats.ts";
import { DEFAULT_PROFILE, adjustOpeningSpot, adjustmentReason, describeProfile, isDefaultProfile, markAdjustedModel, normalizeProfile } from "./table-profile.ts";
import "./ranges.css";

// Published preflop datasets (src/estimated/datasets.ts); preloaded before this module runs in the browser.
const source = publishedDataset("preflop-ranges");
const openingSource = publishedDataset("opening-ranges");
const limpSource = publishedDataset("limp-responses");
const limpDeepSource = publishedDataset("limp-deep-responses");
const threeBetSource = publishedDataset("three-bet-responses");
const tableAdjustments = publishedDataset("table-profile-adjustments");

let dataset;
let dataError;
try { dataset = validateDataset(source); } catch (error) { dataError = error.message; }
let openingDataset;
let openingDataError;
try { openingDataset = validateOpeningDataset(openingSource); } catch (error) { openingDataError = error.message; }
let limpDataset;
let limpDataError;
try {
  if (openingDataError) throw new Error(openingDataError);
  limpDataset = validateLimpResponses(limpSource, openingDataset);
} catch (error) { limpDataError = error.message; }
let limpDeepDataset;
try { if (limpDataset) limpDeepDataset = validateLimpDeepResponses(limpDeepSource, openingDataset, limpDataset); } catch { limpDeepDataset = null; }
let threeBetDataset;
let threeBetDataError;
try {
  if (dataError || openingDataError) throw new Error(dataError || openingDataError);
  threeBetDataset = validateThreeBetDataset(threeBetSource, dataset, openingDataset);
} catch (error) { threeBetDataError = error.message; }

// A missing dataset stays inside the explicit error boundary, like invalid JSON.
const fourBetRaw = (() => { try { return JSON.stringify(publishedDataset("four-bet-responses")); } catch { return undefined; } })();
const fourBetState = loadFourBetDataset(fourBetRaw, dataset, threeBetDataset, openingDataset);

const selectionStorageKey = "reysonai:estimated-selection:v1";
const displayModeStorageKey = displayModeKey;
const formatStorageKey = "reysonai:game-format:v1";
const tableProfileStorageKey = "reysonai:table-profile:v1";
const openingModelFor = spot => markAdjustedModel(openingMatrixModel(spot), spot);
// Postflop labels end in "(33%)"; show that part right-aligned so the amounts line up.
function OptionLabel({ label }: { label: string }) {
  const match = /^(.*\S)\s+(\(\d+%\))$/.exec(label);
  return match ? <><span className="action-seat-main">{match[1]}</span><span className="action-seat-pct">{match[2]}</span></> : <>{label}</>;
}

export function selectedHandForRangeEntry(entry, selected) {
  return entry.spot?.hands.find(row => row.hand === selected) ?? entry.hand;
}
const legacySelectionStorageKey = "reysonai-legacy:estimated-selection:v1";
function restoredSelection(initialRangeType) {
  const fallback = { rangeType: initialRangeType, opener: initialRangeType === "limp" ? "SB" : "BTN", hero: "BB", callers: [], foldedHero: false, pendingRaise: null, continuationAction: null, shoveResponse: null, limpAction: null, limpResponseAction: null, limpReraiseAction: null, limpFourBetAction: null, squeezeResponse: [], continuationActions: [], stage3RootId: null, stage3Actions: [], coldAction: null, selected: "AKo" };
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.sessionStorage.getItem(selectionStorageKey) ?? window.sessionStorage.getItem(legacySelectionStorageKey);
    const saved = JSON.parse(stored);
    const limpSelection = saved?.rangeType === "limp";
    if (!saved || !rangeTypes.some(item => item.value === saved.rangeType && item.available) ||
        !positions.slice(0, -1).includes(saved.opener) || !positions.includes(saved.hero) ||
        (limpSelection ? saved.opener !== "SB" || !["BB", "SB"].includes(saved.hero) : positions.indexOf(saved.hero) <= positions.indexOf(saved.opener)) ||
        !Array.isArray(saved.callers) || saved.callers.some(position => !positions.includes(position) || positions.indexOf(position) <= positions.indexOf(saved.opener)) ||
        new Set(saved.callers).size !== saved.callers.length) return fallback;
    const pendingRaise = saved.pendingRaise === "all_in" && saved.rangeType === "four_bet" ? "all_in" : saved.pendingRaise === "squeeze" && saved.rangeType === "response" && saved.callers.length ? "squeeze" : null;
    const continuationAction = (saved.rangeType === "three_bet" || saved.rangeType === "four_bet") && ["fold", "call"].includes(saved.continuationAction) ? saved.continuationAction : null;
    const shoveResponse = pendingRaise === "all_in" && ["fold", "call"].includes(saved.shoveResponse) ? saved.shoveResponse : null;
    const limpAction = limpSelection && ["check", "raise"].includes(saved.limpAction) ? saved.limpAction : null;
    const limpResponseAction = limpSelection && limpAction === "raise" && ["fold", "call", "raise"].includes(saved.limpResponseAction) ? saved.limpResponseAction : null;
    const limpReraiseAction = limpResponseAction === "raise" && ["fold", "call", "raise"].includes(saved.limpReraiseAction) ? saved.limpReraiseAction : null;
    const limpFourBetAction = limpReraiseAction === "raise" && ["fold", "call", "all_in"].includes(saved.limpFourBetAction) ? saved.limpFourBetAction : null;
    const squeezeActions = ["fold", "call", "raise"];
    const squeezeResponse = pendingRaise === "squeeze" && Array.isArray(saved.squeezeResponse) && saved.squeezeResponse.length <= 2 &&
      saved.squeezeResponse.every(action => squeezeActions.includes(action)) && !(saved.squeezeResponse[0] === "raise" && saved.squeezeResponse.length > 1) ? saved.squeezeResponse : [];
    const coldAction = saved.rangeType === "three_bet" && positions.indexOf(saved.coldAction?.position) > positions.indexOf(saved.hero)
      && ["call", "raise"].includes(saved.coldAction?.action) ? saved.coldAction : null;
    const continuationActions = Array.isArray(saved.continuationActions) && saved.continuationActions.length <= 24
      && saved.continuationActions.every(action => ["fold", "call", "four_bet", "all_in"].includes(action)) ? saved.continuationActions : [];
    const stage3 = saved.stage3RootId ? normalizeStage3Selection(saved.stage3RootId, saved.stage3Actions) : null;
    return { ...fallback, ...saved, coldAction, continuationActions, pendingRaise, continuationAction, shoveResponse, limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction, squeezeResponse, ...(stage3 ?? { stage3RootId: null, stage3Actions: [] }), selected: hands.includes(saved.selected) ? saved.selected : fallback.selected };
  } catch { return fallback; }
}

function HandHeader({ position, hand, comboCount, onClose }) {
  return <div className="hand-header">
    <strong>{hand}</strong>
    <span>{position} · {comboCount} Combos</span>
    {onClose && <button type="button" className="hand-close" aria-label="詳細を閉じる" title="詳細を閉じる" onClick={onClose}>×</button>}
  </div>;
}

// EV-style facts are in bb with a sign; everything else is a percentage.
const formatFact = ({ value, unit }) => unit === "bb"
  ? `${value > 0 ? "+" : ""}${Number(value).toFixed(2)}bb`
  : `${Number(value).toFixed(1)}%`;

export function AiReason({ hand, reasonState, inlineFacts, hideCallEv = false }) {
  const { data, loading, error } = reasonState;
  const detailed = data?.hands[hand.hand];
  const english = productLocale() !== "ja";
  const facts = detailed
    ? data.fact_labels.map(({ key, label, scope, unit }) => ({ key, label: english ? localizedFactLabel(key) ?? label : label, unit, value: scope === "spot" ? data.spot_facts[key] : detailed.facts[key] }))
    : inlineFacts ?? [];
  const shown = facts.filter(fact => fact.value !== null && fact.value !== undefined && !(hideCallEv && fact.key === "call_ev_bb"));
  return <div className="ai-reason">
    <span>AIの考え方</span>
    <p>{english ? (detailed ? localizedPreflopReason(hand, detailed, data) : loading ? "Loading…" : error ? "Could not load the explanation." : "No hand-specific explanation is recorded for this spot.") : detailed?.reason ?? (loading ? "読み込み中…" : error ? "理由を読み込めませんでした。" : hand.reason)}</p>
    {shown.length > 0 && <dl className="reason-facts">
      {shown.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd className={fact.unit === "bb" ? (fact.value >= 0 ? "fact-positive" : "fact-negative") : undefined}>{formatFact(fact)}</dd></div>)}
    </dl>}
    {detailed && <small className="reason-note">{english ? localizedEquityNote() : data.equity_note}</small>}
  </div>;
}

function endResultLabel(result) {
  if (productLocale() === "ja") return result;
  const players = /^(\d+)人でフロップへ$/.exec(result);
  if (players) return `${players[1]} players to the flop`;
  const winner = /^(.+)の勝ち$/.exec(result);
  if (winner) return `${winner[1]} wins`;
  const laterFold = /^(.+)がフォールド。(.+)の勝ちです。$/.exec(result);
  if (laterFold) return `${laterFold[1]} folded. ${laterFold[2]} wins.`;
  if (result === "ショーダウン") return "Showdown";
  if (result === "オールイン・ショウダウン") return "All-in showdown";
  if (result === "データなし") return "No data";
  return result;
}

function HandBreakdown({ hand, model, isOpening, isLimpResponse, isThreeBet, isFourBet, isFiveBet, extra = null, spot, position, onReturnToComparison, displayMode }) {
  const reasonState = useDetailedReasons(spot?.id);
  const equityFact = reasonState.data?.fact_labels.find(fact => fact.key === "equity_pct" || fact.key.startsWith("equity_vs_") && fact.key.endsWith("_pct"));
  const savedFacts = reasonState.data?.hands[hand.hand]?.facts;
  const callEvFacts = savedFacts && equityFact ? { eqr: savedFacts.eqr, equityPct: savedFacts[equityFact.key], callEvBb: savedFacts.call_ev_bb } : null;
  const hasCallEv = callEvFacts && Object.values(callEvFacts).every(Number.isFinite);
  const tableReason = adjustmentReason(hand, spot?.table_profile);
  const aggregate = model.aggregates.get(hand.hand);
  const actionItems = model.actions.map(action => ({ action, frequency: aggregate.actions[action] }));
  const inlineFacts = isFiveBet ? [
    { label: "勝率（対オールインレンジ）", value: hand.equity_vs_shove_pct },
    { label: "コールに必要な勝率", value: spot.call_break_even_equity_pct },
  ] : null;

  return <div className={`detail-column${onReturnToComparison ? " comparison-focus-details" : ""}`}>
    <Panel>
      <HandHeader position={position} hand={hand.hand} comboCount={aggregate.comboCount} onClose={onReturnToComparison} />
      {aggregate.unreachable ? <StatusState title="対象外（到達不能）">{extra?.unreachableText ?? (isLimpResponse ? "SBのリンプ頻度が0%のため、この応答経路の推奨頻度はありません。保存上のfold=100は形式上の値です。" : `${isFiveBet ? "既存4bet" : "既存3bet"}頻度が0%のため、この経路の推奨頻度はありません。保存上のfold=100は形式上の値です。`)}</StatusState> : <>
      {tableReason && <p className="adjustment-reason">{tableReason}</p>}
      {displayMode !== "standard" && !tableReason && !isLimpResponse && <AiReason hand={hand} reasonState={reasonState} inlineFacts={inlineFacts} />}
      {displayMode !== "standard" && isLimpResponse && <div className="ai-reason"><span>AIの考え方</span><p>この局面のハンド別説明はありません。</p></div>}
      {displayMode === "standard" && <>
      {isFourBet && <small>オールイン = 5bet（合計100BB）</small>}
      {hasCallEv && !tableReason
        ? <PreflopCallEvBars items={actionItems} labels={model.actionLabels} facts={callEvFacts} equityLabel={equityFact.label} />
        : <ActionBars items={actionItems} labels={model.actionLabels} />}
      {!tableReason && !isLimpResponse && <AiReason hand={hand} reasonState={reasonState} inlineFacts={inlineFacts} hideCallEv={hasCallEv} />}
      {isLimpResponse && <div className="ai-reason"><span>AIの考え方</span><p>この局面のハンド別説明はありません。</p></div>}
      {!isOpening && !isLimpResponse && <StatList items={extra ? [extra.sizeItem, ...extra.received] : [
        isFiveBet ? { label: "受けるオールイン（合計）", value: "100 BB" }
          : isOpening
          ? null
          : isFourBet ? { label: "5betオールイン（合計）", value: hand.all_in_size_bb === null ? "—（5betなし）" : `${hand.all_in_size_bb} BB` }
          : isThreeBet ? { label: "4betサイズ（合計）", value: hand.four_bet_size_bb === null ? "—（4betなし）" : `${hand.four_bet_size_bb} BB` }
          : { label: "3betサイズ（合計）", value: hand.three_bet_size_bb === null ? "—（3betなし）" : `${hand.three_bet_size_bb} BB` },
        ...(isFourBet ? [{ label: "受ける4bet（合計）", value: `${spot.four_bet_size_bb} BB` }, { label: "元の3bet（合計）", value: `${spot.three_bet_size_bb} BB` }] : []),
        ...(isThreeBet ? [{ label: "受ける3bet（合計）", value: `${spot.three_bet_size_bb} BB` }] : []),
        ...(isFiveBet ? [{ label: "自分の4bet（合計）", value: `${spot.four_bet_size_bb} BB` }, { label: "相手の元の3bet（合計）", value: `${spot.three_bet_size_bb} BB` }] : []),
      ].filter(Boolean)} />}
      </>}
      </>}
      {aggregate.unreachable && !isLimpResponse && <AiReason hand={hand} reasonState={reasonState} inlineFacts={inlineFacts} />}
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
    ] : [{ label: "レイズ先（合計）", value: `${entry.raiseToBb} BB` }]} /></>}
  </Panel></div>;
}

function InlineGenerationControl({ description, status, error, onGenerate }) {
  const label = status === "checking" ? "保存状態を確認中…"
    : status === "loading" ? "Codexで生成中…"
    : status === "cached" ? "保存済みレンジを表示中"
    : "Codexでレンジを生成";
  return <>
    <div className="inline-generation-control">
      <small>{description}</small>
      <button type="button" disabled={status === "loading" || status === "checking" || status === "cached"} onClick={onGenerate}>{label}</button>
    </div>
    {error && <p className="inline-generation-error" role="alert">{error}</p>}
  </>;
}

const formatBb = value => value === null || value === undefined ? "—" : String(Math.round(value * 100) / 100);

export function prioritizeParticipantRanges(rangeEntries, selectedActionEntries) {
  if (!selectedActionEntries) return rangeEntries;
  const prioritizedPositions = new Set(selectedActionEntries.map(entry => entry.position));
  return [...selectedActionEntries, ...rangeEntries.filter(entry => !prioritizedPositions.has(entry.position))];
}

function ActionDropdown({ position, options, onSelect }) {
  const [menu, setMenu] = useState(null);
  const toggle = event => {
    event.stopPropagation();
    if (menu) { setMenu(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
  };
  return <div className="action-seat-select" onClick={event => event.stopPropagation()}>
    <button type="button" className="action-seat-select-trigger" aria-haspopup="menu" aria-expanded={Boolean(menu)} aria-label={localized(`Choose action for ${position}`, `${position}のアクションを選択`)} onClick={toggle}>{localized("Take action", "アクションを選択")}<CaretDown size={12} aria-hidden="true" /></button>
    {menu && createPortal(<>
      <button type="button" className="action-seat-select-backdrop" aria-label={localized("Close", "閉じる")} onClick={() => setMenu(null)} />
      <div className="action-seat-select-menu" role="menu" style={{ top: menu.top, right: menu.right }}>
        {options.map(option => <button type="button" role="menuitem" key={option.action} onClick={() => { setMenu(null); onSelect(option.action); }}>{translateProductCopy(option.label)}</button>)}
      </div>
    </>, document.body)}
  </div>;
}

export function ActionPath({ leading, expanded, blocks: providedBlocks, selectedRangeBlock = null, onSelectRangeBlock = () => {}, onRewindActionBlock = null, onEnterPostflop = null, onOpenFlopCards = () => {}, onOpenLaterCard = () => {}, onFlopAction = () => {}, onLaterAction = () => {}, onAct = () => {}, onContinuationAction = () => {}, onColdAction = () => {}, onSqueezeResponse = () => {}, onBoundedContinuation = () => {}, onStage3Action = () => {}, onFourBet = () => {}, onAllIn = () => {}, onShoveResponse = () => {}, ...state }) {
  const blocks = providedBlocks ?? buildActionBlocks(state);
  const seatsRef = useRef(null);
  useEffect(() => {
    const seats = seatsRef.current;
    if (seats) seats.scrollTo({ left: seats.scrollWidth, behavior: "smooth" });
  }, [blocks.length]);
  const select = (block, action) => {
    if (block.kind === "flop" && block.street) onLaterAction(block, action);
    else if (block.kind === "flop") onFlopAction(block, action);
    else if (block.stage === "limp-bb" || block.stage === "limp-sb-response" || block.stage === "limp-bb-reraise" || block.stage === "limp-sb-four-bet") onAct(block.position, action);
    else if (block.stage3Node) onStage3Action(block, action);
    else if (block.continuationNode) onBoundedContinuation(block, action);
    else if (block.kind === "squeeze-response") onSqueezeResponse(block.role, action);
    else if (block.kind === "seat") onAct(block.position, action);
    else if (block.kind === "cold") onColdAction(action === "fold" ? null : { position: block.position, action });
    else if (block.kind === "shove-response") onShoveResponse(action);
    else if (block.kind === "continuation" && block.position === state.opener && state.rangeType === "three_bet") action === "raise" ? onFourBet() : onContinuationAction(action);
    else if (block.kind === "continuation" && block.position === state.opener && action !== "raise") { onAct(state.hero, "raise"); onContinuationAction(action); }
    else if (block.kind === "continuation") action === "all_in" ? onAllIn() : onContinuationAction(action);
  };

  return <div className={`action-path ${expanded ? "expanded" : "collapsed"}`} aria-label="アクション履歴">
    <div className="action-path-seats" ref={seatsRef}>
      {leading}
      {blocks.map(block => {
        if (block.kind === "board") {
          const street = block.street ?? "flop";
          const isFlop = street === "flop";
          const title = isFlop ? "Flop" : street === "turn" ? "Turn" : "River";
          const label = isFlop ? "フロップ" : street === "turn" ? "ターン" : "リバー";
          const selected = block.cards.some(Boolean);
          const english = productLocale() !== "ja";
          return <button type="button" className={`action-seat action-seat-board${isFlop ? "" : " action-seat-board-later"}`} key={block.key}
            onClick={isFlop ? onOpenFlopCards : () => onOpenLaterCard(street)}
            aria-label={english ? `${title} card ${selected ? "change" : "select"}` : `${label}カードを${selected ? "変更" : "選択"}`}>
            <span className="action-seat-heading"><strong>{title}</strong><span className="action-seat-board-edit" aria-hidden="true">{english ? selected ? "Edit" : "Select" : selected ? "変更" : "選択"}</span></span>
            <span className="action-seat-board-cards">{(isFlop ? [0, 1, 2].map(index => block.cards[index] ?? "") : [block.cards[0] ?? ""]).map((card, index) => <span key={index} className={`action-seat-board-card${/[hd]$/.test(card) ? " red" : ""}${card ? "" : " empty"}`}>{card ? <>{card[0]}<span className="suit">{suitLabels[card[1]]}</span></> : "?"}</span>)}</span>
            {Number.isFinite(block.potBb) && <small className="action-seat-board-pot" aria-label={`${english ? "Pot at the start of the street" : "ストリート開始時のポット"} ${formatBb(block.potBb)}BB`}>{english ? "Pot" : "ポット"} {formatBb(block.potBb)}BB</small>}
          </button>;
        }
        const chosenOption = block.options.find(option => option.action === block.chosen);
        if (block.kind === "end") return <div className="action-seat action-seat-end" key={block.key}>
          <div className="action-seat-heading"><strong>終了</strong></div>
          <p className="action-seat-result">{block.continuationAvailable === false ? continuationCopy(block.continuationStatus === "unreachable" ? "unreachable" : block.continuationStatus === "loading" ? "loading" : block.continuationStatus === "error" ? "error" : "missing") : endResultLabel(block.result)}</p>
          <small>{block.pot}</small>
          {/^\d+人でフロップへ$/.test(block.result) && onEnterPostflop && <button type="button" className="enter-postflop" onClick={onEnterPostflop}>フロップへ進む →</button>}
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
              return <button type="button" key={option.action} className={selected ? "chosen" : ""} aria-pressed={selected} disabled={disabled} title={selected && onRewindActionBlock ? "クリックしてこのアクション前に戻る" : undefined} onClick={event => { event.stopPropagation(); selected && onRewindActionBlock ? onRewindActionBlock(block) : select(block, option.action); }}><OptionLabel label={option.label} /></button>;
            })}
            {block.kind === "pending" && <small className="action-path-pending">推定レンジ準備中</small>}
            {block.active && !block.chosen && block.kind !== "forced" && block.kind !== "pending" && block.options.some(option => !option.disabled) && <ActionDropdown position={block.position} options={block.options.filter(option => !option.disabled)} onSelect={action => select(block, action)} />}
          </div> : <span className={`action-seat-summary${block.kind === "pending" ? " action-path-pending" : ""}`}>{chosenOption?.label ?? (block.kind === "pending" ? "推定レンジ準備中" : "—")}</span>}
        </div>;
      })}
    </div>
  </div>;
}

function PostflopSignIn({ account, onBack }) {
  return <div className="learning-gate postflop-gate"><LearningGate account={account} onBack={onBack}
    title={localized("Sign in to play the flop to the river", "ログインしてフロップ以降を見る")}
    lead={localized("Postflop ranges and hand explanations are available after Google sign-in.", "フロップからリバーまでのAI推定レンジと解説は、Googleログインで使えます。")}
    features={[
      [Cards, localized("Any flop, turn and river", "好きなフロップ・ターン・リバー"), localized("Pick the board and follow the hand to the river", "ボードを選んでリバーまで追える")],
      [Path, localized("Every action branch", "すべてのアクション分岐"), localized("Bets, raises and calls on each street", "各ストリートのベット・レイズ・コール")],
      [ChatText, localized("Hand-by-hand reasons", "ハンドごとの解説"), localized("Why each hand bets, checks or folds", "なぜベット・チェック・フォールドするか")],
    ]}
    backLabel={localized("Back to preflop ranges", "プリフロップのレンジに戻る")} /></div>;
}

// Query navigation is a fresh, validated range selection. Remounting the
// session atomically restores all streets and cancels the old session's async
// effects, so a late source response cannot write over Back/Forward navigation.
export function EstimatedRanges(props) {
  const [navigation, setNavigation] = useState(0);
  useEffect(() => {
    const restore = () => { if (window.location.pathname === "/analyze/ranges") setNavigation(value => value + 1); };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  return <EstimatedRangeSession key={navigation} {...props} />;
}

function EstimatedRangeSession({ initialRangeType = "response", fourBet = fourBetState, profile = null, onEditProfile, onSectionChange }) {
  const [initialUrlState] = useState(() => readRangeUrl());
  const [initialSelection] = useState(() => initialUrlState ?? restoredSelection(initialRangeType));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showFlop, setShowFlop] = useState(initialUrlState?.showFlop ?? false);
  // Postflop (flop to river) requires Google sign-in; preflop ranges stay open to guests.
  const account = useAccount();
  const postflopAllowed = learningAllowed(account);
  const [flopDialogOpen, setFlopDialogOpen] = useState(false);
  const [streetCardDialog, setStreetCardDialog] = useState(null);
  const [flopCards, setFlopCards] = useState(initialUrlState?.flopCards ?? ["", "", ""]);
  const [flopActions, setFlopActions] = useState(initialUrlState?.flopActions ?? []);
  const [turnCard, setTurnCard] = useState(initialUrlState?.turnCard ?? "");
  const [turnActions, setTurnActions] = useState(initialUrlState?.turnActions ?? []);
  const [riverCard, setRiverCard] = useState(initialUrlState?.riverCard ?? "");
  const [riverActions, setRiverActions] = useState(initialUrlState?.riverActions ?? []);
  // Compare inputs rather than skipping one effect: StrictMode replays mount effects.
  const previousFlopState = useRef({ cards: flopCards, actions: flopActions });
  const flopChanged = previousFlopState.current.cards !== flopCards || previousFlopState.current.actions !== flopActions;
  const previousTurnState = useRef({ card: turnCard, actions: turnActions });
  const turnChanged = previousTurnState.current.card !== turnCard || previousTurnState.current.actions !== turnActions;
  useEffect(() => {
    if (!flopChanged) return;
    previousFlopState.current = { cards: flopCards, actions: flopActions };
    setTurnCard(""); setTurnActions([]); setRiverCard(""); setRiverActions([]);
  }, [flopCards, flopActions]);
  useEffect(() => {
    if (!turnChanged) return;
    previousTurnState.current = { card: turnCard, actions: turnActions };
    setRiverCard(""); setRiverActions([]);
  }, [turnCard, turnActions]);
  const [rangeType, setRangeType] = useState(initialSelection.rangeType);
  const isOpening = rangeType === "open";
  const isLimp = rangeType === "limp";
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
  const [limpAction, setLimpAction] = useState(initialSelection.limpAction);
  const [limpResponseAction, setLimpResponseAction] = useState(initialSelection.limpResponseAction);
  const [coldAction, setColdAction] = useState(initialSelection.coldAction ?? null);
  const [limpReraiseAction, setLimpReraiseAction] = useState(initialSelection.limpReraiseAction);
  const [limpFourBetAction, setLimpFourBetAction] = useState(initialSelection.limpFourBetAction);
  const [squeezeResponse, setSqueezeResponse] = useState(initialSelection.squeezeResponse);
  const [continuationActions, setContinuationActions] = useState(initialSelection.continuationActions ?? []);
  const [stage3RootId, setStage3RootId] = useState(initialSelection.stage3RootId ?? null);
  const [stage3Actions, setStage3Actions] = useState(initialSelection.stage3Actions ?? []);
  const [format, setFormat] = useState(() => {
    if (initialUrlState) return initialUrlState.format;
    try {
      const saved = JSON.parse(window.localStorage.getItem(formatStorageKey));
      return saved && isBuilt(saved) ? saved : defaultFormat;
    } catch { return defaultFormat; }
  });
  const [tableProfile, setTableProfile] = useState(() => {
    if (initialUrlState) return initialUrlState.tableProfile;
    try { return normalizeProfile(JSON.parse(window.localStorage.getItem(tableProfileStorageKey)) ?? DEFAULT_PROFILE); } catch { return DEFAULT_PROFILE; }
  });
  const [formatOpen, setFormatOpen] = useState(false);
  function saveFormat(value, profileValue = tableProfile) {
    setShowFlop(false); setFlopDialogOpen(false); setStreetCardDialog(null); setFlopActions([]);
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
    try { return accountStorage()?.getItem(displayModeStorageKey) === "simple" ? "simple" : "standard"; } catch { return "standard"; }
  });
  function changeDisplayMode(value) {
    setDisplayMode(value);
    try { accountStorage()?.setItem(displayModeStorageKey, value); } catch {}
  }
  const currentError = isFourBet ? fourBet.error : isOpening ? openingDataError : isLimp ? limpDataError : isThreeBet ? threeBetDataError : dataError || openingDataError;
  const openerSpot = useMemo(() => openingSpotFor(opener), [opener, tableProfile]);
  const openerModel = useMemo(() => openerSpot ? openingModelFor(openerSpot) : null, [openerSpot]);
  const spot = isOpening
    ? openerSpot
    : isLimp ? null
    : isFourBet ? fourBet.data ? findFourBetSpot(fourBet.data, opener, hero) : null
    : isThreeBet ? threeBetDataset ? findThreeBetSpot(threeBetDataset, opener, hero) : null
    : dataset ? findSpot(dataset, opener, hero) : null;
  const model = useMemo(() => spot ? (isOpening ? openingModelFor(spot) : isFourBet ? fourBetMatrixModel(spot, findSpot(dataset, opener, hero)) : isThreeBet ? threeBetMatrixModel(spot) : matrixModel(spot)) : null, [spot, isOpening, isThreeBet, isFourBet, opener, hero]);
  function resetPath() {
    setShowFlop(false); setFlopDialogOpen(false); setStreetCardDialog(null); setFlopCards(["", "", ""]); setFlopActions([]);
    setRangeType("response");
    setOpener("BTN");
    setHero("BB");
    setCallers([]);
    setFoldedHero(false);
    setPendingRaise(null);
    setContinuationAction(null); setShoveResponse(null); setColdAction(null); setSqueezeResponse([]); setContinuationActions([]); setStage3RootId(null); setStage3Actions([]); setLimpReraiseAction(null); setLimpFourBetAction(null);
    setLimpAction(null); setLimpResponseAction(null);
    setFocusedRange(null);
    setSelectedRangeBlock(null);
    setSelected("AKo");
    setLocalEstimate(null);
    setLocalEstimateRequestKey(null);
    setLocalStatus("idle");
    setLocalError("");
  }
  function changeOpener(value) {
    setShowFlop(false); setFlopDialogOpen(false); setFlopActions([]);
    setOpener(value);
    setRangeType("open");
    setPendingRaise(null);
    setContinuationAction(null); setShoveResponse(null); setColdAction(null); setSqueezeResponse([]); setContinuationActions([]); setStage3RootId(null); setStage3Actions([]); setLimpReraiseAction(null); setLimpFourBetAction(null);
    setLimpAction(null); setLimpResponseAction(null);
    setFocusedRange(null);
    setSelectedRangeBlock(null);
    setHero(positions[positions.indexOf(value) + 1] ?? "");
    setCallers([]);
    setFoldedHero(false);
  }

  function selectStage3(block, action) {
    const next = chooseStage3Action(block, action);
    if (!next) return;
    setRangeType(next.rangeType); setOpener(next.opener); setHero(next.hero); setCallers(next.callers);
    setPendingRaise(next.pendingRaise); setColdAction(next.coldAction); setFoldedHero(false);
    setStage3RootId(next.stage3RootId); setStage3Actions(next.stage3Actions);
    setSqueezeResponse([]); setContinuationActions([]); setContinuationAction(null); setShoveResponse(null);
    setFocusedRange(null); setSelectedRangeBlock(null);
    setShowFlop(false); setFlopDialogOpen(false); setStreetCardDialog(null); setFlopActions([]);
  }

  function actAt(position, action) {
    setShowFlop(false); setFlopDialogOpen(false); setFlopActions([]);
    const index = positions.indexOf(position);
    const next = positions[index + 1];
    setPendingRaise(null);
    setContinuationAction(null); setShoveResponse(null); setColdAction(null); setSqueezeResponse([]); setContinuationActions([]); setStage3RootId(null); setStage3Actions([]); setLimpReraiseAction(null); setLimpFourBetAction(null);
    setFocusedRange(null);
    const limpTransition = limpActionTransition({ rangeType, opener, hero, limpAction, limpResponseAction, limpReraiseAction, position, action });
    if (limpTransition) {
      setSelectedRangeBlock(null);
      setRangeType(limpTransition.rangeType);
      setOpener(limpTransition.opener);
      setHero(limpTransition.hero);
      setCallers([]);
      setFoldedHero(false);
      setLimpAction(limpTransition.limpAction);
      setLimpResponseAction(limpTransition.limpResponseAction);
      setLimpReraiseAction(limpTransition.limpReraiseAction ?? null);
      setLimpFourBetAction(limpTransition.limpFourBetAction ?? null);
      return;
    }
    if (isLimp) return;
    if (index <= positions.indexOf(opener)) {
      if (action === "raise" && next) {
        setSelectedRangeBlock(null);
        setLimpAction(null); setLimpResponseAction(null);
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
    if (block.kind === "forced" || block.kind === "pending") return;
    if (block.kind === "flop" && block.street === "turn") {
      setTurnActions(current => current.slice(0, block.laterIndex ?? 0));
      setRiverCard(""); setRiverActions([]);
      setSelectedRangeBlock(current => current === block.key ? null : block.key);
      return;
    }
    if (block.kind === "flop" && block.street === "river") {
      setRiverActions(current => current.slice(0, block.laterIndex ?? 0));
      setSelectedRangeBlock(current => current === block.key ? null : block.key);
      return;
    }
    if (block.kind === "flop" || block.kind === "flop-forced") {
      setFlopActions(current => current.slice(0, block.flopIndex ?? 0));
      setSelectedRangeBlock(block.key);
      return;
    }
    setShowFlop(false); setFlopDialogOpen(false); setFlopActions([]);
    if (block.stage3Node) {
      selectStage3(block, null);
      setSelectedRangeBlock(current => current === block.key ? null : block.key);
      return;
    }
    if (block.continuationNode) {
      setStage3RootId(null); setStage3Actions([]);
      const next = chooseContinuationAction({ squeezeResponse, continuationActions }, block, null);
      setSqueezeResponse(next.squeezeResponse); setContinuationActions(next.continuationActions);
      setFocusedRange(null); setSelectedRangeBlock(current => current === block.key ? null : block.key);
      return;
    }
    const transition = rewindActionBlockTransition({ rangeType, opener, hero, callers, limpAction, limpResponseAction, squeezeResponse, block });
    setContinuationActions([]); setStage3RootId(null); setStage3Actions([]);
    setFocusedRange(null);
    setColdAction(transition?.coldAction ?? null);
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
    setLimpAction(transition.limpAction ?? null);
    setLimpResponseAction(transition.limpResponseAction ?? null);
    setLimpReraiseAction(transition.limpReraiseAction ?? null);
    setLimpFourBetAction(transition.limpFourBetAction ?? null);
    setSqueezeResponse(transition.squeezeResponse ?? []);
  }

  function selectFourBet() {
    setShowFlop(false); setFlopDialogOpen(false); setFlopActions([]);
    setRangeType("four_bet");
    setPendingRaise(null);
    setContinuationAction(null); setShoveResponse(null); setColdAction(null); setSqueezeResponse([]); setContinuationActions([]); setStage3RootId(null); setStage3Actions([]); setLimpReraiseAction(null); setLimpFourBetAction(null);
    setLimpAction(null); setLimpResponseAction(null);
    setFocusedRange(null);
    setSelectedRangeBlock(null);
  }

  const multiwayParticipants = [opener, ...callers, ...(!foldedHero && !callers.includes(hero) ? [hero] : [])];
  const showPendingRanges = isComparison && callers.some(position => position !== hero);
  const sortedCallers = [...callers].sort((a, b) => positions.indexOf(a) - positions.indexOf(b));
  // Hero's own call/fold is the decision being estimated, so it never counts as a prior caller.
  const priorCallers = sortedCallers.filter(position => positions.indexOf(position) < positions.indexOf(hero));
  // Saved multiway / squeeze ranges replace the local-generation fallback for SB/BB after one caller.
  const savedMultiway = isComparison && multiwayContext(opener, callers, hero) && (pendingRaise !== "squeeze" || callers.length === 1);
  const boundedSelection = continuationRootForSelection({ rangeType, opener, hero, callers, pendingRaise, coldAction });
  const stage3Selection = stage3RootForSelection({ rangeType, opener, hero, callers, foldedHero, pendingRaise, coldAction, stage3RootId, stage3Actions });
  const multiwayRequest = isComparison && !stage3Selection && !boundedSelection && priorCallers.length !== 2 && !savedMultiway && priorCallers.length > 0 && priorCallers.length === sortedCallers.filter(position => position !== hero).length
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
    window.sessionStorage.setItem(selectionStorageKey, JSON.stringify({ rangeType, opener, hero, callers, foldedHero, pendingRaise, continuationAction, shoveResponse, limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction, squeezeResponse, continuationActions, stage3RootId, stage3Actions, coldAction, selected }));
  }, [rangeType, opener, hero, callers, foldedHero, pendingRaise, continuationAction, shoveResponse, limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction, squeezeResponse, continuationActions, stage3RootId, stage3Actions, coldAction, selected]);
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
  const actionState = { rangeType, opener, hero, spot, callers, foldedHero, raiseToBb: currentLocalEstimate?.ranges.find(range => range.position === hero)?.raise_to_bb, pendingRaise, continuationAction, shoveResponse, coldAction, limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction, squeezeResponse, continuationActions, stage3RootId, stage3Actions, raiseSizeFor };
  const continuationRuntime = useContinuationUiRuntime(Boolean(boundedSelection) || callers.length >= 2);
  const structuralActionBlocks = buildActionBlocks(actionState);
  const stage3Runtime = useStage3UiRuntime(structuralActionBlocks.some(block => block.stage3Node));
  const actionBlocks = withStage3Availability(withContinuationAvailability(structuralActionBlocks, continuationRuntime.runtime, continuationRuntime.error), stage3Runtime.runtime, stage3Runtime.error);
  const liveContinuationSeats = stage3LiveSeats(actionBlocks) ?? continuationLiveSeats(actionBlocks);
  const flopContext = !currentError ? completedFlopContext({ actionBlocks, rangeType, opener, hero, pendingRaise, squeezeResponse,
    callers, foldedHero, isDefaultTable: isDefaultProfile(tableProfile) && isBuilt(format), limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction }) : null;
  const flopActive = showFlop && Boolean(flopContext);
  // Temporary loading/missing policy data is not proof that an otherwise valid
  // board/history is invalid. Persist the validated selection, not whether its
  // strategy can be rendered in this particular async frame. Exact zero support
  // is different: only a proved unreachable terminal invalidates that intent.
  const sourceProvesUnreachable = actionBlocks.at(-1)?.continuationStatus === "unreachable";
  const urlFlopContext = !currentError && !sourceProvesUnreachable ? completedFlopContext({
    ...actionState, actionBlocks: structuralActionBlocks,
    isDefaultTable: isDefaultProfile(tableProfile) && isBuilt(format),
  }) : null;
  const persistFlop = showFlop && Boolean(urlFlopContext);
  useEffect(() => {
    // Wait for dependent street resets before serializing a changed upstream path.
    if (flopChanged || turnChanged) return;
    replaceRangeUrl(encodeRangeUrl({ rangeType, opener, hero, callers, foldedHero, pendingRaise,
      continuationAction, shoveResponse, coldAction, limpAction, limpResponseAction, limpReraiseAction,
      limpFourBetAction, squeezeResponse, continuationActions, stage3RootId, stage3Actions, selected, format, tableProfile, showFlop: persistFlop,
      flopCards, flopActions, turnCard, turnActions, riverCard, riverActions }, actionBlocks));
  }, [rangeType, opener, hero, callers, foldedHero, pendingRaise, continuationAction, shoveResponse,
    coldAction, limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction, squeezeResponse, continuationActions, stage3RootId, stage3Actions,
    selected, format, tableProfile, persistFlop, flopCards, flopActions, turnCard, turnActions,
    riverCard, riverActions, flopChanged, turnChanged, actionBlocks]);
  const flopBoard = recognizedFlop(flopCards);
  const canEnterLaterStreets = Boolean(flopContext?.pilotAvailable && flopBoard && laterStart(flopActions, flopContext));
  const laterBlocks = canEnterLaterStreets
    ? buildLaterActionBlocks({ flopActions, turnCard, turnActions, riverCard, riverActions }, flopContext)
    : [];
  const pendingStreetCard = flopActive ? laterBlocks.find(block => block.kind === "board" && block.pending)?.street ?? null : null;
  const previousPendingStreetCard = useRef(null);
  useEffect(() => {
    const nextDialog = nextPendingStreetCardDialog(pendingStreetCard, previousPendingStreetCard.current);
    if (nextDialog) setStreetCardDialog(nextDialog);
    previousPendingStreetCard.current = pendingStreetCard;
  }, [pendingStreetCard]);
  const combinedBlocks = flopActive
    ? [...actionBlocks.filter(block => block.kind !== "end"), { key: "flop-board", kind: "board", cards: flopCards, street: "flop", potBb: flopContext.potBb },
      ...(flopContext.pilotAvailable && flopBoard
        ? [...buildFlopActionBlocks(flopActions, flopContext).filter(block => !(canEnterLaterStreets && block.kind === "end")), ...laterBlocks]
        : [])]
    : actionBlocks;
  const responseSpot = !isOpening && !isLimp && dataset && positions.indexOf(hero) > positions.indexOf(opener) ? findSpot(dataset, opener, hero) : null;
  const responseModel = responseSpot ? matrixModel(responseSpot) : null;
  const threeBetSpot = (isThreeBet || isFourBet) && threeBetDataset ? findThreeBetSpot(threeBetDataset, opener, hero) : null;
  const threeBetModel = threeBetSpot ? threeBetMatrixModel(threeBetSpot) : null;
  const extended = useExtendedDatasets(isThreeBet || (isComparison && callers.length > 0), dataset, openingDataset);
  // Multiway / squeeze-response / cold-3bet tables come from the lazily loaded datasets.
  const extendedEntry = (ref, title) => {
    const missing = (statusTitle, statusDescription) => ({ position: ref.position, kind: "pending", title, statusTitle, statusDescription });
    if (extended.error) return missing("レンジを読み込めません", extended.error.message);
    if (!extended.data) return missing("読み込み中", "保存済みレンジを読み込んでいます。");
    const savedSpot = findExtendedSpot(extended.data, ref, opener);
    if (!savedSpot) return missing("レンジ未収録", "この履歴のレンジはまだ保存されていません。");
    if (savedSpot.unreachable === true) return missing(continuationCopy("unreachable"), continuationCopy("unreachableDetail"));
    return { position: ref.position, kind: ref.kind, spot: savedSpot, model: extendedModel(ref.kind, savedSpot, dataset, openingDataset), title,
      hand: savedSpot.hands.find(row => row.hand === selected), unreachableReason: extendedUnreachableReason(ref.kind, savedSpot) };
  };
  const extendedTitle = ref => ref.kind === "multiway" ? `${ref.position} · オープン＋コールへの応答`
    : ref.kind === "cold" ? `${ref.position} · ${ref.threeBettor}の3betへのコールド応答`
    : ref.priorAction ? `${ref.position} · スクイーズへの応答（${opener}${ref.priorAction === "fold" ? "フォールド" : "コール"}後）` : `${ref.position} · スクイーズへの応答`;
  const continuationEntry = (ref, historical = false) => {
    const selectedRuntime = ref.kind === "stage3" || stage3Selection ? stage3Runtime : continuationRuntime;
    const title = `${ref.position} · ${ref.extraSeat ? stage3Copy("extraSeat") : continuationCopy("saved")}${historical ? continuationCopy("history") : ""}`;
    const missing = (statusTitle, statusDescription) => ({ position: ref.position, kind: "pending", title, statusTitle, statusDescription, retryStage3: ref.kind === "stage3" || Boolean(stage3Selection), retryContinuation: Boolean(selectedRuntime.runtime?.missingSources?.length || selectedRuntime.error) });
    if (selectedRuntime.error) return missing(continuationCopy("error"), selectedRuntime.error.message);
    if (!selectedRuntime.runtime) return missing(continuationCopy("loading"), continuationCopy("loadingDetail"));
    try {
      const saved = selectedRuntime.runtime.select(ref);
      if (saved.status === "rare") return missing(stage3Copy("rare"), stage3Copy("rareDetail"));
      if (saved.status === "unreachable") return missing(continuationCopy("unreachable"), continuationCopy("unreachableDetail"));
      if (saved.status !== "saved") return missing(continuationCopy("missing"), continuationCopy("missingDetail"));
      return { position: ref.position, kind: "bounded", title, spot: saved.spot, model: saved.model,
        hand: saved.spot.hands.find(row => row.hand === selected), unreachableReason: continuationCopy("unreachableHand") };
    } catch (error) { return missing(continuationCopy("error"), error.message); }
  };
  const rangeEntries = [];
  const addSaved = (position, kind, savedSpot, savedModel, title) => rangeEntries.push({ position, kind, spot: savedSpot, model: savedModel, title, hand: savedSpot?.hands.find(row => row.hand === selected) });
  if (isOpening) {
    addSaved(opener, "opening", openerSpot, openerModel, openingTitle(opener));
  } else if (isLimp) {
    const bbLimpSpot = limpDataset ? findLimpResponseSpot(limpDataset, "BB_vs_SB_limp") : null;
    const bbLimpModel = bbLimpSpot ? limpResponsesMatrixModel(bbLimpSpot, openingDataset) : null;
    if (limpAction === "raise" && limpResponseAction === "raise" && limpReraiseAction === "raise") {
      const reraiseSpot = limpDataset ? findLimpResponseSpot(limpDataset, LIMP_RERAISE_RESPONSE_ID) : null;
      const fourBetSpot = limpDeepDataset ? findLimpDeepResponseSpot(limpDeepDataset, LIMP_FOUR_BET_RESPONSE_ID) : null;
      addSaved("BB", "limp_reraise", reraiseSpot, reraiseSpot ? limpResponsesMatrixModel(reraiseSpot, openingDataset, limpDataset) : null, "BB · リンプ・リレイズへの応答（履歴）");
      addSaved("SB", "limp_four_bet", fourBetSpot, fourBetSpot ? limpFourBetMatrixModel(fourBetSpot, limpDataset) : null, "SB · BBの4betへの応答");
    } else if (limpAction === "raise" && limpResponseAction === "raise") {
      const sbIsoSpot = limpDataset ? findLimpResponseSpot(limpDataset, "SB_vs_BB_iso") : null;
      const reraiseSpot = limpDataset ? findLimpResponseSpot(limpDataset, LIMP_RERAISE_RESPONSE_ID) : null;
      addSaved("SB", "limp_response", sbIsoSpot, sbIsoSpot ? limpResponsesMatrixModel(sbIsoSpot, openingDataset) : null, "SB · アイソレイズへの応答（履歴）");
      addSaved("BB", "limp_reraise", reraiseSpot, reraiseSpot ? limpResponsesMatrixModel(reraiseSpot, openingDataset, limpDataset) : null, "BB · リンプ・リレイズへの応答");
    } else if (limpAction === "raise") {
      const sbIsoSpot = limpDataset ? findLimpResponseSpot(limpDataset, "SB_vs_BB_iso") : null;
      const sbIsoModel = sbIsoSpot ? limpResponsesMatrixModel(sbIsoSpot, openingDataset) : null;
      addSaved("BB", "limp_response", bbLimpSpot, bbLimpModel, "BB · SBリンプへの応答（履歴）");
      addSaved("SB", "limp_response", sbIsoSpot, sbIsoModel, "SB · アイソレイズへの応答");
    } else {
      addSaved("SB", "opening", openerSpot, openerModel, "SB · オープンレンジ（リンプ選択）");
      addSaved("BB", "limp_response", bbLimpSpot, bbLimpModel, "BB · SBリンプへの応答");
    }
  } else if (isComparison && pendingRaise === "squeeze" && savedMultiway) {
    const [caller] = callers;
    const [openerAction = null, callerAction = null] = squeezeResponse;
    const squeezeRef = { caller, squeezer: hero };
    rangeEntries.push(extendedEntry({ kind: "multiway", position: hero, caller }, `${hero} · オープン＋コールへの応答（スクイーズ選択）`));
    if (openerAction !== "fold") rangeEntries.push(extendedEntry({ kind: "squeeze", position: opener, ...squeezeRef, priorAction: null }, `${opener} · スクイーズへの応答${openerAction ? "（履歴）" : ""}`));
    if (callerAction !== "fold") {
      if (!openerAction) {
        const callerSpot = dataset ? findSpot(dataset, opener, caller) : null;
        addSaved(caller, "response", callerSpot, callerSpot ? matrixModel(callerSpot) : null, `${caller} · オープンへの応答（履歴）`);
      } else if (openerAction === "raise") rangeEntries.push({ position: caller, kind: "pending", title: `${caller} · 4betへの応答`, statusTitle: "レンジ未収録", statusDescription: "スクイーズ後の4betへの応答データはまだ保存されていません。" });
      else rangeEntries.push(extendedEntry({ kind: "squeeze", position: caller, ...squeezeRef, priorAction: openerAction }, extendedTitle({ kind: "squeeze", position: caller, priorAction: openerAction })));
    }
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
      else if (pendingRaise !== "squeeze" && multiwayContext(opener, callers, position)) {
        const { caller } = multiwayContext(opener, callers, position);
        rangeEntries.push(extendedEntry({ kind: "multiway", position, caller }, extendedTitle({ kind: "multiway", position })));
      } else if (actionBlocks.find(block => block.position === position)?.rangeRef?.kind === "saved-source") {
        const block = actionBlocks.find(block => block.position === position);
        rangeEntries.push(continuationEntry(block.rangeRef, Boolean(block.chosen)));
      } else {
        const localRange = currentLocalEstimate?.ranges.find(range => range.position === position);
        rangeEntries.push(localRange ? { position, kind: "local", model: localMatrix(localRange), title: `${position} · ${pendingRaise === "squeeze" ? "スクイーズ選択" : position === hero ? "現在の応答" : "コール選択"}（レイズ先 ${localRange.raise_to_bb}BB）`, raiseToBb: localRange.raise_to_bb } : { position, kind: "pending", title: `${position} · 推定レンジ準備中`, statusTitle: "レンジ未収録", statusDescription: pendingRaise === "squeeze" ? "この局面の推定レンジはまだ生成・保存されていません。" : "この履歴のレンジはまだ保存されていません。" });
      }
    }
  } else if (isThreeBet) {
    if (coldAction) rangeEntries.push(extendedEntry({ kind: "cold", position: coldAction.position, threeBettor: hero }, `${coldAction.position} · ${hero}の3betへの${coldAction.action === "call" ? "コールドコール" : "コールド4bet"}選択`));
    else if (continuationAction !== "fold") addSaved(opener, "three_bet", spot, model, `${opener} · 3betへの応答`);
    addSaved(hero, "response", responseSpot, responseModel, `${hero} · オープンへの応答（3bet前）`);
  } else if (isFourBet) {
    if (pendingRaise === "all_in") {
      const allInRange = currentLocalEstimate?.scenario === "five_bet_all_in_response" && currentLocalEstimate.ranges?.find(range => range.position === opener);
      if (fiveBet.spot) addSaved(opener, "five_bet", fiveBet.spot, fiveBetModel, `${opener} · 5betオールインへの応答`);
      else if (fiveBet.loading) rangeEntries.push({ position: opener, kind: "pending", title: `${opener} · 5betオールインへの応答`, statusTitle: "読み込み中", statusDescription: "保存済みレンジを読み込んでいます。" });
      else rangeEntries.push(allInRange
        ? { position: opener, kind: "local", model: localMatrix(allInRange), title: `${opener} · 5betオールインへの応答`, allInSizeBb: 100, fourBetSizeBb: spot.four_bet_size_bb, threeBetSizeBb: spot.three_bet_size_bb }
        : { position: opener, kind: "pending", title: `${opener} · 5betオールインへの応答`, statusTitle: "レンジ未収録", statusDescription: "5betオールイン後の応答データはまだ保存されていません。" });
      addSaved(hero, "four_bet", spot, model, `${hero} · 4betへの応答（5bet選択）`);
    } else {
      addSaved(opener, "three_bet", threeBetSpot, threeBetModel, `${opener} · 3betへの応答（4bet前）`);
      if (continuationAction !== "fold") addSaved(hero, "four_bet", spot, model, `${hero} · 4betへの応答`);
    }
  }
  // The last raiser's table goes on the left.
  const aggressor = isLimp && limpAction === "raise" ? "BB" : isThreeBet || pendingRaise ? hero : opener;
  rangeEntries.sort((a, b) => (b.position === aggressor) - (a.position === aggressor));
  const actionRangeEntry = (block, role) => {
    const ref = block?.rangeRef;
    if (!ref) return null;
    const labelContext = role === "previous" ? "前のポジション・履歴" : "選択位置";
    const withContext = entry => entry && ({ ...entry, hand: selectedHandForRangeEntry(entry, selected), title: `${entry.title}（${labelContext}）`, rangeBlockKey: block.key });
    const missing = (title, description = ref.reason || "この履歴のレンジはまだ保存されていません。", statusTitle = "レンジ未収録") => ({
      position: ref.position,
      kind: "pending",
      title: `${ref.position} · ${title}（${labelContext}）`,
      statusTitle,
      statusDescription: description,
      rangeBlockKey: block.key,
    });

    if (ref.kind === "stage3" || ref.kind === "bounded" || ref.kind === "saved-source") return withContext(continuationEntry(ref, role === "previous" || Boolean(block.chosen)));
    if (ref.kind === "opening") {
      const savedSpot = openingSpotFor(ref.position);
      return savedSpot ? withContext({ position: ref.position, kind: "opening", spot: savedSpot, model: openingModelFor(savedSpot), title: openingTitle(ref.position) }) : missing("オープンレンジ");
    }
    if (ref.kind === "multiway" || ref.kind === "squeeze" || ref.kind === "cold") return withContext(extendedEntry(ref, extendedTitle(ref)));
    if (ref.kind === "limp_four_bet") {
      const savedSpot = limpDeepDataset ? findLimpDeepResponseSpot(limpDeepDataset, LIMP_FOUR_BET_RESPONSE_ID) : null;
      return savedSpot ? withContext({ position: ref.position, kind: "limp_four_bet", spot: savedSpot, model: limpFourBetMatrixModel(savedSpot, limpDataset), title: "SB · BBの4betへの応答" }) : missing("BBの4betへの応答");
    }
    if (ref.kind === "limp_reraise") {
      const savedSpot = limpDataset ? findLimpResponseSpot(limpDataset, LIMP_RERAISE_RESPONSE_ID) : null;
      return savedSpot ? withContext({ position: ref.position, kind: "limp_reraise", spot: savedSpot, model: limpResponsesMatrixModel(savedSpot, openingDataset, limpDataset), title: "BB · リンプ・リレイズへの応答" }) : missing("リンプ・リレイズへの応答");
    }
    if (ref.kind === "limp_bb" || ref.kind === "limp_sb") {
      const id = ref.kind === "limp_bb" ? "BB_vs_SB_limp" : "SB_vs_BB_iso";
      const savedSpot = limpDataset ? findLimpResponseSpot(limpDataset, id) : null;
      const savedModel = savedSpot ? limpResponsesMatrixModel(savedSpot, openingDataset) : null;
      const title = ref.kind === "limp_bb" ? "BB · SBリンプへの応答" : "SB · アイソレイズへの応答";
      return savedSpot ? withContext({ position: ref.position, kind: "limp_response", spot: savedSpot, model: savedModel, title }) : missing(title);
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
        ? withContext({ position: ref.position, kind: "local", model: localMatrix(allInRange), title: `${ref.position} · 5betオールインへの応答`, allInSizeBb: 100, fourBetSizeBb: spot?.four_bet_size_bb, threeBetSizeBb: spot?.three_bet_size_bb })
        : missing("5betオールインへの応答", "5betオールイン後の応答データはまだ保存されていません。");
    }
    const localRange = currentLocalEstimate?.ranges.find(range => range.position === ref.position);
    if (localRange) return withContext({ position: ref.position, kind: "local", model: localMatrix(localRange), title: `${ref.position} · レンジ（レイズ先 ${localRange.raise_to_bb}BB）`, raiseToBb: localRange.raise_to_bb });
    return missing(ref.reason ? "推定レンジ準備中" : "この履歴のレンジ");
  };
  if (liveContinuationSeats) {
    rangeEntries.splice(0);
    for (const position of liveContinuationSeats) {
      const block = actionBlocks.findLast(item => item.position === position && item.rangeRef);
      if (block) rangeEntries.push(continuationEntry(block.rangeRef, Boolean(block.chosen)));
    }
    const cursor = actionBlocks.at(-1);
    const history = cursor.stage3Terminal?.history ?? cursor.stage3Node?.history ?? cursor.continuationTerminal?.history ?? cursor.continuationNode?.history ?? [];
    const raiser = history.findLast(item => ["open", "three_bet", "squeeze", "four_bet", "all_in"].includes(item.action))?.seat;
    rangeEntries.sort((a, b) => Number(b.position === raiser) - Number(a.position === raiser));
  }
  const selectedBlockIndex = actionBlocks.findIndex(block => block.key === selectedRangeBlock);
  const selectedActionEntries = selectedBlockIndex < 0 ? null : [
    ...(isOpening ? [] : [actionRangeEntry(actionBlocks[selectedBlockIndex - 1], "previous")]),
    actionRangeEntry(actionBlocks[selectedBlockIndex], "selected"),
  ].filter(entry => entry && (!liveContinuationSeats || liveContinuationSeats.includes(entry.position)));
  // Keep the focused action pair first, but never hide other active participants' ranges.
  const visibleRangeEntries = prioritizeParticipantRanges(rangeEntries, selectedActionEntries);
  const focusedEntry = visibleRangeEntries.find(entry => entry.position === focusedRange && entry.model);
  const displayedEntries = focusedEntry ? [focusedEntry] : visibleRangeEntries;

  // Guests who reach the flop see only the sign-in card, centred on one screen (no action strip).
  if (flopActive && !postflopAllowed) return <div className="shell">
    <Sidebar activeSection={RANGE_SECTION}
      onSectionChange={onSectionChange ?? (() => {})}
      profile={profile} onEditProfile={onEditProfile} />
    <main className="postflop-gate-main">
      <PostflopSignIn account={account} onBack={() => setShowFlop(false)} />
    </main>
  </div>;

  return <div className="shell">
    <Sidebar activeSection={RANGE_SECTION}
      onSectionChange={onSectionChange ?? (() => {})}
      profile={profile} onEditProfile={onEditProfile} />
    <main>
      <Panel className="estimate-settings">
        <ActionPath
          leading={<RangeContextCard postflop={flopActive} settingsOpen={settingsOpen}
            boards={combinedBlocks.filter(block => block.kind === "board")}
            onEditBoard={street => street === "flop" ? setFlopDialogOpen(postflopAllowed) : setStreetCardDialog(postflopAllowed ? street : null)}
            onReset={resetPath}
            displayModeControl={<div className="display-mode-toggle" role="group" aria-label="表示モード">{displayModes.map(mode => <button type="button" key={mode.value} aria-pressed={displayMode === mode.value} onClick={() => changeDisplayMode(mode.value)}>{mode.label}</button>)}</div>}>
            <button type="button" className="settings-toggle" aria-label="ゲーム設定を開閉" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(open => !open)}><DotsThreeVertical size={16} weight="bold" aria-hidden="true" /><strong>{formatLabel("game", format.game)}</strong><span>{formatLabel("stack", format.stack)}</span></button>
            {settingsOpen && <button type="button" className="settings-backdrop" aria-label="閉じる" onClick={() => setSettingsOpen(false)} />}
            <div className="settings-body">
              <ul><li>{formatLabel("table", format.table)} · Open {formatLabel("openSize", format.openSize)}</li><li>レーキ {formatLabel("rake", format.rake)}</li></ul>
              <div className="display-mode-toggle" role="group" aria-label="表示モード">{displayModes.map(mode => <button type="button" key={mode.value} aria-pressed={displayMode === mode.value} onClick={() => changeDisplayMode(mode.value)}>{mode.label}</button>)}</div>
              <div className="settings-actions">
                {/* Non-default table conditions show as a dot on the settings button (full text in its tooltip), so the card keeps its size. */}
                <button type="button" className={`format-edit settings-icon-button${isDefaultProfile(tableProfile) ? "" : " has-table-profile"}`} aria-label={isDefaultProfile(tableProfile) ? "ゲーム設定を変更" : `ゲーム設定を変更（卓: ${describeProfile(tableProfile)}）`} title={isDefaultProfile(tableProfile) ? "ゲーム設定を変更" : `卓: ${describeProfile(tableProfile)}`} onClick={() => setFormatOpen(true)}><GearSix size={14} weight="fill" aria-hidden="true" /></button>
                <button type="button" className="path-reset settings-icon-button" aria-label="アクションをリセット" title="アクションをリセット" onClick={resetPath}><ArrowCounterClockwise size={14} aria-hidden="true" /></button>
              </div>
            </div>
          </RangeContextCard>}
          expanded
          blocks={combinedBlocks}
          selectedRangeBlock={selectedRangeBlock}
          {...actionState}
          onRewindActionBlock={rewindToActionBlock}
          onEnterPostflop={flopContext ? () => { setShowFlop(true); setFlopDialogOpen(postflopAllowed); setSelectedRangeBlock(null); } : null}
          onOpenFlopCards={() => setFlopDialogOpen(postflopAllowed)}
          onOpenLaterCard={street => setStreetCardDialog(postflopAllowed ? street : null)}
          onFlopAction={(block, action) => { setFlopActions(current => [...current.slice(0, block.flopIndex), action]); setSelectedRangeBlock(null); }}
          onLaterAction={(block, action) => {
            if (block.street === "turn") setTurnActions(current => [...current.slice(0, block.laterIndex), action]);
            else if (block.street === "river") setRiverActions(current => [...current.slice(0, block.laterIndex), action]);
            setSelectedRangeBlock(null);
          }}
          onShoveResponse={action => { setFocusedRange(null); setSelectedRangeBlock(null); setShoveResponse(action); }}
          onAct={actAt}
          onFourBet={selectFourBet}
          onAllIn={() => { setContinuationAction(null); setShoveResponse(null); setColdAction(null); setFocusedRange(null); setSelectedRangeBlock(null); setPendingRaise("all_in"); }}
          onStage3Action={selectStage3}
          onBoundedContinuation={(block, action) => {
            setStage3RootId(null); setStage3Actions([]);
            const next = chooseContinuationAction({ squeezeResponse, continuationActions }, block, action);
            setSqueezeResponse(next.squeezeResponse); setContinuationActions(next.continuationActions);
            setFocusedRange(null); setSelectedRangeBlock(null); setShowFlop(false); setFlopDialogOpen(false); setFlopActions([]);
          }}
          onSqueezeResponse={(role, action) => { setFocusedRange(null); setSelectedRangeBlock(null); setSqueezeResponse(current => role === "opener" ? [action] : [current[0], action]); }}
          onColdAction={action => { setFocusedRange(null); setSelectedRangeBlock(null); setContinuationAction(null); setContinuationActions([]); setStage3RootId(null); setStage3Actions([]); setSqueezeResponse([]); setColdAction(action); setShowFlop(false); setFlopDialogOpen(false); setFlopActions([]); }}
          onContinuationAction={action => { setPendingRaise(null); setFocusedRange(null); setShoveResponse(null); setSelectedRangeBlock(null); setContinuationAction(action); }}
        />
        </Panel>
        {flopActive ? <PostflopTrial context={flopContext} cards={flopCards} actions={flopActions} turnCard={turnCard} turnActions={turnActions} riverCard={riverCard} riverActions={riverActions} displayMode={displayMode} /> : currentError ? <StatusState tone="error">{currentError}</StatusState> : <>
        <div className={`results estimate-results participant-results${focusedEntry ? " comparison-focused" : ""}`} aria-label="参加中のレンジ" style={{ "--participant-count": displayedEntries.length }}>
          {displayedEntries.map(entry => entry.model ? <StrategyMatrix key={entry.position} node={{ actingPosition: entry.position }} title={entry.title} ariaLabel={`${entry.position}のレンジ`} aggregates={entry.model.aggregates} actions={entry.model.actions} actionLabels={entry.model.actionLabels} simplified={displayMode === "simple"} selected={selected} onSelect={value => { setSelected(value); setFocusedRange(entry.position); }} {...(entry.unreachableReason ? { unreachableReason: entry.unreachableReason } : {})} /> : <Panel key={entry.position} className="multiway-range-panel missing-range-panel" aria-label={`${entry.position}のレンジ`}><SectionHeading title={entry.title} /><StatusState title={entry.statusTitle || "レンジ未収録"}>{entry.statusDescription || "この履歴のレンジはまだ保存されていません。"}</StatusState>
            {entry.retryContinuation && <button type="button" onClick={entry.retryStage3 ? stage3Runtime.retry : continuationRuntime.retry}>{continuationCopy("retry")}</button>}
            {canGenerate && isComparison && entry.kind === "pending" && <InlineGenerationControl description="マルチウェイレンジを生成します。保存済みデータは変更しません。" status={localStatus} error={localError} onGenerate={generateLocalEstimate} />}
            {canGenerateFiveBet && entry.position === opener && <InlineGenerationControl description="この分岐のレンジを生成します。" status={localStatus} error={localError} onGenerate={generateLocalEstimate} />}
          </Panel>)}
          {focusedEntry && (focusedEntry.kind === "local" ? <LocalHandBreakdown entry={focusedEntry} selected={selected} displayMode={displayMode} onClose={() => setFocusedRange(null)} /> : <HandBreakdown hand={focusedEntry.hand} model={focusedEntry.model} isOpening={focusedEntry.kind === "opening"} isLimpResponse={focusedEntry.kind === "limp_response"} isThreeBet={focusedEntry.kind === "three_bet"} isFourBet={focusedEntry.kind === "four_bet"} isFiveBet={focusedEntry.kind === "five_bet"} extra={focusedEntry.kind === "bounded" ? continuationRangeBreakdown(focusedEntry.spot) : extendedBreakdown(focusedEntry.kind, focusedEntry.spot, focusedEntry.hand)} spot={focusedEntry.spot} position={focusedEntry.position} displayMode={displayMode} onReturnToComparison={() => setFocusedRange(null)} />)}
        </div>
      </>}
      {formatOpen && <GameFormatDialog format={format} tableProfile={tableProfile} onSave={saveFormat} onClose={() => setFormatOpen(false)} />}
      {flopActive && flopDialogOpen && <FlopCardDialog cards={flopCards} onClose={() => setFlopDialogOpen(false)} onApply={cards => { if (cards.join("") !== flopCards.join("")) { setFlopCards(cards); setFlopActions([]); setSelectedRangeBlock(null); } setFlopDialogOpen(false); }} />}
      {flopActive && streetCardDialog && <StreetCardDialog street={streetCardDialog}
        currentCard={streetCardDialog === "turn" ? turnCard : riverCard}
        usedCards={[...flopCards, ...(streetCardDialog === "river" ? [turnCard] : [])].filter(Boolean)}
        onClose={() => setStreetCardDialog(null)}
        onApply={card => {
          if (streetCardDialog === "turn") {
            if (card !== turnCard) setTurnActions([]);
            setTurnCard(card);
          }
          else if (streetCardDialog === "river") { if (card !== riverCard) setRiverActions([]); setRiverCard(card); }
          setSelectedRangeBlock(null); setStreetCardDialog(null);
        }} />}
    </main>
  </div>;
}

export function RangeWorkspace({ profile, onEditProfile, onSectionChange }) {
  return <EstimatedRanges profile={profile} onEditProfile={onEditProfile} onSectionChange={onSectionChange} />;
}
