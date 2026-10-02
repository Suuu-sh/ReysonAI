// The worker and local middleware expose only read-only artifacts: the spot policy and the canonical flop base.
// Postflop EV is not part of the product (decision 2026-10-01).
const LOCAL_PATHS = {
  spot: "/local-postflop-spot",
  flop: "/local-postflop-flop",
} as const;
const API_ROUTES = new Set(["spot", "flop"]);

export type PostflopRoute = keyof typeof LOCAL_PATHS;

export function postflopUrl(route: PostflopRoute, params: URLSearchParams | Record<string, string>, base = (import.meta as any).env?.VITE_API_BASE): string {
  const query = new URLSearchParams(params).toString();
  const path = base && API_ROUTES.has(route) ? `${String(base).replace(/\/$/, "")}/v1/postflop/${route}` : LOCAL_PATHS[route];
  return `${path}?${query}`;
}
