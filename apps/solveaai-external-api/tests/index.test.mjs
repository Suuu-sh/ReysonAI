import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const solutionId = "cash-6max-100bb-v1";
const artifact = {
  solutionId,
  stackBb: 100,
  solverVersion: "dcfr-v0.2-external-sampling",
  continuationModelVersion: "simple-v0.1",
  gameConfigHash: "fnv1a-config",
  createdAt: "2026-09-22T00:00:00Z",
  iterations: 1000,
  convergence: { iterations: 1000, averageStrategyDelta: 0.01, exploitability: 0.1 },
  validation: {
    status: "provisional",
    formatValid: true,
    fullComboCoverage: true,
    frequencyIntegrity: true,
    evIntegrity: true,
    exploitabilityStatus: "sampled_estimate",
    gtoVerified: false,
    notes: [],
  },
  nodes: [
    {
      nodeId: "root",
      nodeType: "root",
      actionHistory: { actions: [] },
      actingPosition: "UTG",
      potBb: 1.5,
      effectiveStackBb: 100,
      combos: [],
      handAggregates: [],
    },
    {
      nodeId: "btn-open",
      nodeType: "decision",
      actionHistory: { actions: [{ position: "BTN", action: { type: "raise", sizeBb: 2.5 } }] },
      actingPosition: "SB",
      potBb: 4,
      effectiveStackBb: 100,
      combos: [{ combo: "AsAh", hand: "AA", actions: [{ action: "fold", frequency: 1, evBb: 0 }] }],
      handAggregates: [{ hand: "AA", comboCount: 1, actions: { fold: 1 } }],
    },
    {
      nodeId: "bb-after-fold",
      nodeType: "decision",
      actionHistory: {
        actions: [
          { position: "BTN", action: { type: "raise", sizeBb: 2.5 } },
          { position: "SB", action: { type: "fold" } },
        ],
      },
      actingPosition: "BB",
      potBb: 4,
      effectiveStackBb: 100,
      combos: [{ combo: "AsAh", hand: "AA", actions: [{ action: "call", frequency: 1, evBb: 1 }] }],
      handAggregates: [{ hand: "AA", comboCount: 1, actions: { call: 1 } }],
    },
  ],
};

const manifest = {
  solutionId,
  stackBb: 100,
  solverVersion: artifact.solverVersion,
  continuationModelVersion: artifact.continuationModelVersion,
  gameConfigHash: artifact.gameConfigHash,
  iterations: artifact.iterations,
  createdAt: artifact.createdAt,
  convergence: artifact.convergence,
  validation: artifact.validation,
  artifact: `solutions/${solutionId}.json`,
  edge: {
    summary: `solutions/${solutionId}/summary.json`,
    nodesIndex: `solutions/${solutionId}/nodes/index.json`,
    nodesPrefix: `solutions/${solutionId}/nodes/`,
  },
};

function bucket() {
  const objects = new Map([
    ["manifest.json", JSON.stringify(manifest)],
    [`solutions/${solutionId}.json`, JSON.stringify(artifact)],
    [manifest.edge.summary, JSON.stringify(artifact)],
    [manifest.edge.nodesIndex, JSON.stringify(artifact.nodes.map((node) => ({
      nodeId: node.nodeId,
      nodeType: node.nodeType,
      actionHistory: node.actionHistory,
      actingPosition: node.actingPosition,
      potBb: node.potBb,
      effectiveStackBb: node.effectiveStackBb,
      hasStrategy: node.combos.length > 0,
    })))],
  ]);
  for (const node of artifact.nodes) {
    objects.set(`${manifest.edge.nodesPrefix}${node.nodeId}.json`, JSON.stringify(node));
  }
  return {
    async get(key) {
      const value = objects.get(key);
      return value === undefined ? null : { text: async () => value };
    },
  };
}

function env(overrides = {}) {
  return { SOLUTIONS: bucket(), ALLOWED_ORIGIN: "https://app.example.com", ...overrides };
}

async function request(path, init = {}, bindings = env()) {
  return worker.fetch(new Request(`https://api.example.com${path}`, init), bindings);
}

test("health is available without a solution request", async () => {
  const response = await request("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "solveaai-external-api" });
});

test("lists and reads the published R2 solution", async () => {
  const list = await request("/v1/preflop/solutions");
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), [{
    solutionId,
    stackBb: 100,
    solverVersion: artifact.solverVersion,
    continuationModelVersion: artifact.continuationModelVersion,
    gameConfigHash: artifact.gameConfigHash,
    createdAt: artifact.createdAt,
    iterations: 1000,
    convergence: artifact.convergence,
    validation: artifact.validation,
  }]);

  const response = await request(`/v1/preflop/solutions/${solutionId}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).nodes.length, 3);
});

test("resolves implicit folds at the edge without contacting local API", async () => {
  const response = await request("/v1/preflop/resolve", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://app.example.com",
    },
    body: JSON.stringify({
      solutionId,
      heroPosition: "BB",
      actions: [{ position: "BTN", action: "raise", sizeBb: 2.5 }],
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://app.example.com");
  const body = await response.json();
  assert.equal(body.node.nodeId, "bb-after-fold");
  assert.equal(body.node.actingPosition, "BB");
});

test("production edge API is read-only", async () => {
  const response = await request("/v1/preflop/jobs", { method: "POST", body: "{}" });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not found" });
});

test("rejects unpublished solutions and invalid resolve input", async () => {
  const missing = await request("/v1/preflop/solutions/not-published");
  assert.equal(missing.status, 404);

  const invalid = await request("/v1/preflop/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ solutionId, heroPosition: "BB", actions: [] }),
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "action history is empty" });
});
