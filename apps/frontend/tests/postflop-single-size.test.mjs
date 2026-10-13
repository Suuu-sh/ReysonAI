import assert from "node:assert/strict";
import fs from "node:fs";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { normalizeSizing, POSTFLOP_SIZINGS } from "../scripts/postflop-ai/sizing.ts";
import { normalizedInputOptions } from "../scripts/postflop-ai/input-options.ts";
import { artifactPaths, boards, config, loadInputs, readArtifact, requireArtifact, root, useArtifactSource } from "../scripts/postflop-ai/inputs.mjs";
import { generate, generateLater, loadCandidate, loadLaterCandidate, promptFor, promptForLater, sha } from "../scripts/postflop-ai/generate.mjs";
import { validatePolicy, validateSingleSizePolicy } from "../scripts/postflop-ai/policy.ts";
import { validateLaterPolicy, validateSingleSizeLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { NODES, treeNodes } from "../scripts/postflop-ai/tree.ts";
import { LATER_NODES, STREETS, streetNodes } from "../scripts/postflop-ai/later-tree.ts";
import { TIERS } from "../scripts/postflop-ai/model.ts";
import { PROFILES, SIMULATION_VERSION, simulationReport } from "../scripts/postflop-ai/simulation.mjs";
import { postflopResponse } from "../scripts/postflop-ai/local-view.mjs";
import { postflopUrl } from "../src/estimated/postflop-api.ts";
import { loadPostflopSpot } from "../src/estimated/postflop-browser.ts";

const mix = (actions, selected, share = 100) => Object.fromEntries(actions.map(action => [action,
  action === selected ? selected === "check" ? 100 : share : action === "check" ? 100 - share : 0]));
function flopPolicy(tree = "oop_checks") {
  return { version: 1, kind: "ai_estimate_not_gto", rules: treeNodes(tree).flatMap(node => TIERS.map(tier => ({
    node, texture: "any", tier, mix: node.endsWith("_first")
      ? mix(NODES[node], ["monster", "strong"].includes(tier) ? "check" : "bet33", 60)
      : Object.fromEntries(NODES[node].map(action => [action, action === "fold" ? 20 : action === "call" ? 80 : 0])),
  }))) };
}
const flopRule = (node, texture, tier, action) => ({ node, texture, tier, mix: mix(NODES[node], action) });
function laterPolicy(action = "bet33") {
  return { version: 1, kind: "ai_estimate_not_gto", streets: Object.fromEntries(STREETS.map(street => [street, {
    rules: streetNodes(street).flatMap(node => TIERS.filter(tier => street !== "river" || tier !== "draw").map(tier => ({
      node, line: "any", texture: "any", tier, mix: node.endsWith("_first") ? mix(LATER_NODES[node], LATER_NODES[node].includes(action) ? action : "bet33", 60)
        : Object.fromEntries(LATER_NODES[node].map(key => [key, key === "fold" ? 20 : key === "call" ? LATER_NODES[node].includes("raise") ? 50 : 80 : key === "raise" ? 30 : 0])),
    }))),
  }])) };
}
const laterRule = (node, line, texture, tier, action) => ({ node, line, texture, tier, mix: mix(LATER_NODES[node], action) });

// Replace artifact reads/writes in memory. No policy files, provider processes or
// network calls are created by any of these tests.
function withArtifacts(records, run) {
  const originalExists = fs.existsSync, originalRead = fs.readFileSync, originalWrite = fs.writeFileSync,
    originalMkdir = fs.mkdirSync, originalSpawn = childProcess.spawn;
  const previousSource = useArtifactSource(null);
  const artifactPrefix = join(root, "scripts/data/postflop-ai/policies") + "/";
  const writes = [];
  fs.existsSync = path => String(path).startsWith(artifactPrefix) ? records.has(String(path)) : originalExists(path);
  fs.readFileSync = (path, ...args) => records.has(String(path)) ? JSON.stringify(records.get(String(path))) : originalRead(path, ...args);
  fs.writeFileSync = (path, value, options) => {
    assert.ok(String(path).startsWith(artifactPrefix), "fixture write escaped artifact mock");
    if (options?.flag === "wx" && records.has(String(path))) throw Object.assign(new Error("Fixture already exists"), { code: "EEXIST" });
    records.set(String(path), JSON.parse(String(value))); writes.push(String(path));
  };
  fs.mkdirSync = path => { assert.ok(String(path).startsWith(artifactPrefix.slice(0, -1)), "fixture directory escaped mock"); };
  childProcess.spawn = () => { throw new Error("Real provider execution is forbidden in Single Size tests"); };
  syncBuiltinESMExports();
  const restore = () => {
    fs.existsSync = originalExists; fs.readFileSync = originalRead; fs.writeFileSync = originalWrite;
    fs.mkdirSync = originalMkdir; childProcess.spawn = originalSpawn; syncBuiltinESMExports(); useArtifactSource(previousSource);
  };
  let result;
  try { result = run(writes); } catch (error) { restore(); throw error; }
  if (result && typeof result.then === "function") return Promise.resolve(result).finally(restore);
  restore(); return result;
}
function candidateFixtures(inputs) {
  const policy = flopPolicy(inputs.spot.tree), later = laterPolicy();
  const metadata = { kind: "ai_estimate_not_gto", sizing: "single", source_hash: inputs.fingerprint,
    config_version: config.version, spot: inputs.spot.id, tree: inputs.spot.tree, policy_hash: sha(policy) };
  const candidate = { metadata, policy };
  const laterCandidate = { metadata: { ...metadata, policy_hash: sha(later), flop_policy_hash: metadata.policy_hash }, policy: later };
  const metric = () => ({ mean: 0, ci95: [0, 0] });
  const results = boards().flatMap(board => PROFILES.flatMap(opponent => [inputs.spot.ip, inputs.spot.oop].map(hero => ({
    board: board.id, split: board.split, opponent, hero, candidate_ev_bb: metric(), baseline_ev_bb: metric(), delta_bb: metric(),
  }))));
  // Construct report identities only, never run the Monte Carlo simulation.
  const report = { ...simulationReport(inputs, policy, config.samples_per_board_profile_seat, laterCandidate, results), marker: "single-only-audit" };
  return { candidate, laterCandidate, report };
}

test("sizing defaults, strict invalid values and standard-only options preserve normalized hash input", () => {
  assert.deepEqual(POSTFLOP_SIZINGS, ["multi", "single"]);
  for (const value of [undefined, null, "multi"]) assert.equal(normalizeSizing(value), "multi");
  assert.equal(normalizeSizing("single"), "single");
  for (const value of ["", "Single", "multi-size", 0, false, {}, []]) {
    assert.throws(() => normalizeSizing(value), /Invalid postflop sizing/);
    assert.throws(() => normalizedInputOptions({ sizing: value }), /Invalid postflop sizing/);
  }
  assert.deepEqual(normalizedInputOptions({ sizing: "single" }), normalizedInputOptions());
  for (const opponentProfile of ["nit", "station", "lag", "maniac"]) assert.throws(
    () => normalizedInputOptions({ sizing: "single", opponentProfile }),
    { message: "Single-size policies support the standard profile only" });
});

test("artifact paths isolate single public policies/report and preserve every Multi Size path", () => {
  const spot = { slug: "test-spot" }, multi = artifactPaths(spot);
  assert.deepEqual(multi, {
    candidate: join(root, "scripts/data/postflop-ai/policies/test-spot-policy.json"),
    laterCandidate: join(root, "scripts/data/postflop-ai/policies/test-spot-later-policy.json"),
    report: join(root, "scripts/data/postflop-ai/policies/test-spot-report.json"),
    handEv: join(root, ".local/postflop-ai/test-spot-hand-ev.json"),
    laterHandEv: join(root, ".local/postflop-ai/test-spot-later-hand-ev.json"),
  });
  assert.deepEqual(artifactPaths(spot, { sizing: "multi" }), multi);
  const single = artifactPaths(spot, { sizing: "single" });
  for (const kind of ["candidate", "laterCandidate", "report"]) assert.equal(single[kind], multi[kind].replace("test-spot-", "test-spot-single-"));
  assert.equal(single.handEv, multi.handEv);
  assert.equal(single.laterHandEv, multi.laterHandEv);
  assert.throws(() => artifactPaths(spot, { sizing: "single", profile: "nit", role: "villain" }), /standard profile only/);
});

test("single flop validation resolves exact, shape, height, any fallbacks at every first node", () => {
  for (const tree of ["oop_checks", "oop_leads"]) {
    const policy = flopPolicy(tree);
    for (const node of treeNodes(tree).filter(node => node.endsWith("_first"))) {
      for (const tier of ["air", "draw", "medium"]) policy.rules.push(flopRule(node, "wet_low", tier, "bet75"));
      policy.rules.push(flopRule(node, "wet", "monster", "check"), flopRule(node, "low", "strong", "check"));
    }
    assert.equal(validateSingleSizePolicy(policy, tree), policy);
    const invalid = structuredClone(policy);
    invalid.rules.find(rule => rule.node === "btn_first" && rule.texture === "any" && rule.tier === "monster").mix = mix(NODES.btn_first, "bet75");
    assert.equal(validatePolicy(invalid, tree), invalid, "ordinary Multi Size validation stays permissive");
    assert.throws(() => validateSingleSizePolicy(invalid, tree), /several bet sizes/);
  }
  const policy = flopPolicy();
  for (const rule of policy.rules.filter(rule => rule.node === "btn_first")) rule.mix = mix(NODES.btn_first, "check");
  policy.rules.find(rule => rule.node === "btn_first" && rule.tier === "monster").mix = mix(NODES.btn_first, "bet75");
  policy.rules.push(flopRule("btn_first", "dry", "monster", "check"), flopRule("btn_first", "dry_low", "air", "bet33"));
  assert.equal(validateSingleSizePolicy(policy), policy, "shape fallback masks broader size before exact texture air bet");
  policy.rules.push(flopRule("btn_first", "dry_low", "monster", "bet75"));
  assert.throws(() => validateSingleSizePolicy(policy), /btn_first\/dry_low/);
  const uncovered = flopPolicy();
  for (const rule of uncovered.rules.filter(rule => rule.node === "btn_first")) rule.mix = mix(NODES.btn_first, "check");
  uncovered.rules.find(rule => rule.node === "btn_first" && rule.tier === "monster").mix = mix(NODES.btn_first, "bet75");
  uncovered.rules.push(flopRule("btn_first", "dry_low", "air", "bet33"));
  assert.throws(() => validateSingleSizePolicy(uncovered), /btn_first\/dry_low/, "any monster bet75 plus exact dry_low air bet33 resolves to two sizes");
});

test("single later validation allows allin/facing mixes and uses exact, line, texture, any precedence", () => {
  const allin = laterPolicy("allin");
  assert.equal(validateSingleSizeLaterPolicy(allin), allin);
  const invalid = structuredClone(allin);
  invalid.streets.turn.rules.find(rule => rule.node === "turn_oop_first" && rule.tier === "monster").mix = mix(LATER_NODES.turn_oop_first, "bet75");
  assert.equal(validateLaterPolicy(invalid), invalid);
  assert.throws(() => validateSingleSizeLaterPolicy(invalid), /several bet sizes/);
  for (const street of STREETS) for (const node of streetNodes(street).filter(node => node.endsWith("_first"))) {
    const policy = laterPolicy("check");
    const rules = policy.streets[street].rules;
    rules.push(laterRule(node, "any", "blank", "monster", "bet75"),
      laterRule(node, "aggressor", "any", "monster", "check"), laterRule(node, "aggressor", "blank", "air", "bet33"));
    assert.equal(validateSingleSizeLaterPolicy(policy), policy, `line fallback outranks texture at ${node}`);
    rules.push(laterRule(node, "aggressor", "blank", "monster", "bet75"));
    assert.throws(() => validateSingleSizeLaterPolicy(policy), /several bet sizes/);
  }
});

test("sizing never changes source/structure fingerprints and D1 never substitutes a Multi Size artifact", () => {
  const multi = loadInputs(), explicit = loadInputs(undefined, { sizing: "multi" }), single = loadInputs(undefined, { sizing: "single" });
  assert.equal(multi.sizing, "multi"); assert.equal(single.sizing, "single");
  assert.equal(explicit.fingerprint, multi.fingerprint); assert.equal(single.fingerprint, multi.fingerprint);
  assert.equal(single.structure_hash, multi.structure_hash);
  const adjusted = loadInputs(undefined, { tableProfile: { call: "high" } });
  const adjustedSingle = loadInputs(undefined, { sizing: "single", tableProfile: { call: "high" } });
  assert.equal(adjustedSingle.fingerprint, adjusted.fingerprint); assert.equal(adjustedSingle.structure_hash, adjusted.structure_hash);
  const previous = useArtifactSource({ artifact: () => ({ sentinel: "multi" }), ranges: {} });
  try {
    assert.deepEqual(readArtifact(single.spot, "candidate"), { sentinel: "multi" });
    for (const kind of ["candidate", "laterCandidate", "report"]) {
      assert.equal(readArtifact(single.spot, kind, { sizing: "single" }), null);
      assert.throws(() => requireArtifact(single.spot, kind, { sizing: "single" }), { code: "ENOENT" });
    }
  } finally { useArtifactSource(previous); }
});

test("single loading enforces metadata, reports and missing later policy without Multi Size fallback", () => {
  const inputs = loadInputs(undefined, { sizing: "single" }), paths = artifactPaths(inputs.spot, { sizing: "single" });
  const fixtures = candidateFixtures(inputs), records = new Map(Object.entries(fixtures).map(([kind, value]) => [paths[kind], value]));
  const multiPaths = artifactPaths(inputs.spot);
  const multiInputs = loadInputs();
  for (const kind of ["candidate", "laterCandidate"]) records.set(multiPaths[kind], {
    ...fixtures[kind], metadata: { ...fixtures[kind].metadata, sizing: undefined },
  });
  records.set(multiPaths.report, { ...fixtures.report, marker: "must-not-read-multi" });
  withArtifacts(records, () => {
    const defaultResponse = postflopResponse("/local-postflop-spot", new URLSearchParams({ spot: inputs.spot.id }));
    const multiResponse = postflopResponse("/local-postflop-spot", new URLSearchParams({ spot: inputs.spot.id, sizing: "multi" }));
    assert.equal(defaultResponse.status, 200);
    assert.deepEqual(defaultResponse, multiResponse);
    assert.equal(Object.hasOwn(defaultResponse.body, "sizing"), false, "Multi Size response body stays unchanged");
    const legacyMulti = records.get(multiPaths.candidate);
    assert.deepEqual(loadCandidate(multiInputs), JSON.parse(JSON.stringify(legacyMulti)), "absent metadata sizing is accepted for Multi Size");
    records.set(multiPaths.candidate, { ...legacyMulti, metadata: { ...legacyMulti.metadata, sizing: "multi" } });
    assert.equal(loadCandidate(multiInputs).metadata.sizing, "multi");
    records.set(multiPaths.candidate, fixtures.candidate);
    assert.throws(() => loadCandidate(multiInputs), /sizing identity mismatch/, "single artifact cannot be consumed from the Multi Size path");
    records.set(multiPaths.candidate, legacyMulti);
    assert.deepEqual(loadCandidate(inputs), fixtures.candidate);
    assert.deepEqual(loadLaterCandidate(inputs, fixtures.candidate), fixtures.laterCandidate);
    const params = new URLSearchParams({ spot: inputs.spot.id, sizing: "single" });
    const response = postflopResponse("/local-postflop-spot", params);
    assert.equal(response.status, 200);
    assert.equal(response.body.sizing, "single");
    assert.equal(response.body.report.marker, "single-only-audit");
    records.delete(paths.report);
    assert.equal(postflopResponse("/local-postflop-spot", params).status, 404, "Multi Size report cannot fill a missing single report");
    for (const patch of [{ policy_hash: "stale" }, { source_hash: "stale" }, { defence_version: 5 },
      { later_policy_hash: "stale" }, { later_sizing_hash: "stale" }, { results: fixtures.report.results.slice(1) }]) {
      records.set(paths.report, { ...fixtures.report, ...patch });
      assert.equal(postflopResponse("/local-postflop-spot", params).status, 409, `single report rejects ${Object.keys(patch)[0]}`);
    }
    const historical = { spot: inputs.spot.id, source_hash: inputs.fingerprint, policy_hash: fixtures.candidate.metadata.policy_hash,
      simulation_version: SIMULATION_VERSION, results: Array.from({ length: 72 }, () => ({})) };
    records.set(paths.report, historical);
    assert.equal(postflopResponse("/local-postflop-spot", params).status, 409, "Single Size has no legacy historical exemption");
    records.set(multiPaths.report, historical);
    const preserved = postflopResponse("/local-postflop-spot", new URLSearchParams({ spot: inputs.spot.id }));
    assert.equal(preserved.status, 200); assert.equal(preserved.body.report_status, "preserved-historical");
    records.set(paths.report, fixtures.report);
    records.delete(paths.laterCandidate);
    assert.throws(() => loadLaterCandidate(inputs, fixtures.candidate), { code: "LATER_POLICY_MISSING" });
    const missing = postflopResponse("/local-postflop-spot", params);
    assert.equal(missing.status, 404); assert.equal(missing.body.code, "LATER_POLICY_MISSING");
    records.set(paths.laterCandidate, fixtures.laterCandidate);
    records.set(paths.candidate, { ...fixtures.candidate, metadata: { ...fixtures.candidate.metadata, sizing: "multi" } });
    assert.throws(() => loadCandidate(inputs), /sizing identity mismatch/);
    records.set(paths.candidate, { ...fixtures.candidate, metadata: { ...fixtures.candidate.metadata, sizing: undefined } });
    assert.throws(() => loadCandidate(inputs), /sizing identity mismatch/);
    records.set(paths.candidate, fixtures.candidate);
    records.set(paths.laterCandidate, { ...fixtures.laterCandidate, metadata: { ...fixtures.laterCandidate.metadata, sizing: undefined } });
    assert.throws(() => loadLaterCandidate(inputs, fixtures.candidate), /sizing identity mismatch/);
  });
});

test("mocked authoring saves separate single metadata/paths and reuses only same-source/current-prompt artifacts", async () => {
  const single = loadInputs(undefined, { sizing: "single" }), multi = loadInputs();
  const singlePaths = artifactPaths(single.spot, { sizing: "single" }), multiPaths = artifactPaths(single.spot);
  const records = new Map();
  await withArtifacts(records, async writes => {
    let providers = 0;
    const flopGenerator = async prompt => { providers++; assert.match(prompt, /SINGLE-SIZE MODE/); return flopPolicy(single.spot.tree); };
    const laterGenerator = async prompt => { providers++; assert.match(prompt, /SINGLE-SIZE MODE/); return laterPolicy(); };
    const options = { model: "fixture-model", effort: "high" };
    const generated = await generate(single, { ...options, generator: flopGenerator });
    assert.equal(generated.reused, false); assert.equal(generated.candidate.metadata.sizing, "single");
    assert.equal(generated.candidate.metadata.source_hash, multi.fingerprint);
    assert.equal(generated.candidate.metadata.prompt_hash, sha(promptFor(single)));
    const generatedLater = await generateLater(single, generated.candidate, { ...options, generator: laterGenerator });
    assert.equal(generatedLater.reused, false); assert.equal(generatedLater.candidate.metadata.sizing, "single");
    assert.equal(generatedLater.candidate.metadata.prompt_hash, sha(promptForLater(single)));
    assert.equal(generatedLater.candidate.metadata.flop_policy_hash, generated.candidate.metadata.policy_hash);
    await generate(multi, { ...options, generator: async prompt => {
      providers++; assert.doesNotMatch(prompt, /SINGLE-SIZE MODE/); return flopPolicy(multi.spot.tree);
    } });
    const multiCandidate = records.get(multiPaths.candidate);
    assert.equal(Object.hasOwn(multiCandidate.metadata, "sizing"), false);
    await generateLater(multi, multiCandidate, { ...options, generator: async prompt => {
      providers++; assert.doesNotMatch(prompt, /SINGLE-SIZE MODE/); return laterPolicy();
    } });
    assert.equal(Object.hasOwn(records.get(multiPaths.laterCandidate).metadata, "sizing"), false);
    assert.deepEqual(writes, [singlePaths.candidate, singlePaths.laterCandidate, multiPaths.candidate, multiPaths.laterCandidate]);
    const mustNotGenerate = async () => { providers++; throw new Error("Provider must not be used for reuse"); };
    assert.equal((await generate(single, { ...options, generator: mustNotGenerate })).reused, true);
    assert.equal((await generateLater(single, generated.candidate, { ...options, generator: mustNotGenerate })).reused, true);
    assert.equal(providers, 4); assert.equal(writes.length, 4);
    records.set(singlePaths.candidate, { ...generated.candidate, metadata: { ...generated.candidate.metadata, prompt_hash: "stale" } });
    await assert.rejects(generate(single, { ...options, generator: mustNotGenerate }), /prompt or source is stale/);
    records.set(singlePaths.candidate, { ...generated.candidate, metadata: { ...generated.candidate.metadata, source_hash: "stale" } });
    await assert.rejects(generate(single, { ...options, generator: mustNotGenerate }), /source is stale/);
    records.set(singlePaths.candidate, generated.candidate);
    records.set(singlePaths.laterCandidate, { ...generatedLater.candidate, metadata: { ...generatedLater.candidate.metadata, prompt_hash: "stale" } });
    await assert.rejects(generateLater(single, generated.candidate, { ...options, generator: mustNotGenerate }), /prompt or source is stale/);
    assert.equal(providers, 4); assert.equal(writes.length, 4, "stale reuse neither calls providers nor overwrites saved files");
  });
});

test("invalid mocked Single Size provider output never saves flop or later artifacts", async () => {
  const inputs = loadInputs(undefined, { sizing: "single" }), records = new Map();
  const invalidFlop = flopPolicy(inputs.spot.tree);
  invalidFlop.rules.find(rule => rule.node === "btn_first" && rule.tier === "monster").mix = mix(NODES.btn_first, "bet75");
  const invalidLater = laterPolicy();
  invalidLater.streets.turn.rules.find(rule => rule.node === "turn_oop_first" && rule.tier === "monster").mix = mix(LATER_NODES.turn_oop_first, "bet75");
  await withArtifacts(records, async writes => {
    const options = { model: "fixture-model", effort: "high" };
    await assert.rejects(generate(inputs, { ...options, generator: async () => invalidFlop }), /several bet sizes/);
    await assert.rejects(generateLater(inputs, candidateFixtures(inputs).candidate,
      { ...options, generator: async () => invalidLater }), /several bet sizes/);
    assert.equal(records.size, 0); assert.deepEqual(writes, []);
  });
});

test("local Single Size query and cache are separate; omitted/explicit Multi Size URLs stay unchanged", async () => {
  assert.equal(postflopUrl("spot", { spot: "BTN_open_BB_call" }, ""), "/local-postflop-spot?spot=BTN_open_BB_call");
  assert.equal(postflopUrl("spot", { spot: "BTN_open_BB_call", sizing: "multi" }, ""), "/local-postflop-spot?spot=BTN_open_BB_call");
  assert.equal(postflopUrl("spot", { spot: "BTN_open_BB_call", sizing: "single" }, ""), "/local-postflop-spot?spot=BTN_open_BB_call&sizing=single");
  const originalFetch = globalThis.fetch, urls = [], spot = "single-size-cache-fixture";
  globalThis.fetch = async url => {
    urls.push(String(url)); const sizing = new URL(String(url), "http://localhost").searchParams.get("sizing");
    return { ok: true, json: async () => ({ kind: "ai_estimate_not_gto", spot: { id: spot },
      candidate: { policy: {}, metadata: {} }, report: {}, ...(sizing ? { sizing } : {}) }) };
  };
  try {
    const multi = await loadPostflopSpot(spot, undefined, {}, "");
    assert.equal(await loadPostflopSpot(spot, undefined, { sizing: "multi" }, ""), multi);
    const single = await loadPostflopSpot(spot, undefined, { sizing: "single" }, "");
    assert.equal(await loadPostflopSpot(spot, undefined, { sizing: "single" }, ""), single);
    assert.notEqual(single, multi);
    assert.deepEqual(urls, [`/local-postflop-spot?spot=${spot}`, `/local-postflop-spot?spot=${spot}&sizing=single`]);
    await assert.rejects(loadPostflopSpot(spot, undefined, { sizing: "single" }, "https://api.example.test"),
      { code: "SINGLE_SIZE_UNAVAILABLE", message: "Single Size の方針はまだ配信されていません。" });
    assert.throws(() => postflopUrl("spot", { spot, sizing: "single" }, "https://api.example.test"), { code: "SINGLE_SIZE_UNAVAILABLE" });
    await assert.rejects(loadPostflopSpot(spot, undefined, { sizing: "invalid" }, ""), /Invalid postflop sizing/);
    assert.equal(urls.length, 2, "published single and invalid sizing must not issue a request");
  } finally { globalThis.fetch = originalFetch; }
});
