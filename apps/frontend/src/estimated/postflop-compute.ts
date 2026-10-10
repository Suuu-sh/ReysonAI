import type { Candidate, InputOptions, Inputs, LaterPolicy, PostflopDatasets, StrategyNodes } from "../../scripts/postflop-ai/types.ts";
import type { CandidateSource } from "../../scripts/postflop-ai/candidate-source.ts";
import type { BalancedFlopBase } from "../../scripts/postflop-ai/flop-base-core.ts";
import type { PlayerRole, BettingStep } from "../../scripts/postflop-ai/tree.ts";
import type { LaterStreet } from "../../scripts/postflop-ai/later-tree.ts";
export type ComboInput = { cards: string; weight: number };
type ComputeSource = InputOptions & { spotId: string; datasets: PostflopDatasets; flopCandidate: CandidateSource; laterCandidate?: CandidateSource<LaterPolicy> | null; flopBase?: BalancedFlopBase | null };
type BoardRequest = ComputeSource & { board: string; history?: string[] | null };
type ExplainRequest = BoardRequest & { node: string; cards?: string; combos?: ComboInput[]; prev?: string };
type LaterRequest = ComputeSource & { flop: string; flopActions?: string; turn?: string; turnActions?: string; river?: string; riverActions?: string };
type LaterExplainRequest = LaterRequest & { cards?: string; combos?: ComboInput[] };
import { buildInputs } from "../../scripts/postflop-ai/browser-inputs.ts";
import { resolveFlopCandidate, resolveLaterCandidate } from "../../scripts/postflop-ai/candidate-source.ts";
import { flopBetTable, flopUiFacts } from "../../scripts/postflop-ai/flop-ui-facts.ts";
import { explainLaterCombo, explainLaterCombos, laterExplainContext } from "../../scripts/postflop-ai/explain-later.ts";
import { flopRangeFacts, laterRangeFacts } from "../../scripts/postflop-ai/range-facts.ts";
import { boardTexture, parseCards, parseFlopBoard, runoutTexture } from "../../scripts/postflop-ai/model.ts";
import { FLOP_BETS, flopState } from "../../scripts/postflop-ai/tree.ts";
import { laterDecision, laterStart, replayLater } from "./postflop-trial.ts";
import { flopNodes, laterMixRows } from "../../scripts/postflop-ai/views.ts";
import { canonicalFlop } from "../../scripts/postflop-ai/flop-isomorphism.ts";
import { isFreshFlopBase, storedFlopNodes, storedFlopExplanation } from "../../scripts/postflop-ai/flop-base-core.ts";

function policyForLater(inputs: Inputs, candidate: CandidateSource, laterCandidate?: CandidateSource<LaterPolicy> | null) {
  const flop = resolveFlopCandidate(inputs, candidate);
  const later = resolveLaterCandidate(inputs, laterCandidate, flop);
  return { flopPolicy: flop.policy, laterPolicy: later.policy };
}

const adjustment = (inputs: Inputs) => inputs.adjusted ? { adjusted: inputs.adjusted, structure_hash: inputs.structure_hash } : {};

export function computeBoard({ spotId, board, history = null, datasets, flopCandidate, laterCandidate, flopBase, tableProfile, opponentProfile, opponentSeat }: BoardRequest) {
  const inputs = buildInputs(spotId, datasets, { tableProfile, opponentProfile, opponentSeat });
  const selected = parseFlopBoard(board);
  const candidate = resolveFlopCandidate(inputs, flopCandidate), policy = candidate.policy;
  const { spot } = inputs;
  let nodes: StrategyNodes | null = null;
  if (!inputs.adjusted && isFreshFlopBase(flopBase, inputs, candidate, laterCandidate as Candidate<LaterPolicy> | null | undefined)) {
    try { nodes = storedFlopNodes(flopBase!, inputs, selected.cards, history); } catch { /* malformed optional cache: use the shared computation */ }
  }
  nodes ??= flopNodes(inputs, policy, selected.cards, history);
  return { kind: "ai_estimate_not_gto", spot: spot.id, tree: spot.tree, ip: spot.ip, oop: spot.oop,
    pot_bb: spot.potBb, stack_bb: spot.stackBb, board: selected.id, split: selected.split,
    texture: boardTexture(selected.cards), source_hash: inputs.fingerprint,
    policy_hash: candidate.metadata.policy_hash, nodes, ...adjustment(inputs) };
}

export function computeExplain({ spotId, board, node, cards, combos, prev, history, datasets, flopCandidate, laterCandidate, flopBase, tableProfile, opponentProfile, opponentSeat }: ExplainRequest) {
  const inputs = buildInputs(spotId, datasets, { tableProfile, opponentProfile, opponentSeat });
  const selected = parseFlopBoard(board);
  const previous = (FLOP_BETS as readonly (string | undefined)[]).includes(prev) ? prev! : FLOP_BETS[0];
  const candidate = resolveFlopCandidate(inputs, flopCandidate), policy = candidate.policy;
  const options = { boardCards: selected.cards, node, prev: previous, history, inputs, policy, cards, combos };
  let explanation;
  if (combos !== undefined) {
    if (!Array.isArray(combos) || !combos.length || combos.some(item => typeof item?.cards !== "string" ||
        !/^([2-9TJQKA][cdhs]){2}$/.test(item.cards) || !Number.isFinite(item.weight) || item.weight <= 0)) {
      throw new Error("ハンドクラスのコンボ形式が正しくありません。");
    }
  } else {
    if (typeof cards !== "string" || !/^([2-9TJQKA][cdhs]){2}$/.test(cards)) throw new Error("カードの形式が正しくありません。");
  }
  if (!inputs.adjusted && isFreshFlopBase(flopBase, inputs, candidate, laterCandidate as Candidate<LaterPolicy> | null | undefined)) {
    try { explanation = storedFlopExplanation(flopBase!, options); } catch { /* optional base must never prevent fallback */ }
  }
  explanation ??= flopUiFacts(options);
  // Called-range equity is not in the stored base; compute it from the same contexts (never stored).
  explanation = { ...explanation, ...flopBetTable(options) };
  return { spot: inputs.spot.id, board: selected.id,
    ...explanation, ...adjustment(inputs) };
}

function singleCard(value: unknown, label: string, used: Set<number>) {
  if (!value) return null;
  if (typeof value !== "string" || !/^[2-9TJQKA][cdhs]$/.test(value)) throw new Error(`${label}の形式が正しくありません。`);
  const card = parseCards(value, 1)[0];
  if (used.has(card)) throw new Error("盤面カードが重複しています。");
  used.add(card);
  return card;
}

function parseActions(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (typeof value !== "string") throw new Error("アクション履歴の形式が正しくありません。");
  return value.split(",");
}

export function computeLaterView({ spotId, flop, flopActions = "", turn = "", turnActions = "", river = "", riverActions = "",
  datasets, flopCandidate, laterCandidate, tableProfile, opponentProfile, opponentSeat }: LaterRequest) {
  const inputs = buildInputs(spotId, datasets, { tableProfile, opponentProfile, opponentSeat });
  const { flopPolicy, laterPolicy } = policyForLater(inputs, flopCandidate, laterCandidate);
  const flopBoard = parseFlopBoard(flop);
  const used = new Set(flopBoard.cards);
  const turnCard = singleCard(turn, "ターン", used);
  const riverCard = singleCard(river, "リバー", used);
  const flopPath = parseActions(flopActions);
  const turnPath = parseActions(turnActions);
  const riverPath = parseActions(riverActions);
  const start = laterStart(flopPath, inputs.spot);
  if (!start) throw new Error("フロップのアクションが後続ストリートへ進める状態ではありません。");
  if (turnCard === null) throw new Error("ターンカードを選択してください。");

  const turnBoard = [...flopBoard.cards, turnCard];
  const turnReplay = replayLater("turn", turnPath, start, inputs.spot);
  let street: LaterStreet = "turn", currentBoard = turnBoard;
  let riverBoard: number[] | null = null, turnSteps = turnReplay.state.steps, riverSteps: BettingStep[] | null = null, riverPreviousAggressor: PlayerRole | null = null;
  let decision = laterDecision("turn", turnPath, start, inputs.spot);
  if (!decision.node) {
    if ((["fold", "raise-fold"] as readonly (string | undefined)[]).includes(turnReplay.end?.type) || turnReplay.stacks.ip <= 0 || turnReplay.stacks.oop <= 0) {
      throw new Error("このアクションではショーダウンまで進んでおり、次の判断はありません。");
    }
    if (riverCard === null) throw new Error("リバーカードを選択してください。");
    street = "river";
    const riverStart = { pot: turnReplay.pot, stacks: turnReplay.stacks, lastAggressor: turnReplay.lastAggressor };
    currentBoard = [...turnBoard, riverCard];
    riverBoard = currentBoard;
    riverPreviousAggressor = turnReplay.lastAggressor;
    const riverReplay = replayLater("river", riverPath, riverStart, inputs.spot);
    riverSteps = riverReplay.state.steps;
    decision = laterDecision("river", riverPath, riverStart, inputs.spot);
    if (!decision.node) throw new Error("リバーの判断は終了しています。");
  }
  const flopSteps = flopState(inputs.spot.tree, flopPath).steps;
  const role = decision.role!;
  const actor = inputs.spot[role];
  const rows = laterMixRows({ actor, role, board: currentBoard, node: decision.node!, line: decision.line!,
    inputs, flopPolicy, laterPolicy, flopSteps, turnSteps, riverSteps, turnBoard, riverBoard,
    turnPreviousAggressor: start.lastAggressor, riverPreviousAggressor,
    paths: { flop: flopPath, turn: turnPath, river: riverPath } });
  return { kind: "ai_estimate_not_gto", street, node: decision.node, actor, line: decision.line,
    texture: runoutTexture(currentBoard), pot_bb: decision.potBb, rows, ...adjustment(inputs) };
}

export function computeLaterExplain({ spotId, flop, flopActions = "", turn, turnActions = "", river = "", riverActions = "",
  cards, combos, datasets, flopCandidate, laterCandidate, tableProfile, opponentProfile, opponentSeat }: LaterExplainRequest) {
  const inputs = buildInputs(spotId, datasets, { tableProfile, opponentProfile, opponentSeat });
  const { flopPolicy, laterPolicy } = policyForLater(inputs, flopCandidate, laterCandidate);
  const options = { flop, flopActions, turn, turnActions, river, riverActions,
    inputs, flopPolicy, laterPolicy };
  let explanation;
  if (combos !== undefined) {
    if (!Array.isArray(combos) || !combos.length || combos.some(item => typeof item?.cards !== "string" ||
        !/^([2-9TJQKA][cdhs]){2}$/.test(item.cards) || !Number.isFinite(item.weight) || item.weight <= 0)) {
      throw new Error("ハンドクラスのコンボ形式が正しくありません。");
    }
    explanation = explainLaterCombos({ ...options, combos });
  } else {
    if (typeof cards !== "string" || !/^([2-9TJQKA][cdhs]){2}$/.test(cards)) throw new Error("カードの形式が正しくありません。");
    explanation = explainLaterCombo({ ...options, cards });
  }
  return { spot: inputs.spot.id, ...explanation, ...adjustment(inputs) };
}

// Range-level facts (tier shares of both ranges, bet-size composition, SPR, runout shift) for the advanced
// explanations. Hero independent and never stored, so it stays out of computeExplain's stored/parity payload.
export function computeRangeFacts({ spotId, board, node, prev, history, datasets, flopCandidate, tableProfile, opponentProfile, opponentSeat }: ExplainRequest) {
  const inputs = buildInputs(spotId, datasets, { tableProfile, opponentProfile, opponentSeat });
  const policy = resolveFlopCandidate(inputs, flopCandidate).policy;
  const facts = flopRangeFacts({ inputs, policy, boardCards: parseFlopBoard(board).cards, node,
    prev: (FLOP_BETS as readonly (string | undefined)[]).includes(prev) ? prev! : FLOP_BETS[0], history });
  return facts ? { ...facts, ...adjustment(inputs) } : null;
}

export function computeLaterRangeFacts({ spotId, flop, flopActions = "", turn, turnActions = "", river = "", riverActions = "",
  datasets, flopCandidate, laterCandidate, tableProfile, opponentProfile, opponentSeat }: LaterRequest) {
  try {
    const inputs = buildInputs(spotId, datasets, { tableProfile, opponentProfile, opponentSeat });
    const { flopPolicy, laterPolicy } = policyForLater(inputs, flopCandidate, laterCandidate);
    const facts = laterRangeFacts({ inputs, flopPolicy, laterPolicy,
      context: laterExplainContext({ flop, flopActions, turn, turnActions, river, riverActions }, inputs) });
    return facts ? { ...facts, ...adjustment(inputs) } : null;
  } catch (error) {
    if (opponentProfile && opponentProfile !== "standard") throw error;
    return null;
  }
}
