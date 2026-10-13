import type { D1Database } from "./postflop.ts";

type Result = { status: number; body?: unknown; text?: string; bytes?: Uint8Array; etag?: string };
const SPOT_ID = /^[A-Za-z0-9_]+$/;

// The edge dispatcher sends only Single Size or invalid sizing selectors here.
// Preserve the existing DB -> spot -> sizing validation order.
export async function routePostflopSingle(db: D1Database | undefined, path: string, params: URLSearchParams): Promise<Result> {
  if (!db) throw new Error("DB binding is not configured");
  const spotId = params.get("spot");
  if (!spotId || !SPOT_ID.test(spotId)) return { status: 400, body: { error: "spot is required" } };
  if (path !== "/v1/postflop/spot") return { status: 404, body: { error: "not found" } };
  const sizing = params.get("sizing");
  if (params.getAll("sizing").length > 1 || (sizing !== null && sizing !== "multi" && sizing !== "single")) {
    return { status: 400, body: { error: "sizing must be multi or single" } };
  }
  // Single Size is a separately published AI estimate, not a GTO solution.
  // Never substitute the standard multi-size policies when its flop is missing.
  const [spots, policies, reports] = await Promise.all([
    db.prepare("SELECT spot_json FROM postflop_spots WHERE spot_id = ?").bind(spotId).all<{ spot_json: string }>(),
    db.prepare("SELECT stage, policy_json FROM postflop_single_policies WHERE spot_id = ?").bind(spotId).all<{ stage: string; policy_json: string }>(),
    db.prepare("SELECT payload_json FROM postflop_single_reports WHERE spot_id = ?").bind(spotId).all<{ payload_json: string }>(),
  ]);
  const flop = policies.results.find(row => row.stage === "flop");
  if (!flop) return { status: 404, body: { error: "No single-size policy", code: "SINGLE_SIZE_MISSING" } };
  if (!spots.results[0]) return { status: 404, body: { error: `unpublished spot: ${spotId}` } };
  const later = policies.results.find(row => row.stage === "later")?.policy_json ?? "null";
  return { status: 200, text: `{"kind":"ai_estimate_not_gto","spot":${spots.results[0].spot_json},"candidate":${flop.policy_json},` +
    `"laterCandidate":${later},"report":${reports.results[0]?.payload_json ?? "null"},"sizing":"single"}` };
}
