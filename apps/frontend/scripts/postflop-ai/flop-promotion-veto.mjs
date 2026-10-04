// OFFLINE RESEARCH CANDIDATE ONLY. No product or legacy Defence import uses this module.
// It post-processes a completed legacy mix; it never recalculates a floor or ceiling.
// Context identities must come from a trusted, current-source replay, not user JSON.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { captureSourceGraph, identityHash } from './audit-identity.mjs';

export const FLOP_PROMOTION_VETO_VERSION = 1;
export const VETO_IMPLEMENTATION_SHA256 = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
// The builder verifier includes every transitive live helper, including this gate.
export const VETO_BINDING_BUILDER_SHA256 = identityHash(captureSourceGraph({ roots: ['apps/frontend/scripts/postflop-ai/build-flop-promotion-veto.mjs'] }));
const HASH = /^[0-9a-f]{64}$/;
const SAME_ACTIONS = ['fold', 'call', 'raise'];
const IDENTITY_KEYS = [
  'input_fingerprint', 'saved_support_sha256', 'saved_input_bytes_sha256', 'flop_policy_sha256', 'later_policy_sha256',
  'flop_artifact_sha256', 'later_artifact_sha256', 'base_runtime_sha256',
  'fallback_sha256', 'classifier_sha256', 'reach_sha256', 'intervention_sha256', 'binding_builder_sha256',
];

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  throw new Error('Unsupported or non-finite identity value');
}
export const vetoHash = value => createHash('sha256').update(canonical(value)).digest('hex');
const own = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);
const number = value => typeof value === 'number' && Number.isFinite(value);
const card = value => Number.isInteger(value) && value >= 0 && value < 52;
const sum = mix => Object.values(mix).reduce((a, b) => a + b, 0);
const FREQUENCY_SCALE = 1e6;
const frequencyUnits = value => {
  if (!number(value) || value < 0 || value > 100) return null;
  const scaled = value * FREQUENCY_SCALE, units = Math.round(scaled);
  return Math.abs(scaled - units) <= 5e-8 ? units : null;
};
function validMix(mix) {
  return mix && Object.getPrototypeOf(mix) === Object.prototype && own(mix, 'fold') && own(mix, 'call') &&
    Object.keys(mix).every(key => SAME_ACTIONS.includes(key)) &&
    Object.values(mix).every(value => frequencyUnits(value) !== null) &&
    Object.values(mix).reduce((total, value) => total + frequencyUnits(value), 0) === 100 * FREQUENCY_SCALE;
}

export function validVetoBinding(binding) {
  const { model, geometry: g, support, identities, history } = binding ?? {};
  return Boolean(binding?.schema_version === 1 && binding.street === 'flop' &&
    typeof binding.spot === 'string' && binding.spot.length > 0 &&
    /^(?:bb|ip)_vs_(?:33|75|125)$/.test(binding.node) &&
    Array.isArray(binding.board) && binding.board.length === 3 && binding.board.every(card) &&
    Array.isArray(binding.hero) && binding.hero.length === 2 && binding.hero.every(card) &&
    new Set([...binding.board, ...binding.hero]).size === 5 &&
    Array.isArray(history?.flop) && (history.flop.length === 1 || history.flop.length === 2 && history.flop[0] === 'check') &&
    /^bet(?:33|75|125)$/.test(history.flop.at(-1)) && history.flop.at(-1).slice(3) === binding.node.split('_vs_')[1] &&
    Array.isArray(history.turn) && history.turn.length === 0 && Array.isArray(history.river) && history.river.length === 0 &&
    model?.family === 'legacy-hu' && Number.isSafeInteger(model.base_defence_version) && model.base_defence_version > 0 &&
    model.intervention_version === FLOP_PROMOTION_VETO_VERSION &&
    IDENTITY_KEYS.every(key => HASH.test(identities?.[key])) && identities.intervention_sha256 === VETO_IMPLEMENTATION_SHA256 &&
    identities.binding_builder_sha256 === VETO_BINDING_BUILDER_SHA256 &&
    typeof g?.bettor === 'string' && typeof g.defender === 'string' && g.bettor !== g.defender &&
    ['pot_before_bb', 'wager_bb', 'call_bb', 'final_pot_bb', 'rake_bb', 'bettor_remaining_bb',
      'defender_remaining_before_call_bb', 'bettor_invested_bb', 'defender_invested_bb'].every(key => number(g[key]) && g[key] >= 0) &&
    g.pot_before_bb > 0 && g.call_bb > 0 && g.bettor_remaining_bb > 0 && g.defender_remaining_before_call_bb > g.call_bb &&
    g.final_pot_bb > g.rake_bb && typeof g.can_raise === 'boolean' && typeof g.capped === 'boolean' &&
    support && number(support.hero_weight) && support.hero_weight > 0 &&
    Number.isSafeInteger(support.opponent_combos) && support.opponent_combos > 0 &&
    number(support.opponent_weight) && support.opponent_weight > 0 && HASH.test(support.opponent_sha256));
}

function inspect({ rawMix, legacyMix, binding, certificate, approvalReceipt }, requireApproval) {
  const unchanged = reason => ({ applied: false, reason, mix: legacyMix, removed_call_pp: 0 });
  try {
    if (!validVetoBinding(binding)) return unchanged('invalid-current-binding');
    if (!validMix(rawMix) || !validMix(legacyMix)) return unchanged('invalid-mix');
    if (Object.keys(rawMix).sort().join() !== Object.keys(legacyMix).sort().join()) return unchanged('action-set-changed');
    if ((rawMix.raise ?? 0) !== (legacyMix.raise ?? 0)) return unchanged('raise-changed');
    const addedUnits = frequencyUnits(legacyMix.call) - frequencyUnits(rawMix.call), added = addedUnits / FREQUENCY_SCALE;
    if (!(addedUnits > 0)) return unchanged('no-added-call');
    if (frequencyUnits(rawMix.fold) - frequencyUnits(legacyMix.fold) !== addedUnits || sum(rawMix) !== sum(legacyMix)) {
      return unchanged('not-a-pure-floor-promotion');
    }
    if (certificate?.schema_version !== 1 || certificate.kind !== 'negative-continuation-promotion-veto' ||
        certificate.intervention_version !== FLOP_PROMOTION_VETO_VERSION) return unchanged('missing-or-unsupported-evidence');
    if (certificate.binding_sha256 !== vetoHash(binding) || certificate.raw_mix_sha256 !== vetoHash(rawMix) ||
        certificate.legacy_mix_sha256 !== vetoHash(legacyMix)) return unchanged('evidence-identity-mismatch');
    const proof = certificate.proof;
    if (!proof || !HASH.test(proof.raw_report_sha256) || !HASH.test(proof.protocol_sha256) || !HASH.test(proof.sampling_source_sha256) ||
        proof.fixed_sample_plan !== true || !Number.isSafeInteger(proof.planned_samples) || proof.planned_samples < 8192 || proof.planned_samples > 1_000_000 ||
        proof.completed_samples !== proof.planned_samples || !number(proof.upper_bound_bb) || !(proof.upper_bound_bb < 0) ||
        !number(proof.lower_bound_bb) || proof.lower_bound_bb > proof.upper_bound_bb ||
        !number(proof.case_delta) || !(proof.case_delta > 0 && proof.case_delta <= 0.01) ||
        !Number.isSafeInteger(proof.family_cases) || proof.family_cases < 1 ||
        !number(proof.family_error_budget) || !(proof.family_error_budget > 0 && proof.family_error_budget <= 0.01) ||
        proof.case_delta * proof.family_cases > proof.family_error_budget + 1e-15) return unchanged('invalid-or-inconclusive-proof');
    if (requireApproval && (approvalReceipt?.schema_version !== 1 ||
        approvalReceipt.status !== 'independently-reviewed-for-candidate' ||
        approvalReceipt.scope !== 'flop-promotion-veto-v1' || !HASH.test(approvalReceipt.review_sha256) ||
        approvalReceipt.approved_certificate_sha256 !== vetoHash(certificate) ||
        approvalReceipt.approved_binding_sha256 !== vetoHash(binding) ||
        approvalReceipt.approved_candidate_source_sha256 !== VETO_IMPLEMENTATION_SHA256 ||
        approvalReceipt.approved_binding_builder_sha256 !== VETO_BINDING_BUILDER_SHA256)) {
      return unchanged('candidate-approval-missing');
    }
    // Returning the existing raw fold/call numbers restores exactly the removed mass.
    // No new threshold, ceiling evaluation, MDF refill or normalization is performed.
    return { applied: true, reason: requireApproval ? 'reviewed-negative-continuation' : 'unapproved-research-preview',
      mix: { ...legacyMix, fold: rawMix.fold, call: rawMix.call }, removed_call_pp: added };
  } catch {
    return unchanged('invalid-evidence-data');
  }
}

// Actual candidate gate defaults to no application without a separately supplied trusted
// implementation-review receipt. A certificate cannot approve itself; the receipt
// binds its complete content and this exact candidate implementation, not just an ID.
export const applyReviewedFlopPromotionVeto = args => inspect(args, true);
// Explicit, non-production counterfactual; it cannot create an approval or certify a strategy.
export const previewFlopPromotionVeto = args => ({ ...inspect(args, false), research_preview: true, production_eligible: false });
