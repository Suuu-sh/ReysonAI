import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadPostflopSpot, loadPostflopDatasets } from "../src/estimated/postflop-browser.ts";
import { postflopUrl } from "../src/estimated/postflop-api.ts";
import { postflopResponse } from "../scripts/postflop-ai/local-view.mjs";
import { useArtifactSource } from "../scripts/postflop-ai/inputs.mjs";
import { buildInputs, sha } from "../scripts/postflop-ai/browser-inputs.ts";
import { profileArtifactKey } from "../scripts/postflop-ai/candidate-source.ts";
import { referencePolicyFor } from "../scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { spotById } from "../scripts/postflop-ai/spots.ts";

const profile = "maniac", spotId = "BTN_open_BB_call", options = { opponentProfile: profile, opponentSeat: "oop" };
const opening = { id: "BTN_open", hero: "BTN", open_size_bb: 2.5, effective_stack_bb: 100,
  hands: [{ hand: "AA", open: 100, fold: 0, open_size_bb: 2.5 }] };
const response = { id: "BB_vs_BTN", hero: "BB", opener: "BTN", open_size_bb: 2.5, effective_stack_bb: 100,
  hands: [{ hand: "AA", call: 100, fold: 0, three_bet: 0, three_bet_size_bb: null }] };
const ranges = { "opening-ranges": { spots: [opening] }, "preflop-ranges": { spots: [response] },
  [`profiles/${profile}/villain/preflop-ranges`]: { spots: [response] },
  [`profiles/${profile}/villain/opening-ranges`]: { spots: [opening] } };
const inputs = buildInputs(spotId, ranges, options);
function artifacts() {
  const output = {};
  for (const role of ["villain", "exploit"]) {
    const policy = referencePolicyFor(inputs.spot.tree);
    const metadata = { source_hash: inputs.fingerprint, structure_hash: inputs.structure_hash,
      policy_hash: sha(policy), config_version: inputs.config.version, spot: spotId, tree: inputs.spot.tree, profile, role };
    output[profileArtifactKey(inputs.spot, "candidate", profile, role)] = { policy, metadata };
    const later = referenceLaterPolicy();
    output[profileArtifactKey(inputs.spot, "laterCandidate", profile, role)] = { policy: later,
      metadata: { ...metadata, policy_hash: sha(later), flop_policy_hash: metadata.policy_hash } };
  }
  return output;
}
function withSource(saved, run) {
  const previous = useArtifactSource({ ranges, profileArtifact: key => saved[key] ?? null,
    artifact() { throw new Error("Standard policy fallback is forbidden"); } });
  try { return run(); } finally { useArtifactSource(previous); }
}
const params = () => new URLSearchParams({ spot: spotId, ...options });
const envelope = (id, pair = true) => ({ kind: "ai_estimate_not_gto", spot: { id, tree: "oop_checks" },
  candidate: pair ? { villain: { metadata: {}, policy: {} }, exploit: { metadata: {}, policy: {} } }
    : { metadata: {}, policy: {} },
  laterCandidate: pair ? { villain: { metadata: {}, policy: {} }, exploit: { metadata: {}, policy: {} } } : null,
  report: pair ? null : {} });

// Fixture policies remain entirely in memory; these tests never author local artifacts.
test("read-only middleware reads the exact villain/exploit flop and later keys", () => {
  const saved = artifacts();
  withSource(saved, () => {
    const result = postflopResponse("/local-postflop-spot", params());
    assert.equal(result.status, 200);
    for (const role of ["villain", "exploit"]) {
      assert.deepEqual(result.body.candidate.profileCandidates[role], saved[profileArtifactKey(inputs.spot, "candidate", profile, role)]);
      assert.deepEqual(result.body.laterCandidate.profileCandidates[role], saved[profileArtifactKey(inputs.spot, "laterCandidate", profile, role)]);
    }
    assert.equal(result.body.report, null);
    assert.equal(result.body.audit_scope, "structure_only_unpublished");
  });
});

test("missing profile flop role is not_generated HTTP 404, without standard fallback", () => {
  for (const role of ["villain", "exploit"]) {
    const saved = artifacts();
    delete saved[profileArtifactKey(inputs.spot, "candidate", profile, role)];
    withSource(saved, () => {
      const result = postflopResponse("/local-postflop-spot", params());
      assert.equal(result.status, 404);
      assert.equal(result.body.code, "PROFILE_POLICY_MISSING");
      assert.equal(result.body.state, "not_generated");
      assert.match(result.body.error, new RegExp(role));
    });
  }
});

test("available flop stays readable when a later role is missing, but later route fails closed", () => {
  const saved = artifacts();
  delete saved[profileArtifactKey(inputs.spot, "laterCandidate", profile, "exploit")];
  withSource(saved, () => {
    const result = postflopResponse("/local-postflop-spot", params());
    assert.equal(result.status, 200);
    assert.ok(result.body.candidate.profileCandidates);
    assert.equal(result.body.laterCandidate, null);
    assert.equal(result.body.laterPolicyError.code, "PROFILE_POLICY_MISSING");
    assert.equal(result.body.laterPolicyError.state, "not_generated");
    const later = postflopResponse("/local-postflop-later", params());
    assert.equal(later.status, 404);
    assert.equal(later.body.code, "PROFILE_POLICY_MISSING");
  });
});

test("stale later role remains an error rather than an optional missing policy", () => {
  const saved = artifacts();
  saved[profileArtifactKey(inputs.spot, "laterCandidate", profile, "exploit")].metadata.flop_policy_hash = "wrong-flop";
  withSource(saved, () => {
    const result = postflopResponse("/local-postflop-spot", params());
    assert.equal(result.status, 409);
    assert.match(result.body.error, /stale/);
    assert.equal(result.body.state, undefined);
  });
});

test("published profile URL fails before contacting the standard-only D1 route", () => {
  assert.throws(() => postflopUrl("spot", { spot: spotId, ...options }, "https://api.test"),
    error => error.code === "PROFILE_POLICY_MISSING" && error.state === "not_generated");
  assert.equal(postflopUrl("spot", { spot: spotId }, "https://api.test"), `https://api.test/v1/postflop/spot?spot=${spotId}`);
});

test("browser passes profile/seat/table options, accepts role pairs, and isolates its caches", async () => {
  const original = globalThis.fetch, id = "profile-browser-cache", calls = [];
  globalThis.fetch = async url => {
    const query = new URL(String(url), "http://localhost").searchParams;
    calls.push(Object.fromEntries(query));
    return { ok: true, json: async () => envelope(id, query.has("opponentProfile")) };
  };
  try {
    const one = await loadPostflopSpot(id, undefined, options);
    assert.equal(await loadPostflopSpot(id, undefined, options), one);
    await loadPostflopSpot(id, undefined, { ...options, opponentSeat: "ip" });
    await loadPostflopSpot(id, undefined, { ...options, opponentProfile: "nit" });
    await loadPostflopSpot(id, undefined, { ...options, tableProfile: { call: "high" } });
    const standard = await loadPostflopSpot(id);
    assert.notEqual(one, standard);
    assert.equal(calls.length, 5);
    assert.deepEqual(JSON.parse(calls[0].tableProfile), { call: "normal", three_bet: "normal" });
    assert.equal(calls[1].opponentSeat, "ip");
    assert.equal(calls[2].opponentProfile, "nit");
    assert.equal(calls[4].opponentProfile, undefined);
    await loadPostflopSpot(id, undefined, { tableProfile: { call: "high" } });
    assert.equal(calls.at(-1).opponentProfile, undefined);
    assert.equal(calls.at(-1).tableProfile, undefined, "table-only input uses standard saved artifacts");
  } finally { globalThis.fetch = original; }
});

test("browser propagates missing-policy HTTP code/state and retries rejected entries", async () => {
  const original = globalThis.fetch, id = "profile-browser-retry";
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: false, status: 404,
    json: async () => ({ error: "not authored", code: "PROFILE_POLICY_MISSING", state: "not_generated" }) }; };
  try {
    for (let n = 0; n < 2; n++) await assert.rejects(loadPostflopSpot(id, undefined, options),
      error => error.code === "PROFILE_POLICY_MISSING" && error.state === "not_generated");
    assert.equal(calls, 2);
    globalThis.fetch = async () => ({ ok: true, json: async () => envelope(id) });
    assert.ok(await loadPostflopSpot(id, undefined, options));
  } finally { globalThis.fetch = original; }
});

test("browser never accepts a standard response for a profile and retries partial later entries", async () => {
  const original = globalThis.fetch, id = "profile-browser-no-fallback";
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => envelope(id, false) }; };
  try {
    await assert.rejects(loadPostflopSpot(id, undefined, options), error => error.code === "PROFILE_POLICY_MISSING");
    globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ ...envelope(id), laterCandidate: null,
      laterPolicyError: { error: "not authored", code: "PROFILE_POLICY_MISSING", state: "not_generated" } }) }; };
    for (let n = 0; n < 2; n++) assert.equal((await loadPostflopSpot(id, undefined, options)).laterCandidate, null);
    assert.equal(calls, 3);
  } finally { globalThis.fetch = original; }
});

test("one aborted profile consumer does not cancel a shared request or another consumer", async () => {
  const original = globalThis.fetch, id = "profile-browser-abort", first = new AbortController(), second = new AbortController();
  let finish, calls = 0;
  globalThis.fetch = (url, fetchOptions) => { calls++; assert.notEqual(fetchOptions.signal, first.signal);
    return new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => envelope(id) }); }); };
  try {
    const cancelled = loadPostflopSpot(id, first.signal, options), kept = loadPostflopSpot(id, second.signal, options);
    await Promise.resolve();
    first.abort();
    await assert.rejects(cancelled, { name: "AbortError" });
    finish();
    assert.equal((await kept).spot.id, id);
    assert.equal(calls, 1);
    await assert.rejects(loadPostflopSpot(id, first.signal, options), { name: "AbortError" });
  } finally { globalThis.fetch = original; }
});

test("browser loads only the selected opponent's real preflop factor files", async () => {
  const spot = spotById(spotId);
  const oop = await loadPostflopDatasets(spot, undefined, { opponentProfile: "nit", opponentSeat: "oop" });
  assert.deepEqual(Object.keys(oop).sort(), ["opening-ranges", "preflop-ranges", "profiles/nit/villain/preflop-ranges"]);
  const ip = await loadPostflopDatasets(spot, undefined, { opponentProfile: "nit", opponentSeat: "ip" });
  assert.deepEqual(Object.keys(ip).sort(), ["opening-ranges", "preflop-ranges", "profiles/nit/villain/opening-ranges"]);
  const persisted = JSON.parse(await readFile(new URL("../src/estimated/profiles/nit/villain/preflop-ranges.json", import.meta.url), "utf8"));
  assert.deepEqual(oop["profiles/nit/villain/preflop-ranges"], persisted);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadPostflopDatasets(spot, controller.signal, options), { name: "AbortError" });
});
