import { isCanonicalFlopKey } from "../../frontend/scripts/postflop-ai/flop-isomorphism.ts";
// Heads-up postflop AI policies (AI estimates, not GTO) read from the reysonai D1
// database. The worker only reads: canonical flop bases and policies are stored data;
// missing flop bases and later-street views are computed in the browser.
// Stored JSON is passed through as text so a request never parses a whole policy.

export type D1Statement = { bind(...values: unknown[]): D1Statement; all<T>(): Promise<{ results: T[] }> };
export type D1Database = { prepare(sql: string): D1Statement };
type Result = { status: number; body?: unknown; text?: string; bytes?: Uint8Array; etag?: string };

// D1 returns a BLOB as an array of byte values (or an ArrayBuffer/Uint8Array in other runtimes).
function blobBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  throw new Error("flop base part is not a BLOB");
}

const SPOT_ID = /^[A-Za-z0-9_]+$/;

export async function routePostflop(db: D1Database | undefined, path: string, params: URLSearchParams): Promise<Result> {
  if (!db) throw new Error("DB binding is not configured");
  if (path === "/v1/postflop/spots") {
    const { results } = await db.prepare("SELECT spot_id, stage, policy_hash FROM postflop_policies ORDER BY spot_id, stage").all<{ spot_id: string; stage: string; policy_hash: string }>();
    const spots: Record<string, Record<string, string>> = {};
    for (const row of results) (spots[row.spot_id] ??= {})[row.stage] = row.policy_hash;
    return { status: 200, body: { kind: "ai_estimate_not_gto", spots } };
  }
  if (path === "/v1/postflop/profile-policy") {
    // Each selector is explicit and singular: never substitute a balanced,
    // different-role or different-street policy when this row is absent.
    const profile = params.get("profile") ?? "";
    const spot = params.get("spot") ?? "";
    const role = params.get("role") ?? "";
    const stage = params.get("stage") ?? "";
    if (["profile", "spot", "role", "stage"].some(key => params.getAll(key).length !== 1)
      || !["nit", "station", "lag", "maniac"].includes(profile)
      || !SPOT_ID.test(spot) || spot.length > 128
      || !["villain", "exploit"].includes(role)
      || !["flop", "later"].includes(stage)) {
      return { status: 400, body: { error: "valid profile, spot, role and stage are required" } };
    }
    const { results } = await db.prepare("SELECT metadata_json, policy_json, published_at FROM postflop_profile_policies WHERE profile = ? AND spot_id = ? AND role = ? AND stage = ?")
      .bind(profile, spot, role, stage).all<{ metadata_json: string; policy_json: string; published_at: string }>();
    const row = results[0];
    if (!row) return { status: 404, body: { error: "No stored profile policy", code: "PROFILE_POLICY_MISSING", state: "not_generated" } };
    // Only scalar envelope fields are serialized; stored payload bytes pass through.
    return { status: 200, text: `{"kind":"ai_estimate_not_gto","profile":${JSON.stringify(profile)},"spot":${JSON.stringify(spot)},` +
      `"role":${JSON.stringify(role)},"stage":${JSON.stringify(stage)},"metadata":${row.metadata_json},"policy":${row.policy_json},"publishedAt":${JSON.stringify(row.published_at)}}` };
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
    const { results } = await db.prepare("SELECT part, parts, content_hash, body FROM postflop_flop_base_br WHERE spot_id = ? AND flop_key = ? ORDER BY part")
      .bind(spotId, flop).all<{ part: number; parts: number; content_hash: string; body: unknown }>();
    if (!results.length) return { status: 404, body: { error: "No stored flop base" } };
    const first = results[0];
    if (results.length !== first.parts || results.some((row, index) => row.part !== index || row.parts !== first.parts || row.content_hash !== first.content_hash)) {
      return { status: 409, body: { error: "Incomplete flop base" } };
    }
    // The parts are the stored Brotli bytes; they are joined, never decompressed or parsed here.
    const chunks = results.map(row => blobBytes(row.body));
    const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { status: 200, bytes, etag: `"${first.content_hash}"` };
  }

  return { status: 404, body: { error: "not found" } };
}

