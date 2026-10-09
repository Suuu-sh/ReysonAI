Warning: truncated output (original token count: 23765)
Total output lines: 1097

/// <reference lib="es2023.array" />
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import type { Profile } from "../profile.ts";
import type { MatrixModel } from "../data.ts";
import type { ResponseDataset, OpeningDataset, LimpDataset, LimpDeepDataset, ThreeBetDataset, OpeningSpot, ResponseSpot, ThreeBetSpot, FourBetSpot, FrequencyRow, OpeningHand } from "./preflop-types.ts";
import type { GameFormat } from "./game-formats.ts";
import type { TableProfile, TableAdjustments } from "./table-profile.ts";
import type { ActionBlock, ActionOption, RangeRef, RangeBuildState, RangeUrlSelection } from "./range-url.ts";
import type { ExtendedSpot } from "./extended-ranges.ts";
import type { StreetCardDialog as StreetCardDialogName } from "./street-card-dialog-state.ts";
import type { PreflopCallEvFacts } from "./PreflopCallEvBars.tsx";

type DisplayHand = FrequencyRow & Partial<{ reason: string; adjusted: "add" | "drop"; shift_bb: number; saved_open: number; open_size_bb: number | null; three_bet_size_bb: number | null; four_bet_size_bb: number | null; all_in_size_bb: number | null; squeeze_size_bb: number | null; equity_vs_shove_pct: number | null }>;
type DisplaySpot = { unreachable?: boolean; id: string; hands: DisplayHand[]; table_profile?: TableProfile; open_size_bb?: number; three_bet_size_bb?: number; four_bet_size_bb?: number | null; squeeze_size_bb?: number; limp_reraise_size_bb?: number; prior_action?: string | null; call_break_even_equity_pct?: number };
type RangeEntry = { loading?: boolean; retryContinuation?: boolean; retryStage3?: boolean; position: string; kind: string; title: string; spot?: DisplaySpot | null; model?: MatrixModel | null; hand?: DisplayHand; statusTitle?: string; statusDescription?: string; unreachableReason?: string | null; rangeBlockKey?: string; raiseToBb?: number; allInSizeBb?: number; fourBetSizeBb?: number | null; threeBetSizeBb?: number };
type LocalRange = { position: string; available_actions?: string[]; raise_to_bb?: number; rows: [string, number, number, number][] };
type LocalEstimate = { scenario?: string; ranges: LocalRange[] };
type LocalEstimateResponse = { error?: string; data?: LocalEstimate; pending?: boolean; cached?: boolean };
type InlineFact = { key?: string; label: string; unit?: string; value: number | null | undefined };
type WorkspaceActionBlock = Partial<Omit<ActionBlock, "key" | "kind">> & { key: string; kind: string; cards?: string[]; street?: string; potBb?: number; pending?: boolean; flopIndex?: number; laterIndex?: number };
type EstimatedRangesProps = WorkspaceProps & { initialRangeType?: string; fourBet?: ReturnType<typeof loadFourBetDataset>; mw3Client?: typeof mw3DeliveryClient };
type WorkspaceProps = { profile?: Profile | null; onEditProfile?: () => void; onSectionChange?: (section: string) => void };
type ActionPathProps = RangeBuildState & { leading?: ReactNode; expanded?: boolean; blocks?: WorkspaceActionBlock[]; selectedRangeBlock?: string | null; onSelectRangeBlock?: (key: string | null) => void; onRewindActionBlock?: ((block: WorkspaceActionBlock) => void) | null; onEnterPostflop?: (() => void) | null; onOpenFlopCards?: () => void; onOpenLaterCard?: (street: string) => void; onFlopAction?: (block: WorkspaceActionBlock, action: string) => void; onLaterAction?: (block: WorkspaceActionBlock, action: string) => void; onAct?: (position: string, action: string) => void; onContinuationAction?: (action: string) => void; onColdAction?: (value: RangeUrlSelection["coldAction"]) => void; onSqueezeResponse?: (role: string, action: string) => void; onBoundedContinuation?: (block: WorkspaceActionBlock, action: string) => void; onStage3Action?: (block: WorkspaceActionBlock, action: string) => void; onFourBet?: () => void; onAllIn?: () => void; onShoveResponse?: (action: string) => void };
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
import { RangeMatrixSkeleton, SkeletonText, Spinner } from "../components/Loading.tsx";
import { findFourBetSpot, fourBetMatrixModel, loadFourBetDataset } from "./four-bet-responses.ts";
import { findThreeBetSpot, threeBetMatrixModel, validateThreeBetDataset } from "./three-bet-responses.ts";
import { findOpeningSpot, openingMatrixModel, validateOpeningDataset } from "./opening-ranges.ts";
import { LIMP_FOUR_BET_RESPONSE_ID, findLimpDeepResponseSpot, limpFourBetMatrixModel, validateLimpDeepResponses } from "./limp-deep-responses.ts";
import { LIMP_RERAISE_RESPONSE_ID, findLimpResponseSpot, limpResponsesMatrixModel, validateLimpResponses } from "./limp-responses.ts";
import { extendedBreakdown, extendedModel, extendedUnreachableReason, findExtendedSpot, useExtendedDatasets } from "./extended-ranges.ts";
import { continuationCopy } from "./continuation-copy.ts";
import { chooseContinuationAction, continuationLiveSeats, continuationRootForSelection } from "./continuation-flow.ts";
import { continuationRangeBreakdown, continuationUnreachableCopy, useContinuationUiRuntime, withContinuationAvailability } from "./continuation-ranges.ts";
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
import { Mw3PostflopTrial, useMw3RangeSession } from "./Mw3PostflopTrial.tsx";
import { currentMw3PotBb } from "./mw3-range-state.ts";
import { mw3DeliveryClient } from "./mw3-browser.ts";
import { FlopCardDialog, PostflopTrial, StreetCardDialog, suitLabels } from "./PostflopTrial.tsx";
import { ProfilePolicyPreparing } from "./PostflopProfileSettings.tsx";
import { useAccount } from "../account/AuthPanel.tsx";
import { LearningGate, learningAllowed } from "../account/LearningAccess.tsx";
import { Cards, ChatText, Path } from "@phosphor-icons/react";
import { nextPendingStreetCardDialog } from "./street-card-dialog-state.ts";
import { buildActionBlocks, encodeRangeUrl, multiwayContext, readRangeUrl, replaceRangeUrl } from "./range-url.ts";
export { buildActionBlocks } from "./range-url.ts";
import { PreflopCallEvBars } from "./PreflopCallEvBars.tsx";
import { defaultOpponentSeat, normalizePostflopProfileState } from "./postflop-profile-state.ts";
import type { OpponentProfile, OpponentSeat, PostflopProfileState } from "./postflop-profile-state.ts";
import { buildFlopActionBlocks, buildLaterActionBlocks, completedFlopContext, currentPostflopPotBb, laterStart, recognizedFlop } from "./postflop-trial.ts";
import { defaultFormat, formatLabel, isBuilt } from "./game-formats.ts";
import { DEFAULT_PROFILE, adjustOpeningSpot, adjustmentReason, describeProfile, isDefaultProfile, markAdjustedModel, normalizeProfile } from "./table-profile.ts";
import "./ranges.css";

// Published preflop datasets (src/estimated/datasets.ts); preloaded before this module runs in the browser.
const source = publishedDataset("preflop-ranges");
const openingSource = publishedDataset("opening-ranges");
const limpSource = publishedDataset("limp-responses");
const limpDeepSource = publishedDataset("limp-deep-responses");
const threeBetSource = publishedDataset("three-bet-responses");
const tableAdjustments = publishedDataset<TableAdjustments>("table-profile-adjustments");

let dataset: ResponseDataset | undefined;
let dataError: string | undefined;
try { dataset = validateDataset(source); } catch (error) { dataError = (error as Error).message; }
let openingDataset: OpeningDataset | undefined;
let openingDataError: string | undefined;
try { openingDataset = validateOpeningDataset(openingSource); } catch (error) { openingDataError = (error as Error).message; }
let limpDataset: LimpDataset | undefined;
let limpDataError: string | undefined;
try {
  if (openingDataError) throw new Error(openingDataError);
  limpDataset = validateLimpResponses(limpSource, openingDataset!);
} catch (error) { limpDataError = (error as Error).message; }
let limpDeepDataset: LimpDeepDataset | null | undefined;
try { if (limpDataset!) limpDeepDataset = validateLimpDeepResponses(limpDeepSource, openingDataset!, limpDataset!); } catch { limpDeepDataset = null; }
let threeBetDataset: ThreeBetDataset | undefined;
let threeBetDataError: string | undefined;
try {
  if (dataError || openingDataError) throw new Error(dataError || openingDataError);
  threeBetDataset = validateThreeBetDataset(threeBetSource, dataset!, openingDataset!);
} catch (error) { threeBetDataError = (error as Error).message; }

// A missing dataset stays inside the explicit error boundary, like invalid JSON.
const fourBetRaw = (() => { try { return JSON.stringify(publishedDataset("four-bet-responses")); } catch { return undefined; } })();
const fourBetState = loadFourBetDataset(fourBetRaw, dataset!, threeBetDataset!, openingDataset!);

const selectionStorageKey = "reysonai:estimated-selection:v1";
const displayModeStorageKey = displayModeKey;
const formatStorageKey = "reysonai:game-format:v1";
const tableProfileStorageKey = "reysonai:table-profile:v1";
const openingModelFor = (spot: OpeningSpot) => markAdjustedModel(openingMatrixModel(spot), spot);
// Postflop labels end in "(33%)"; show that part right-aligned so the amounts line up.
function OptionLabel({ label }: { label: string }) {
  const match = /^(.*\S)\s+(\(\d+%\))$/.exec(label);
  return match ? <><span className="action-seat-main">{match[1]}</span><span className="action-seat-pct">{match[2]}</span></> : <>{label}</>;
}

export function selectedHandForRangeEntry(entry: RangeEntry, selected: string) {
  return entry.spot?.hands.find(row => row.hand === selected) ?? entry.hand;
}
const legacySelectionStorageKey = "reysonai-legacy:estimated-selection:v1";
function restoredSelection(initialRangeType: string): RangeUrlSelection & PostflopProfileState {
  const fallback = { rangeType: initialRangeType, opener: initialRangeType === "limp" ? "SB" : "BTN", hero: "BB", callers: [], foldedHero: false, pendingRaise: null, continuationAction: null, shoveResponse: null, limpAction: null, limpResponseAction: null, limpReraiseAction: null, limpFourBetAction: null, squeezeResponse: [], continuationActions: [], stage3RootId: null, stage3Actions: [], coldAction: null, selected: "AKo", ...normalizePostflopProfileState(null) };
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.sessionStorage.getItem(selectionStorageKey) ?? window.sessionStorage.getItem(legacySelectionStorageKey);
    const saved = JSON.parse(stored!);
    const limpSelection = saved?.rangeType === "limp";
    if (!saved || !rangeTypes.some(item => item.value === saved.rangeType && item.available) ||
        !positions.slice(0, -1).includes(saved.opener) || !positions.includes(saved.hero) ||
        (limpSelection ? saved.opener !== "SB" || !["BB", "SB"].includes(saved.hero) : positions.indexOf(saved.hero) <= positions.indexOf(saved.opener)) ||
        !Array.isArray(saved.callers) || saved.callers.some((position: string) => !positions.includes(position) || positions.indexOf(position) <= positions.indexOf(saved.opener)) ||
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
      saved.squeezeResponse.every((action: string) => squeezeActions.includes(action)) && !(saved.squeezeResponse[0] === "raise" && saved.squeezeResponse.length > 1) ? saved.squeezeResponse : [];
    const coldAction = saved.rangeType === "three_bet" && positions.indexOf(saved.coldAction?.position) > positions.indexOf(saved.hero)
      && ["call", "raise"].includes(saved.coldAction?.action) ? saved.coldAction : null;
    const continuationActions = Array.isArray(saved.continuationActions) && saved.continuationActions.length <= 24
      && saved.continuationActions.every((action: string) => ["fold", "call", "four_bet", "all_in"].includes(action)) ? saved.continuationActions : [];
    const stage3 = saved.stage3RootId ? normalizeStage3Selection(saved.stage3RootId, saved.stage3Actions) : null;
    return { ...fallback, ...saved, ...normalizePostflopProfileState(saved), coldAction, continuationActions, pendingRaise, continuationAction, shoveResponse, limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction, squeezeResponse, ...(stage3 ?? { stage3RootId: null, stage3Actions: [] }), selected: hands.includes(saved.selected) ? saved.selected : fallback.selected };
  } catch { return fallback; }
}

function HandHeader({ position, hand, comboCount, onClose }: { position: string; hand: string; comboCount: number; onClose?: () => void }) {
  return <div className="hand-header">
    <strong>{hand}</strong>
    <span>{position} · {comboCount} Combos</span>
    {onClose && <button type="button" className="hand-close" aria-label="詳細を閉じる" title="詳細を閉じる" onClick={onClose}>×</button>}
  </div>;
}

// EV-style facts are in bb with a sign; everything else is a percentage.
const formatFact = ({ value, unit }: InlineFact) => unit === "bb"
  ? `${value! > 0 ? "+" : ""}${Number(value).toFixed(2)}bb`
  : `${Number(value).toFixed(1)}%`;

export function AiReason({ hand, reasonState, inlineFacts, hideCallEv = false }: { hand: DisplayHand; reasonState: ReturnType<typeof useDetailedReasons>; inlineFacts?: InlineFact[] | null; hideCallEv?: boolean | null }) {
  const { data, loading, error } = reasonState;
  const detailed = data?.hands[hand.hand];
  const english = productLocale() !== "ja";
  const facts = detailed
    ? data!.fact_labels!.map(({ key, label, scope, unit }) => ({ key, label: english ? localizedFactLabel(key) ?? label : label, unit, value: scope === "spot" ? data!.spot_facts![key] as number | null : detailed.facts![key] }))
    : inlineFacts ?? [];
  const shown = facts.filter(fact => fact.value !== null && fact.value !== undefined && !(hideCallEv && fact.key === "call_ev_bb"));
  return <div className="ai-reason">
    <span>AIの考え方</span>
    {loading && !detailed ? <SkeletonText lines={3} label={english ? "Loading explanation…" : "説明を読み込み中…"} />
      : <p>{english ? (detailed ? localizedPreflopReason(hand, detailed, data) : error ? "Could not load the explanation." : "No hand-specific explanation is recorded for this spot.") : detailed?.reason ?? (error ? "理由を読み込めませんでした。" : hand.reason)}</p>}
    {shown.length > 0 && <dl className="reason-facts">
      {shown.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd className={fact.unit === "bb" ? (fact.value! >= 0 ? "fact-positive" : "fact-negative") : undefined}>{formatFact(fact)}</dd></div>)}
    </dl>}
    {detailed && <small className="reason-note">{english ? localizedEquityNote() : data!.equity_note}</small>}
  </div>;
}

function endResultLabel(result: string) {
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

function HandBreakdown({ hand, model, isOpening, isLimpResponse, isThreeBet, isFourBet, isFiveBet, isContinuation, extra = null, spot, position, onReturnToComparison, displayMode }: { hand: DisplayHand; model: MatrixModel; isOpening?: boolean; isLimpResponse?: boolean; isThreeBet?: boolean; isFourBet?: boolean; isFiveBet?: boolean; isContinuation?: boolean; extra?: ReturnType<typeof extendedBreakdown>; spot: DisplaySpot; position: string; onReturnToComparison?: () => void; displayMode: string }) {
  const reasonState = useDetailedReasons(spot?.id);
  const equityFact = reasonState.data?.fact_labels!.find(fact => fact.key === "equity_pct" || fact.key.startsWith("equity_vs_") && fact.key.endsWith("_pct"));
  const savedFacts = reasonState.data?.hands[hand.hand]?.facts;
  const callEvFacts = savedFacts && equityFact ? { eqr: savedFacts.eqr, equityPct: savedFacts[equityFact.key], callEvBb: savedFacts.call_ev_bb } : null;
  const hasCallEv = callEvFacts && Object.values(callEvFacts).every(Number.isFinite);
  const tableReason = adjustmentReason(hand, spot?.table_profile);
  const aggregate = model.aggregates.get(hand.hand)!;
  const actionItems = model.actions.map(action => ({ action, frequency: aggregate.actions[action] }));
  const inlineFacts = isFiveBet ? [
    { label: "勝率（対オールインレンジ）", value: hand.equity_vs_shove_pct },
    { label: "コールに必要な勝率", value: spot.call_break_even_equity_pct },
  ] : null;

  return <div className={`detail-column${onReturnToComparison ? " comparison-focus-details" : ""}`}>
    <Panel>
      <HandHeader position={position} hand={hand.hand} comboCount={aggregate.comboCount} onClose={onReturnToComparison} />
      {aggregate.unreachable ? <StatusState title="対象外（到達不能）">{isContinuation ? continuationUnreachableCopy().description : extra?.unreachableText ?? (isLimpResponse ? "SBのリンプ頻度が0%のため、この応答経路の推奨頻度はありません。保存上のfold=100は形式上の値です。" : `${isFiveBet ? "既存4bet" : "既存3bet"}頻度が0%のため、この経路の推奨頻度はありません。保存上のfold=100は形式上の値です。`)}</StatusState> : <>
      {tableReason && <p className="adjustment-reason">{tableReason}</p>}
      {displayMode !== "standard" && !tableReason && !isLimpResponse && <AiReason hand={hand} reasonState={reasonState} inlineFacts={inlineFacts} />}
      {displayMode !== "standard" && isLimpResponse && <div className="ai-reason"><span>AIの考え方</span><p>この局面のハンド別説明はありません。</p></div>}
      {displayMode === "standard" && <>
      {isFourBet && <small>オールイン = 5bet（合計100BB）</small>}
      {hasCallEv && !tableReason
        ? <PreflopCallEvBars items={actionItems} labels={model.actionLabels} facts={callEvFacts as PreflopCallEvFacts} equityLabel={equityFact!.label} />
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
        ...(isFourBet ? [{ label: "受ける4bet（合計）", value: `${spot!.four_bet_size_bb} BB` }, { label: "元の3bet（合計）", value: `${spot!.three_bet_size_bb} BB` }] : []),
        ...(isThreeBet ? [{ label: "受ける3bet（合計）", value: `${spot!.three_bet_size_bb} BB` }] : []),
        ...(isFiveBet ? [{ label: "自分の4bet（合計）", value: `${spot!.four_bet_size_bb} BB` }, { label: "相手の元の3bet（合計）", value: `${spot!.three_bet_size_bb} BB` }] : []),
       ].filter(Boolean) as { label: string; value: string }[]} />}
      </>}
      </>}
      {aggregate.unreachable && !isLimpResponse && <AiReason hand={hand} reasonState={reasonState} inlineFacts={inlineFacts} />}
    </Panel>
  </div>;
}

function LocalHandBreakdown({ entry, selected, onClose, displayMode }: { entry: RangeEntry; selected: string; onClose: () => void; displayMode: string }) {
  const aggregate = entry.model!.aggregates.get(selected)!;
  return <div className="detail-column comparison-focus-details"><Panel>
    <HandHeader position={entry.position} hand={selected} comboCount={aggregate.comboCount} onClose={onClose} />
    {displayMode === "standard" && <><ActionBars items={entry.model!.actions.map(action => ({ action, frequency: aggregate.actions[action] }))} labels={entry.model!.actionLabels} />
    <StatList items={entry.allInSizeBb ? [
      { label: "受ける5betオールイン（合計）", value: `${entry.allInSizeBb} BB` },
      { label: "直前の4bet（合計）", value: `${entry.fourBetSizeBb} BB` },
      { label: "直前の3bet（合計）", value: `${entry.threeBetSizeBb} BB` },
    ] : [{ label: "レイズ先（合計）", value: `${entry.raiseToBb} BB` }]} /></>}
  </Panel></div>;
}

function InlineGenerationControl({ description, status, error, onGenerate }: { description: string; status: string; error: string; onGenerate: () => void }) {
  const label = status === "checking" ? "保存状態を確認中…"
    : status === "loading" ? "Codexで生成中…"
    :…11765 tokens truncated…ion: caller, priorAction: openerAction })));
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
        const { caller } = multiwayContext(opener, callers, position)!;
        rangeEntries.push(extendedEntry({ kind: "multiway", position, caller }, extendedTitle({ kind: "multiway", position })));
      } else if (actionBlocks.find(block => block.position === position)?.rangeRef?.kind === "saved-source") {
        const block = actionBlocks.find(block => block.position === position);
        rangeEntries.push(continuationEntry(block!.rangeRef!, Boolean(block!.chosen)));
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
      else if (fiveBet.loading) rangeEntries.push({ position: opener, kind: "pending", loading: true, title: `${opener} · 5betオールインへの応答`, statusTitle: "読み込み中", statusDescription: "保存済みレンジを読み込んでいます。" });
      else rangeEntries.push(allInRange
        ? { position: opener, kind: "local", model: localMatrix(allInRange), title: `${opener} · 5betオールインへの応答`, allInSizeBb: 100, fourBetSizeBb: spot!.four_bet_size_bb, threeBetSizeBb: spot!.three_bet_size_bb }
        : { position: opener, kind: "pending", title: `${opener} · 5betオールインへの応答`, statusTitle: "レンジ未収録", statusDescription: "5betオールイン後の応答データはまだ保存されていません。" });
      addSaved(hero, "four_bet", spot, model, `${hero} · 4betへの応答（5bet選択）`);
    } else {
      addSaved(opener, "three_bet", threeBetSpot, threeBetModel, `${opener} · 3betへの応答（4bet前）`);
      if (continuationAction !== "fold") addSaved(hero, "four_bet", spot, model, `${hero} · 4betへの応答`);
    }
  }
  // The last raiser's table goes on the left.
  const aggressor = isLimp && limpAction === "raise" ? "BB" : isThreeBet || pendingRaise ? hero : opener;
  rangeEntries.sort((a, b) => ((b.position === aggressor) as unknown as number) - ((a.position === aggressor) as unknown as number));
  const actionRangeEntry = (block: ActionBlock | undefined, role: string): RangeEntry | null => {
    const ref = block?.rangeRef;
    if (!ref) return null;
    const labelContext = role === "previous" ? "前のポジション・履歴" : "選択位置";
    const withContext = (entry: RangeEntry | null) => entry && ({ ...entry, hand: selectedHandForRangeEntry(entry, selected), title: `${entry.title}（${labelContext}）`, rangeBlockKey: block.key });
    const missing = (title: string, description = ref.reason || "この履歴のレンジはまだ保存されていません。", statusTitle = "レンジ未収録") => ({
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
      return savedSpot ? withContext({ position: ref.position, kind: "limp_four_bet", spot: savedSpot, model: limpFourBetMatrixModel(savedSpot, limpDataset!), title: "SB · BBの4betへの応答" }) : missing("BBの4betへの応答");
    }
    if (ref.kind === "limp_reraise") {
      const savedSpot = limpDataset ? findLimpResponseSpot(limpDataset!, LIMP_RERAISE_RESPONSE_ID) : null;
      return savedSpot ? withContext({ position: ref.position, kind: "limp_reraise", spot: savedSpot, model: limpResponsesMatrixModel(savedSpot, openingDataset!, limpDataset!), title: "BB · リンプ・リレイズへの応答" }) : missing("リンプ・リレイズへの応答");
    }
    if (ref.kind === "limp_bb" || ref.kind === "limp_sb") {
      const id = ref.kind === "limp_bb" ? "BB_vs_SB_limp" : "SB_vs_BB_iso";
      const savedSpot = limpDataset ? findLimpResponseSpot(limpDataset!, id) : null;
      const savedModel = savedSpot ? limpResponsesMatrixModel(savedSpot, openingDataset!) : null;
      const title = ref.kind === "limp_bb" ? "BB · SBリンプへの応答" : "SB · アイソレイズへの応答";
      return savedSpot ? withContext({ position: ref.position, kind: "limp_response", spot: savedSpot, model: savedModel, title }) : missing(title);
    }
    if (ref.kind === "response") {
      const savedSpot = dataset ? findSpot(dataset!, opener, ref.position) : null;
      return savedSpot ? withContext({ position: ref.position, kind: "response", spot: savedSpot, model: matrixModel(savedSpot), title: `${ref.position} · オープンへの応答` }) : missing("オープンへの応答");
    }
    if (ref.kind === "three_bet") {
      const savedSpot = threeBetDataset ? findThreeBetSpot(threeBetDataset!, opener, ref.opponent!) : null;
      return savedSpot ? withContext({ position: ref.position, kind: "three_bet", spot: savedSpot, model: threeBetMatrixModel(savedSpot), title: `${ref.position} · 3betへの応答` }) : missing("3betへの応答");
    }
    if (ref.kind === "four_bet") {
      const savedSpot = fourBet.data ? findFourBetSpot(fourBet.data, opener, ref.position) : null;
      return savedSpot ? withContext({ position: ref.position, kind: "four_bet", spot: savedSpot, model: fourBetMatrixModel(savedSpot, (dataset ? findSpot(dataset!, opener, ref.position) : null)!), title: `${ref.position} · 4betへの応答` }) : missing("4betへの応答");
    }
    if (ref.kind === "five_bet") {
      if (fiveBet.spot) return withContext({ position: ref.position, kind: "five_bet", spot: fiveBet.spot, model: fiveBetMatrixModel(fiveBet.spot), title: `${ref.position} · 5betオールインへの応答` });
      if (fiveBet.loading) return { ...missing("5betオールインへの応答", "保存済みレンジを読み込んでいます。", "読み込み中"), loading: true };
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
      if (block) rangeEntries.push(continuationEntry(block!.rangeRef as RangeRef, Boolean(block!.chosen)));
    }
    const cursor = actionBlocks.at(-1)!;
    const history = cursor.stage3Terminal?.history ?? cursor.stage3Node?.history ?? cursor.continuationTerminal?.history ?? cursor.continuationNode?.history ?? [];
    const raiser = history.findLast(item => ["open", "three_bet", "squeeze", "four_bet", "all_in"].includes(item.action))?.seat;
    rangeEntries.sort((a, b) => Number(b.position === raiser) - Number(a.position === raiser));
  }
  const selectedBlockIndex = actionBlocks.findIndex(block => block.key === selectedRangeBlock);
  const selectedActionEntries = selectedBlockIndex < 0 ? null : [
    ...(isOpening ? [] : [actionRangeEntry(actionBlocks[selectedBlockIndex - 1], "previous")]),
    actionRangeEntry(actionBlocks[selectedBlockIndex], "selected"),
  ].filter((entry): entry is RangeEntry => Boolean(entry && (!liveContinuationSeats || liveContinuationSeats.includes(entry.position))));
  // Keep the focused action pair first, but never hide other active participants' ranges.
  const visibleRangeEntries = prioritizeActingBBRange(
    prioritizeParticipantRanges(rangeEntries, selectedActionEntries),
    actionBlocks.find(block => block.active)?.position,
  );
  const focusedEntry = visibleRangeEntries.find(entry => entry.position === focusedRange && entry.model);
  const displayedEntries = focusedEntry ? [focusedEntry] : visibleRangeEntries;

  // Guests who reach the flop see only the sign-in card, centred on one screen (no action strip).
  // Opponent assumptions change every later policy, so any change restarts from the flop decision.
  const applyOpponent = (profile: OpponentProfile | undefined, seat: OpponentSeat | undefined, cards: string[]) => {
    const profileChanged = !!profile && profile !== opponentProfile; if (profileChanged) setOpponentProfile(profile);
    const seatChanged = !!seat && seat !== effectiveOpponentSeat; if (seatChanged) setOpponentSeat(seat);
    if (profileChanged || seatChanged) { setFlopCards(cards); setFlopActions([]); setSelectedRangeBlock(null); }
    return profileChanged || seatChanged;
  };
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
            boards={combinedBlocks.filter(block => block.kind === "board") as { key: string; street?: "flop" | "turn" | "river"; cards: string[] }[]}
            currentPotBb={currentBoardPotBb}
            onEditBoard={street => street === "flop" ? setFlopDialogOpen(postflopAllowed) : setStreetCardDialog(postflopAllowed ? street as StreetCardDialogName : null)}
            onReset={resetPath}>
            <div className="settings-header">
              <button type="button" className="settings-toggle" aria-label="ゲーム設定を開閉" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(open => !open)}><DotsThreeVertical size={16} weight="bold" aria-hidden="true" /><strong>{formatLabel("game", format.game)}</strong><span>{formatLabel("stack", format.stack)}</span></button>
              <div className="settings-actions">
                {/* Keep non-default table conditions visible as a dot and in the control tooltip. */}
                <button type="button" className={`format-edit settings-icon-button${isDefaultProfile(tableProfile) ? "" : " has-table-profile"}`} aria-label={isDefaultProfile(tableProfile) ? "ゲーム設定を変更" : `ゲーム設定を変更（卓: ${describeProfile(tableProfile)}）`} title={isDefaultProfile(tableProfile) ? "ゲーム設定を変更" : `卓: ${describeProfile(tableProfile)}`} onClick={() => setFormatOpen(true)}><GearSix size={14} weight="fill" aria-hidden="true" /></button>
                <button type="button" className="path-reset settings-icon-button" aria-label="アクションをリセット" title="アクションをリセット" onClick={resetPath}><ArrowCounterClockwise size={14} aria-hidden="true" /></button>
              </div>
            </div>
            {settingsOpen && <button type="button" className="settings-backdrop" aria-label="閉じる" onClick={() => setSettingsOpen(false)} />}
            <div className="settings-body">
              <ul><li>{formatLabel("table", format.table)} · Open {formatLabel("openSize", format.openSize)}</li><li>レーキ {formatLabel("rake", format.rake)}</li></ul>
              <div className="display-mode-toggle" role="group" aria-label="表示モード">{displayModes.map(mode => <button type="button" key={mode.value} aria-pressed={displayMode === mode.value} onClick={() => changeDisplayMode(mode.value)}>{mode.label}</button>)}</div>
            </div>
          </RangeContextCard>}
          expanded
          blocks={combinedBlocks}
          selectedRangeBlock={selectedRangeBlock}
          {...actionState}
          onRewindActionBlock={rewindToActionBlock}
          onEnterPostflop={flopContext ? () => { setShowFlop(true); setFlopDialogOpen(postflopAllowed); setSelectedRangeBlock(null); } : null}
          onOpenFlopCards={() => setFlopDialogOpen(postflopAllowed)}
          onOpenLaterCard={street => setStreetCardDialog(postflopAllowed ? street as StreetCardDialogName : null)}
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
            setFocusedRange(null); setSelectedRangeBlock(null); setShowFlop(false); setFlopDialogOpen(false); setStreetCardDialog(null); setFlopActions([]); setTurnActions([]); setRiverActions([]);
          }}
          onSqueezeResponse={(role, action) => { setFocusedRange(null); setSelectedRangeBlock(null); setSqueezeResponse(current => role === "opener" ? [action] : [current[0], action]); }}
          onColdAction={action => { setFocusedRange(null); setSelectedRangeBlock(null); setContinuationAction(null); setContinuationActions([]); setStage3RootId(null); setStage3Actions([]); setSqueezeResponse([]); setColdAction(action); setShowFlop(false); setFlopDialogOpen(false); setFlopActions([]); }}
          onContinuationAction={action => { setPendingRaise(null); setFocusedRange(null); setShoveResponse(null); setSelectedRangeBlock(null); setContinuationAction(action); }}
        />
        </Panel>
        {flopActive ? (mw3ProfilePreparing ? <ProfilePolicyPreparing onRestoreStandard={() => setOpponentProfile("standard")} /> : flopContext!.kind === "mw3_srp" || flopContext!.kind === "multiway_unavailable" ? <Mw3PostflopTrial context={flopContext!} session={mw3Session} cards={flopCards} displayMode={displayMode} /> : <PostflopTrial context={flopContext!} tableProfile={tableProfile} opponentProfile={opponentProfile} opponentSeat={effectiveOpponentSeat} onOpponentProfileChange={setOpponentProfile} cards={flopCards} actions={flopActions} turnCard={turnCard} turnActions={turnActions} riverCard={riverCard} riverActions={riverActions} displayMode={displayMode} />) : currentError ? <StatusState tone="error">{currentError}</StatusState> : <>
        <div className={`results estimate-results participant-results${focusedEntry ? " comparison-focused" : ""}`} aria-label="参加中のレンジ" style={{ "--participant-count": displayedEntries.length } as CSSProperties}>
          {displayedEntries.map(entry => entry.model ? <StrategyMatrix key={entry.position} node={{ actingPosition: entry.position }} title={entry.title} ariaLabel={`${entry.position}のレンジ`} aggregates={entry.model.aggregates} actions={entry.model.actions} actionLabels={entry.model.actionLabels} simplified={displayMode === "simple"} selected={selected} onSelect={value => { setSelected(value); setFocusedRange(entry.position); }} {...(entry.unreachableReason ? { unreachableReason: entry.unreachableReason } : {})} /> : entry.loading ? <RangeMatrixSkeleton key={entry.position} className="multiway-range-panel missing-range-panel" ariaLabel={`${entry.position}のレンジ`} title={entry.title} label={entry.statusDescription ?? ""} /> : <Panel key={entry.position} className="multiway-range-panel missing-range-panel" aria-label={`${entry.position}のレンジ`}><SectionHeading title={entry.title} /><StatusState title={entry.statusTitle || "レンジ未収録"}>{entry.statusDescription || "この履歴のレンジはまだ保存されていません。"}</StatusState>
            {entry.retryContinuation && <button type="button" onClick={entry.retryStage3 ? stage3Runtime.retry : continuationRuntime.retry}>{continuationCopy("retry")}</button>}
            {canGenerate && isComparison && entry.kind === "pending" && <InlineGenerationControl description="マルチウェイレンジを生成します。保存済みデータは変更しません。" status={localStatus} error={localError} onGenerate={generateLocalEstimate} />}
            {canGenerateFiveBet && entry.position === opener && <InlineGenerationControl description="この分岐のレンジを生成します。" status={localStatus} error={localError} onGenerate={generateLocalEstimate} />}
          </Panel>)}
          {focusedEntry && (focusedEntry.kind === "local" ? <LocalHandBreakdown entry={focusedEntry} selected={selected} displayMode={displayMode} onClose={() => setFocusedRange(null)} /> : <HandBreakdown hand={focusedEntry.hand!} model={focusedEntry.model!} isOpening={focusedEntry.kind === "opening"} isLimpResponse={focusedEntry.kind === "limp_response"} isThreeBet={focusedEntry.kind === "three_bet"} isFourBet={focusedEntry.kind === "four_bet"} isFiveBet={focusedEntry.kind === "five_bet"} isContinuation={focusedEntry.kind === "bounded"} extra={focusedEntry.kind === "bounded" ? continuationRangeBreakdown(focusedEntry.spot!) : extendedBreakdown(focusedEntry.kind, focusedEntry.spot!, focusedEntry.hand!)} spot={focusedEntry.spot!} position={focusedEntry.position} displayMode={displayMode} onReturnToComparison={() => setFocusedRange(null)} />)}
        </div>
      </>}
      {formatOpen && <GameFormatDialog format={format} tableProfile={tableProfile} onSave={saveFormat} onClose={() => setFormatOpen(false)} />}
      {flopActive && flopDialogOpen && <FlopCardDialog cards={flopCards} profile={opponentProfile} seat={flopContext!.kind === "mw3_srp" || flopContext!.kind === "multiway_unavailable" ? undefined : effectiveOpponentSeat}
        positions={{ ip: flopContext!.ip ?? null, oop: flopContext!.oop ?? null }} onClose={() => setFlopDialogOpen(false)}
        onApply={(cards, seat, profile) => {
          if (applyOpponent(profile, seat, cards) || cards.join("") !== flopCards.join("")) { setFlopCards(cards); setFlopActions([]); setSelectedRangeBlock(null); } setFlopDialogOpen(false); }} />}
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

export function RangeWorkspace({ profile, onEditProfile, onSectionChange }: WorkspaceProps) {
  return <EstimatedRanges profile={profile} onEditProfile={onEditProfile} onSectionChange={onSectionChange} />;
}
