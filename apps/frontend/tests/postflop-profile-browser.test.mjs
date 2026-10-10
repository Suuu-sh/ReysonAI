import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadPostflopSpot, loadPostflopDatasets } from "../src/estimated/postflop-browser.ts";
import { postflopUrl } from "../src/estimated/postflop-api.ts";
import { postflopResponse } from "../scripts/postflop-ai/local-view.mjs";
import { useArtifactSource } from "../scripts/postflop-ai/inputs.mjs";
import { buildInputs, sha } from "../scripts/postflop-ai/browser-inputs.ts";
import { profileArtifactKey, resolveFlopCandidate, resolveLaterCandidate } from "../scripts/postflop-ai/candidate-source.ts";
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

test("published profile URL uses its dedicated API and never the standard policy route", () => {
  assert.throws(() => postflopUrl("spot", { spot: spotId, ...options }, "https://api.test"),
    error => error.code === "PROFILE_POLICY_MISSING" && error.state === "not_generated");
  assert.equal(postflopUrl("profile-policy", { profile, spot: spotId, opponentSeat: "oop", role: "villain", stage: "later" }, "https://api.test/"),
    `https://api.test/v1/postflop/profile-policy?profile=${profile}&spot=${spotId}&opponentSeat=oop&role=villain&stage=later`);
  assert.throws(() => postflopUrl("profile-policy", { profile, spot: spotId }, ""), /requires a published API base/);
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

test("profile source identity binds the selected seat and survives table-only adjustments", async () => {
  const spot = spotById(spotId);
  const oopRanges = await loadPostflopDatasets(spot, undefined, { opponentProfile: profile, opponentSeat: "oop" });
  const ipRanges = await loadPostflopDatasets(spot, undefined, { opponentProfile: profile, opponentSeat: "ip" });
  const oopInputs = buildInputs(spotId, oopRanges, { opponentProfile: profile, opponentSeat: "oop" });
  const ipInputs = buildInputs(spotId, ipRanges, { opponentProfile: profile, opponentSeat: "ip" });
  assert.equal(oopInputs.profileSourceHash, oopInputs.fingerprint);
  assert.equal(ipInputs.profileSourceHash, ipInputs.fingerprint);
  assert.notEqual(oopInputs.profileSourceHash, ipInputs.profileSourceHash);
  assert.equal(buildInputs(spotId, oopRanges, { ...options, tableProfile: { call: "high" } }).profileSourceHash,
    oopInputs.profileSourceHash, "table adjustments do not change which opponent range the policy describes");

  const policy = referencePolicyFor(spot.tree), pair = {};
  for (const role of ["villain", "exploit"]) pair[role] = { policy, metadata: {
    source_hash: oopInputs.profileSourceHash, structure_hash: oopInputs.structure_hash,
    policy_hash: sha(policy), profile, role, spot: spotId, tree: spot.tree,
  } };
  assert.throws(() => resolveFlopCandidate(ipInputs, pair), error =>
    error.code === "PROFILE_POLICY_MISSING" && error.state === "not_generated");
  const wrongSeat = structuredClone(pair);
  wrongSeat.villain.metadata.opponent_seat = "ip";
  assert.throws(() => resolveFlopCandidate(oopInputs, wrongSeat), error =>
    error.code === "PROFILE_POLICY_MISSING" && error.state === "not_generated");
});

// Production fixtures are Candidate metadata plus raw policy. No artifacts are authored.
function publishedEnvelope(url) {
  const query = new URL(String(url)).searchParams;
  const selectedProfile = query.get("profile"), opponentSeat = query.get("opponentSeat"), role = query.get("role"), stage = query.get("stage");
  const candidate = artifacts()[profileArtifactKey(inputs.spot, stage === "flop" ? "candidate" : "laterCandidate", profile, role)];
  return { kind: "ai_estimate_not_gto", profile: selectedProfile, spot: query.get("spot"), opponentSeat, role, stage,
    metadata: { ...candidate.metadata, profile: selectedProfile, opponent_seat: opponentSeat }, policy: candidate.policy, publishedAt: "2026-10-08T00:00:00Z" };
}
const productionResponse = url => ({ ok: true, status: 200, json: async () => publishedEnvelope(url) });
const missingResponse = () => ({ ok: false, status: 404,
  json: async () => ({ error: "Profile policy not published", code: "PROFILE_POLICY_MISSING" }) });

test("production loads four role/stage policies for every profile without standard artifacts", async () => {
  const original = globalThis.fetch;
  try {
    for (const opponentProfile of ["nit", "station", "lag", "maniac"]) {
      const calls = [], base = `https://profile-pairs-${opponentProfile}.test`;
      globalThis.fetch = async (url, fetchOptions) => {
        const parsed = new URL(String(url));
        assert.equal(parsed.pathname, "/v1/postflop/profile-policy");
        assert.ok(fetchOptions.signal instanceof AbortSignal);
        calls.push(Object.fromEntries(parsed.searchParams));
        return productionResponse(url);
      };
      const source = await loadPostflopSpot(spotId, undefined, { ...options, opponentProfile }, base);
      assert.equal(source.spot, spotById(spotId));
      assert.equal(source.report, null);
      assert.equal(source.laterPolicyError, undefined);
      assert.deepEqual(calls.map(({ role, stage }) => `${stage}/${role}`).sort(),
        ["flop/exploit", "flop/villain", "later/exploit", "later/villain"]);
      for (const query of calls) assert.deepEqual(Object.keys(query).sort(), ["opponentSeat", "profile", "role", "spot", "stage"]);
      for (const pair of [source.candidate, source.laterCandidate]) for (const role of ["villain", "exploit"]) {
        assert.equal(pair[role].metadata.profile, opponentProfile);
        assert.equal(pair[role].metadata.role, role);
      }
      assert.equal(await loadPostflopSpot(spotId, undefined, { ...options, opponentProfile }, base), source);
      assert.equal(calls.length, 4);
      if (opponentProfile === profile) {
        const flop = resolveFlopCandidate(inputs, source.candidate);
        assert.ok(resolveLaterCandidate(inputs, source.laterCandidate, flop));
      }
    }
  } finally { globalThis.fetch = original; }
});

test("production missing flop maps to preparing and retries without standard fallback", async () => {
  const original = globalThis.fetch;
  try {
    for (const role of ["villain", "exploit"]) {
      const base = `https://missing-flop-${role}.test`, calls = [];
      globalThis.fetch = async url => {
        const parsed = new URL(String(url)); calls.push(parsed);
        assert.equal(parsed.pathname, "/v1/postflop/profile-policy");
        return parsed.searchParams.get("role") === role ? missingResponse() : productionResponse(url);
      };
      for (let n = 0; n < 2; n++) await assert.rejects(loadPostflopSpot(spotId, undefined, options, base),
        error => error.code === "PROFILE_POLICY_MISSING" && error.state === "not_generated");
      assert.equal(calls.length, 4);
      assert.ok(calls.every(url => url.searchParams.get("stage") === "flop"));
      globalThis.fetch = async url => productionResponse(url);
      assert.ok((await loadPostflopSpot(spotId, undefined, options, base)).laterCandidate);
    }
  } finally { globalThis.fetch = original; }
});

test("production missing later preserves flop, exposes laterPolicyError and retries", async () => {
  const original = globalThis.fetch;
  try {
    for (const role of ["villain", "exploit"]) {
      const base = `https://missing-later-${role}.test`;
      let calls = 0;
      globalThis.fetch = async url => {
        const parsed = new URL(String(url)); calls++;
        assert.equal(parsed.pathname, "/v1/postflop/profile-policy");
        return parsed.searchParams.get("role") === role && parsed.searchParams.get("stage") === "later"
          ? missingResponse() : productionResponse(url);
      };
      for (let n = 0; n < 2; n++) {
        const source = await loadPostflopSpot(spotId, undefined, options, base);
        assert.ok(source.candidate.villain && source.candidate.exploit);
        assert.equal(source.laterCandidate, null);
        assert.equal(source.laterPolicyError.code, "PROFILE_POLICY_MISSING");
        assert.equal(source.laterPolicyError.state, "not_generated");
        assert.throws(() => resolveLaterCandidate(inputs, source.laterCandidate, resolveFlopCandidate(inputs, source.candidate)),
          error => error.code === "PROFILE_POLICY_MISSING");
      }
      assert.equal(calls, 8);
      globalThis.fetch = async url => productionResponse(url);
      assert.ok((await loadPostflopSpot(spotId, undefined, options, base)).laterCandidate);
    }
  } finally { globalThis.fetch = original; }
});

test("production rejects standard, wrong identity and conflicting metadata responses", async () => {
  const original = globalThis.fetch;
  const invalid = [
    body => ({ ...body, kind: "solver_gto" }),
    body => envelope(body.spot, false),
    body => ({ ...body, profile: "standard" }),
    body => ({ ...body, profile: "nit" }),
    body => ({ ...body, spot: "SB_open_BB_call" }),
    body => ({ ...body, role: body.role === "villain" ? "exploit" : "villain" }),
    body => ({ ...body, stage: body.stage === "flop" ? "later" : "flop" }),
    body => ({ ...body, metadata: { ...body.metadata, profile: "standard" } }),
    body => ({ ...body, metadata: { ...body.metadata, role: "standard" } }),
    body => ({ ...body, metadata: { ...body.metadata, spot: "wrong" } }),
    body => ({ ...body, metadata: { ...body.metadata, tree: "oop_leads" } }),
    body => ({ ...body, metadata: { ...body.metadata, stage: "wrong" } }),
    body => ({ ...body, metadata: { ...body.metadata, profile: undefined } }),
    body => ({ ...body, policy: { ...body.policy, kind: "gto" } }),
    body => ({ ...body, policy: {} }),
  ];
  try {
    for (const stage of ["flop", "later"]) for (const [index, alter] of invalid.entries()) {
      const base = `https://identity-${stage}-${index}.test`;
      globalThis.fetch = async url => ({ ok: true, status: 200, json: async () => {
        const body = publishedEnvelope(url);
        return body.stage === stage ? alter(body) : body;
      } });
      await assert.rejects(loadPostflopSpot(spotId, undefined, options, base), /identity or format mismatch/);
      globalThis.fetch = async url => productionResponse(url);
      assert.ok(await loadPostflopSpot(spotId, undefined, options, base), "rejected identity must not be cached");
    }
  } finally { globalThis.fetch = original; }
});

test("production seat mismatches stay in preparing state instead of accepting another seat's policy", async () => {
  const original = globalThis.fetch;
  try {
    for (const alter of [
      body => ({ ...body, opponentSeat: body.opponentSeat === "ip" ? "oop" : "ip" }),
      body => ({ ...body, metadata: { ...body.metadata, opponent_seat: body.metadata.opponent_seat === "ip" ? "oop" : "ip" } }),
    ]) {
      const base = `https://seat-identity-${Math.random()}.test`;
      globalThis.fetch = async url => ({ ok: true, status: 200, json: async () => alter(publishedEnvelope(url)) });
      await assert.rejects(loadPostflopSpot(spotId, undefined, options, base), error =>
        error.code === "PROFILE_POLICY_MISSING" && error.state === "not_generated");
    }
  } finally { globalThis.fetch = original; }
});

test("production generic JSON 404 means preparing for both flop and later without fallback", async () => {
  const original = globalThis.fetch;
  try {
    for (const stage of ["flop", "later"]) {
      const calls = [];
      globalThis.fetch = async url => {
        const parsed = new URL(String(url)); calls.push(parsed);
        assert.equal(parsed.pathname, "/v1/postflop/profile-policy");
        return parsed.searchParams.get("stage") === stage
          ? { ok: false, status: 404, json: async () => ({ error: "Not found" }) }
          : productionResponse(url);
      };
      const request = loadPostflopSpot(spotId, undefined, options, `https://generic-404-${stage}.test`);
      if (stage === "flop") await assert.rejects(request,
        error => error.code === "PROFILE_POLICY_MISSING" && error.state === "not_generated");
      else {
        const source = await request;
        assert.ok(source.candidate.villain && source.candidate.exploit);
        assert.equal(source.laterCandidate, null);
        assert.deepEqual(source.laterPolicyError,
          { error: "Not found", code: "PROFILE_POLICY_MISSING", state: "not_generated" });
      }
      assert.equal(calls.length, stage === "flop" ? 2 : 4);
    }
  } finally { globalThis.fetch = original; }
});

test("production later server errors do not masquerade as a missing policy", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async url => new URL(String(url)).searchParams.get("stage") === "later"
      ? { ok: false, status: 503, json: async () => ({ error: "Unavailable", code: "PROFILE_POLICY_MISSING" }) }
      : productionResponse(url);
    await assert.rejects(loadPostflopSpot(spotId, undefined, options, "https://later-error.test"),
      error => error.message === "Unavailable" && error.state !== "not_generated");
  } finally { globalThis.fetch = original; }
});

test("production standard route is unchanged; local/production/profile option caches stay isolated", async () => {
  const original = globalThis.fetch, base = "https://production-cache-isolation.test", calls = [];
  try {
    globalThis.fetch = async url => {
      const parsed = new URL(String(url), "http://localhost"); calls.push(parsed);
      return parsed.pathname.endsWith("profile-policy") ? productionResponse(url)
        : { ok: true, json: async () => envelope(spotId, parsed.searchParams.has("opponentProfile")) };
    };
    await loadPostflopSpot(spotId, undefined, options, "");
    const one = await loadPostflopSpot(spotId, undefined, options, base);
    await loadPostflopSpot(spotId, undefined, { ...options, opponentSeat: "ip" }, base);
    await loadPostflopSpot(spotId, undefined, { ...options, tableProfile: { call: "high" } }, base);
    const standard = await loadPostflopSpot(spotId, undefined, { tableProfile: { call: "high" } }, base);
    assert.notEqual(one, standard);
    assert.equal(calls.length, 14);
    assert.equal(calls[0].pathname, "/local-postflop-spot");
    assert.equal(calls.at(-1).pathname, "/v1/postflop/spot");
    assert.deepEqual(Object.fromEntries(calls.at(-1).searchParams), { spot: spotId });
  } finally { globalThis.fetch = original; }
});

test("aborting a production consumer leaves shared role requests alive for another", async () => {
  const original = globalThis.fetch, controller = new AbortController(), base = "https://production-abort.test";
  let finish;
  const started = new Promise(resolve => { finish = resolve; }), pending = [], calls = [];
  try {
    globalThis.fetch = (url, fetchOptions) => {
      assert.notEqual(fetchOptions.signal, controller.signal);
      assert.equal(fetchOptions.signal.aborted, false);
      calls.push(url);
      if (new URL(String(url)).searchParams.get("stage") === "later") return Promise.resolve(productionResponse(url));
      return new Promise(resolve => { pending.push(() => resolve(productionResponse(url))); if (pending.length === 2) finish(); });
    };
    const cancelled = loadPostflopSpot(spotId, controller.signal, options, base);
    const kept = loadPostflopSpot(spotId, undefined, options, base);
    await started;
    controller.abort();
    await assert.rejects(cancelled, { name: "AbortError" });
    for (const resolve of pending) resolve();
    const source = await kept;
    assert.ok(source.candidate.villain && source.laterCandidate.exploit);
    assert.equal(calls.length, 4);
    assert.equal(await loadPostflopSpot(spotId, undefined, options, base), source);
    await assert.rejects(loadPostflopSpot(spotId, controller.signal, options, base), { name: "AbortError" });
    assert.equal(calls.length, 4);
  } finally { globalThis.fetch = original; }
});
