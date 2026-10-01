import { buildInputs, sha } from "../../scripts/postflop-ai/browser-inputs.mjs";
import { flopUiFacts } from "../../scripts/postflop-ai/flop-ui-facts.mjs";
import { explainLaterCombo, explainLaterCombos } from "../../scripts/postflop-ai/explain-later.mjs";
import { validatePolicy } from "../../scripts/postflop-ai/policy.mjs";
import { boardTexture, parseCards, parseFlopBoard, runoutTexture } from "../../scripts/postflop-ai/model.mjs";
import { FLOP_BETS, flopState } from "../../scripts/postflop-ai/tree.mjs";
import { referenceLaterPolicy, validateLaterPolicy } from "../../scripts/postflop-ai/later-policy.mjs";
import { laterDecision, laterStart, replayLater } from "./postflop-trial.ts";
import { flopHandEvForHand } from "../../scripts/postflop-ai/flop-hand-ev-core.mjs";
import { laterHandEvForHand } from "../../scripts/postflop-ai/later-hand-ev-core.mjs";
import { flopNodes, laterMixRows } from "../../scripts/postflop-ai/views.mjs";
import { canonicalFlop } from "../../scripts/postflop-ai/flop-isomorphism.mjs";
import { isFreshFlopBase, storedFlopNodes, storedFlopExplanation, storedFlopHandEv } from "../../scripts/postflop-ai/flop-base-core.mjs";

function policyForLater(inputs, candidate, laterCandidate) {
  if (!laterCandidate) {
    const error = new Error("ターン・リバーのAI方針がありません。");
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

export function computeBoard({ spotId, board, history = null, datasets, flopCandidate, laterCandidate, flopBase }) {
  const inputs = buildInputs(spotId, datasets);
  const selected = parseFlopBoard(board);
  const policy = validatePolicy(flopCandidate.policy, inputs.spot.tree);
  if (flopCandidate.metadata?.source_hash !== inputs.fingerprint || flopCandidate.metadata.policy_hash !== sha(policy)) {
    throw new Error("ローカル候補の入力または方針ハッシュが一致しません。");
  }
  const { spot } = inputs;
  let nodes = null;
  if (isFreshFlopBase(flopBase, inputs, flopCandidate, laterCandidate)) {
    try { nodes = storedFlopNodes(flopBase, inputs, selected.cards, history); } catch { /* malformed optional cache: use the shared computation */ }
  }
  nodes ??= flopNodes(inputs, policy, selected.cards, history);
  return { kind: "ai_estimate_not_gto", spot: spot.id, tree: spot.tree, ip: spot.ip, oop: spot.oop,
    pot_bb: spot.potBb, stack_bb: spot.stackBb, board: selected.id, split: selected.split,
    texture: boardTexture(selected.cards), source_hash: inputs.fingerprint,
    policy_hash: flopCandidate.metadata.policy_hash, nodes };
}

export function computeExplain({ spotId, board, node, cards, combos, prev, history, datasets, flopCandidate, laterCandidate, flopBase }) {
  const inputs = buildInputs(spotId, datasets);
  const selected = parseFlopBoard(board);
  const previous = FLOP_BETS.includes(prev) ? prev : FLOP_BETS[0];
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
    try { explanation = storedFlopExplanation(flopBase, options); } catch { /* optional base must never prevent fallback */ }
  }
  explanation ??= flopUiFacts(options);
  return { spot: inputs.spot.id, board: selected.id,
    ...explanation };
}

function singleCard(value, label, used) {
  if (!value) return null;
  if (typeof value !== "string" || !/^[2-9TJQKA][cdhs]$/.test(value)) throw new Error(`${label}の形式が正しくありません。`);
  const card = parseCards(value, 1)[0];
  if (used.has(card)) throw new Error("盤面カードが重複しています。");
  used.add(card);
  return card;
}

function parseActions(value) {
  if (value == null || value === "") return [];
  if (typeof value !== "string") throw new Error("アクション履歴の形式が正しくありません。");
  return value.split(",");
}

export function computeLaterView({ spotId, flop, flopActions = "", turn = "", turnActions = "", river = "", riverActions = "",
  datasets, flopCandidate, laterCandidate }) {
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
  let street = "turn", currentBoard = turnBoard;
  let riverBoard = null, turnSteps = turnReplay.state.steps, riverSteps = null, riverPreviousAggressor = null;
  let decision = laterDecision("turn", turnPath, start, inputs.spot);
  if (!decision.node) {
    if (["fold", "raise-fold"].includes(turnReplay.end?.type) || turnReplay.stacks.ip <= 0 || turnReplay.stacks.oop <= 0) {
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
  const role = decision.role;
  const actor = inputs.spot[role];
  const rows = laterMixRows({ actor, role, board: currentBoard, node: decision.node, line: decision.line,
    inputs, flopPolicy, laterPolicy, flopSteps, turnSteps, riverSteps, turnBoard, riverBoard,
    turnPreviousAggressor: start.lastAggressor, riverPreviousAggressor,
    paths: { flop: flopPath, turn: turnPath, river: riverPath } });
  return { kind: "ai_estimate_not_gto", street, node: decision.node, actor, line: decision.line,
    texture: runoutTexture(currentBoard), pot_bb: decision.potBb, rows };
}

export function computeLaterExplain({ spotId, flop, flopActions = "", turn, turnActions = "", river = "", riverActions = "",
  cards, combos, datasets, flopCandidate, laterCandidate }) {
  const inputs = buildInputs(spotId, datasets);
  const options = { flop, flopActions, turn, turnActions, river, riverActions,
    inputs, flopPolicy: flopCandidate.policy, laterPolicy: laterCandidate.policy };
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

// The on-demand hand EV is the pure core shared with the Node scripts (later-hand-ev-core.mjs), so the
// worker transfers one self-contained request without the Node-only artifact and worker-pool code.
export function computeLaterHandEv({ spotId, flop, flopActions = [], turn, turnActions = [], river = null, riverActions = [],
  hand, samples, seed, datasets, flopCandidate, laterCandidate }) {
  const inputs = buildInputs(spotId, datasets);
  return laterHandEvForHand({ flop, flopActions, turn, turnActions, river, riverActions, hand, samples, seed,
    inputs, flopPolicy: flopCandidate.policy, laterPolicy: laterCandidate.policy });
}

// Flop hand EV uses the same browser-safe core as scripts/postflop-ai/hand-ev.mjs. The
// representative artifact is an optional fast path; this function handles any valid flop.
export function computeFlopHandEv({ spotId, board, history = [], hand, samples, seed, datasets,
  flopCandidate, laterCandidate, flopBase }) {
  const inputs = buildInputs(spotId, datasets);
  const selected = parseFlopBoard(board);
  const policy = validatePolicy(flopCandidate?.policy, inputs.spot.tree);
  if (flopCandidate?.metadata?.source_hash !== inputs.fingerprint ||
      flopCandidate.metadata.policy_hash !== sha(policy)) throw new Error("ローカル候補の入力または方針ハッシュが一致しません。");
  let laterPolicy = referenceLaterPolicy();
  if (laterCandidate) {
    const checked = validateLaterPolicy(laterCandidate.policy);
    if (laterCandidate.metadata?.source_hash !== inputs.fingerprint ||
        laterCandidate.metadata?.flop_policy_hash !== flopCandidate.metadata.policy_hash ||
        laterCandidate.metadata.policy_hash !== sha(checked)) throw new Error("Later AI policy source or hash is stale");
    laterPolicy = checked;
  }
  const stored = storedFlopHandEvInput({ spotId, board, history, hand, samples, seed, datasets, flopCandidate, laterCandidate, flopBase });
  if (stored) return stored;
  return { spot: inputs.spot.id, hand, kind: "ai_estimate_not_gto",
    ...flopHandEvForHand({ flop: canonicalFlop(selected.cards).key, history, hand, samples, seed,
      inputs, flopPolicy: policy, laterPolicy }) };
}

// Cheap lookup, also called before creating/transferring a Web Worker. No equity work.
export function storedFlopHandEvInput({ spotId, board, history = [], hand, samples, seed, datasets,
  flopCandidate, laterCandidate, flopBase }) {
  if (!flopBase?.ev || seed != null || samples != null && samples !== flopBase.metadata?.samples?.ev_per_hand_action) return null;
  const inputs = buildInputs(spotId, datasets);
  if (flopCandidate?.metadata?.source_hash !== inputs.fingerprint || sha(flopCandidate.policy) !== flopCandidate.metadata.policy_hash ||
      laterCandidate && (laterCandidate.metadata?.source_hash !== inputs.fingerprint ||
        laterCandidate.metadata?.flop_policy_hash !== flopCandidate.metadata.policy_hash || sha(laterCandidate.policy) !== laterCandidate.metadata?.policy_hash)) return null;
  if (!isFreshFlopBase(flopBase, inputs, flopCandidate, laterCandidate) || canonicalFlop(board).key !== flopBase.flop) return null;
  let result;
  try { result = storedFlopHandEv(flopBase, history, hand); } catch { return null; }
  if (result?.row && (!Number.isFinite(result.row.mix_ev_bb) || !Number.isFinite(result.row.equity_pct) ||
      !result.row.ev_bb || !Object.values(result.row.ev_bb).every(Number.isFinite))) return null;
  return result ? { spot: inputs.spot.id, hand, kind: "ai_estimate_not_gto", ...result } : null;
}
