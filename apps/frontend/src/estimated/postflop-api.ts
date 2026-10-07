// The worker and local middleware expose only read-only artifacts: the spot policy and the canonical flop base.
// Postflop EV is not part of the product (decision 2026-10-01).
const LOCAL_PATHS = {
  spot: "/local-postflop-spot",
  flop: "/local-postflop-flop",
} as const;
const API_ROUTES = new Set(["spot", "flop"]);

export type PostflopRoute = keyof typeof LOCAL_PATHS;

export function postflopUrl(route: PostflopRoute, params: URLSearchParams | Record<string, string>, base = (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE): string {
  const search = new URLSearchParams(params);
  // D1 has only standard (spot_id, stage) policies. Do not send a profile to
  // that endpoint: an older worker could silently answer with standard data.
  if (base && search.has("opponentProfile") && search.get("opponentProfile") !== "standard") {
    throw Object.assign(new Error("Opponent-profile policies are not generated for the published API."),
      { code: "PROFILE_POLICY_MISSING", state: "not_generated" });
  }
  const query = search.toString();
  const path = base && API_ROUTES.has(route) ? `${String(base).replace(/\/$/, "")}/v1/postflop/${route}` : LOCAL_PATHS[route];
  return `${path}?${query}`;
}
