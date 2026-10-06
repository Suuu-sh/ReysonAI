// Additive offline gate contracts. These never approve policies or alter model10 loaders.
import { boards, config, seatRange } from './inputs.mjs';
import { canonicalFlops } from './flop-isomorphism.mjs';
import { PROFILES } from './simulation.mjs';
import { hasPostflopDeal } from './range-support.mjs';
import { NODES, nodeRole, policyMix, treeNodes, validatePolicy } from './policy.mjs';
import { validateLaterPolicy } from './later-policy.mjs';
import { expectedCompanionCoverage } from './all-board-companion.mjs';
import { canonicalJson, contentHash, freezeSnapshot } from './effective-law-identity.mjs';
import { EffectiveReachError } from './decision-prefix.mjs';
export const MODEL11_GATE_DRIVER_VERSION = 1;
export const gateFail = message => { throw new EffectiveReachError('invalid-model11-gate-contract', message); };
export const same = (a, b) => canonicalJson(a) === canonicalJson(b);
export const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && same(Object.keys(value).sort(), [...keys].sort());
const integer = n => Number.isSafeInteger(n) && n >= 0;

// No default scope, implicit board subset, reduced full sample count or profile override.
export function resolveModel11GatePlan(inputs, plan, { executeFull = false } = {}) {
  if (!plan || !['representative', 'all-boards'].includes(plan.kind) || !['full', 'diagnostic'].includes(plan.scope)) gateFail('An explicit gate kind and full/diagnostic scope are required');
  const representative = plan.kind === 'representative', full = plan.scope === 'full';
  const keys = full ? ['kind', 'scope', ...(representative ? ['cacheBatchSize'] : [])]
    : ['kind', 'scope', 'boardIds', 'street', ...(representative ? ['samples', 'profiles', 'heroes', 'cacheBatchSize'] : [])];
  if (!exactKeys(plan, keys)) gateFail('Unknown or missing plan field');
  if (full && executeFull !== true) gateFail('Full numerical work requires the separate explicit --execute-full flag');
  if (config.samples_per_board_profile_seat !== 10000 || inputs.config.seed !== config.seed || !same(inputs.config, config)) gateFail('Inherited pilot configuration changed');
  const catalog = representative ? boards() : canonicalFlops();
  if (catalog.length !== (representative ? 12 : 1755)) gateFail('Inherited board catalog cardinality changed');
  const boardList = full ? catalog : plan.boardIds?.map(id => catalog.find(board => board.id === id));
  if (!Array.isArray(boardList) || !boardList.length || boardList.some(board => !board) || new Set(boardList.map(board => board.id)).size !== boardList.length || !full && boardList.length !== 1) gateFail('Diagnostics must select exactly one existing gate board');
  const street = full ? 'all' : plan.street;
  if (!['flop', 'later', 'all'].includes(street)) gateFail('Invalid explicit street');
  const resolved = { kind: plan.kind, scope: plan.scope, boardList, street, authored: true };
  if (representative) {
    const samples = full ? 10000 : plan.samples, profiles = full ? [...PROFILES] : plan.profiles;
    const heroes = full ? [inputs.spot.ip, inputs.spot.oop] : plan.heroes;
    if (!Number.isSafeInteger(samples) || samples < 1 || !full && samples > 12 ||
        !Array.isArray(profiles) || !profiles.length || new Set(profiles).size !== profiles.length || profiles.some(profile => !PROFILES.includes(profile)) ||
        !Array.isArray(heroes) || !heroes.length || new Set(heroes).size !== heroes.length || heroes.some(hero => ![inputs.spot.ip, inputs.spot.oop].includes(hero)) ||
        !Number.isSafeInteger(plan.cacheBatchSize) || plan.cacheBatchSize < 1 || plan.cacheBatchSize > 10000) gateFail('Invalid sample/profile/seat/cache plan');
    Object.assign(resolved, { samples, profiles, heroes, cacheBatchSize: plan.cacheBatchSize, seed: config.seed });
  }
  return freezeSnapshot(resolved);
}

export function simulationOptions(plan) {
  if (plan.kind !== 'representative') gateFail('A representative plan is required');
  return { boardList: plan.boardList, samples: plan.samples, profiles: plan.profiles, heroes: plan.heroes, cacheBatchSize: plan.cacheBatchSize };
}

// There is exactly one telemetry field at this boundary. Every other byte is compared.
export function simulationNumerical(report) {
  if (!exactKeys(report, ['kind', 'version', 'execution', 'artifactProvenance', 'belief', 'planIdentity', 'samples_per_board_profile_seat', 'seed', 'profiles', 'heroes', 'counts', 'diagnostics', 'results'])) gateFail('Unexpected simulation report shape');
  const { diagnostics: _telemetry, ...numerical } = report;
  return freezeSnapshot(numerical);
}

export function validateModel11Simulation(inputs, plan, binding, report) {
  const numeric = simulationNumerical(report);
  if (numeric.kind !== 'model11-offline-simulation-not-acceptance' || numeric.version !== 2 ||
      !same(numeric.execution, binding.execution) || !same(numeric.belief, binding.belief) || !same(numeric.artifactProvenance, binding.artifactProvenance) ||
      numeric.planIdentity !== contentHash({ boards: plan.boardList, samples: plan.samples, seed: plan.seed, cacheBatchSize: plan.cacheBatchSize, profiles: plan.profiles, heroes: plan.heroes }) ||
      numeric.samples_per_board_profile_seat !== plan.samples || numeric.seed !== plan.seed || !same(numeric.profiles, plan.profiles) || !same(numeric.heroes, plan.heroes) || !Array.isArray(numeric.results)) gateFail('Stale simulation execution/belief/artifact/plan identity');
  let offset = 0, attempted = 0, completed = 0, offModel = 0, provedUnreachableBoards = 0, evaluatedCells = 0, unresolvedCells = 0;
  const warnings = [], metrics = ['candidate_ev_bb', 'baseline_ev_bb', 'delta_bb'];
  for (const board of plan.boardList) {
    if (!hasPostflopDeal(inputs, board.cards)) {
      const row = numeric.results[offset++];
      if (!exactKeys(row, ['board', 'status']) || row.board !== board.id || row.status !== 'unreachable-base-deal') gateFail('Unreachable board proof differs from exact saved support');
      provedUnreachableBoards++; continue;
    }
    for (const profile of plan.profiles) for (const hero of plan.heroes) {
      const row = numeric.results[offset++], key = `${board.id}|${profile}|${hero}`;
      if (!exactKeys(row, ['board', 'split', 'hero', 'opponent', 'status', 'attempted', 'completed', 'unresolved', ...metrics]) || row.board !== board.id || row.split !== (board.split ?? null) || row.hero !== hero || row.opponent !== profile || row.attempted !== plan.samples || !integer(row.completed) || !Array.isArray(row.unresolved) || row.completed + row.unresolved.length !== row.attempted) gateFail(`Missing, reordered or malformed simulation cell: ${key}`);
      const indices = row.unresolved.map(item => item.index);
      if (new Set(indices).size !== indices.length || indices.some(index => !integer(index) || index >= row.attempted) || row.unresolved.some(item => item.status !== 'off-model-observed-action' || typeof item.message !== 'string' || !item.decision?.request || !integer(item.decision.randomIndex))) gateFail(`Invalid typed unresolved trial: ${key}`);
      attempted += row.attempted; completed += row.completed; offModel += row.unresolved.length;
      if (row.unresolved.length) {
        if (row.status !== 'unresolved-off-model' || metrics.some(metric => row[metric] !== null)) gateFail('Off-model trials must suppress all paired EVs, including survivors');
        unresolvedCells++; continue;
      }
      if (row.status !== 'complete') gateFail(`Incomplete simulation status: ${key}`);
      for (const name of metrics) {
        const metric = row[name];
        if (!exactKeys(metric, ['mean', 'sampleCount', 'status', 'ci95']) || !Number.isFinite(metric.mean) || metric.sampleCount !== plan.samples) gateFail(`Invalid simulation metric: ${key}`);
        if (plan.samples < 2) {
          if (metric.ci95 !== null || metric.status !== 'insufficient-samples-for-ci') gateFail('A single trial cannot provide a CI');
        } else if (metric.status !== 'normal-approximation-not-acceptance' || !Array.isArray(metric.ci95) || metric.ci95.length !== 2 || metric.ci95.some(value => !Number.isFinite(value)) || metric.ci95[0] > metric.mean || metric.ci95[1] < metric.mean) gateFail(`Invalid enclosing confidence interval: ${key}`);
      }
      if (row.delta_bb.ci95?.[1] < 0) warnings.push(`${key}: candidate below reference (${row.delta_bb.mean}bb)`);
      evaluatedCells++;
    }
  }
  if (offset !== numeric.results.length || !same(numeric.counts, { attempted, completed, offModel })) gateFail('Unexpected cells or mismatched simulation counts');
  const requestedBoards = plan.boardList.length, cellFactor = plan.profiles.length * plan.heroes.length;
  const counts = { requestedBoards, attemptedBoards: requestedBoards - provedUnreachableBoards, provedUnreachableBoards,
    requestedCells: requestedBoards * cellFactor, evaluatedCells, unresolvedCells, provedUnreachableCells: provedUnreachableBoards * cellFactor,
    requestedTrials: requestedBoards * cellFactor * plan.samples, attemptedTrials: attempted, evaluatedTrials: completed,
    unresolvedTrials: offModel, provedUnreachableTrials: provedUnreachableBoards * cellFactor * plan.samples };
  if (counts.requestedCells !== counts.evaluatedCells + counts.unresolvedCells + counts.provedUnreachableCells || counts.requestedTrials !== completed + offModel + counts.provedUnreachableTrials) gateFail('Incomplete simulation accounting');
  return { numericalHash: contentHash(numeric), counts, complete: offModel === 0, warnings };
}

// This is the original representative audit expansion, unchanged in meaning/order.
export function expandedModel11Legality(inputs, flopArtifact, laterArtifact, boardList) {
  const policy = validatePolicy(flopArtifact.policy, inputs.spot.tree);
  validateLaterPolicy(laterArtifact.policy);
  let checkedCombos = 0;
  for (const board of boardList.filter(board => hasPostflopDeal(inputs, board.cards))) {
    const seats = Object.fromEntries([inputs.spot.ip, inputs.spot.oop].map(seat => [seat, seatRange(inputs, seat, board.cards)]));
    for (const node of treeNodes(inputs.spot.tree)) for (const { combo } of seats[inputs.spot[nodeRole(node)]]) {
      const actions = NODES[node], mix = policyMix(policy, node, combo, board.cards);
      if (actions.reduce((sum, action) => sum + mix[action], 0) !== 100 || actions.some(action => !Number.isInteger(mix[action]) || mix[action] < 0)) gateFail('Expanded policy is illegal');
      checkedCombos++;
    }
  }
  return { checkedCombos, laterPolicyStructure: 'validated-by-original-validator' };
}

export function expectedModel11LaterCoverage(inputs, board) { return expectedCompanionCoverage(inputs, board); }

export function validateModel11Balance(plan, binding, result) {
  if (result.kind !== 'model11-selected-board-balance-gate-bridge' || result.version !== 2 ||
      !same(result.execution, binding.execution) || !same(result.belief, binding.belief) || !same(result.artifactProvenance, binding.artifactProvenance) ||
      result.planIdentity !== contentHash({ boardList: plan.boardList, street: plan.street, authored: true }) || result.selectedBoards !== plan.boardList.length ||
      !Array.isArray(result.results) || !same(result.results.map(row => row.street), plan.street === 'all' ? ['flop', 'later'] : [plan.street]) || !Array.isArray(result.prefixCoverage) ||
      result.complete !== result.results.every(row => row.complete === true)) gateFail('Stale/incomplete balance gate shape or identity');
  for (const row of result.results) {
    if (typeof row.complete !== 'boolean' || !Array.isArray(row.findings) || row.findings.some(finding => !['error', 'warn'].includes(finding.severity))) gateFail('Malformed balance stage');
    if (!row.complete && (row.status !== 'off-model-observed-action' || !row.stoppedAt?.request || !row.findings.some(f => f.check === 'model11-off-model-coverage' && f.severity === 'error'))) gateFail('Incomplete balance stage lacks a typed coverage blocker');
  }
  const findings = result.results.flatMap(row => row.findings.map(finding => ({ ...finding, street: row.street })));
  if (!same(findings, result.findings)) gateFail('Balance findings differ from its stages');
  const offModelStages = result.results.filter(row => !row.complete).length;
  const modelUnreachableProofs = [...new Map(result.prefixCoverage.filter(row => row.state === 'proved-model-unreachable').map(row => {
    if (row.zeroLikelihoodVerification?.eligible !== true || row.zeroLikelihoodVerification.proofHash !== row.zeroLikelihoodProof?.proofHash) gateFail('Unverified model-unreachable prefix');
    return [row.zeroLikelihoodProof.proofHash, row.zeroLikelihoodProof];
  })).values()];
  const modelUnreachablePrefixes = result.prefixCoverage.filter(row => row.state === 'proved-model-unreachable').map(row =>
    ({ request: { board: row.prefix.board, path: row.prefix.path }, prefixIdentity: row.prefixIdentity, proofHash: row.zeroLikelihoodProof.proofHash }));
  const prefixCounts = { requested: result.prefixCoverage.length,
    evaluated: result.prefixCoverage.filter(row => !['off-model-observed-action', 'proved-model-unreachable'].includes(row.state)).length,
    provedModelUnreachable: result.prefixCoverage.filter(row => row.state === 'proved-model-unreachable').length,
    unresolved: result.prefixCoverage.filter(row => row.state === 'off-model-observed-action').length };
  if (prefixCounts.requested !== prefixCounts.evaluated + prefixCounts.provedModelUnreachable + prefixCounts.unresolved) gateFail('Prefix coverage does not partition');
  return { complete: result.complete, offModelStages, prefixCounts, modelUnreachableProofs, modelUnreachablePrefixes, findings,
    errorCount: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warn') };
}
