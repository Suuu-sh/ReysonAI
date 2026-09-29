// Where postflop views come from: the solveaai-edge-api worker (D1) when the build sets
// VITE_POSTFLOP_API, otherwise the local Vite middleware. Both return identical bodies.
const LOCAL_PATHS = {
  board: "/local-postflop",
  explain: "/local-postflop-explain",
  later: "/local-postflop-later",
  "later-explain": "/local-postflop-later-explain",
  "later-hand-ev": "/local-postflop-later-hand-ev",
  "hand-ev": "/local-postflop-hand-ev",
} as const;

export type PostflopRoute = keyof typeof LOCAL_PATHS;

export function postflopUrl(route: PostflopRoute, params: URLSearchParams | Record<string, string>, base = (import.meta as any).env?.VITE_POSTFLOP_API): string {
  const query = new URLSearchParams(params).toString();
  const path = base ? `${String(base).replace(/\/$/, "")}/v1/postflop/${route}` : LOCAL_PATHS[route];
  return `${path}?${query}`;
}
