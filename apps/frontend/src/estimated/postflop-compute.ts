import type { Candidate, FlopPolicy, Inputs, LaterPolicy, PostflopDatasets, StrategyNodes } from "../../scripts/postflop-ai/types.ts";
import type { BalancedFlopBase } from "../../scripts/postflop-ai/flop-base-core.ts";
import type { PlayerRole, BettingStep } from "../../scripts/postflop-ai/tree.ts";
import type { LaterStreet } from "../../scripts/postflop-ai/later-tree.ts";
export type ComboInput = { cards: string; weight: number };
type ComputeSource = { spotId: string; datasets: PostflopDatasets; flopCandidate: Candidate; laterCandidate?: Candidate<LaterPolicy> | null; flopBase?: BalancedFlopBase | null };
type BoardRequest = ComputeSource & { board: string; history?: string[] | null };
type ExplainRequest = BoardRequest & { node: string; cards?: string; combos?: ComboInput[]; prev?: string };
type LaterRequest = ComputeSource & { flop: string; flopActions?: string; turn?: string; turnActions?: string; river?: string; riverActions?: string };
type LaterExplainRequest = LaterRequest & { cards?: string; combos?: ComboInput[] };
import { buildInputs, sha } from "../../scripts/postflop-ai/browser-inputs.ts";
import { flopBetTable, flopUiFacts } from "../../scripts/postflop-ai/flop-ui-facts.ts";
import { explainLaterCombo, explainLaterCombos, laterExplainContext } from "../../scripts/postflop-ai/explain-later.ts";
import { flopRangeFacts, laterRangeFacts } from "../../scripts/postflop-ai/range-facts.ts";
import { validatePolicy } from "../../scripts/postflop-ai/policy.ts";
import { boardTexture, parseCards, parseFlopBoard, runoutTexture } from "../../scripts/postflop-ai/model.ts";
import { FLOP_BETS, flopState } from "../../scripts/postflop-ai/tree.ts";
import { referenceLaterPolicy, validateLaterPolicy } from "../../scripts/postflop-ai/later-policy.ts";
import { laterDecision, laterStart, replayLater } from "./postflop-trial.ts";
import { flopNodes, laterMixRows } from "../../scripts/postflop-ai/views.ts";
import { canonicalFlop } from "../../scripts/postflop-ai/flop-isomorphism.ts";
import { isFreshFlopBase, storedFlopNodes, storedFlopExplanation } from "../../scripts/postflop-ai/flop-base-core.ts";

function policyForLater(inputs: Inputs, candidate: Candidate, laterCandidate?: Candidate<LaterPolicy> | null) {
  if (!laterCandidate) {
    const error = new Error("ターン・リバーのAI方針がありません。") as Error & { code: string };
    error.code = "LATER_POLICY_MISSING";
    throw error;
  }
  const flopPolicy = validatePolicy(candidate?.policy, inputs.spot.tree);
  if (candidate?.metadata?.source_hash !== inputs.fingerprint ||
      candidate.metadata.policy_hash !== sha(flopPolicy) ||
      laterCandidate.metadata?.source_hash !== inputs.fingerprint ||
      laterCandidate.metadata?.flop_policy_hash !== candidate.metadata.policy_hash) {
    throw new Error("Later AI policy source or flop policy is stale");
  }
  const laterPolicy = validateLaterPolicy(laterCandidate.policy);
  if (laterCandidate.metadata.policy_hash !== sha(laterPolicy)) throw new Error("Saved later AI policy hash does not match its content");
  return { flopPolicy, laterPolicy };
}

export function computeBoard({ spotId, board, history = null, datasets, flopCandidate, laterCandidate, flopBase }: BoardRequest) {
  const inputs = buildInputs(spotId, datasets);
  const selected = parseFlopBoard(board);
  const policy = validatePolicy(flopCandidate.policy, inputs.spot.tree);
  if (flopCandidate.metadata?.source_hash !== inputs.fingerprint || flopCandidate.metadata.policy_hash !== sha(policy)) {
    throw new Error("ローカル候補の入力または方針ハッシュが一致しません。");
  }
  const { spot } = inputs;
  let nodes: StrategyNodes | null = null;
  if (isFreshFlopBase(flopBase, inputs, flopCandidate, laterCandidate)) {
    try { nodes = storedFlopNodes(flopBase!, inputs, selected.cards, history); } catch { /* malformed optional cache: use the shared computation */ }
  }
  nodes ??= flopNodes(inputs, policy, selected.cards, history);
  return { kind: "ai_estimate_not_gto", spot: spot.id, tree: spot.tree, ip: spot.ip, oop: spot.oop,
    pot_bb: spot.potBb, stack_bb: spot.stackBb, board: selected.id, split: selected.split,
    texture: boardTexture(selected.cards), source_hash: inputs.fingerprint,
    policy_hash: flopCandidate.metadata.policy_hash, nodes };
}

export function computeExplain({ spotId, board, node, cards, combos, prev, history, datasets, flopCandidate, laterCandidate, flopBase }: ExplainRequest) {
  const inputs = buildInputs(spotId, datasets);
  const selected = parseFlopBoard(board);
  const previous = (FLOP_BETS as readonly (string | undefined)[]).includes(prev) ? prev! : FLOP_BETS[0];
  const policy = validatePolicy(flopCandidate.policy, inputs.spot.tree);
  if (flopCandidate.metadata?.source_hash !== inputs.fingerprint || flopCandidate.metadata.policy_hash !== sha(policy)) {
    throw new Error("ローカル候補の入力または方針ハッシュが一致しません。");
  }
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
  if (isFreshFlopBase(flopBase, inputs, flopCandidate, laterCandidate)) {
    try { explanation = storedFlopExplanation(flopBase!, options); } catch { /* optional base must never prevent fallback */ }
  }
  explanation ??= flopUiFacts(options);
  // Called-range equity is not in the stored base; compute it from the same contexts (never stored).
  explanation = { ...explanation, ...flopBetTable(options) };
  return { spot: inputs.spot.id, board: selected.id,
    ...explanation };
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
  datasets, flopCandidate, laterCandidate }: LaterRequest) {
  const inputs = buildInputs(spotId, datasets);
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
    texture: runoutTexture(currentBoard), pot_bb: decision.potBb, rows };
}

export function computeLaterExplain({ spotId, flop, flopActions = "", turn, turnActions = "", river = "", riverActions = "",
  cards, combos, datasets, flopCandidate, laterCandidate }: LaterExplainRequest) {
  const inputs = buildInputs(spotId, datasets);
  const options = { flop, flopActions, turn, turnActions, river, riverActions,
    inputs, flopPolicy: flopCandidate.policy, laterPolicy: laterCandidate!.policy };
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
  return { spot: inputs.spot.id, ...explanation };
}

// Range-level facts (tier shares of both ranges, bet-size composition, SPR, runout shift) for the advanced
// explanations. Hero independent and never stored, so it stays out of computeExplain's stored/parity payload.
export function computeRangeFacts({ spotId, board, node, prev, history, datasets, flopCandidate }: ExplainRequest) {
  const inputs = buildInputs(spotId, datasets);
  const policy = validatePolicy(flopCandidate.policy, inputs.spot.tree);
  return flopRangeFacts({ inputs, policy, boardCards: parseFlopBoard(board).cards, node,
    prev: (FLOP_BETS as readonly (string | undefined)[]).includes(prev) ? prev! : FLOP_BETS[0], history }) ?? null;
}

export function computeLaterRangeFacts({ spotId, flop, flopActions = "", turn, turnActions = "", river = "", riverActions = "",
  datasets, flopCandidate, laterCandidate }: LaterRequest) {
  try {
    const inputs = buildInputs(spotId, datasets);
    const { flopPolicy, laterPolicy } = policyForLater(inputs, flopCandidate, laterCandidate);
    return laterRangeFacts({ inputs, flopPolicy, laterPolicy,
      context: laterExplainContext({ flop, flopActions, turn, turnActions, river, riverActions }, inputs) }) ?? null;
  } catch { return null; }
}
