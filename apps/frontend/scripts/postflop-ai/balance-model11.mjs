// Prefix-weighted numerical balance diagnostics, deliberately separate from acceptance balance.mjs.
import { createModel11Execution } from './execution-model11.mjs';
import { multiplyDeclaredMass } from './effective-reach.mjs';
import { EffectiveReachError } from './decision-prefix.mjs';
import { contentHash, freezeSnapshot } from './effective-law-identity.mjs';
import { handTier } from './model.mjs';
import { hasPostflopDeal } from './range-support.mjs';
const cardsOf = id => [Math.floor(id / 52), id % 52];
const ratio = (mass, total) => {
  const result = total > 0 ? mass / total : null;
  if (mass > 0 && result === 0) throw new EffectiveReachError('numerical-underflow', 'Positive balance share underflowed');
  return result;
};

export function summarizeModel11Prefix(execution, request, { includeRows = false } = {}) {
  const prefix = execution.prefix(request), actor = prefix.pending.seat;
  const seats = [execution.spot.ip, execution.spot.oop];
  const ranges = Object.fromEntries(seats.map(seat => [seat, execution.rangeState(request, seat)]));
  const physicalActions = prefix.pending.observation.classes.map(group => group.action);
  const actionWeights = Object.fromEntries(physicalActions.map(action => [action, 0]));
  const tierActionWeights = {}, equityStatuses = {}, rows = [];
  let support = 0, total = 0, labelActions = null;
  const labelWeights = {};
  for (let id = 0; id < ranges[actor].weights.length; id++) {
    const weight = ranges[actor].weights[id]; if (!(weight > 0)) continue;
    const combo = cardsOf(id), law = execution.law(request, combo), tier = handTier(combo, prefix.board);
    labelActions ??= law.actions;
    support++; total += weight;
    equityStatuses[law.provenance.equity] = (equityStatuses[law.provenance.equity] ?? 0) + 1;
    tierActionWeights[tier] ??= Object.fromEntries(physicalActions.map(action => [action, 0]));
    for (const action of law.actions) labelWeights[action] = (labelWeights[action] ?? 0) + multiplyDeclaredMass(weight, law.labelMass[action], `balance label ${action}`);
    for (const action of physicalActions) {
      const mass = multiplyDeclaredMass(weight, law.physicalMass[action], `balance physical ${action}`);
      actionWeights[action] += mass; tierActionWeights[tier][action] += mass;
    }
    if (includeRows) rows.push({ comboId: id, combo, weight, tier, law });
  }
  return { kind: 'model11-prefix-balance-diagnostic', prefix, prefixIdentity: contentHash(prefix),
    semantics: 'unnormalized-own-action-realization; not joint public probability or hero posterior',
    status: ranges[actor].status, actor, support, total,
    ranges: Object.fromEntries(seats.map(seat => [seat, { status: ranges[seat].status, total: ranges[seat].total,
      ...(includeRows ? { weights: Array.from(ranges[seat].weights) } : {}) }])),
    labelActions, labelWeights, physicalActions, actionWeights,
    physicalShares: Object.fromEntries(physicalActions.map(action => [action, ratio(actionWeights[action], total)])),
    tierActionWeights, equityStatuses, ...(includeRows ? { rows } : {}),
    // Do not apply model10 saved-reach thresholds and then call the result model11 acceptance.
    acceptance: 'not-evaluated; heuristic quality thresholds require a separate model11 gate' };
}

export function balanceModel11(inputs, flopArtifact, laterArtifact, { requests, includeRows = false, executionOptions = {} } = {}) {
  if (!Array.isArray(requests) || !requests.length) throw new EffectiveReachError('invalid-evaluation-plan', 'Explicit nonempty public request plan required');
  const plan = freezeSnapshot(requests), execution = createModel11Execution(inputs, flopArtifact, laterArtifact, executionOptions);
  const results = [], started = performance.now();
  try {
    for (const request of plan) {
      execution.releaseBoardCaches();
      try { results.push(summarizeModel11Prefix(execution, request, { includeRows })); }
      catch (error) {
        if (!(error instanceof EffectiveReachError) || error.status !== 'off-model-observed-action') throw error;
        results.push({ request, status: error.status, message: error.message, acceptance: 'not-evaluated' });
      }
    }
    return { kind: 'model11-bounded-balance-not-acceptance', version: 1, execution: execution.identity,
      artifactProvenance: execution.artifactProvenance, belief: execution.belief, planIdentity: contentHash(plan),
      diagnostics: { elapsedMs: performance.now() - started, cache: execution.cacheStats() }, results };
  } finally { execution.releaseBoardCaches(); }
}

// All-board routing uses exactly the same prefix summary. A plan names every actual request;
// there is no hidden 1,755-board expansion, representative-runout default or checkpoint reuse.
export function auditModel11Boards(inputs, flopArtifact, laterArtifact, { boardPlan, includeRows = false, executionOptions = {} } = {}) {
  if (!Array.isArray(boardPlan) || !boardPlan.length) throw new EffectiveReachError('invalid-evaluation-plan', 'Explicit bounded board plan required');
  const plan = freezeSnapshot(boardPlan), execution = createModel11Execution(inputs, flopArtifact, laterArtifact, executionOptions), results = [], started = performance.now();
  if (new Set(plan.map(row => row.id)).size !== plan.length) throw new EffectiveReachError('invalid-evaluation-plan', 'Duplicate board IDs');
  try {
    for (const board of plan) {
      if (typeof board.id !== 'string' || !board.id || !Array.isArray(board.requests) || !board.requests.length || board.cards?.length !== 3)
        throw new EffectiveReachError('invalid-evaluation-plan', 'Each board requires its flop cards and nonempty explicit request list');
      const root = execution.prefix({ board: board.cards, path: { flop: [] } });
      // Validate every requested prefix before marking the board unreachable.
      const prefixes = board.requests.map(request => execution.prefix(request));
      if (prefixes.some(prefix => prefix.board.slice(0, 3).join(',') !== root.board.join(',')))
        throw new EffectiveReachError('invalid-evaluation-plan', 'Request does not belong to its declared flop');
      if (new Set(prefixes.map(contentHash)).size !== prefixes.length)
        throw new EffectiveReachError('invalid-evaluation-plan', 'Duplicate physical decision prefixes in board plan');
      const diagnostics = [];
      if (!hasPostflopDeal(inputs, board.cards)) { results.push({ board: board.id, status: 'unreachable-base-deal', diagnostics }); continue; }
      for (const request of board.requests) {
        execution.releaseBoardCaches();
        try { diagnostics.push(summarizeModel11Prefix(execution, request, { includeRows })); }
        catch (error) {
          if (!(error instanceof EffectiveReachError) || error.status !== 'off-model-observed-action') throw error;
          diagnostics.push({ request, status: error.status, message: error.message, acceptance: 'not-evaluated' });
        }
      }
      results.push({ board: board.id, status: 'evaluated-declared-prefixes-only', diagnostics });
    }
    return { kind: 'model11-selected-board-balance-not-acceptance', version: 1, execution: execution.identity,
      artifactProvenance: execution.artifactProvenance, belief: execution.belief, planIdentity: contentHash(plan),
      coverage: { selectedBoards: plan.length, requestedPrefixes: plan.reduce((n, row) => n + row.requests.length, 0),
        all1755BoardsClaim: false, allHistoriesClaim: false },
      diagnostics: { elapsedMs: performance.now() - started, cache: execution.cacheStats() }, results };
  } finally { execution.releaseBoardCaches(); }
}
