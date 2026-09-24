import { findEstimatedSpot, listEstimatedDatasets, listEstimatedSpots } from "./estimated.js";

const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }), request, env);
      }

      const url = new URL(request.url);
      const response = await route(request, env, url);
      return withCors(response, request, env);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      return withCors(
        errorResponse(status, error instanceof Error ? error.message : "internal error"),
        request,
        env,
      );
    }
  },
};

async function route(request, env, url) {
  if (url.pathname === "/health" && request.method === "GET") {
    return json({ status: "ok", service: "solveaai-external-api" });
  }

  if (url.pathname.startsWith("/v1/estimated/")) {
    return routeEstimated(request, url.pathname);
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

// 推定レンジはWorkerに同梱したJSONから返すため、R2のmanifestを読まない。
function routeEstimated(request, path) {
  if (request.method !== "GET") return errorResponse(404, "not found");
  const cacheControl = "public, max-age=300, s-maxage=3600";
  if (path === "/v1/estimated/datasets") return json(listEstimatedDatasets(), { cacheControl });
  if (path === "/v1/estimated/spots") return json(listEstimatedSpots(), { cacheControl });
  const spotMatch = path.match(/^\/v1\/estimated\/datasets\/([^/]+)\/spots\/([^/]+)$/);
  if (spotMatch) {
    const spot = findEstimatedSpot(decodePathSegment(spotMatch[1]), decodePathSegment(spotMatch[2]));
    return spot ? json(spot, { cacheControl }) : errorResponse(404, "estimated spot not found");
  }
  return errorResponse(404, "not found");
}

async function readManifest(bucket) {
  if (!bucket || typeof bucket.get !== "function") {
    throw new Error("SOLUTIONS R2 binding is not configured");
  }
  const object = await bucket.get("manifest.json");
  if (!object) throw new HttpError(503, "solution manifest is not published");
  return parseJsonText(await object.text(), "invalid solution manifest");
}

async function readSolution(bucket, manifest, solutionId) {
  if (solutionId !== manifest.solutionId) {
    throw new HttpError(404, `solution not found: ${solutionId}`);
  }
  const artifact = String(manifest.artifact || "");
  if (!artifact.startsWith("solutions/") || artifact.includes("..")) {
    throw new Error("invalid solution artifact path");
  }
  return readJsonObject(bucket, artifact, 404, `solution not found: ${solutionId}`, "invalid solution artifact");
}

async function readPublishedData(bucket, manifest, solutionId = manifest.solutionId) {
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

  const summary = await readJsonObject(bucket, safeEdgePath(edge.summary, "summary"), 503, "solution summary is not published", "invalid solution summary");
  const nodesIndex = await readJsonObject(bucket, safeEdgePath(edge.nodesIndex, "nodes index"), 503, "solution node index is not published", "invalid solution node index");
  if (!Array.isArray(nodesIndex)) throw new Error("invalid solution node index");
  const nodesPrefix = safeEdgePath(edge.nodesPrefix, "nodes prefix");
  return {
    summary,
    nodesIndex,
    readNode: async (nodeId) => {
      if (nodeId.includes("/") || nodeId.includes("\\") || nodeId.includes("..")) {
        throw new HttpError(400, "invalid node id");
      }
      return readJsonObject(bucket, `${nodesPrefix}${nodeId}.json`, 404, `node not found: ${nodeId}`, "invalid solution node");
    },
  };
}

async function readJsonObject(bucket, key, missingStatus, missingMessage, invalidMessage) {
  const object = await bucket.get(key);
  if (!object) throw new HttpError(missingStatus, missingMessage);
  return parseJsonText(await object.text(), invalidMessage);
}

function safeEdgePath(value, label) {
  const path = String(value || "");
  if (!path.startsWith("solutions/") || path.includes("..")) {
    throw new Error(`invalid solution ${label} path`);
  }
  return path;
}

function manifestSummary(manifest) {
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

function nodeSummary(node) {
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

function resolveForPosition(solution, requestedActions, heroPosition) {
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

function findHistory(solution, history) {
  return solution.nodes.find((node) => historiesEqual(node.actionHistory?.actions ?? [], history));
}

function historiesEqual(left, right) {
  return left.length === right.length && left.every((item, index) => actionsEqual(item, right[index]));
}

function actionsEqual(left, right) {
  return left.position === right.position && actionEqual(left.action, right.action);
}

function actionEqual(left, right) {
  if (!left || !right || left.type !== right.type) return false;
  if (left.type !== "raise") return true;
  return Math.abs(Number(left.sizeBb) - Number(right.sizeBb)) < 0.0001;
}

function parseHistoryAction(value) {
  if (!value || typeof value !== "object") throw new HttpError(400, "invalid action");
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

function parsePosition(value, field = "heroPosition") {
  const position = requiredString(value, field).toUpperCase();
  if (!POSITIONS.includes(position)) throw new HttpError(400, `invalid position: ${value}`);
  return position;
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `${field} is required`);
  }
  return value;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stackFromSolutionId(solutionId) {
  const match = String(solutionId).match(/-(\d+(?:\.\d+)?)bb(?:-v\d+)?$/i);
  return match ? Number(match[1]) : null;
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "invalid URL path");
  }
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}

function parseJsonText(text, message) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(message);
  }
}

function json(value, options = {}) {
  const headers = new Headers(JSON_HEADERS);
  if (options.cacheControl) headers.set("cache-control", options.cacheControl);
  return new Response(JSON.stringify(value), { status: 200, headers });
}

function errorResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: JSON_HEADERS,
  });
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  const configuredOrigin = env.ALLOWED_ORIGIN || "*";
  const requestOrigin = request.headers.get("origin");
  const allowed = configuredOrigin === "*" || configuredOrigin === requestOrigin;
  if (allowed) headers.set("access-control-allow-origin", configuredOrigin === "*" ? "*" : requestOrigin);
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("vary", "Origin");
  return new Response(response.body, { status: response.status, headers });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
