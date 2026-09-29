// The worker and local middleware expose only read-only artifacts and the saved flop hand-EV.
// Board views and explanations are computed in the browser from the returned spot artifacts.
const LOCAL_PATHS = {
  spot: "/local-postflop-spot",
  "hand-ev": "/local-postflop-hand-ev",
} as const;
const API_ROUTES = new Set(["spot", "hand-ev"]);

export type PostflopRoute = keyof typeof LOCAL_PATHS;

export function postflopUrl(route: PostflopRoute, params: URLSearchParams | Record<string, string>, base = (import.meta as any).env?.VITE_API_BASE): string {
  const query = new URLSearchParams(params).toString();
  const path = base && API_ROUTES.has(route) ? `${String(base).replace(/\/$/, "")}/v1/postflop/${route}` : LOCAL_PATHS[route];
  return `${path}?${query}`;
}
