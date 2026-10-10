// The worker and local middleware expose only read-only artifacts: the spot policy and the canonical flop base.
// Postflop EV is not part of the product (decision 2026-10-01).
const LOCAL_PATHS = {
  spot: "/local-postflop-spot",
  flop: "/local-postflop-flop",
} as const;
const API_ROUTES = new Set(["spot", "flop", "profile-policy"]);

export type PostflopRoute = keyof typeof LOCAL_PATHS | "profile-policy";

export const postflopApiBase = (): string | undefined =>
  (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE;

export function postflopUrl(route: PostflopRoute, params: URLSearchParams | Record<string, string>, base = postflopApiBase()): string {
  const search = new URLSearchParams(params);
  // Standard routes must never receive profile options: an older worker could
  // silently answer with standard data. Profile artifacts have their own route.
  if (base && route !== "profile-policy" && search.has("opponentProfile") && search.get("opponentProfile") !== "standard") {
    throw Object.assign(new Error("Use the dedicated opponent-profile policy API."),
      { code: "PROFILE_POLICY_MISSING", state: "not_generated" });
  }
  if (route === "profile-policy" && !base) throw new Error("The profile policy route requires a published API base.");
  const query = search.toString();
  const path = base && API_ROUTES.has(route) ? `${String(base).replace(/\/$/, "")}/v1/postflop/${route}` : LOCAL_PATHS[route as keyof typeof LOCAL_PATHS];
  return `${path}?${query}`;
}
