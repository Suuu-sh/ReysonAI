// Where postflop data comes from: the evionai-api worker (D1, read-only) when the build sets
// VITE_POSTFLOP_API, otherwise the local Vite middleware. The worker serves only artifacts
// ("spot") and the flop hand-EV lookup; views are computed in the browser from the spot's
// artifacts. The other routes are local-development views of the same computations.
const LOCAL_PATHS = {
  spot: "/local-postflop-spot",
  "hand-ev": "/local-postflop-hand-ev",
  board: "/local-postflop",
  explain: "/local-postflop-explain",
  later: "/local-postflop-later",
  "later-explain": "/local-postflop-later-explain",
  "later-hand-ev": "/local-postflop-later-hand-ev",
} as const;
const API_ROUTES = new Set(["spot", "hand-ev"]);

export type PostflopRoute = keyof typeof LOCAL_PATHS;

export function postflopUrl(route: PostflopRoute, params: URLSearchParams | Record<string, string>, base = (import.meta as any).env?.VITE_POSTFLOP_API): string {
  const query = new URLSearchParams(params).toString();
  const path = base && API_ROUTES.has(route) ? `${String(base).replace(/\/$/, "")}/v1/postflop/${route}` : LOCAL_PATHS[route];
  return `${path}?${query}`;
}
