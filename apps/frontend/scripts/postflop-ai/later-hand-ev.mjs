// 本番はオンデマンドの laterHandEvForHand を使う。事前計算は検証用。
// Per-hand action EV/EQR for representative turn and river nodes. Values are sampled by
// AI-policy self-play and are local estimates, not GTO or solver output.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { seedFor, seededRandom } from "../lib/equity.mjs";
import { artifactPaths, boards, config, loadInputs, readArtifact } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate, sha } from "./generate.mjs";
import { validatePolicy } from "./policy.mjs";
import { validateLaterPolicy } from "./later-policy.mjs";
import { streetHistories } from "./later-tree.mjs";
import { FLOP_BETS, flopState } from "./tree.mjs";
import { DEFAULT_SPOT_ID } from "./spots.mjs";
import { LATER_HAND_EV_FOR_HAND_DEFAULT_SAMPLES, computeNode, laterHandEvForHand, laterHandEvKey, makeLaterMixReader } from "./later-hand-ev-core.mjs";

// The on-demand one-hand entry point lives in the pure core (shared with the browser worker).
export { LATER_HAND_EV_FOR_HAND_DEFAULT_SAMPLES, laterHandEvForHand, laterHandEvKey };
export const LATER_HAND_EV_DEFAULT_SAMPLES = 1000;
export const LATER_HAND_EV_VERSION = 1;
const cardText = card => "23456789TJQKA"[card >> 2] + "cdhs"[card & 3];

function flopPaths(spot) {
  const check = spot.tree === "oop_leads" ? ["check", "check"] : ["check"];
  const paths = [check, [FLOP_BETS[0], "call"]];
  return paths.map(actions => {
    const state = flopState(spot.tree, actions);
    if (!state.end || !["check", "call", "raise-call"].includes(state.end.type)) throw new Error("Invalid representative flop path");
    return { actions, steps: state.steps };
  });
}

// Deliberately identical to balance.mjs's seeded dealing rule. The four turns are removed
// first; then three distinct representative rivers are drawn from the remaining deck for
// each selected turn.
export function representativeLaterRunouts(board) {
  const random = seededRandom(seedFor(`${config.seed}|balance|${board.id}`));
  const deck = Array.from({ length: 52 }, (_, card) => card).filter(card => !board.cards.includes(card));
  const take = cards => cards.splice(Math.floor(random() * cards.length), 1)[0];
  const turns = Array.from({ length: 4 }, () => take(deck));
  return turns.flatMap(turn => {
    const rivers = deck.filter(card => card !== turn);
    const turnBoard = [...board.cards, turn];
    return Array.from({ length: 3 }, () => {
      const river = take(rivers);
      return { turn, river, turnBoard, riverBoard: [...turnBoard, river] };
    });
  });
}

// Pure per-flop generator for tests and batch generation. Optional subsets are useful for
// fast deterministic function-level checks; normal callers use the complete audited set.
export function laterHandEvForBoard(board, inputs, flopPolicy, laterPolicy,
  samples = LATER_HAND_EV_DEFAULT_SAMPLES, { runouts = representativeLaterRunouts(board), turnHistories: turnHistorySubset, riverHistories: riverHistorySubset } = {}) {
  if (!Number.isInteger(samples) || samples < 1) throw new Error("samples must be a positive integer");
  const policy = validatePolicy(flopPolicy, inputs.spot.tree);
  const later = validateLaterPolicy(laterPolicy);
  const laterMix = makeLaterMixReader(later);
  const turns = turnHistorySubset ?? streetHistories("turn");
  const rivers = riverHistorySubset ?? streetHistories("river");
  const selectedFlopPaths = flopPaths(inputs.spot);
  const out = {};
  const representativeTurns = [...new Map(runouts.map(runout => [runout.turn, runout])).values()];
  for (const path of selectedFlopPaths) {
    for (const runout of representativeTurns) {
      const turnText = cardText(runout.turn);
      for (const [historyText, { node }] of Object.entries(turns)) {
        const history = historyText ? historyText.split(",") : [];
        const key = laterHandEvKey({ flop: board.id, turn: turnText, flopActions: path.actions, turnActions: history });
        out[key] = computeNode({ key, street: "turn", history, expectedNode: node, expectedRole: node.split("_")[1], flopPath: path, runout, board, inputs,
          flopPolicy: policy, laterPolicy: later, laterMix, samples })[1];
      }
    }
    for (const river of runouts) {
      const turnText = cardText(river.turn);
      for (const turnHistory of [["check", "check"], ["bet75", "call"]]) {
        for (const [riverHistoryText] of Object.entries(rivers)) {
          const riverHistory = riverHistoryText ? riverHistoryText.split(",") : [];
          const key = laterHandEvKey({ flop: board.id, turn: turnText, river: cardText(river.river),
            flopActions: path.actions, turnActions: turnHistory, riverActions: riverHistory });
          out[key] = computeNode({ key, street: "river", history: riverHistory, turnHistory, expectedNode: rivers[riverHistoryText].node,
            expectedRole: rivers[riverHistoryText].role, flopPath: path,
            runout: river, board, inputs, flopPolicy: policy, laterPolicy: later, laterMix, samples,
          })[1];
        }
      }
    }
  }
  return out;
}

function artifactPath(inputs) {
  const paths = artifactPaths(inputs.spot);
  return paths.laterHandEv ?? paths.handEv.replace(/-hand-ev\.json$/, "-later-hand-ev.json");
}

function matchesLaterHandEv(data, inputs, candidate, laterCandidate) {
  return Boolean(laterCandidate) && data?.kind === "ai_estimate_not_gto" && data.version === LATER_HAND_EV_VERSION &&
    data.source_hash === inputs.fingerprint && data.policy_hash === candidate?.metadata?.policy_hash &&
    data.later_policy_hash === sha(laterCandidate.policy) && Number.isInteger(data.samples) && data.samples > 0 &&
    data.seed === config.seed;
}

export function loadLaterHandEv(inputs, candidate, laterCandidate) {
  const data = readArtifact(inputs.spot, "laterHandEv");
  return matchesLaterHandEv(data, inputs, candidate, laterCandidate) ? data : null;
}

async function generateBoardBatch(spotId, samples, onBoard) {
  const boardList = boards();
  const workerCount = Math.min(boardList.length, Math.max(1, Math.min(8, availableParallelism?.() ?? 1)));
  const jobs = Array.from({ length: workerCount }, (_, index) => boardList.filter((_, boardIndex) => boardIndex % workerCount === index).map(board => board.id));
  const resultsByBoard = {};
  const started = Date.now();
  const workers = jobs.map(boardIds => new Worker(new URL("./later-hand-ev-worker.mjs", import.meta.url), {
    workerData: { spotId, samples, boardIds },
  }));
  try {
    await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      let done = false;
      worker.on("message", message => {
        if (message?.error) { done = true; reject(new Error(message.error)); return; }
        resultsByBoard[message.boardId] = message.boards;
        onBoard(message.boardId, Date.now() - started);
      });
      worker.on("error", error => { if (!done) { done = true; reject(error); } });
      worker.on("exit", code => {
        if (done) return;
        done = true;
        if (code === 0) resolve(); else reject(new Error(`later-hand-ev worker exited (${code})`));
      });
    })));
  } catch (error) {
    await Promise.all(workers.map(worker => worker.terminate().catch(() => {})));
    throw error;
  }
  return Object.assign({}, ...boardList.map(board => resultsByBoard[board.id] ?? {}));
}

export async function generateLaterHandEv({ spotId = DEFAULT_SPOT_ID, samples = LATER_HAND_EV_DEFAULT_SAMPLES, onBoard = () => {} } = {}) {
  if (!Number.isInteger(samples) || samples < 1) throw new Error("samples must be a positive integer");
  const inputs = loadInputs(spotId);
  const candidate = loadCandidate(inputs);
  const laterCandidate = loadLaterCandidate(inputs, candidate);
  if (!laterCandidate) {
    const error = new Error("ターン・リバーのAI方針がありません。");
    error.code = "LATER_POLICY_MISSING";
    throw error;
  }
  const flopPolicy = validatePolicy(candidate.policy, inputs.spot.tree);
  const laterPolicy = validateLaterPolicy(laterCandidate.policy);
  const result = { kind: "ai_estimate_not_gto", version: LATER_HAND_EV_VERSION, source_hash: inputs.fingerprint,
    policy_hash: candidate.metadata.policy_hash, later_policy_hash: sha(laterPolicy), samples, seed: config.seed, boards: {} };
  result.boards = await generateBoardBatch(spotId, samples, onBoard);
  const path = artifactPath(inputs);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result)}\n`);
  return result;
}

// Read-only local lookup for `/local-postflop-later-hand-ev?spot=&key=&hand=`.
export function laterHandEvResult(data, key, hand) {
  const node = data?.boards?.[key];
  if (!node) return null;
  return { node: node.node, actor: node.actor, pot_bb: node.pot_bb, hand,
    row: hand == null ? null : node.rows?.[hand] ?? null, samples: data.samples, kind: data.kind };
}
