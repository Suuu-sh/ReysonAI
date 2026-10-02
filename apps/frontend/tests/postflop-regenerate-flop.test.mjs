import test from "node:test";
import assert from "node:assert/strict";
import { flopAdoptionDecision, rebindLaterPolicy, worstProfileScore } from "../scripts/postflop-ai/regenerate-flop.mjs";

const report = ({ standard, passive, aggressive }) => ({ results: [
  ...[standard, passive, aggressive].flatMap((mean, index) => [
    { opponent: ["standard", "passive", "aggressive"][index], delta_bb: { mean } },
    { opponent: ["standard", "passive", "aggressive"][index], delta_bb: { mean } },
  ]),
] });

const finding = severity => ({ check: "test", severity });
const decision = ({ candidateScore, genericScore = 0, candidateFindings = [], genericFindings = [] }) =>
  flopAdoptionDecision({
    candidate: { metadata: { model: "unit-test" } },
    candidateReport: report({ standard: candidateScore, passive: candidateScore, aggressive: candidateScore }),
    genericReport: report({ standard: genericScore, passive: genericScore, aggressive: genericScore }),
    genericFindings,
    candidateFindings,
  });

test("flop adoption compares the worst opponent-profile mean and accepts equality", () => {
  const candidateReport = report({ standard: 2, passive: -0.5, aggressive: 3 });
  assert.equal(worstProfileScore(candidateReport), -0.5);

  const equal = decision({ candidateScore: 0, genericScore: 0 });
  assert.equal(equal.adopt, true);
  const better = decision({ candidateScore: 0.1, genericScore: 0 });
  assert.equal(better.adopt, true);
  const worse = decision({ candidateScore: -0.1, genericScore: 0 });
  assert.equal(worse.adopt, false);
  assert.equal(worse.candidateScore, -0.1);
});

test("flop adoption rejects more warnings and any candidate balance error", () => {
  const genericWarnings = [finding("warn"), finding("info")];
  const equalWarnings = decision({ candidateScore: 1, genericScore: 0,
    genericFindings: genericWarnings, candidateFindings: [finding("warn")] });
  assert.equal(equalWarnings.genericWarningCount, 1);
  assert.equal(equalWarnings.candidateWarningCount, 1);
  assert.equal(equalWarnings.adopt, true);

  const extraWarning = decision({ candidateScore: 10, genericScore: 0,
    genericFindings: genericWarnings, candidateFindings: [finding("warn"), finding("warn")] });
  assert.equal(extraWarning.adopt, false);

  const withError = decision({ candidateScore: 10, genericScore: 0,
    candidateFindings: [finding("warn"), finding("error")] });
  assert.equal(withError.adopt, false);
  assert.equal(withError.candidateErrors.length, 1);
});

test("rebinding a later candidate changes only metadata.flop_policy_hash", () => {
  const laterPolicy = { streets: { turn: { rules: [{ node: "turn_oop_first", mix: { check: 100 } }] } } };
  const original = {
    metadata: { spot: "BTN_open_BB_call", flop_policy_hash: "old-flop", policy_hash: "later-policy", model: "unit-test" },
    policy: laterPolicy,
  };
  const before = structuredClone(original);

  const rebound = rebindLaterPolicy(original, "new-flop");
  assert.notEqual(rebound, original);
  assert.notEqual(rebound.metadata, original.metadata);
  assert.equal(rebound.metadata.flop_policy_hash, "new-flop");
  assert.equal(rebound.metadata.policy_hash, "later-policy");
  assert.equal(rebound.policy, laterPolicy);
  assert.deepEqual(rebound.policy, before.policy);
  assert.deepEqual(original, before);
});
