import test from "node:test";
import assert from "node:assert/strict";
import { artifactPaths, loadInputs, useArtifactSource } from "../scripts/postflop-ai/inputs.mjs";
import { buildInputs, sha } from "../scripts/postflop-ai/browser-inputs.ts";
import { generate, generateLater, loadCandidate, loadLaterCandidate } from "../scripts/postflop-ai/generate.mjs";
import { matchesCandidateSource, profileArtifactKey, resolveFlopCandidate, resolveLaterCandidate } from "../scripts/postflop-ai/candidate-source.ts";
import { referencePolicyFor, nodeRole, NODES } from "../scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { laterNodeRole, LATER_NODES } from "../scripts/postflop-ai/later-tree.ts";
import { computeBoard, computeLaterView } from "../src/estimated/postflop-compute.ts";

const spotId = "BTN_open_BB_call", profile = "maniac";
const clone = value => structuredClone(value);
const hands = ["AA", "AKs", "76s"];
// Tiny deterministic source ranges; policy fixtures still cover the entire ordinary schema.
const opening = { id: "BTN_open", hero: "BTN", open_size_bb: 2.5, effective_stack_bb: 100,
  hands: hands.map(hand => ({ hand, open: 100, fold: 0, open_size_bb: 2.5 })) };
const response = { id: "BB_vs_BTN", hero: "BB", opener: "BTN", open_size_bb: 2.5, effective_stack_bb: 100,
  hands: hands.map(hand => ({ hand, call: 60, fold: 40, three_bet: 0, three_bet_size_bb: null })) };
const villainOpening = { ...clone(opening), hands: opening.hands.map(row => ({ ...row, open: 80, fold: 20 })) };
const villainResponse = { ...clone(response), hands: response.hands.map(row => ({ ...row, call: 90, fold: 10 })) };
const datasets = {
  "opening-ranges": { spots: [opening] }, "preflop-ranges": { spots: [response] },
  [`profiles/${profile}/villain/opening-ranges`]: { spots: [villainOpening] },
  [`profiles/${profile}/villain/preflop-ranges`]: { spots: [villainResponse] },
};
const base = buildInputs(spotId, datasets);
const optionsFor = opponentSeat => ({ opponentProfile: profile, opponentSeat });
const sourceFor = (standard, profileArtifacts = {}, onStandard = () => {}) => ({ ranges: datasets,
  artifact: (_spot, kind) => { onStandard(kind); return standard[kind] ?? null; },
  profileArtifact: key => profileArtifacts[key] ?? null,
});
function withSource(source, run) {
  const previous = useArtifactSource(source);
  try { return run(); } finally { useArtifactSource(previous); }
}
function candidate(policy, inputs = base, extra = {}) {
  return { policy, metadata: { source_hash: inputs.fingerprint, policy_hash: sha(policy),
    config_version: inputs.config.version, spot: inputs.spot.id, tree: inputs.spot.tree, ...extra } };
}
function rawMix(node, role, later = false) {
  const actions = (later ? LATER_NODES : NODES)[node];
  const selected = Object.fromEntries(actions.map(action => [action, 0]));
  if (node.endsWith("_first")) {
    if (later && node.startsWith("river_") && role === "villain") selected.allin = 100;
    else Object.assign(selected, { check: role === "villain" ? 20 : 60, bet33: role === "villain" ? 80 : 40 });
  } else Object.assign(selected, { fold: role === "villain" ? 35 : 75, call: role === "villain" ? 65 : 25 });
  return selected;
}
function profileFixtures(inputs) {
  const flopPair = {}, laterPair = {}, artifacts = {};
  for (const role of ["villain", "exploit"]) {
    const flopPolicy = referencePolicyFor(inputs.spot.tree);
    for (const rule of flopPolicy.rules) rule.mix = rawMix(rule.node, role);
    flopPair[role] = candidate(flopPolicy, inputs, { profile, role, structure_hash: inputs.structure_hash });
    const laterPolicy = referenceLaterPolicy();
    for (const street of ["turn", "river"]) for (const rule of laterPolicy.streets[street].rules) rule.mix = rawMix(rule.node, role, true);
    laterPair[role] = candidate(laterPolicy, inputs, { profile, role, structure_hash: inputs.structure_hash,
      flop_policy_hash: flopPair[role].metadata.policy_hash });
    artifacts[profileArtifactKey(inputs.spot, "candidate", profile, role)] = flopPair[role];
    artifacts[profileArtifactKey(inputs.spot, "laterCandidate", profile, role)] = laterPair[role];
  }
  return { flopPair, laterPair, artifacts };
}
function standardFixtures() {
  const flop = candidate(referencePolicyFor(base.spot.tree));
  const later = candidate(referenceLaterPolicy(), base, { flop_policy_hash: flop.metadata.policy_hash });
  return { candidate: flop, laterCandidate: later };
}
function assertRows(rows, expected) {
  const positive = rows.filter(row => row.reachable && row.reachWeight > 0);
  assert.ok(positive.length > 0, "at least one positive reached hand");
  for (const row of positive) {
    for (const [action, frequency] of Object.entries(expected)) assert.ok(Math.abs(row.mix[action] - frequency / 100) < 1e-10,
      `${row.hand}/${action}: ${row.mix[action]} versus authored ${frequency}%`);
    for (const combo of row.combos.filter(combo => (combo.reachWeight ?? combo.weight) > 0)) {
      for (const [action, frequency] of Object.entries(expected)) assert.equal(combo.mix[action], frequency / 100);
    }
  }
}

test("standard loaders reject stale full sources even if structural hashes match", () => {
  const fixture = standardFixtures();
  withSource(sourceFor(fixture), () => {
    assert.deepEqual(loadInputs(spotId), base);
    assert.equal(loadCandidate(base), fixture.candidate);
    assert.equal(loadLaterCandidate(base, fixture.candidate), fixture.laterCandidate);
    fixture.candidate.metadata.source_hash = "stale";
    fixture.candidate.metadata.structure_hash = base.structure_hash;
    assert.throws(() => loadCandidate(base), /source is stale/);
    assert.throws(() => resolveFlopCandidate(base, fixture.candidate), /source is stale/);
    fixture.candidate.metadata.source_hash = base.fingerprint;
    fixture.laterCandidate.metadata.source_hash = "stale";
    assert.throws(() => loadLaterCandidate(base, fixture.candidate), /source or flop policy is stale/);
  });
});

test("adjusted legacy loading accepts only baseline/current identity or explicit matching geometry", () => {
  const adjusted = buildInputs(spotId, datasets, { tableProfile: { call: "high" } });
  assert.equal(adjusted.baselineFingerprint, base.fingerprint);
  assert.notEqual(adjusted.fingerprint, base.fingerprint);
  const fixture = standardFixtures();
  withSource(sourceFor(fixture), () => {
    for (const hash of [adjusted.baselineFingerprint, adjusted.fingerprint]) {
      fixture.candidate.metadata.source_hash = hash;
      fixture.laterCandidate.metadata.source_hash = hash;
      assert.equal(loadCandidate(adjusted), fixture.candidate);
      assert.equal(loadLaterCandidate(adjusted, fixture.candidate), fixture.laterCandidate);
      assert.equal(resolveFlopCandidate(adjusted, fixture.candidate), fixture.candidate);
    }
    fixture.candidate.metadata.source_hash = "unrelated-old-range";
    assert.throws(() => loadCandidate(adjusted), /source is stale/);
    fixture.candidate.metadata.structure_hash = adjusted.structure_hash;
    assert.equal(loadCandidate(adjusted), fixture.candidate);
    fixture.candidate.metadata.structure_hash = "different-pot-stack-tree";
    fixture.candidate.metadata.source_hash = adjusted.baselineFingerprint;
    assert.throws(() => loadCandidate(adjusted), /source is stale/);
    assert.throws(() => resolveFlopCandidate(adjusted, fixture.candidate), /source is stale/);
    fixture.candidate.metadata.structure_hash = adjusted.structure_hash;
    fixture.laterCandidate.metadata.structure_hash = "different-pot-stack-tree";
    assert.throws(() => loadLaterCandidate(adjusted, fixture.candidate), /source or flop policy is stale/);
  });
});

test("adjusted candidates without a baseline fingerprint still require a nonempty saved source identity", () => {
  const adjusted = { ...buildInputs(spotId, datasets, { tableProfile: { call: "high" } }) };
  // Profile-only histories such as SB-flat cannot supply a reachable standard baseline.
  delete adjusted.baselineFingerprint;
  const fixture = standardFixtures();
  fixture.candidate.metadata.source_hash = adjusted.fingerprint;
  fixture.laterCandidate.metadata.source_hash = adjusted.fingerprint;
  withSource(sourceFor(fixture), () => {
    assert.equal(matchesCandidateSource(adjusted, fixture.candidate), true);
    assert.equal(loadCandidate(adjusted), fixture.candidate);
    assert.equal(loadLaterCandidate(adjusted, fixture.candidate), fixture.laterCandidate);
    assert.equal(resolveFlopCandidate(adjusted, fixture.candidate), fixture.candidate);
    for (const savedSource of [undefined, "", null, 0, "arbitrarily-stale-nonempty-source"]) {
      fixture.candidate.metadata.source_hash = savedSource;
      delete fixture.candidate.metadata.structure_hash;
      assert.equal(matchesCandidateSource(adjusted, fixture.candidate), false);
      assert.throws(() => loadCandidate(adjusted), /source is stale/);
      assert.throws(() => resolveFlopCandidate(adjusted, fixture.candidate), /source is stale/);
    }
    // A valid explicit geometry stamp cannot replace the required source_hash envelope.
    for (const savedSource of [undefined, "", null, 0]) {
      fixture.candidate.metadata.source_hash = savedSource;
      fixture.candidate.metadata.structure_hash = adjusted.structure_hash;
      assert.equal(matchesCandidateSource(adjusted, fixture.candidate), false);
      assert.throws(() => loadCandidate(adjusted), /source is stale/);
    }
    delete fixture.candidate.metadata.source_hash;
    assert.equal(matchesCandidateSource(adjusted, fixture.candidate), false);
    assert.throws(() => resolveFlopCandidate(adjusted, fixture.candidate), /source is stale/);
    fixture.candidate.metadata.source_hash = adjusted.fingerprint;
    delete fixture.candidate.metadata.structure_hash;
    for (const withGeometry of [false, true]) {
      delete fixture.laterCandidate.metadata.source_hash;
      if (withGeometry) fixture.laterCandidate.metadata.structure_hash = adjusted.structure_hash;
      else delete fixture.laterCandidate.metadata.structure_hash;
      assert.throws(() => loadLaterCandidate(adjusted, fixture.candidate), /source or flop policy is stale/);
      assert.throws(() => resolveLaterCandidate(adjusted, fixture.laterCandidate, fixture.candidate), /source or flop policy is stale/);
    }
  });
});

test("Implicit/standard adjusted authoring guards reject before artifact lookup or injected generation", async () => {
  for (const selected of [
    buildInputs(spotId, datasets, { tableProfile: { call: "high" } }),
    buildInputs(spotId, datasets, optionsFor("oop")),
  ]) {
    let generatorCalls = 0;
    const guarded = { ...selected, get spot() { throw new Error("Authoring must reject before constructing an artifact path"); } };
    const generator = async () => { generatorCalls++; throw new Error("No generation is authorized"); };
    const options = { model: "gpt-6-luna", generator };
    await assert.rejects(generate(guarded, options), /Standard policy authoring with adjusted inputs is not enabled/);
    await assert.rejects(generateLater(guarded, null, options), /Standard policy authoring with adjusted inputs is not enabled/);
    assert.equal(generatorCalls, 0);
  }
});

test("profile artifact paths are role-specific and cannot target standard storage", () => {
  for (const role of ["villain", "exploit"]) {
    const paths = artifactPaths(base.spot, { profile, role });
    assert.ok(paths.candidate.endsWith(`/.local/postflop-ai/profiles/${profile}/${base.spot.slug}-${role}-policy.json`));
    assert.ok(paths.laterCandidate.endsWith(`/.local/postflop-ai/profiles/${profile}/${base.spot.slug}-${role}-later-policy.json`));
    assert.equal(profileArtifactKey(base.spot, "candidate", profile, role), `profiles/${profile}/${base.spot.slug}-${role}-policy`);
  }
  assert.ok(artifactPaths(base.spot).candidate.includes("/scripts/data/postflop-ai/policies/"));
  assert.throws(() => profileArtifactKey(base.spot, "candidate", "unknown", "villain"), /Invalid profile/);
  assert.throws(() => profileArtifactKey(base.spot, "candidate", profile, "unknown"), /Invalid profile/);
  assert.throws(() => profileArtifactKey({ slug: "../escape" }, "candidate", profile, "villain"), /Invalid profile/);
});

test("profile loaders compose villain/exploit flop and later rules by selected seat", () => {
  for (const opponentSeat of ["ip", "oop"]) {
    const options = optionsFor(opponentSeat), inputs = buildInputs(spotId, datasets, options);
    const fixture = profileFixtures(inputs);
    withSource(sourceFor(standardFixtures(), fixture.artifacts), () => {
      assert.deepEqual(loadInputs(spotId, options), inputs);
      const flop = loadCandidate(inputs), later = loadLaterCandidate(inputs, flop);
      assert.deepEqual(flop.profileCandidates, fixture.flopPair);
      assert.deepEqual(later.profileCandidates, fixture.laterPair);
      assert.equal(flop.metadata.policy_hash, sha(flop.policy));
      assert.equal(later.metadata.policy_hash, sha(later.policy));
      assert.equal(later.metadata.flop_policy_hash, flop.metadata.policy_hash);
      assert.deepEqual(flop.metadata.role_policy_hashes, Object.fromEntries(Object.entries(fixture.flopPair)
        .map(([role, item]) => [role, item.metadata.policy_hash])));
      for (const rule of flop.policy.rules) assert.deepEqual(rule.mix,
        rawMix(rule.node, nodeRole(rule.node) === opponentSeat ? "villain" : "exploit"));
      for (const street of ["turn", "river"]) for (const rule of later.policy.streets[street].rules) assert.deepEqual(rule.mix,
        rawMix(rule.node, laterNodeRole(rule.node) === opponentSeat ? "villain" : "exploit", true));
    });
  }
});

test("profile content, role identities and per-role flop linkage hashes fail closed", () => {
  const inputs = buildInputs(spotId, datasets, optionsFor("oop"));
  for (const mutation of [
    fixture => { fixture.flopPair.villain.metadata.policy_hash = "corrupted-content"; },
    fixture => { fixture.flopPair.villain.metadata.role = "exploit"; },
    fixture => { fixture.flopPair.exploit.metadata.profile = "nit"; },
    fixture => { fixture.flopPair.villain.metadata.structure_hash = "wrong-geometry"; },
  ]) {
    const fixture = profileFixtures(inputs);
    mutation(fixture);
    withSource(sourceFor(standardFixtures(), fixture.artifacts), () => assert.throws(() => loadCandidate(inputs), /hash|identity mismatch|source is stale/));
  }
  for (const mutation of [
    fixture => { fixture.laterPair.villain.metadata.policy_hash = "corrupted-content"; },
    fixture => { fixture.laterPair.villain.metadata.flop_policy_hash = fixture.flopPair.exploit.metadata.policy_hash; },
    fixture => { fixture.laterPair.exploit.metadata.role = "villain"; },
    fixture => { fixture.laterPair.exploit.metadata.structure_hash = "wrong-geometry"; },
  ]) {
    const fixture = profileFixtures(inputs);
    mutation(fixture);
    withSource(sourceFor(standardFixtures(), fixture.artifacts), () => {
      const flop = loadCandidate(inputs);
      assert.throws(() => loadLaterCandidate(inputs, flop), /hash|identity mismatch|source or flop policy is stale/);
    });
  }
});

test("missing profile roles never borrow standard or the other seat's policy", () => {
  const inputs = buildInputs(spotId, datasets, optionsFor("oop"));
  for (const stage of ["candidate", "laterCandidate"]) for (const role of ["villain", "exploit"]) {
    const fixture = profileFixtures(inputs);
    delete fixture.artifacts[profileArtifactKey(inputs.spot, stage, profile, role)];
    let standardReads = 0;
    withSource(sourceFor(standardFixtures(), fixture.artifacts, () => standardReads++), () => {
      assert.throws(() => stage === "candidate" ? loadCandidate(inputs) : loadLaterCandidate(inputs, loadCandidate(inputs)),
        error => error.code === "PROFILE_POLICY_MISSING" && error.message.includes(role));
      assert.equal(standardReads, 0);
    });
  }
  withSource({ ranges: datasets, artifact: () => { throw new Error("standard fallback must not run"); } }, () => {
    assert.throws(() => loadCandidate(inputs), error => error.code === "PROFILE_POLICY_MISSING");
  });
  const fixture = profileFixtures(inputs);
  assert.throws(() => resolveFlopCandidate(inputs, { villain: fixture.flopPair.villain }), error => error.code === "PROFILE_POLICY_MISSING");
  assert.throws(() => resolveLaterCandidate(inputs, null, resolveFlopCandidate(inputs, fixture.flopPair)),
    error => error.code === "PROFILE_POLICY_MISSING");
});

test("browser flop/later views expose adjusted identity and preserve both seats' authored mixes", () => {
  for (const opponentSeat of ["ip", "oop"]) {
    const options = optionsFor(opponentSeat), inputs = buildInputs(spotId, datasets, options);
    const fixture = profileFixtures(inputs);
    const source = { spotId, datasets, ...options, flopCandidate: fixture.flopPair, laterCandidate: fixture.laterPair };
    const flop = computeBoard({ ...source, board: "As7d2c" });
    assert.deepEqual(flop.adjusted, inputs.adjusted);
    assert.equal(flop.structure_hash, inputs.structure_hash);
    for (const node of ["btn_first", "bb_vs_33"]) assertRows(flop.nodes[node].rows,
      rawMix(node, nodeRole(node) === opponentSeat ? "villain" : "exploit"));
    const common = { ...source, flop: "As7d2c", flopActions: "check", turn: "Kh" };
    // First and facing decisions of both seats; no computed call/fold or bluff limits.
    for (const [turnActions, node] of [["", "turn_oop_first"], ["check", "turn_ip_first"],
      ["bet33", "turn_ip_vs_33"], ["check,bet33", "turn_oop_vs_33"]]) {
      const view = computeLaterView({ ...common, turnActions });
      assert.equal(view.node, node);
      assert.deepEqual(view.adjusted, inputs.adjusted);
      assert.equal(view.structure_hash, inputs.structure_hash);
      assertRows(view.rows, rawMix(node, laterNodeRole(node) === opponentSeat ? "villain" : "exploit", true));
    }
    const riverActions = opponentSeat === "oop" ? "" : "check";
    const river = computeLaterView({ ...common, turnActions: "check,check", river: "3c", riverActions });
    assert.equal(river.street, "river");
    assertRows(river.rows, rawMix(river.node, "villain", true)); // Includes 100% all-in at deep SPR.
    assert.ok(river.rows.filter(row => row.reachable).every(row => row.mix.allin === 1));
    const resolved = resolveFlopCandidate(inputs, fixture.flopPair);
    const composed = computeBoard({ ...source, flopCandidate: resolved, board: "As7d2c" });
    assert.deepEqual(composed.nodes, flop.nodes);
  }
});

test("browser profile requests reject wrong geometry and missing roles rather than show standard", () => {
  const options = optionsFor("oop"), inputs = buildInputs(spotId, datasets, options);
  const fixture = profileFixtures(inputs), source = { spotId, datasets, ...options, board: "As7d2c", flopCandidate: fixture.flopPair };
  fixture.flopPair.villain.metadata.structure_hash = "incorrect-stack-geometry";
  assert.throws(() => computeBoard(source), /source is stale/);
  fixture.flopPair.villain.metadata.structure_hash = inputs.structure_hash;
  assert.throws(() => computeBoard({ ...source, flopCandidate: fixture.flopPair.exploit }),
    error => error.code === "PROFILE_POLICY_MISSING");
  assert.throws(() => computeLaterView({ ...source, flop: "As7d2c", flopActions: "check", turn: "Kh", laterCandidate: null }),
    error => error.code === "PROFILE_POLICY_MISSING");
});
