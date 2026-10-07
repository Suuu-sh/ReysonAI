import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { buildInputs } from "../scripts/postflop-ai/browser-inputs.ts";
import { artifactPaths, config, loadInputs, useArtifactSource } from "../scripts/postflop-ai/inputs.mjs";
import { generate, generateLater, loadCandidate, loadLaterCandidate, promptFor, promptForLater, sha } from "../scripts/postflop-ai/generate.mjs";
import { generationInputOptions, normalizeGenerationOptions } from "../scripts/postflop-ai/generation-options.mjs";
import { defaultOpponentSeat } from "../src/estimated/postflop-profile-state.ts";
import { POSTFLOP_SPOTS } from "../scripts/postflop-ai/spots.ts";
import { referencePolicyFor, nodeRole } from "../scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { laterNodeRole } from "../scripts/postflop-ai/later-tree.ts";
import { profileArtifactKey, resolveFlopCandidate, resolveLaterCandidate } from "../scripts/postflop-ai/candidate-source.ts";

const spotId = "BTN_open_BB_call";
const profiles = ["nit", "station", "lag", "maniac"];
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/postflop-standard-prompts.json", import.meta.url), "utf8"));
// Small actual buildInputs fixture: the opponent ranges differ markedly, so a
// standard-summary substitution cannot accidentally pass profile prompt tests.
const opening = { id: "BTN_open", hero: "BTN", open_size_bb: 2.5, effective_stack_bb: 100,
  hands: ["AA", "AKs", "76s"].map(hand => ({ hand, open: 100, fold: 0, open_size_bb: 2.5 })) };
const response = { id: "BB_vs_BTN", hero: "BB", opener: "BTN", open_size_bb: 2.5, effective_stack_bb: 100,
  hands: opening.hands.map(({ hand }) => ({ hand, call: 60, fold: 40, three_bet: 0, three_bet_size_bb: null })) };
const datasets = { "opening-ranges": { spots: [opening] }, "preflop-ranges": { spots: [response] } };
for (const profile of profiles) {
  datasets[`profiles/${profile}/villain/opening-ranges`] = { spots: [{ ...opening,
    hands: opening.hands.map(row => ({ ...row, open: row.hand === "AA" ? 100 : 0 })) }] };
  datasets[`profiles/${profile}/villain/preflop-ranges`] = { spots: [{ ...response,
    hands: response.hands.map(row => ({ ...row, call: row.hand === "76s" ? 100 : 0 })) }] };
}
const inputsFor = (profile = "nit", opponentSeat = "ip") => buildInputs(spotId, datasets, { opponentProfile: profile, opponentSeat });
const standard = buildInputs(spotId, datasets);
const options = (profile = "nit", role = "villain", extra = {}) => ({ profile, role, model: "mock-model", effort: "high", ...extra });
function rawCandidate(inputs, role = "villain", policy = referencePolicyFor(inputs.spot.tree), extra = {}) {
  return { policy, metadata: { kind: "ai_estimate_not_gto", source_hash: inputs.fingerprint,
    structure_hash: inputs.structure_hash, policy_hash: sha(policy), spot: inputs.spot.id, tree: inputs.spot.tree,
    config_version: config.version, profile: inputs.opponentProfile, role, ...extra } };
}
function withArtifacts(inputs, artifacts, callback) {
  const previous = useArtifactSource({ ranges: datasets, artifact: () => { throw new Error("Must not read standard storage"); },
    profileArtifact: key => artifacts[key] ?? null });
  try { return callback(); } finally { useArtifactSource(previous); }
}
// Write mocks only under unique test slugs, never production or real profile
// candidates. Cleanup lists exact owned files rather than deleting directories.
async function withUniqueFiles(callback) {
  const inputs = inputsFor();
  inputs.spot = { ...inputs.spot, slug: `test-profile-generation-${randomUUID()}` };
  const paths = ["villain", "exploit"].flatMap(role => Object.values(artifactPaths(inputs.spot, { profile: "nit", role })));
  try {
    assert.ok(paths.every(path => !existsSync(path)));
    return await callback(inputs);
  } finally { for (const path of paths) rmSync(path, { force: true }); }
}

test("standard flop and later prompts match exact pre-edit fixtures byte for byte", () => {
  for (const fixture of fixtures) {
    assert.equal(promptFor(fixture.inputs), fixture.flop, fixture.inputs.spot.id);
    assert.equal(promptForLater(fixture.inputs), fixture.later, fixture.inputs.spot.id);
    assert.equal(promptFor(fixture.inputs, { profile: "standard" }), fixture.flop);
  }
});

test("generation input defaults reuse Stage B for every spot, including all limp branches", () => {
  for (const spot of POSTFLOP_SPOTS) {
    assert.deepEqual(generationInputOptions(spot.id), {});
    assert.deepEqual(generationInputOptions(spot.id, "nit"), { opponentProfile: "nit", opponentSeat: defaultOpponentSeat({ spotId: spot.id }) });
    if (spot.kind === "limp") assert.equal(spot[generationInputOptions(spot.id, "nit").opponentSeat], "BB");
  }
  assert.throws(() => generationInputOptions("unknown", "nit"), /Unknown/);
  assert.throws(() => generationInputOptions(spotId, "unknown"), /Invalid opponent profile/);
  assert.deepEqual(generationInputOptions(spotId, "nit"), { opponentProfile: "nit", opponentSeat: "ip" });
});

test("both prompt stages express every personality and counterplay as complete seat-independent role policies", () => {
  const traits = { nit: /low betting frequency.*few bluffs/, station: /calls too often.*rarely raises/,
    lag: /high betting, raising and bluffing/, maniac: /extremely frequent overbets, all-ins/ };
  const counters = { nit: /bluff more.*fold readily/, station: /reduce bluffs.*larger and thinner/,
    lag: /induce further aggression.*widen bluff-catching/, maniac: /bluff-catch even wider.*commit stacks/ };
  for (const profile of profiles) for (const role of ["villain", "exploit"]) for (const prompt of [promptFor, promptForLater]) {
    const text = prompt(inputsFor(profile), { profile, role });
    assert.match(text, traits[profile]); assert.match(text, counters[profile]);
    if (profile === "station") assert.match(text, /weak pairs and draws still do not fold easily/);
    assert.match(text, new RegExp(`Profile: ${profile}; role: ${role}`));
    assert.match(text, /At EVERY IP and OOP node/);
    assert.match(text, /occupying either seat/);
    assert.match(text, /explicitly supersede generic balanced/);
    assert.doesNotMatch(text, /do not exploit an opponent that folds too often/);
    assert.match(text, /fallback/); assert.match(text, /OOP/);
    if (prompt === promptForLater) assert.match(text, /Donk bets are rare/);
    else assert.match(text, /Board height decides range advantage/);
  }
});

test("profile prompt range summaries reflect buildInputs and loadInputs opponent-seat ranges, not standard", () => {
  for (const opponentSeat of ["ip", "oop"]) {
    const inputs = inputsFor("nit", opponentSeat);
    const previous = useArtifactSource({ ranges: datasets, artifact: () => null });
    try { assert.deepEqual(loadInputs(spotId, { opponentProfile: "nit", opponentSeat }), inputs); }
    finally { useArtifactSource(previous); }
    for (const prompt of [promptFor, promptForLater]) {
      const profileText = prompt(inputs, { profile: "nit", role: "villain" });
      // The legacy formatter itself is unchanged and can summarize any input rows.
      const expected = prompt(inputs);
      const summary = expected.split("\n").find(line => line.startsWith(prompt === promptFor ? "Example design flops:" : "Preflop range summaries"));
      assert.ok(profileText.includes(summary));
      assert.notEqual(summary, prompt(standard).split("\n").find(line => line.startsWith(prompt === promptFor ? "Example design flops:" : "Preflop range summaries")));
      assert.match(profileText, new RegExp(`opponent is ${inputs.spot[opponentSeat]} \\(${opponentSeat.toUpperCase()}\\)`));
    }
  }
});

test("invalid profile/role/input/model requests reject before provider or filesystem writes", async () => {
  let calls = 0;
  const generator = async () => { calls++; throw new Error("No provider invocation permitted"); };
  const cases = [
    [inputsFor(), options("unknown")], [inputsFor(), options("nit", "wrong")],
    [inputsFor(), { generator }], [inputsFor(), options("station")], [standard, options()],
    [{ ...inputsFor(), opponentSeat: "invalid" }, options()],
    [{ ...inputsFor(), fingerprint: "stale" }, options()],
    [{ ...inputsFor(), structure_hash: "" }, options()],
    [{ ...inputsFor(), seatRows: {} }, options()],
    [inputsFor(), options("nit", "villain", { model: "bad model" })],
    [inputsFor(), options("nit", "villain", { effort: "bad effort" })],
    [standard, { role: "villain" }], [standard, { force: true }],
  ];
  for (const [inputs, selected] of cases) {
    const request = { ...selected, generator };
    await assert.rejects(generate(inputs, request));
    await assert.rejects(generateLater(inputs, null, request));
  }
  assert.equal(calls, 0);
  assert.throws(() => normalizeGenerationOptions({ profile: "nit", role: "villain", force: "yes" }), /boolean/);
});

test("role-specific profile loaders reject swapped, absent, wrong-profile and wrong-geometry identity", () => {
  const inputs = inputsFor(), flopKey = profileArtifactKey(inputs.spot, "candidate", "nit", "villain");
  const laterKey = profileArtifactKey(inputs.spot, "laterCandidate", "nit", "villain");
  for (const mutate of [item => item.metadata.role = "exploit", item => delete item.metadata.role,
    item => item.metadata.profile = "station", item => delete item.metadata.profile,
    item => item.metadata.structure_hash = "bad", item => item.metadata.spot = "wrong"]) {
    const flop = rawCandidate(inputs), later = rawCandidate(inputs, "villain", referenceLaterPolicy(), { flop_policy_hash: flop.metadata.policy_hash });
    mutate(flop);
    withArtifacts(inputs, { [flopKey]: flop, [laterKey]: later }, () => {
      assert.throws(() => loadCandidate(inputs, "villain"), /identity mismatch/);
      assert.throws(() => loadLaterCandidate(inputs, flop, "villain"), /identity mismatch/);
    });
    const goodFlop = rawCandidate(inputs); mutate(later);
    withArtifacts(inputs, { [flopKey]: goodFlop, [laterKey]: later }, () => assert.throws(() => loadLaterCandidate(inputs, goodFlop, "villain"), /identity mismatch/));
  }
});

test("profile generation saves locally with identity; valid existing candidate is reused without calling mock", async () => withUniqueFiles(async inputs => {
  let calls = 0;
  const generator = async (prompt, request) => {
    calls++; assert.match(prompt, /role: villain/); assert.equal(request.model, "mock-model");
    request.onThread({ model: "mock-model", reasoningEffort: "high" });
    return referencePolicyFor(inputs.spot.tree);
  };
  const request = options("nit", "villain", { generator });
  const result = await generate(inputs, request);
  assert.equal(result.reused, false); assert.equal(calls, 1);
  assert.deepEqual(result.candidate.metadata, { kind: "ai_estimate_not_gto", scope: "12 representative flops; flop only; not published",
    spot: inputs.spot.id, tree: inputs.spot.tree, source_hash: inputs.fingerprint, structure_hash: inputs.structure_hash,
    policy_hash: sha(result.candidate.policy), config_version: config.version, model: "mock-model", reasoning_effort: "high",
    prompt_hash: sha(promptFor(inputs, request)), profile: "nit", role: "villain" });
  const path = artifactPaths(inputs.spot, request).candidate;
  assert.ok(path.includes("/.local/postflop-ai/profiles/nit/"));
  assert.equal(readFileSync(path, "utf8"), `${JSON.stringify(result.candidate, null, 2)}\n`);
  const reused = await generate(inputs, request);
  assert.equal(reused.reused, true); assert.equal(calls, 1); assert.deepEqual(reused.candidate, result.candidate);
}));

test("existing invalid/stale candidate fails safely, explicit force replaces only after a valid reply", async () => withUniqueFiles(async inputs => {
  const path = artifactPaths(inputs.spot, options()).candidate;
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, "broken existing JSON");
  let calls = 0;
  const generator = async () => { calls++; return referencePolicyFor(inputs.spot.tree); };
  await assert.rejects(generate(inputs, options("nit", "villain", { generator })));
  assert.equal(calls, 0); assert.equal(readFileSync(path, "utf8"), "broken existing JSON");
  await assert.rejects(generate(inputs, options("nit", "villain", { force: true, generator: async () => ({}) })));
  assert.equal(readFileSync(path, "utf8"), "broken existing JSON");
  const forced = await generate(inputs, options("nit", "villain", { generator, force: true }));
  assert.equal(forced.reused, false); assert.equal(calls, 1);
  const stale = structuredClone(forced.candidate); stale.metadata.source_hash = "a".repeat(64);
  writeFileSync(path, JSON.stringify(stale));
  await assert.rejects(generate(inputs, options("nit", "villain", { generator })), /fingerprint is stale/);
  assert.equal(calls, 1); assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), stale);
  await generate(inputs, options("nit", "villain", { generator, force: true })); assert.equal(calls, 2);
}));

test("later generation uses the same raw role flop candidate, preserves linkage and reuses/forces safely", async () => withUniqueFiles(async inputs => {
  const flop = rawCandidate(inputs), exploitFlop = rawCandidate(inputs, "exploit");
  let calls = 0;
  const generator = async prompt => { calls++; assert.match(prompt, /role: villain/); return referenceLaterPolicy(); };
  const request = options("nit", "villain", { generator });
  for (const wrong of [null, exploitFlop, { ...flop, profileCandidates: { villain: flop, exploit: exploitFlop } },
    { ...flop, metadata: { ...flop.metadata, source_hash: "b".repeat(64) } },
    { ...flop, metadata: { ...flop.metadata, policy_hash: "bad" } }]) await assert.rejects(generateLater(inputs, wrong, request));
  assert.equal(calls, 0);
  const first = await generateLater(inputs, flop, request); assert.equal(first.reused, false); assert.equal(calls, 1);
  assert.equal(first.candidate.metadata.flop_policy_hash, flop.metadata.policy_hash);
  assert.equal(first.candidate.metadata.profile, "nit"); assert.equal(first.candidate.metadata.role, "villain");
  assert.equal(first.candidate.metadata.source_hash, inputs.fingerprint); assert.equal(first.candidate.metadata.structure_hash, inputs.structure_hash);
  const second = await generateLater(inputs, flop, request); assert.equal(second.reused, true); assert.equal(calls, 1);
  const path = artifactPaths(inputs.spot, request).laterCandidate;
  const corrupt = structuredClone(first.candidate); corrupt.metadata.flop_policy_hash = "bad";
  writeFileSync(path, JSON.stringify(corrupt));
  await assert.rejects(generateLater(inputs, flop, request), /flop policy is stale/); assert.equal(calls, 1);
  await generateLater(inputs, flop, { ...request, force: true }); assert.equal(calls, 2);
}));

test("CLI rejects malformed generation flags before loading inputs or provider calls", () => {
  for (const args of [["--profile", "unknown", "--role", "villain"], ["--profile", "nit"], ["--role", "villain"], ["--force"],
    ["--profile", "nit", "--role", "villain", "--force", "yes"],
    ["--profile", "--role", "villain"], ["--model", "--force"],
    ["--profile", "nit", "--role", "villain", "--opponent-seat", "bad"], ["--opponent-seat", "ip"]]) {
    const run = spawnSync(process.execPath, ["scripts/postflop-ai/cli.mjs", "generate", ...args], { encoding: "utf8" });
    assert.notEqual(run.status, 0); assert.match(run.stderr, /Invalid opponent profile|requires role|nonstandard profile|only supported|Usage|must be ip or oop/);
  }
});

test("explicit opponent-seat admits profile-only SB flats without changing last-aggressor default", () => {
  const sbFlatId = "BTN_open_SB_call";
  const sbResponse = { ...response, id: "SB_vs_BTN", hero: "SB", hands: response.hands.map(row => ({ ...row, call: 0, fold: 100 })) };
  const sbVillain = { ...sbResponse, hands: sbResponse.hands.map(row => ({ ...row, call: 80, fold: 20 })) };
  const source = { ...datasets,
    "preflop-ranges": { spots: [response, sbResponse] },
    "profiles/nit/villain/preflop-ranges": { spots: [datasets["profiles/nit/villain/preflop-ranges"].spots[0], sbVillain] },
  };
  assert.deepEqual(generationInputOptions(sbFlatId, "nit"), { opponentProfile: "nit", opponentSeat: "ip" });
  const explicit = generationInputOptions(sbFlatId, "nit", "oop");
  assert.deepEqual(explicit, { opponentProfile: "nit", opponentSeat: "oop" });
  assert.throws(() => buildInputs(sbFlatId, source, generationInputOptions(sbFlatId, "nit")), /unreachable after range adjustment/);
  const inputs = buildInputs(sbFlatId, source, explicit);
  assert.equal(inputs.spot.oop, "SB"); assert.ok(inputs.seatRows.SB.every(row => row.freq === 80));
  const previous = useArtifactSource({ ranges: source, artifact: () => null });
  try { assert.deepEqual(loadInputs(sbFlatId, explicit), inputs); } finally { useArtifactSource(previous); }
  assert.match(promptFor(inputs, { profile: "nit", role: "villain", opponentSeat: "oop" }), /opponent is SB \(OOP\)/);
  assert.throws(() => promptFor(inputs, { profile: "nit", role: "villain", opponentSeat: "ip" }), /seat does not match/);
  assert.throws(() => generationInputOptions(sbFlatId, "nit", "invalid"), /must be ip or oop/);
  assert.throws(() => generationInputOptions(sbFlatId, "standard", "oop"), /nonstandard profile/);
  assert.throws(() => normalizeGenerationOptions({ profile: "nit", role: "villain", opponentSeat: "invalid" }), /must be ip or oop/);
  assert.throws(() => normalizeGenerationOptions({ opponentSeat: "oop" }), /nonstandard profile/);
});


test("explicit empty/null loader roles and malformed raw flop identities fail closed", () => {
  const inputs = inputsFor();
  const flop = rawCandidate(inputs), later = rawCandidate(inputs, "villain", referenceLaterPolicy(), { flop_policy_hash: flop.metadata.policy_hash });
  const artifacts = { [profileArtifactKey(inputs.spot, "candidate", "nit", "villain")]: flop,
    [profileArtifactKey(inputs.spot, "laterCandidate", "nit", "villain")]: later };
  withArtifacts(inputs, artifacts, () => {
    for (const role of ["", null, "wrong"]) {
      assert.throws(() => loadCandidate(inputs, role), /Invalid profile/);
      assert.throws(() => loadLaterCandidate(inputs, flop, role), /identity mismatch/);
    }
    delete flop.metadata.tree;
    assert.throws(() => loadCandidate(inputs, "villain"), /identity mismatch/);
    assert.throws(() => loadLaterCandidate(inputs, flop, "villain"), /identity mismatch/);
    flop.metadata.tree = inputs.spot.tree;
    flop.policy = {}; flop.metadata.policy_hash = sha(flop.policy);
    assert.throws(() => loadLaterCandidate(inputs, flop, "villain"), /policy envelope/);
  });
});


test("generated on-disk role pairs resolve through Stage C flop/later composition", async () => withUniqueFiles(async inputs => {
  const flopPair = {}, laterPair = {};
  const authored = (policy, role, later = false) => {
    const rules = later ? Object.values(policy.streets).flatMap(street => street.rules) : policy.rules;
    for (const rule of rules) {
      const actions = Object.keys(rule.mix);
      const selected = role === "villain" ? actions[0] : actions.at(-1);
      rule.mix = Object.fromEntries(actions.map(action => [action, action === selected ? 100 : 0]));
    }
    return policy;
  };
  for (const role of ["villain", "exploit"]) {
    const request = options("nit", role, { generator: async () => authored(referencePolicyFor(inputs.spot.tree), role) });
    const flop = await generate(inputs, request);
    const later = await generateLater(inputs, flop.candidate, { ...request,
      generator: async () => authored(referenceLaterPolicy(), role, true) });
    assert.equal(flop.reused, false); assert.equal(later.reused, false);
    for (const [kind, generated, pair] of [["candidate", flop.candidate, flopPair], ["laterCandidate", later.candidate, laterPair]]) {
      const key = profileArtifactKey(inputs.spot, kind, "nit", role);
      const path = artifactPaths(inputs.spot, request)[kind];
      assert.ok(path.endsWith(`/.local/postflop-ai/${key}.json`));
      pair[role] = JSON.parse(readFileSync(path, "utf8"));
      assert.deepEqual(pair[role], generated);
    }
  }
  const resolved = resolveFlopCandidate(inputs, flopPair);
  assert.deepEqual(loadCandidate(inputs), resolved);
  assert.deepEqual(resolved.profileCandidates, flopPair);
  for (const rule of resolved.policy.rules) {
    const role = nodeRole(rule.node) === inputs.opponentSeat ? "villain" : "exploit";
    assert.deepEqual(rule, flopPair[role].policy.rules.find(item => item.node === rule.node && item.tier === rule.tier && item.texture === rule.texture));
  }
  const resolvedLater = resolveLaterCandidate(inputs, laterPair, resolved);
  assert.deepEqual(loadLaterCandidate(inputs, resolved), resolvedLater);
  assert.deepEqual(resolvedLater.profileCandidates, laterPair);
  assert.equal(resolvedLater.metadata.flop_policy_hash, resolved.metadata.policy_hash);
  for (const street of ["turn", "river"]) for (const rule of resolvedLater.policy.streets[street].rules) {
    const role = laterNodeRole(rule.node) === inputs.opponentSeat ? "villain" : "exploit";
    assert.deepEqual(rule, laterPair[role].policy.streets[street].rules.find(item => item.node === rule.node && item.tier === rule.tier && item.texture === rule.texture && item.line === rule.line));
  }
}));
