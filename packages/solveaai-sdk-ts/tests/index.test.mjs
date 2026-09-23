import assert from "node:assert/strict";
import test from "node:test";

import { SolveaAIApiError, SolveaAIClient } from "../dist/index.js";

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test("createJob sends an optional solutionId and returns the typed response", async () => {
  const calls = [];
  const expected = {
    jobId: "job-123",
    solutionId: "cash-6max-100bb-v1",
    status: "pending",
    created: true,
    deduplicated: false,
    solutionAvailable: false,
    createdAt: 1,
    startedAt: null,
    finishedAt: null,
    workerId: null,
    attempts: 0,
    error: null,
  };
  const client = new SolveaAIClient({
    baseUrl: "http://localhost:3000/",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(expected);
    },
  });

  const actual = await client.preflop.createJob({
    solutionId: "cash-6max-100bb-v1",
  });

  assert.deepEqual(actual, expected);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:3000/v1/preflop/jobs");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    solutionId: "cash-6max-100bb-v1",
  });
});

test("createJob omits solutionId when using the configured default", async () => {
  let request;
  const client = new SolveaAIClient({
    baseUrl: "http://localhost:3000",
    fetch: async (url, init) => {
      request = { url, init };
      return jsonResponse({ status: "pending" });
    },
  });

  await client.preflop.createJob();

  assert.equal(request.url, "http://localhost:3000/v1/preflop/jobs");
  assert.deepEqual(JSON.parse(request.init.body), {});
});

test("getJob URL-encodes the job id", async () => {
  let requestedUrl;
  const client = new SolveaAIClient({
    baseUrl: "http://localhost:3000",
    fetch: async (url) => {
      requestedUrl = url;
      return jsonResponse({ status: "running" });
    },
  });

  await client.preflop.getJob("job/with spaces");

  assert.equal(
    requestedUrl,
    "http://localhost:3000/v1/preflop/jobs/job%2Fwith%20spaces",
  );
});

test("API errors preserve the HTTP status and response body", async () => {
  const client = new SolveaAIClient({
    baseUrl: "http://localhost:3000",
    fetch: async () =>
      jsonResponse({ error: "job not found" }, { ok: false, status: 404 }),
  });

  await assert.rejects(
    client.preflop.getJob("missing"),
    (error) => {
      assert.ok(error instanceof SolveaAIApiError);
      assert.equal(error.status, 404);
      assert.equal(error.body, '{"error":"job not found"}');
      return true;
    },
  );
});
