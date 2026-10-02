// OFFLINE RESEARCH TOOL ONLY (decision 2026-10-01): postflop EV is not part of the product. Not imported by the app bundle,
// the backend or the Vite dev server; the middleware below is no longer registered.
// Per-hand action EV and equity realization (EQR) for the local heads-up flop pilot (any
// spot in spots.mjs, on its tree). Both players follow the saved AI candidate on the flop and
// the saved later-street policy (or the fixed reference). Each value is the expected value when both
// players follow the shown strategy from the decision on (exact-ev.mjs) — not GTO, not solver EV. Local-only output under .local/postflop-ai/.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { artifactPaths, boards, readArtifact, config, laterSizingHash, loadInputs } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate, sha } from "./generate.mjs";
import { referenceLaterPolicy } from "./later-policy.mjs";
import { DEFAULT_SPOT_ID } from "./spots.mjs";
import { parseFlopBoard } from "./model.mjs";
import { FLOP_EV_RUNOUTS, FLOP_HAND_EV_DEFAULT_SAMPLES, HISTORIES, handEvForBoard as handEvForBoardCore, historiesFor,
  playFromNode } from "./flop-hand-ev-core.mjs";
import { DEFENCE_VERSION } from "./defence.mjs";
import { computeBoardBatch } from "./board-batch.mjs";

export { playFromNode };

// 3: exact expectation (exact-ev.mjs) instead of 2,000-sample Monte Carlo; version 2 files are stale.
export const HAND_EV_VERSION = 3;
export const DEFAULT_SAMPLES = FLOP_HAND_EV_DEFAULT_SAMPLES; // only used by the Monte Carlo validation path
const referenceLater = referenceLaterPolicy();
// The 12 saved artifacts retain their authored IDs, which are not all in canonical
// suit order for paired boards. Normalize a request, then resolve it back to that key.
const savedBoardIds = new Map(boards().map(board => [parseFlopBoard(board.id).id, board.id]));
export function handEvArtifactBoardId(value) {
  const board = parseFlopBoard(value).id;
  return savedBoardIds.get(board) ?? board;
}

// The flop decision points of a tree, keyed by the actions before them ("oop_checks" by
// default). `role` is the in-position ("ip") or out-of-position ("oop") player of the spot.
export { HISTORIES, historiesFor };

export function handEvForBoard(board, inputs, policy, samples = DEFAULT_SAMPLES, laterPolicy = referenceLater) {
  return handEvForBoardCore(board, inputs, policy, samples, laterPolicy);
}

export async function generateHandEv({ spotId = DEFAULT_SPOT_ID, samples = DEFAULT_SAMPLES, onBoard = () => {} } = {}) {
  const inputs = loadInputs(spotId);
  const candidate = loadCandidate(inputs);
  const laterCandidate = loadLaterCandidate(inputs, candidate);
  const laterPolicy = laterCandidate?.policy ?? referenceLater;
  const result = { kind: "ai_estimate_not_gto", version: HAND_EV_VERSION, defence_version: DEFENCE_VERSION, source_hash: inputs.fingerprint,
    later_policy_hash: sha(laterPolicy), later_sizing_hash: laterSizingHash(),
    policy_hash: candidate.metadata.policy_hash, method: "exact_expectation", runouts: FLOP_EV_RUNOUTS, seed: config.seed,
    note: "両者が表示中の戦略（ターン・リバーは保存済み方針、未保存時は固定参照方針。ベットに対するコール／フォールドはエクイティと必要勝率の計算）に最後まで従った場合の期待値。GTO・ソルバーのEVではない。", boards: {} };
  result.boards = await computeBoardBatch({ kind: "hand-ev", inputs, policy: candidate.policy, laterCandidate: laterPolicy, samples, onBoard });
  writeFileSync(artifactPaths(inputs.spot).handEv, `${JSON.stringify(result)}\n`);
  return result;
}

// Read-only lookup for the local view; null when missing or stale for the candidate.
export function loadHandEv(inputs, candidate, laterCandidate = loadLaterCandidate(inputs, candidate)) {
  const data = readArtifact(inputs.spot, "handEv");
  return matchesHandEv(data, inputs, candidate, laterCandidate) ? data : null;
}

const matchesHandEv = (data, inputs, candidate, laterCandidate) => data?.kind === "ai_estimate_not_gto" &&
  data.version === HAND_EV_VERSION && data.defence_version === DEFENCE_VERSION && data.source_hash === inputs.fingerprint && data.policy_hash === candidate.metadata.policy_hash &&
  data.later_policy_hash === sha(laterCandidate?.policy ?? referenceLater) && data.later_sizing_hash === laterSizingHash();

// GET /local-postflop-hand-ev?spot=BTN_open_BB_call&board=As7d2c&history=bet33,raise&hand=AKo
// — read-only, local-only. `spot` defaults to BTN_open_BB_call.
const cache = new Map();
export function handEvMiddleware(req, res, next) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname !== "/local-postflop-hand-ev") { next(); return; }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const host = req.headers.host?.split(":")[0];
  if (req.method !== "GET" || !["127.0.0.1", "localhost"].includes(host)) {
    res.writeHead(req.method !== "GET" ? 405 : 403).end(JSON.stringify({ error: "ローカルの読み取り専用です。" })); return;
  }
  const { status, body } = handEvResponse(url.searchParams);
  res.writeHead(status).end(JSON.stringify(body));
}

// Flop hand-EV lookup as { status, body }; shared with the edge worker.
export function handEvResponse(params) {
  try {
    const inputs = loadInputs(params.get("spot") || DEFAULT_SPOT_ID);
    const candidate = loadCandidate(inputs);
    const laterCandidate = loadLaterCandidate(inputs, candidate);
    let data = cache.get(inputs.spot.id);
    if (!matchesHandEv(data, inputs, candidate, laterCandidate)) {
      data = loadHandEv(inputs, candidate, laterCandidate);
      if (data) cache.set(inputs.spot.id, data); else cache.delete(inputs.spot.id);
    }
    if (!data) return { status: 404, body: { error: `ハンド別EVが未計算か、方針と一致しません。npm run postflop-ai:hand-ev -- --spot ${inputs.spot.id} で計算してください。` } };
    const history = params.get("history") ?? "";
    const board = parseFlopBoard(params.get("board")).id;
    const artifactBoard = handEvArtifactBoardId(board);
    const node = data.boards[artifactBoard]?.[history];
    if (!node) return { status: 404, body: { error: "この場面のEVはありません。" } };
    const hand = params.get("hand");
    return { status: 200, body: { spot: inputs.spot.id, board, history, node: node.node, actor: node.actor, pot_bb: node.pot_bb, hand,
      row: node.rows[hand] ?? null, method: data.method, note: data.note } };
  } catch (error) {
    return { status: error.code === "ENOENT" ? 404 : 409, body: { error: error.message } };
  }
}
