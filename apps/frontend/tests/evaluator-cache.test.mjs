import test from "node:test";
import assert from "node:assert/strict";
import { EVALUATOR_VERSION } from "../scripts/lib/equity.ts";
import { DEFENCE_VERSION } from "../scripts/postflop-ai/defence.ts";
import { flopBaseIdentity, isFreshFlopBase } from "../scripts/postflop-ai/flop-base-core.ts";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { referencePolicy } from "../scripts/postflop-ai/policy.ts";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.ts";
import { sha } from "../scripts/postflop-ai/browser-inputs.ts";
import { computeBoard } from "../src/estimated/postflop-compute.ts";
import opening from "../src/estimated/opening-ranges.json" with { type: "json" };
import responses from "../src/estimated/preflop-ranges.json" with { type: "json" };

const inputs = loadInputs("BTN_open_BB_call");
const candidate = { policy: referencePolicy, metadata: { source_hash: inputs.fingerprint, policy_hash: sha(referencePolicy) } };
const laterCandidate = { policy: referenceLaterPolicy(), metadata: {} };
const identity = flopBaseIdentity(inputs, candidate, laterCandidate);
const base = { kind: "ai_estimate_not_gto", mode: "balanced", spot: inputs.spot.id, histories: {}, metadata: identity };

test("derived flop bases require explicit current evaluator and defence identities", () => {
  assert.equal(identity.evaluator_version, EVALUATOR_VERSION);
  assert.equal(identity.defence_version, DEFENCE_VERSION);
  assert.ok(isFreshFlopBase(base, inputs, candidate, laterCandidate));
  const { evaluator_version, ...oldIdentity } = identity;
  for (const metadata of [oldIdentity, { ...identity, evaluator_version: EVALUATOR_VERSION - 1 }, { ...identity, defence_version: 5 }])
    assert.equal(isFreshFlopBase({ ...base, metadata }, inputs, candidate, laterCandidate), false);
});

test("a legacy stored base falls back to corrected deterministic computation without requiring regeneration", () => {
  const request = { spotId: inputs.spot.id, board: "7s7h7d", datasets: { opening, responses }, flopCandidate: candidate, laterCandidate };
  const expected = computeBoard(request);
  const { evaluator_version, ...oldIdentity } = identity;
  const legacy = { ...base, flop: "7c7d7h", metadata: { ...oldIdentity, defence_version: 5 }, histories: { obsolete: true } };
  assert.deepEqual(computeBoard({ ...request, flopBase: legacy }), expected);
  assert.ok(Object.keys(expected.nodes).length > 0);
});
