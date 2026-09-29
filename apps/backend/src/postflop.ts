// Heads-up postflop AI policies (AI estimates, not GTO) served from the evionai-postflop D1
// database. The views are computed by the same code as the frontend Vite middleware, with
// its artifact reads redirected to rows published by scripts/postflop-ai/publish-d1.mjs.
// @ts-nocheck -- the shared view code is untyped JavaScript
import { useArtifactSource } from "../../frontend/scripts/postflop-ai/inputs.mjs";
import { postflopResponse } from "../../frontend/scripts/postflop-ai/local-view.mjs";
import { handEvResponse } from "../../frontend/scripts/postflop-ai/hand-ev.mjs";
import { spotById } from "../../frontend/scripts/postflop-ai/spots.mjs";
import openingRanges from "../../frontend/src/estimated/opening-ranges.json" with { type: "json" };
import preflopRanges from "../../frontend/src/estimated/preflop-ranges.json" with { type: "json" };
import threeBetResponses from "../../frontend/src/estimated/three-bet-responses.json" with { type: "json" };
import fourBetResponses from "../../frontend/src/estimated/four-bet-responses.json" with { type: "json" };
import limpResponses from "../../frontend/src/estimated/limp-responses.json" with { type: "json" };

export type D1Statement = { bind(...values: unknown[]): D1Statement; all<T>(): Promise<{ results: T[] }> };
export type D1Database = { prepare(sql: string): D1Statement };

// Worker route → local middleware path; "hand-ev" is the flop hand-EV lookup.
const ROUTES: Record<string, string> = {
  board: "/local-postflop",
  explain: "/local-postflop-explain",
  later: "/local-postflop-later",
  "later-explain": "/local-postflop-later-explain",
  "later-hand-ev": "/local-postflop-later-hand-ev",
  "hand-ev": "/local-postflop-hand-ev",
};
const TTL_MS = 5 * 60 * 1000;
const loaded = new Map<string, { at: number; artifacts: Record<string, unknown> }>();

useArtifactSource({
  ranges: {
    "opening-ranges": openingRanges,
    "preflop-ranges": preflopRanges,
    "three-bet-responses": threeBetResponses,
    "four-bet-responses": fourBetResponses,
    "limp-responses": limpResponses,
  },
  artifact: (spot: { id: string }, kind: string) => loaded.get(spot.id)?.artifacts[kind] ?? null,
});

async function loadSpot(db: D1Database, spotId: string): Promise<void> {
  const cached = loaded.get(spotId);
  if (cached && Date.now() - cached.at < TTL_MS) return;
  const [policies, reports, handEv] = await Promise.all([
    db.prepare("SELECT stage, policy_json FROM postflop_policies WHERE spot_id = ?").bind(spotId).all<{ stage: string; policy_json: string }>(),
    db.prepare("SELECT payload_json FROM postflop_reports WHERE spot_id = ?").bind(spotId).all<{ payload_json: string }>(),
    db.prepare("SELECT stage, board_key, history, payload_json FROM postflop_hand_ev WHERE spot_id = ?").bind(spotId)
      .all<{ stage: string; board_key: string; history: string; payload_json: string }>(),
  ]);
  const artifacts: Record<string, unknown> = {};
  for (const row of policies.results) artifacts[row.stage === "flop" ? "candidate" : "laterCandidate"] = JSON.parse(row.policy_json);
  if (reports.results[0]) artifacts.report = JSON.parse(reports.results[0].payload_json);
  artifacts.handEv = assembleHandEv(handEv.results, "flop");
  artifacts.laterHandEv = assembleHandEv(handEv.results, "later");
  loaded.set(spotId, { at: Date.now(), artifacts });
}

// Inverse of publish-d1.mjs handEvRows: header at ('', ''), nodes at (board, history) for
// the flop and at (key, '*') for turn/river.
export function assembleHandEv(rows: Array<{ stage: string; board_key: string; history: string; payload_json: string }>, stage: string) {
  const own = rows.filter(row => row.stage === stage);
  const header = own.find(row => row.board_key === "" && row.history === "");
  if (!header) return null;
  const boards: Record<string, any> = {};
  for (const row of own) {
    if (row === header) continue;
    const node = JSON.parse(row.payload_json);
    if (stage === "flop") (boards[row.board_key] ??= {})[row.history] = node;
    else boards[row.board_key] = node;
  }
  return { ...JSON.parse(header.payload_json), boards };
}

export async function routePostflop(db: D1Database | undefined, path: string, params: URLSearchParams): Promise<{ status: number; body: unknown }> {
  if (!db) throw new Error("POSTFLOP_DB binding is not configured");
  if (path === "/v1/postflop/spots") {
    const { results } = await db.prepare("SELECT spot_id, stage, policy_hash FROM postflop_policies ORDER BY spot_id, stage").all<{ spot_id: string; stage: string; policy_hash: string }>();
    const spots: Record<string, Record<string, string>> = {};
    for (const row of results) (spots[row.spot_id] ??= {})[row.stage] = row.policy_hash;
    return { status: 200, body: { kind: "ai_estimate_not_gto", spots } };
  }
  const route = ROUTES[path.slice("/v1/postflop/".length)];
  if (!route) return { status: 404, body: { error: "not found" } };
  const spotId = params.get("spot");
  if (!spotId) return { status: 400, body: { error: "spot is required" } };
  try { spotById(spotId); } catch { return { status: 404, body: { error: `unknown spot: ${spotId}` } }; }
  await loadSpot(db, spotId);
  return route === "/local-postflop-hand-ev" ? handEvResponse(params) : postflopResponse(route, params);
}
