import { routePostflop, type D1Database } from "./postflop.ts";

const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"] as const;

type Position = (typeof POSITIONS)[number];
type PokerAction =
  | { type: "fold" | "call" | "check" | "all_in" }
  | { type: "raise"; sizeBb: number };
type HistoryAction = { position: Position; action: PokerAction };
type SolutionNode = {
  nodeId: string;
  nodeType: string;
  actionHistory?: { actions?: HistoryAction[] };
  actingPosition?: Position | null;
  potBb?: number;
  effectiveStackBb?: number;
  combos?: unknown[];
  handAggregates?: Array<{ hand: string }>;
  [key: string]: unknown;
};
type Solution = {
  solutionId: string;
  nodes: SolutionNode[];
  [key: string]: unknown;
};
type SolutionSummary = {
  solutionId: string;
  stackBb: number | null;
  solverVersion: unknown;
  continuationModelVersion: unknown;
  gameConfigHash: unknown;
  createdAt: unknown;
  iterations: unknown;
  convergence: unknown;
  validation: unknown;
};
type NodeSummary = Pick<SolutionNode, "nodeId" | "nodeType" | "actionHistory" | "actingPosition" | "potBb" | "effectiveStackBb"> & {
  hasStrategy: boolean;
};
type EdgeManifest = { summary: string; nodesIndex: string; nodesPrefix: string };
type Manifest = {
  solutionId: string;
  artifact?: string;
  stackBb?: unknown;
  solverVersion?: unknown;
  continuationModelVersion?: unknown;
  gameConfigHash?: unknown;
  createdAt?: unknown;
  iterations?: unknown;
  convergence?: unknown;
  validation?: unknown;
  edge?: EdgeManifest;
};
type R2Bucket = { get(key: string): Promise<{ text(): Promise<string> } | null> };
type Env = { SOLUTIONS: R2Bucket; POSTFLOP_DB?: D1Database; ALLOWED_ORIGIN?: string };
type PublishedData = {
  summary: Solution;
  nodesIndex: NodeSummary[];
  readNode(nodeId: string): Promise<SolutionNode>;
};
type JsonRecord = Record<string, unknown>;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }), request, env);
      }

      const url = new URL(request.url);
      const response = await route(request, env, url);
      return withCors(response, request, env);
    } catch (error: unknown) {
      const status = error instanceof HttpError ? error.status : 500;
      return withCors(
        errorResponse(status, error instanceof Error ? error.message : "internal error"),
        request,
        env,
      );
    }
  },
};

async function route(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === "/health" && request.method === "GET") {
    return json({ status: "ok", service: "solveaai-edge-api" });
  }

  if (url.pathname.startsWith("/v1/postflop/") && request.method === "GET") {
    const { status, body } = await routePostflop(env.POSTFLOP_DB, url.pathname, url.searchParams);
    if (status !== 200) return errorResponse(status, String((body as JsonRecord).error ?? "error"));
    return json(body, { cacheControl: "public, max-age=300, s-maxage=300" });
  }

  if (!url.pathname.startsWith("/v1/preflop/")) {
    return errorResponse(404, "not found");
  }

  // Generation remains a local-only capability. Keep this rejection before
  // reading R2 so the production contract is explicit even before publication.
  if (url.pathname.startsWith("/v1/preflop/jobs")) {
    return errorResponse(404, "not found");
  }

  const manifest = await readManifest(env.SOLUTIONS);
  const path = url.pathname;

  if (path === "/v1/preflop/solutions" && request.method === "GET") {
    const published = await readPublishedData(env.SOLUTIONS, manifest);
    return json([manifestSummary(published.summary)]);
  }

  const solutionMatch = path.match(/^\/v1\/preflop\/solutions\/([^/]+)$/);
  if (solutionMatch && request.method === "GET") {
    const solutionId = decodePathSegment(solutionMatch[1]);
    return json(await readSolution(env.SOLUTIONS, manifest, solutionId), {
      cacheControl: "public, max-age=300, s-maxage=3600",
    });
  }

  const nodesMatch = path.match(/^\/v1\/preflop\/solutions\/([^/]+)\/nodes$/);
  if (nodesMatch && request.method === "GET") {
    const solutionId = decodePathSegment(nodesMatch[1]);
    const published = await readPublishedData(env.SOLUTIONS, manifest, solutionId);
    return json(published.nodesIndex, {
      cacheControl: "public, max-age=300, s-maxage=3600",
    });
  }

  const scopedNodeMatch = path.match(/^\/v1\/preflop\/solutions\/([^/]+)\/nodes\/([^/]+)$/);
  if (scopedNodeMatch && request.method === "GET") {
    const solutionId = decodePathSegment(scopedNodeMatch[1]);
    const nodeId = decodePathSegment(scopedNodeMatch[2]);
    const published = await readPublishedData(env.SOLUTIONS, manifest, solutionId);
    if (!published.nodesIndex.some((item) => item.nodeId === nodeId)) {
      return errorResponse(404, "node not found in solution");
    }
    return json(await published.readNode(nodeId), {
      cacheControl: "public, max-age=300, s-maxage=3600",
    });
  }

  const nodeMatch = path.match(/^\/v1\/preflop\/nodes\/([^/]+)$/);
  if (nodeMatch && request.method === "GET") {
    const nodeId = decodePathSegment(nodeMatch[1]);
    const published = await readPublishedData(env.SOLUTIONS, manifest);
    if (!published.nodesIndex.some((item) => item.nodeId === nodeId)) {
      return errorResponse(404, "node not found");
    }
    return json(await published.readNode(nodeId), {
      cacheControl: "public, max-age=300, s-maxage=3600",
    });
  }

  const handMatch = path.match(/^\/v1\/preflop\/nodes\/([^/]+)\/hands\/([^/]+)$/);
  if (handMatch && request.method === "GET") {
    const nodeId = decodePathSegment(handMatch[1]);
    const hand = decodePathSegment(handMatch[2]);
    const published = await readPublishedData(env.SOLUTIONS, manifest);
    if (!published.nodesIndex.some((item) => item.nodeId === nodeId)) {
      return errorResponse(404, "node not found");
    }
    const node = await published.readNode(nodeId);
    const aggregate = node?.handAggregates?.find((item) => item.hand === hand);
    return aggregate
      ? json(aggregate, { cacheControl: "public, max-age=300, s-maxage=3600" })
      : errorResponse(404, `hand ${hand} not found at node ${nodeId}`);
  }

  if (path === "/v1/preflop/resolve" && request.method === "POST") {
    const requestBody = await parseJson(request);
    if (!isRecord(requestBody)) throw new HttpError(400, "invalid JSON body");
    const solutionId = requiredString(requestBody.solutionId, "solutionId");
    const heroPosition = parsePosition(requestBody.heroPosition);
    const actions = Array.isArray(requestBody.actions)
      ? requestBody.actions.map(parseHistoryAction)
      : (() => { throw new HttpError(400, "actions must be an array"); })();
    const published = await readPublishedData(env.SOLUTIONS, manifest, solutionId);
    const descriptor = resolveForPosition({ nodes: published.nodesIndex }, actions, heroPosition);
    const node = await published.readNode(descriptor.nodeId);
    return json({ solutionId, heroPosition, node }, {
      cacheControl: "public, max-age=60, s-maxage=300",
    });
  }

  return errorResponse(404, "not found");
}

async function readManifest(bucket: R2Bucket | undefined): Promise<Manifest> {
  if (!bucket || typeof bucket.get !== "function") {
    throw new Error("SOLUTIONS R2 binding is not configured");
  }
  const object = await bucket.get("manifest.json");
  if (!object) throw new HttpError(503, "solution manifest is not published");
  return parseJsonText<Manifest>(await object.text(), "invalid solution manifest");
}

async function readSolution(bucket: R2Bucket, manifest: Manifest, solutionId: string): Promise<Solution> {
  if (solutionId !== manifest.solutionId) {
    throw new HttpError(404, `solution not found: ${solutionId}`);
  }
  const artifact = String(manifest.artifact || "");
  if (!artifact.startsWith("solutions/") || artifact.includes("..")) {
    throw new Error("invalid solution artifact path");
  }
  return readJsonObject<Solution>(bucket, artifact, 404, `solution not found: ${solutionId}`, "invalid solution artifact");
}

async function readPublishedData(bucket: R2Bucket, manifest: Manifest, solutionId = manifest.solutionId): Promise<PublishedData> {
  if (solutionId !== manifest.solutionId) {
    throw new HttpError(404, `solution not found: ${solutionId}`);
  }
  const edge = manifest.edge;
  if (!edge) {
    const solution = await readSolution(bucket, manifest, solutionId);
    return {
      summary: solution,
      nodesIndex: solution.nodes.map(nodeSummary),
      readNode: async (nodeId) => {
        const node = solution.nodes.find((item) => item.nodeId === nodeId);
        if (!node) throw new HttpError(404, `node not found: ${nodeId}`);
        return node;
      },
    };
  }

  const summary = await readJsonObject<Solution>(bucket, safeEdgePath(edge.summary, "summary"), 503, "solution summary is not published", "invalid solution summary");
  const nodesIndex = await readJsonObject<NodeSummary[]>(bucket, safeEdgePath(edge.nodesIndex, "nodes index"), 503, "solution node index is not published", "invalid solution node index");
  if (!Array.isArray(nodesIndex)) throw new Error("invalid solution node index");
  const nodesPrefix = safeEdgePath(edge.nodesPrefix, "nodes prefix");
  return {
    summary,
    nodesIndex,
    readNode: async (nodeId) => {
      if (nodeId.includes("/") || nodeId.includes("\\") || nodeId.includes("..")) {
        throw new HttpError(400, "invalid node id");
      }
      return readJsonObject<SolutionNode>(bucket, `${nodesPrefix}${nodeId}.json`, 404, `node not found: ${nodeId}`, "invalid solution node");
    },
  };
}

async function readJsonObject<T>(bucket: R2Bucket, key: string, missingStatus: number, missingMessage: string, invalidMessage: string): Promise<T> {
  const object = await bucket.get(key);
  if (!object) throw new HttpError(missingStatus, missingMessage);
  return parseJsonText<T>(await object.text(), invalidMessage);
}

function safeEdgePath(value: unknown, label: string): string {
  const path = String(value || "");
  if (!path.startsWith("solutions/") || path.includes("..")) {
    throw new Error(`invalid solution ${label} path`);
  }
  return path;
}

function manifestSummary(manifest: Solution): SolutionSummary {
  return {
    solutionId: manifest.solutionId,
    stackBb: finiteNumber(manifest.stackBb) ?? stackFromSolutionId(manifest.solutionId),
    solverVersion: manifest.solverVersion,
    continuationModelVersion: manifest.continuationModelVersion,
    gameConfigHash: manifest.gameConfigHash,
    createdAt: manifest.createdAt,
    iterations: manifest.iterations,
    convergence: manifest.convergence,
    validation: manifest.validation,
  };
}

function nodeSummary(node: SolutionNode): NodeSummary {
  return {
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    actionHistory: node.actionHistory,
    actingPosition: node.actingPosition,
    potBb: node.potBb,
    effectiveStackBb: node.effectiveStackBb,
    hasStrategy: Array.isArray(node.combos) && node.combos.length > 0,
  };
}

function resolveForPosition(solution: { nodes: SolutionNode[] }, requestedActions: HistoryAction[], heroPosition: Position): SolutionNode {
  if (requestedActions.length === 0) {
    throw new HttpError(400, "action history is empty");
  }

  let history = [requestedActions[0]];
  let current = findHistory(solution, history);
  if (!current) throw new HttpError(400, "unknown opener history");

  for (const requested of requestedActions.slice(1)) {
    while (current.actingPosition && current.actingPosition !== requested.position) {
      history = [...history, { position: current.actingPosition, action: { type: "fold" } }];
      current = findHistory(solution, history);
      if (!current) throw new HttpError(400, `cannot advance to position ${requested.position}`);
    }
    history = [...history, requested];
    current = findHistory(solution, history);
    if (!current) throw new HttpError(400, "action unavailable at current node");
  }

  while (current.actingPosition && current.actingPosition !== heroPosition) {
    history = [...history, { position: current.actingPosition, action: { type: "fold" } }];
    current = findHistory(solution, history);
    if (!current) throw new HttpError(400, `cannot advance to hero position ${heroPosition}`);
  }
  if (current.actingPosition !== heroPosition) {
    throw new HttpError(400, `hero position ${heroPosition} is not acting at this history`);
  }
  return current;
}

function findHistory(solution: { nodes: SolutionNode[] }, history: HistoryAction[]): SolutionNode | undefined {
  return solution.nodes.find((node) => historiesEqual(node.actionHistory?.actions ?? [], history));
}

function historiesEqual(left: HistoryAction[], right: HistoryAction[]): boolean {
  return left.length === right.length && left.every((item, index) => actionsEqual(item, right[index]));
}

function actionsEqual(left: HistoryAction, right: HistoryAction): boolean {
  return left.position === right.position && actionEqual(left.action, right.action);
}

function actionEqual(left: PokerAction, right: PokerAction): boolean {
  if (!left || !right || left.type !== right.type) return false;
  if (left.type !== "raise" || right.type !== "raise") return true;
  return Math.abs(Number(left.sizeBb) - Number(right.sizeBb)) < 0.0001;
}

function parseHistoryAction(value: unknown): HistoryAction {
  if (!isRecord(value)) throw new HttpError(400, "invalid action");
  const position = parsePosition(value.position, "position");
  const actionName = requiredString(value.action, "action").toLowerCase();
  switch (actionName) {
    case "fold":
    case "call":
    case "check":
      return { position, action: { type: actionName } };
    case "all_in":
    case "allin":
      return { position, action: { type: "all_in" } };
    case "raise": {
      const sizeBb = finiteNumber(value.sizeBb);
      if (sizeBb === null) throw new HttpError(400, "raise requires finite sizeBb");
      return { position, action: { type: "raise", sizeBb } };
    }
    default:
      throw new HttpError(400, `invalid action: ${value.action}`);
  }
}

function parsePosition(value: unknown, field = "heroPosition"): Position {
  const position = requiredString(value, field).toUpperCase();
  if (!POSITIONS.includes(position as Position)) throw new HttpError(400, `invalid position: ${String(value)}`);
  return position as Position;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${field} is required`);
  }
  return value;
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stackFromSolutionId(solutionId: string): number | null {
  const match = String(solutionId).match(/-(\d+(?:\.\d+)?)bb(?:-v\d+)?$/i);
  return match ? Number(match[1]) : null;
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "invalid URL path");
  }
}

async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}

function parseJsonText<T>(text: string, message: string): T {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(message);
  }
}

function json(value: unknown, options: { cacheControl?: string } = {}): Response {
  const headers = new Headers(JSON_HEADERS);
  if (options.cacheControl) headers.set("cache-control", options.cacheControl);
  return new Response(JSON.stringify(value), { status: 200, headers });
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: JSON_HEADERS,
  });
}

function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  const configuredOrigin = env.ALLOWED_ORIGIN || "*";
  const requestOrigin = request.headers.get("origin");
  const allowed = configuredOrigin === "*" || configuredOrigin === requestOrigin;
  if (allowed) headers.set("access-control-allow-origin", configuredOrigin === "*" ? "*" : requestOrigin ?? configuredOrigin);
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("vary", "Origin");
  return new Response(response.body, { status: response.status, headers });
}

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
