import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBatchArgs, normalizeBatchOptions, runProfileBatch, main, GENERATION_REPORT_PATH } from "../scripts/postflop-ai/generate-profiles.mjs";
import { generationInputOptions } from "../scripts/postflop-ai/generation-options.mjs";
import { defaultOpponentSeat } from "../src/estimated/postflop-profile-state.ts";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { POSTFLOP_SPOTS } from "../scripts/postflop-ai/spots.ts";

const ids = ["BTN_open_BB_call", "BTN_open_BB_3bet_call", "UTG_open_SB_call"];
const catalog = ids.map(id => POSTFLOP_SPOTS.find(spot => spot.id === id));
const options = { profiles: ["nit"], roles: ["villain", "exploit"], spots: ids.slice(0, 2), concurrency: 2 };
function harness(overrides = {}) {
  const events = [], saved = [], candidates = new Map();
  const identity = (inputs, role) => `${inputs.opponentProfile}/${inputs.spot.id}/${role}`;
  const dependencies = {
    spots: catalog,
    loadInputs(id, inputOptions) {
      events.push({ type: "inputs", id, options: inputOptions });
      const spot = catalog.find(item => item.id === id);
      return { spot, ...inputOptions, seatRows: { [spot.ip]: [{ hand: "AA", freq: 50 }], [spot.oop]: [{ hand: "KK", freq: 20 }] } };
    },
    generationInputOptions,
    async generate(inputs, generation) {
      events.push({ type: "flop", id: inputs.spot.id, ...generation });
      const candidate = { metadata: { policy_hash: identity(inputs, generation.role) } };
      candidates.set(identity(inputs, generation.role), candidate);
      return { candidate, reused: false };
    },
    loadCandidate(inputs, role) {
      events.push({ type: "load-flop", id: inputs.spot.id, role });
      const candidate = candidates.get(identity(inputs, role));
      if (!candidate) throw new Error("role-specific flop is missing");
      return candidate;
    },
    async generateLater(inputs, flop, generation) {
      events.push({ type: "later", id: inputs.spot.id, ...generation, flop });
      return { candidate: { metadata: { policy_hash: `${flop.metadata.policy_hash}/later` } }, reused: false };
    },
    artifactPaths(spot, { profile, role }) {
      return { candidate: `/mock/${profile}/${spot.slug}-${role}-policy.json`, laterCandidate: `/mock/${profile}/${spot.slug}-${role}-later-policy.json` };
    },
    reportPath: "/mock/generation-report.json",
    writeReport(report, path) { saved.push({ report, path }); },
    output(line) { events.push({ type: "output", line }); },
    now: () => "2026-10-08T00:00:00.000Z",
    ...overrides,
  };
  return { dependencies, events, saved, candidates };
}

test("batch CLI parses explicit profile/role/spot/stage/provider options without work", () => {
  const result = parseBatchArgs(["--profiles", "nit,station", "--roles", "exploit", "--spots", ids[0], "--stage", "flop", "--concurrency", "3", "--model", "gpt-6-luna", "--effort", "max", "--force"], catalog);
  assert.deepEqual(result, { profiles: ["nit", "station"], roles: ["exploit"], spots: [ids[0]], stage: "flop", concurrency: 3, model: "gpt-6-luna", effort: "max", force: true });
  const defaults = parseBatchArgs([], catalog);
  assert.deepEqual(defaults.profiles, ["nit", "station", "lag", "maniac"]);
  assert.deepEqual(defaults.roles, ["villain", "exploit"]);
  assert.deepEqual(defaults.spots, ids);
  assert.equal(defaults.stage, "both");
  assert.match(GENERATION_REPORT_PATH, /\.local\/postflop-ai\/profiles\/generation-report\.json$/);
});

test("invalid options are rejected before any input or provider work", async () => {
  const h = harness();
  for (const bad of [{ profiles: "standard" }, { profiles: "nit," }, { profiles: "nit,nit" }, { roles: "hero" }, { roles: [] }, { stage: "river" }, { spots: "not_a_spot" }, { spots: "all," }, { spots: [] }, { concurrency: 0 }, { concurrency: -1 }, { concurrency: 1.5 }, { concurrency: "NaN" }, { concurrency: true }, { concurrency: [] }, { force: "yes" }, { model: "../provider" }, { effort: "extreme" }, { opponentSeat: "SB" }, { typo: true }]) {
    await assert.rejects(runProfileBatch({ ...options, ...bad }, h.dependencies));
  }
  for (const args of [["--profiles"], ["--profiles", "--force"], ["--unknown", "nit"], ["--force", "--force"], ["--stage", "flop", "--stage", "later"], ["stray"]]) assert.throws(() => parseBatchArgs(args, catalog));
  assert.deepEqual(h.events, []);
  assert.deepEqual(h.saved, []);
});

test("all profile inputs use Stage B default seat, including limp and history spots", () => {
  for (const spot of POSTFLOP_SPOTS) for (const profile of ["nit", "station", "lag", "maniac"]) {
    assert.deepEqual(generationInputOptions(spot.id, profile), { opponentProfile: profile, opponentSeat: defaultOpponentSeat({ spotId: spot.id }) });
  }
  assert.deepEqual(generationInputOptions("BTN_open_BB_call", "nit"), { opponentProfile: "nit", opponentSeat: "ip" });
  assert.deepEqual(generationInputOptions("BTN_open_BB_3bet_call", "station"), { opponentProfile: "station", opponentSeat: "oop" });
  assert.deepEqual(generationInputOptions("SB_limp_BB_iso_SB_reraise_call", "lag"), { opponentProfile: "lag", opponentSeat: "ip" });
});

test("all flop jobs finish before any later provider call, with role-specific flop loading", async () => {
  let completed = 0;
  const h = harness();
  const flop = h.dependencies.generate;
  h.dependencies.generate = async (...args) => { await new Promise(resolve => setTimeout(resolve, 3)); const result = await flop(...args); completed++; return result; };
  const later = h.dependencies.generateLater;
  h.dependencies.generateLater = async (...args) => { assert.equal(completed, 4); return later(...args); };
  const report = await runProfileBatch({ ...options, model: "gpt-6-luna", effort: "high", force: true }, h.dependencies);
  assert.deepEqual(report.summary, { total: 8, successes: 8, failures: 0, skips: 0, reused: 0 });
  assert.equal(h.events.filter(event => event.type === "inputs").length, 4);
  assert.ok(h.events.filter(event => event.type === "later").every(event => event.flop.metadata.policy_hash.endsWith(`/${event.role}`)));
  assert.ok(h.events.filter(event => event.type === "flop" || event.type === "later").every(event => event.model === "gpt-6-luna" && event.effort === "high" && event.force));
  const firstLater = h.events.findIndex(event => event.type === "later");
  assert.ok(h.events.every((event, index) => event.type !== "flop" || index < firstLater));
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].path, "/mock/generation-report.json");
  assert.equal(h.saved[0].report, report);
  assert.match(report.successes[0].path, /nit\/.+-villain-policy\.json$/);
});

test("enumeration includes standard-unreachable SB flats and every registered spot", async () => {
  const h = harness({ spots: POSTFLOP_SPOTS });
  h.dependencies.loadInputs = (id, inputOptions) => {
    h.events.push({ type: "inputs", id, options: inputOptions });
    const spot = POSTFLOP_SPOTS.find(item => item.id === id);
    return { spot, ...inputOptions, seatRows: { [spot.ip]: [{ freq: 10 }], [spot.oop]: [{ freq: 10 }] } };
  };
  const report = await runProfileBatch({ profiles: "nit", roles: "villain", spots: "all", stage: "flop" }, h.dependencies);
  assert.equal(report.successes.length, POSTFLOP_SPOTS.length);
  for (const spot of POSTFLOP_SPOTS.filter(spot => !spot.reachable)) assert.ok(report.successes.some(record => record.spot === spot.id));
  assert.ok(h.events.filter(event => event.type === "inputs").every(event => event.options.opponentProfile === "nit"));
});

test("only adjusted unreachable histories skip; no generation occurs for zero reach", async () => {
  const h = harness();
  const load = h.dependencies.loadInputs;
  h.dependencies.loadInputs = (id, inputOptions) => {
    if (id === ids[0]) throw new Error(`${id}: BTN saved history is unreachable after range adjustment`);
    const inputs = load(id, inputOptions);
    inputs.seatRows[inputs.spot.oop] = [{ hand: "AA", freq: 0 }];
    return inputs;
  };
  const report = await runProfileBatch(options, h.dependencies);
  assert.deepEqual(report.summary, { total: 8, successes: 0, failures: 0, skips: 8, reused: 0 });
  assert.ok(report.skips.every(record => record.reason === "unreachable_adjusted_history"));
  assert.ok(h.events.every(event => !["flop", "load-flop", "later"].includes(event.type)));
});

test("missing profile sources and malformed rows are failures, never unreachable or standard fallback", async () => {
  const h = harness();
  const load = h.dependencies.loadInputs;
  h.dependencies.loadInputs = (id, inputOptions) => {
    if (id === ids[0]) throw Object.assign(new Error("profiles/nit/villain/squeeze-responses is missing"), { code: "ENOENT" });
    const inputs = load(id, inputOptions);
    inputs.seatRows[inputs.spot.ip] = [];
    return inputs;
  };
  const report = await runProfileBatch(options, h.dependencies);
  assert.deepEqual(report.summary, { total: 8, successes: 0, failures: 4, skips: 4, reused: 0 });
  assert.equal(report.failures.filter(record => record.code === "ENOENT").length, 2);
  assert.ok(report.skips.every(record => record.reason === "flop_dependency_failed"));
  assert.ok(h.events.every(event => !["flop", "later"].includes(event.type)));
});

test("per-job provider failures continue; dependent later skips but other roles run", async () => {
  const h = harness();
  const generate = h.dependencies.generate;
  h.dependencies.generate = (inputs, settings) => {
    if (inputs.spot.id === ids[0] && settings.role === "villain") throw new Error("mock flop failed");
    return generate(inputs, settings);
  };
  const later = h.dependencies.generateLater;
  h.dependencies.generateLater = (inputs, candidate, settings) => {
    if (inputs.spot.id === ids[1] && settings.role === "exploit") throw new Error("mock later failed");
    return later(inputs, candidate, settings);
  };
  const report = await runProfileBatch(options, h.dependencies);
  assert.deepEqual(report.summary, { total: 8, successes: 5, failures: 2, skips: 1, reused: 0 });
  assert.deepEqual(report.failures.map(record => record.reason), ["mock flop failed", "mock later failed"]);
  assert.equal(report.skips[0].dependency_reason, "mock flop failed");
  assert.ok(report.successes.some(record => record.spot === ids[0] && record.role === "exploit" && record.stage === "later"));
});

test("fresh reused flop supports retry and reuse records remain explicit skips", async () => {
  const h = harness();
  const flop = h.dependencies.generate, later = h.dependencies.generateLater;
  h.dependencies.generate = async (...args) => ({ ...await flop(...args), reused: true });
  h.dependencies.generateLater = async (...args) => ({ ...await later(...args), reused: true });
  const report = await runProfileBatch(options, h.dependencies);
  assert.deepEqual(report.summary, { total: 8, successes: 0, failures: 0, skips: 8, reused: 8 });
  assert.ok(report.skips.every(record => record.reason === "existing_candidate_reused" && record.reused));
  assert.equal(h.events.filter(event => event.type === "later").length, 4);
});

test("later-only requires saved same-role flop; missing flop fails and jobs continue", async () => {
  const h = harness();
  h.candidates.set(`nit/${ids[0]}/exploit`, { metadata: { policy_hash: "saved-exploit" } });
  const report = await runProfileBatch({ ...options, stage: "later" }, h.dependencies);
  assert.deepEqual(report.summary, { total: 4, successes: 1, failures: 3, skips: 0, reused: 0 });
  assert.ok(h.events.every(event => event.type !== "flop"));
  assert.equal(report.successes[0].role, "exploit");
  assert.ok(report.failures.every(record => record.stage === "later" && record.reason === "role-specific flop is missing"));
});

test("concurrency is bounded independently in both phases and provider injection is forwarded", async () => {
  const generator = () => { throw new Error("provider must remain mocked"); };
  const h = harness({ generator });
  let active = 0, peak = 0;
  for (const method of ["generate", "generateLater"]) {
    const original = h.dependencies[method];
    h.dependencies[method] = async (...args) => {
      assert.equal(args.at(-1).generator, generator);
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 4));
      const result = await original(...args);
      active--;
      return result;
    };
  }
  const report = await runProfileBatch({ ...options, profiles: "nit,station,lag,maniac", concurrency: 3 }, h.dependencies);
  assert.equal(peak, 3);
  assert.equal(active, 0);
  assert.equal(report.summary.successes, 32);
});

test("flop-only omits later work and main reports failure exit status without publishing", async () => {
  const h = harness({ generate: () => { throw new Error("mock failed"); } });
  const exitCode = await main(["--profiles", "nit", "--roles", "villain", "--spots", ids[0], "--stage", "flop"], h.dependencies);
  assert.equal(exitCode, 1);
  assert.equal(h.saved[0].report.summary.total, 1);
  assert.ok(h.events.every(event => event.type !== "later"));
  const source = readFileSync(new URL("../scripts/postflop-ai/generate-profiles.mjs", import.meta.url), "utf8");
  assert.match(source, /import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href/);
  assert.doesNotMatch(source, /publish-d1|hand-ev|simulateParallel/);
});

test("normalized batch selections are stable, with report counts matching explicit records", async () => {
  assert.deepEqual(normalizeBatchOptions({ spots: ids[2], profiles: "maniac", roles: "villain", stage: "flop", concurrency: "1" }, catalog).spots, [ids[2]]);
  const h = harness();
  const report = await runProfileBatch({ ...options, spots: ids[2], profiles: "nit,station", stage: "flop" }, h.dependencies);
  assert.equal(report.summary.total, report.successes.length + report.failures.length + report.skips.length);
  assert.deepEqual(report.successes.map(({ profile, role }) => [profile, role]), [["nit", "villain"], ["nit", "exploit"], ["station", "villain"], ["station", "exploit"]]);
  assert.equal(report.kind, "profile_policy_generation_not_publication");
});


test("explicit opponent-seat enables profile-only SB flat while omission preserves the mandated default", async () => {
  const h = harness({ loadInputs });
  const selection = { profiles: "station", roles: "villain", spots: "UTG_open_SB_call", stage: "flop" };
  const defaultReport = await runProfileBatch(selection, h.dependencies);
  assert.equal(defaultReport.skips[0].reason, "unreachable_adjusted_history");
  assert.ok(h.events.every(event => event.type !== "flop"));
  const explicit = parseBatchArgs(["--profiles", "station", "--roles", "villain", "--spots", "UTG_open_SB_call", "--stage", "flop", "--opponent-seat", "oop"], catalog);
  const report = await runProfileBatch(explicit, h.dependencies);
  assert.equal(report.summary.successes, 1);
  assert.equal(report.options.opponentSeat, "oop");
});
