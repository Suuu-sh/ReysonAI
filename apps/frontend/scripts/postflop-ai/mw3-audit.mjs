// Structural all-board coverage and transparent, advisory policy diagnostics.
// Finite contexts collapse only policy-equivalent states, never joint reach probabilities.
import { combosOf } from '../lib/equity.ts';
import { runoutTexture } from './model.ts';
import { MW3_TIERS as TIERS, mw3HandTier } from './mw3-hand-features.mjs';
import { canonicalFlops } from './flop-isomorphism.ts';
import { selectMw3Rule, validateMw3Policy } from './mw3-policy.mjs';
import { probeMw3Hand } from './mw3-tree.mjs';

export function mw3BoardRanges(inputs, board) {
  const blocked = new Set(board);
  return Object.fromEntries(inputs.spot.seats.map(seat => [seat, inputs.seatRows[seat].filter(row => row.freq > 0).flatMap(row =>
    combosOf(row.hand).filter(combo => combo.every(card => !blocked.has(card))).map(combo => ({
      hand: row.hand, combo, weight: row.freq / 100, tier: mw3HandTier(combo, board) }))) ]));
}

const selectorCoverage = (decision, rule) => ({
  facingPrice: !decision.facing || rule.when.price !== 'any',
  facingResponse: !decision.facing || rule.when.response !== 'any',
  remainingPosition: decision.players !== 2 || rule.when.position !== 'any',
  explicitSpr: rule.when.spr !== 'any',
});

// Exact for legality/normalization/selection coverage: every source-supported combo
// falls into one of these tiers, and the saved schema sees no hidden holecard details.
// This validates a superset of policy-reachable contexts; advisory rates use raw own-action
// preflop weights, NOT joint-conditioned rates or proof of actual policy-history reach.
export function auditMw3Board(inputs, policies, board, contexts) {
  const street = ({ 3: 'flop', 4: 'turn', 5: 'river' })[board.length];
  if (!street) throw new Error('Invalid mw3 audit board');
  const policy = street === 'flop' ? policies.flop : policies.later, ranges = mw3BoardRanges(inputs, board);
  const errors = [], warnings = [], coverage = {}, aggregates = {};
  for (const [key, decision] of Object.entries(contexts)) {
    if (decision.street !== street) continue;
    const tiers = new Map();
    for (const item of ranges[decision.seat]) tiers.set(item.tier, (tiers.get(item.tier) ?? 0) + item.weight);
    const mixes = {}, checks = {}, total = [...tiers.values()].reduce((a, b) => a + b, 0);
    for (const tier of TIERS) {
      try {
        const rule = selectMw3Rule(policy, decision, tier, board);
        mixes[tier] = rule.mix; checks[tier] = selectorCoverage(decision, rule);
        const weight = tiers.get(tier) ?? 0;
        if (weight > 0 && tier === 'monster' && (rule.mix.fold ?? 0) >= 90) warnings.push({ type: 'monster_nearly_folds', context: key, tier, frequency: rule.mix.fold });
        const aggressive = Object.entries(rule.mix).filter(([action]) => action === 'raise' || action === 'allin' || action.startsWith('bet')).reduce((a, [, n]) => a + n, 0);
        if (weight > 0 && tier === 'air' && aggressive > (decision.players === 3 ? 25 : 40)) warnings.push({ type: 'raw_air_aggression', context: key, tier, frequency: aggressive });
        if (weight > 0 && tier === 'board_locked' && (aggressive > 0 || (rule.mix.fold ?? 0) > 0)) warnings.push({ type: 'locked_board_policy_mismatch', context: key, tier, mix: rule.mix });
        if (weight > 0 && tier === 'absolute_nuts' && (rule.mix.fold ?? 0) > 0) warnings.push({ type: 'certified_future_nuts_folds', context: key, tier, frequency: rule.mix.fold });
        if (weight > 0 && tier === 'nuts' && street === 'river' && (rule.mix.fold ?? 0) > 0) warnings.push({ type: 'river_nuts_folds', context: key, tier, frequency: rule.mix.fold });
        if (weight > 0 && tier === 'board_shared' && aggressive > 0) warnings.push({ type: 'shared_board_aggression', context: key, tier, frequency: aggressive });
      } catch (error) { errors.push({ context: key, tier, message: error.message }); }
    }
    coverage[key] = checks;
    aggregates[key] = { rangeWeight: total, combos: ranges[decision.seat].length,
      actions: Object.fromEntries(decision.actions.map(action => [action, total ? [...tiers].reduce((sum, [tier, weight]) => sum + weight * (mixes[tier]?.[action] ?? 0), 0) / total : null])) };
  }
  return { street, board, errors, warnings, coverage, aggregates,
    scope: 'every_legal_policy_context_and_source_supported_combo_tier',
    warningWeighting: 'raw_own_action_preflop_combo_weight_not_joint_or_policy_history_reach' };
}

export function auditMw3AllFlops(inputs, policies, { onProgress = () => {}, contract = probeMw3Hand(inputs.spot) } = {}) {
  validateMw3Policy(policies.flop, { spotId: inputs.spot.id, nodes: contract.nodes });
  validateMw3Policy(policies.later, { spotId: inputs.spot.id, nodes: contract.nodes });
  const boards = canonicalFlops(), warnings = new Map(), errors = [], uncovered = new Map();
  let comboContexts = 0;
  for (const [index, board] of boards.entries()) {
    const result = auditMw3Board(inputs, policies, [...board.cards], contract.contexts);
    for (const issue of result.errors) errors.push({ board: board.id, ...issue });
    for (const [context, tiers] of Object.entries(result.coverage)) for (const [tier, fields] of Object.entries(tiers)) {
      for (const [field, value] of Object.entries(fields)) if (!value) {
        const key = `${context}|${tier}|${field}`, prior = uncovered.get(key) ?? { context, tier, field, boards: 0 };
        prior.boards++; uncovered.set(key, prior);
      }
    }
    for (const item of Object.values(result.aggregates)) comboContexts += item.combos;
    for (const warning of result.warnings) {
      const key = `${warning.type}|${warning.context}|${warning.tier}`, prior = warnings.get(key) ?? { ...warning, boards: 0, examples: [] };
      prior.boards++; if (prior.examples.length < 5) prior.examples.push(board.id); warnings.set(key, prior);
    }
    if ((index + 1) % 100 === 0 || index === boards.length - 1) onProgress({ boards: index + 1, total: boards.length });
  }
  return { schemaVersion: 1, spot: inputs.spot.id, sourceHash: inputs.fingerprint, boards: boards.length,
    errors, warnings: [...warnings.values()], uncoveredExplicitSelectors: [...uncovered.values()], comboContexts,
    policyContexts: Object.values(contract.contexts).filter(item => item.street === 'flop').length,
    scope: 'all_1755_flops_all_geometric_contexts_all_source_supported_combo_tiers',
    jointDefence: 'not_part_of_this_structural_pass_requires_tuple_conditioned_diagnostic',
    warningWeighting: 'raw_own_action_preflop_combo_weight_not_joint_or_policy_history_reach' };
}


export function representativeMw3Runouts(flops) {
  const out = [];
  for (const flop of flops) {
    const turns = new Map();
    for (let card = 0; card < 52; card++) if (!flop.includes(card)) {
      const board = [...flop, card], texture = runoutTexture(board);
      if (!turns.has(texture)) turns.set(texture, board);
    }
    for (const turn of turns.values()) {
      out.push(turn);
      const rivers = new Map();
      for (let card = 0; card < 52; card++) if (!turn.includes(card)) {
        const board = [...turn, card], texture = runoutTexture(board);
        if (!rivers.has(texture)) rivers.set(texture, board);
      }
      out.push(...rivers.values());
    }
  }
  return out;
}
