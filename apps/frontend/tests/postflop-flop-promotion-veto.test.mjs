import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, appendFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { applyReviewedFlopPromotionVeto, previewFlopPromotionVeto, validVetoBinding, vetoHash,
  VETO_IMPLEMENTATION_SHA256, VETO_BINDING_BUILDER_SHA256 } from '../scripts/postflop-ai/flop-promotion-veto.mjs';

// Synthetic unit evidence only. These fixtures are not real approval receipts.
function fixture() {
  const rawMix = { fold: 98, call: 0, raise: 2 }, legacyMix = { fold: 0, call: 98, raise: 2 };
  const identities = Object.fromEntries(['input_fingerprint', 'saved_support_sha256', 'saved_input_bytes_sha256', 'flop_policy_sha256',
    'later_policy_sha256', 'flop_artifact_sha256', 'later_artifact_sha256', 'base_runtime_sha256', 'fallback_sha256',
    'classifier_sha256', 'reach_sha256'].map(key => [key, vetoHash(`synthetic-${key}`)]));
  identities.intervention_sha256 = VETO_IMPLEMENTATION_SHA256;
  identities.binding_builder_sha256 = VETO_BINDING_BUILDER_SHA256;
  const binding = { schema_version: 1, street: 'flop', spot: 'BTN_open_BB_call', node: 'bb_vs_75',
    board: [25, 24, 2], hero: [44, 42], history: { flop: ['bet75'], turn: [], river: [] },
    model: { family: 'legacy-hu', base_defence_version: 6, intervention_version: 1 }, identities,
    geometry: { bettor: 'BTN', defender: 'BB', pot_before_bb: 5.5, wager_bb: 4.13, call_bb: 4.13,
      final_pot_bb: 13.76, rake_bb: 0.688, bettor_remaining_bb: 93.37, defender_remaining_before_call_bb: 97.5,
      bettor_invested_bb: 4.13, defender_invested_bb: 0, can_raise: true, capped: false },
    support: { hero_weight: 0.6, opponent_combos: 621, opponent_weight: 60.05, opponent_sha256: vetoHash('synthetic-opponent-support') } };
  const certificate = { schema_version: 1, kind: 'negative-continuation-promotion-veto', intervention_version: 1,
    binding_sha256: vetoHash(binding), raw_mix_sha256: vetoHash(rawMix), legacy_mix_sha256: vetoHash(legacyMix),
    proof: { raw_report_sha256: vetoHash('synthetic-report'), protocol_sha256: vetoHash('synthetic-protocol'),
      sampling_source_sha256: vetoHash('synthetic-sampler'), fixed_sample_plan: true, planned_samples: 8192,
      completed_samples: 8192, upper_bound_bb: -3, lower_bound_bb: -6, case_delta: 0.01 / 7,
      family_cases: 7, family_error_budget: 0.01 } };
  const approvalReceipt = { schema_version: 1, status: 'independently-reviewed-for-candidate',
    scope: 'flop-promotion-veto-v1', review_sha256: vetoHash('synthetic-test-review-not-real-approval'),
    approved_certificate_sha256: vetoHash(certificate), approved_binding_sha256: vetoHash(binding),
    approved_candidate_source_sha256: VETO_IMPLEMENTATION_SHA256, approved_binding_builder_sha256: VETO_BINDING_BUILDER_SHA256 };
  const result = { rawMix, legacyMix, binding, certificate, approvalReceipt };
  assert.equal(applyReviewedFlopPromotionVeto(result).applied, true, 'Synthetic baseline receipt must apply before any mutation');
  return result;
}
const legacyUnchanged = args => {
  const result = applyReviewedFlopPromotionVeto(args);
  assert.equal(result.applied, false);
  assert.equal(result.mix, args.legacyMix);
  assert.equal(result.removed_call_pp, 0);
};

test('preview is explicitly unapproved; application requires a separate bound review receipt', () => {
  const f = fixture(); assert.equal(validVetoBinding(f.binding), true);
  legacyUnchanged({ ...f, approvalReceipt: undefined });
  const preview = previewFlopPromotionVeto(f);
  assert.equal(preview.applied, true); assert.equal(preview.production_eligible, false);
  assert.equal(preview.reason, 'unapproved-research-preview');
  assert.deepEqual(preview.mix, f.rawMix); assert.equal(preview.removed_call_pp, 98);
});

test('only the original added call goes to fold; raises and total mass are exactly preserved', () => {
  const f = fixture(), before = structuredClone(f);
  const result = applyReviewedFlopPromotionVeto(f);
  assert.equal(result.applied, true); assert.deepEqual(result.mix, f.rawMix);
  assert.equal(result.mix.raise, f.legacyMix.raise);
  assert.equal(Object.values(result.mix).reduce((a, b) => a + b), 100);
  assert.deepEqual(f, before);
});

test('every source, policy, fallback, classifier, reach and support identity is fail-closed', () => {
  for (const key of Object.keys(fixture().binding.identities)) {
    const f = fixture(); f.binding.identities[key] = vetoHash(`changed-${key}`); legacyUnchanged(f);
  }
  for (const key of ['hero_weight', 'opponent_combos', 'opponent_weight']) {
    const f = fixture(); f.binding.support[key] += 1; legacyUnchanged(f);
  }
  const f = fixture(); f.binding.support.opponent_sha256 = vetoHash('changed-support'); legacyUnchanged(f);
});

test('new models, geometry, boards, exact combos and histories do not reuse old evidence', () => {
  const mutations = [f => f.binding.model.base_defence_version++, f => f.binding.model.intervention_version++,
    f => f.binding.board[0] = 29, f => f.binding.hero[0] = 45, f => f.binding.geometry.call_bb += 0.01,
    f => f.binding.geometry.can_raise = false, f => f.binding.history.flop.unshift('check'),
    f => f.binding.geometry.capped = true, f => f.binding.node = 'bb_vs_125'];
  for (const mutate of mutations) { const f = fixture(); mutate(f); legacyUnchanged(f); }
});

test('missing, malformed and non-finite bindings never apply a veto', () => {
  for (const key of ['identities', 'model', 'support', 'geometry', 'history', 'hero', 'board', 'spot']) {
    const f = fixture(); delete f.binding[key]; legacyUnchanged(f);
  }
  const f = fixture(); f.binding.geometry.call_bb = NaN; legacyUnchanged(f);
  const g = fixture(); g.binding.hero[0] = g.binding.board[0]; legacyUnchanged(g);
});

test('inconclusive, non-fixed or incomplete evidence does not authorize even preview', () => {
  for (const patch of [{ upper_bound_bb: 0 }, { upper_bound_bb: 0.5 }, { upper_bound_bb: -Infinity },
    { completed_samples: 8191 }, { fixed_sample_plan: false }, { family_cases: 8 }, { case_delta: 0.1 }]) {
    const f = fixture(); Object.assign(f.certificate.proof, patch);
    assert.equal(previewFlopPromotionVeto(f).applied, false); legacyUnchanged(f);
  }
});

test('editing proof or review identities invalidates the separate receipt; self-approval is ignored', () => {
  const f = fixture(); f.certificate.proof.upper_bound_bb = -4; legacyUnchanged(f);
  const g = fixture(); delete g.approvalReceipt;
  g.certificate.approval = { status: 'independently-reviewed-for-candidate', scope: 'flop-promotion-veto-v1', review_sha256: vetoHash('fake') };
  legacyUnchanged(g);
  for (const key of ['approved_certificate_sha256', 'approved_binding_sha256', 'approved_candidate_source_sha256', 'approved_binding_builder_sha256']) {
    const h = fixture(); h.approvalReceipt[key] = vetoHash('wrong'); legacyUnchanged(h);
  }
});

test('floor-inactive and ceiling-reduced decisions remain the completed legacy result', () => {
  const f = fixture(); f.rawMix = { ...f.legacyMix }; legacyUnchanged(f);
  const g = fixture(); g.rawMix = { fold: 40, call: 58, raise: 2 }; g.legacyMix = { fold: 55, call: 43, raise: 2 }; legacyUnchanged(g);
  const h = fixture(); h.rawMix.raise = 3; h.rawMix.fold = 97; legacyUnchanged(h);
});

test('only a covered hand changes; missing certificates do not redistribute its removed mass', () => {
  const a = fixture(), b = fixture(); b.binding.hero = [43, 41];
  const first = applyReviewedFlopPromotionVeto(a), other = applyReviewedFlopPromotionVeto(b);
  assert.equal(first.removed_call_pp, 98); assert.equal(other.applied, false);
  assert.equal(other.mix, b.legacyMix);
});


test('a change in each live builder dependency invalidates the old reviewed fixture', async () => {
  const files = ['build-flop-promotion-veto.mjs', 'flop-promotion-veto.mjs', 'audit-identity.mjs', 'rollout-diagnostic-contract.mjs'];
  const source = new URL('../scripts/postflop-ai/', import.meta.url);
  for (const changed of files) {
    const root = mkdtempSync(join(tmpdir(), 'low-flop-veto-dependency-'));
    const directory = join(root, 'apps/frontend/scripts/postflop-ai'); mkdirSync(directory, { recursive: true });
    for (const name of files) copyFileSync(new URL(name, source), join(directory, name));
    appendFileSync(join(directory, changed), '\n// Deliberate test-only dependency identity change.\n');
    const updated = await import(pathToFileURL(join(directory, 'flop-promotion-veto.mjs')).href);
    assert.notEqual(updated.VETO_BINDING_BUILDER_SHA256, VETO_BINDING_BUILDER_SHA256, changed);
    const f = fixture(); // Positively verifies the unmodified approved control first.
    const result = updated.applyReviewedFlopPromotionVeto(f);
    assert.equal(result.applied, false, changed); assert.equal(result.mix, f.legacyMix, changed);
  }
});


test('fractional raises and partial promotions conserve model units without near-tolerance drift', () => {
  const f = fixture();
  f.rawMix = { fold: 1.37, call: 98.13, raise: 0.5 };
  f.legacyMix = { fold: 0.62, call: 98.88, raise: 0.5 };
  f.certificate.raw_mix_sha256 = vetoHash(f.rawMix); f.certificate.legacy_mix_sha256 = vetoHash(f.legacyMix);
  f.approvalReceipt.approved_certificate_sha256 = vetoHash(f.certificate);
  const result = applyReviewedFlopPromotionVeto(f);
  assert.equal(result.applied, true); assert.deepEqual(result.mix, f.rawMix);
  assert.equal(result.removed_call_pp, 0.75); assert.equal(result.mix.raise, 0.5);
  assert.equal(Object.values(result.mix).reduce((a,b)=>a+b), Object.values(f.legacyMix).reduce((a,b)=>a+b));
  const drift = fixture(); drift.legacyMix.fold += 0.0000005;
  drift.certificate.legacy_mix_sha256 = vetoHash(drift.legacyMix);
  drift.approvalReceipt.approved_certificate_sha256 = vetoHash(drift.certificate);
  legacyUnchanged(drift);
});
