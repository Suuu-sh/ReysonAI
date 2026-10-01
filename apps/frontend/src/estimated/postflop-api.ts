// The worker and local middleware expose only read-only artifacts and the saved flop hand-EV.
// A canonical flop base is optional; missing/stale entries use the same browser computation.
const LOCAL_PATHS = {
  spot: "/local-postflop-spot",
  flop: "/local-postflop-flop",
  "hand-ev": "/local-postflop-hand-ev",
} as const;
const API_ROUTES = new Set(["spot", "flop", "hand-ev"]);

export type PostflopRoute = keyof typeof LOCAL_PATHS;

export function postflopUrl(route: PostflopRoute, params: URLSearchParams | Record<string, string>, base = (import.meta as any).env?.VITE_API_BASE): string {
  const query = new URLSearchParams(params).toString();
  const path = base && API_ROUTES.has(route) ? `${String(base).replace(/\/$/, "")}/v1/postflop/${route}` : LOCAL_PATHS[route];
  return `${path}?${query}`;
}
