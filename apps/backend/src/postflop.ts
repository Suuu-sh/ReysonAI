import { isCanonicalFlopKey } from "../../frontend/scripts/postflop-ai/flop-isomorphism.mjs";
// Heads-up postflop AI policies (AI estimates, not GTO) read from the evionai D1
// database. The worker only reads: canonical flop bases and policies are stored data;
// missing flop bases and later-street views are computed in the browser.
// Stored JSON is passed through as text so a request never parses a whole policy.

export type D1Statement = { bind(...values: unknown[]): D1Statement; all<T>(): Promise<{ results: T[] }> };
export type D1Database = { prepare(sql: string): D1Statement };
type Result = { status: number; body?: unknown; text?: string };

const SPOT_ID = /^[A-Za-z0-9_]+$/;

export async function routePostflop(db: D1Database | undefined, path: string, params: URLSearchParams): Promise<Result> {
  if (!db) throw new Error("DB binding is not configured");
  if (path === "/v1/postflop/spots") {
    const { results } = await db.prepare("SELECT spot_id, stage, policy_hash FROM postflop_policies ORDER BY spot_id, stage").all<{ spot_id: string; stage: string; policy_hash: string }>();
    const spots: Record<string, Record<string, string>> = {};
    for (const row of results) (spots[row.spot_id] ??= {})[row.stage] = row.policy_hash;
    return { status: 200, body: { kind: "ai_estimate_not_gto", spots } };
  }
  const spotId = params.get("spot");
  if (!spotId || !SPOT_ID.test(spotId)) return { status: 400, body: { error: "spot is required" } };

  // One spot's artifacts: the spot description, flop and turn/river candidates (whole files as
  // published) and the simulation report. The browser builds its inputs from the bundled
  // preflop ranges and checks these against them as the local view does.
  if (path === "/v1/postflop/spot") {
    const [spots, policies, reports] = await Promise.all([
      db.prepare("SELECT spot_json FROM postflop_spots WHERE spot_id = ?").bind(spotId).all<{ spot_json: string }>(),
      db.prepare("SELECT stage, policy_json FROM postflop_policies WHERE spot_id = ?").bind(spotId).all<{ stage: string; policy_json: string }>(),
      db.prepare("SELECT payload_json FROM postflop_reports WHERE spot_id = ?").bind(spotId).all<{ payload_json: string }>(),
    ]);
    if (!spots.results[0]) return { status: 404, body: { error: `unpublished spot: ${spotId}` } };
    const policy = (stage: string) => policies.results.find(row => row.stage === stage)?.policy_json ?? "null";
    return { status: 200, text: `{"kind":"ai_estimate_not_gto","spot":${spots.results[0].spot_json},"candidate":${policy("flop")},` +
      `"laterCandidate":${policy("later")},"report":${reports.results[0]?.payload_json ?? "null"}}` };
  }

  // Canonical balanced-mode flop JSON, passed through without parsing any payload.
  if (path === "/v1/postflop/flop") {
    const flop = params.get("flop") ?? "";
    if (!isCanonicalFlopKey(flop)) return { status: 400, body: { error: "canonical flop key is required" } };
    const { results } = await db.prepare("SELECT part, parts, content_hash, body FROM postflop_flop_base WHERE spot_id = ? AND flop_key = ? ORDER BY part")
      .bind(spotId, flop).all<{ part: number; parts: number; content_hash: string; body: string }>();
    if (!results.length) return { status: 404, body: { error: "No stored flop base" } };
    const first = results[0];
    if (results.length !== first.parts || results.some((row, index) => row.part !== index || row.parts !== first.parts || row.content_hash !== first.content_hash)) {
      return { status: 409, body: { error: "Incomplete flop base" } };
    }
    return { status: 200, text: results.map(row => row.body).join("") };
  }

  // Flop hand-EV at one representative board and flop history. With `hand` the body matches
  // the local /local-postflop-hand-ev lookup; without it the whole node (every hand) is returned.
  if (path === "/v1/postflop/hand-ev") {
    const board = params.get("board") ?? "", history = params.get("history") ?? "";
    const { results } = await db.prepare("SELECT board_key, payload_json FROM postflop_hand_ev WHERE spot_id = ? AND stage = 'flop' AND ((board_key = '' AND history = '') OR (board_key = ? AND history = ?))")
      .bind(spotId, board, history).all<{ board_key: string; payload_json: string }>();
    const header = results.find(row => row.board_key === "");
    const node = results.find(row => row.board_key !== "");
    if (!header) return { status: 404, body: { error: "ハンド別EVが未公開です。" } };
    if (!node) return { status: 404, body: { error: "この場面のEVはありません。" } };
    const hand = params.get("hand");
    if (hand == null) return { status: 200, text: `{"spot":${JSON.stringify(spotId)},"header":${header.payload_json},"node":${node.payload_json}}` };
    const meta = JSON.parse(header.payload_json), data = JSON.parse(node.payload_json);
    return { status: 200, body: { spot: spotId, board, history, node: data.node, actor: data.actor, pot_bb: data.pot_bb, hand,
      row: data.rows?.[hand] ?? null, samples: meta.samples_per_hand_action, note: meta.note } };
  }
  return { status: 404, body: { error: "not found" } };
}

