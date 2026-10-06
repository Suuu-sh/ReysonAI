// Only explicit model11 gates. Numeric completion remains separate from review and adoption.
import { createDecisionPrefix } from './decision-prefix.mjs';
import { assertZeroProofAncestor, verifyZeroLikelihoodProof } from './model11-zero-proof.mjs';
import { createModel11Execution } from './execution-model11.mjs';
import { simulateModel11 } from './simulation-model11.mjs';
import { simulate } from './simulation.mjs';
import { referencePolicyFor } from './policy.mjs';
import { checkModel11Balance } from './gate-model11.mjs';
import { hasPostflopDeal } from './range-support.mjs';
import { seatRange } from './inputs.mjs';
import { openBoardCheckpoints, writeImmutableAllBoardOutput } from './all-board-checkpoints.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditFileRecord } from './audit-identity.mjs';
import { summarizeCompanionRows } from './all-board-companion.mjs';
import { contentHash, freezeSnapshot } from './effective-law-identity.mjs';
import { MODEL11_GATE_DRIVER_VERSION, gateFail, same, exactKeys, simulationOptions, simulationNumerical,
  validateModel11Simulation, expandedModel11Legality, expectedModel11LaterCoverage, validateModel11Balance } from './model11-gate-contract.mjs';

export function model11GateBinding(inputs, flopArtifact, laterArtifact, plan, source, files) {
  const execution = createModel11Execution(inputs, flopArtifact, laterArtifact);
  try {
    return freezeSnapshot({ kind: 'model11-numerical-gate-binding', version: MODEL11_GATE_DRIVER_VERSION,
      spot: inputs.spot.id, sourceFingerprint: inputs.fingerprint, source, files,
      execution: execution.identity, belief: execution.belief, artifactProvenance: execution.artifactProvenance,
      plan, planIdentity: contentHash(plan) });
  } finally { execution.releaseBoardCaches(); }
}

export function produceModel11Representative(inputs, flopArtifact, laterArtifact, binding) {
  const plan = binding.plan;
  const report = simulateModel11(inputs, flopArtifact, laterArtifact, simulationOptions(plan));
  const validation = validateModel11Simulation(inputs, plan, binding, report);
  return { kind: 'model11-representative-simulation-for-independent-replay', version: 1, binding, bindingHash: contentHash(binding),
    status: validation.complete ? 'simulation-produced-not-audited' : 'blocked-off-model-coverage',
    acceptance: 'not-accepted; fresh independent replay, balance, all-board gates and review remain required',
    numericalHash: validation.numericalHash, counts: validation.counts, report };
}

export function auditModel11Representative(inputs, flopArtifact, laterArtifact, binding, saved) {
  if (!exactKeys(saved, ['kind', 'version', 'binding', 'bindingHash', 'status', 'acceptance', 'numericalHash', 'counts', 'report']) ||
      saved.kind !== 'model11-representative-simulation-for-independent-replay' || saved.version !== 1 ||
      !same(saved.binding, binding) || saved.bindingHash !== contentHash(binding)) gateFail('A fresh same-identity model11 report is required; legacy reports are not accepted');
  const plan = binding.plan, first = validateModel11Simulation(inputs, plan, binding, saved.report);
  if (saved.numericalHash !== first.numericalHash || !same(saved.counts, first.counts) || saved.status !== (first.complete ? 'simulation-produced-not-audited' : 'blocked-off-model-coverage')) gateFail('Saved report hash/count/status mismatch');
  // This function is called only by the distinct audit operation. No checkpoint or saved
  // numeric result substitutes for fresh simulation; its factory/cache is new each time.
  const replay = simulateModel11(inputs, flopArtifact, laterArtifact, simulationOptions(plan));
  const second = validateModel11Simulation(inputs, plan, binding, replay);
  if (!same(simulationNumerical(saved.report), simulationNumerical(replay))) gateFail('Model11 fixed-seed numerical replay differs');
  const legality = expandedModel11Legality(inputs, flopArtifact, laterArtifact, plan.boardList);
  const balancePlan = { ...plan, boardList: plan.boardList.filter(board => hasPostflopDeal(inputs, board.cards)) };
  if (!balancePlan.boardList.length) gateFail('Representative gate has no reachable board to evaluate');
  const balance = checkModel11Balance(inputs, flopArtifact, laterArtifact, { boardList: balancePlan.boardList, street: plan.street, authored: true });
  const balanceValidation = validateModel11Balance(balancePlan, binding, balance);
  const sanity = simulate(inputs, referencePolicyFor(inputs.spot.tree), 12, null, { computedDefence: false, boardList: plan.boardList });
  const sanityExpected = plan.boardList.filter(board => hasPostflopDeal(inputs, board.cards)).length * 3 * 2;
  if (sanity.results.length !== sanityExpected || sanity.results.some(row => row.delta_bb.mean !== 0 || row.delta_bb.ci95.some(value => value !== 0))) gateFail('Reference-versus-reference sanity drifted or is incomplete');
  const complete = first.complete && second.complete && balanceValidation.complete;
  const qualityPass = complete && legality.checkedCombos > 0 && balanceValidation.errorCount === 0 && first.counts.evaluatedCells > 0;
  return { kind: 'model11-representative-gate-result', version: 1, binding, bindingHash: contentHash(binding),
    status: !complete ? 'blocked-off-model-coverage' : !qualityPass ? 'completed-with-quality-errors' : plan.scope === 'full' ? 'representative-numerical-gate-complete-unapproved' : 'diagnostic-complete-not-acceptance',
    acceptance: 'not-accepted; matching complete all-board evidence and independent review remain required',
    complete, fullScopePassed: plan.scope === 'full' && qualityPass, counts: first.counts, ...legality,
    replay: { pass: true, savedNumericalHash: first.numericalHash, freshNumericalHash: second.numericalHash,
      comparison: 'every report field except the declared top-level diagnostics; not a cache/checkpoint replay' },
    referenceSanity: { samplesPerCell: 12, cells: sanityExpected, zeroDrift: true, numericalHash: contentHash(sanity) },
    balance, warnings: [...first.warnings, ...balanceValidation.warnings.map(f => `balance [${f.check}] ${f.node}: ${f.detail}`)],
    balanceBoardCounts: { requested: plan.boardList.length, evaluated: balancePlan.boardList.length, provedBaseUnreachable: plan.boardList.length - balancePlan.boardList.length },
    balancePrefixCounts: balanceValidation.prefixCounts,
    offModel: { simulationTrials: first.counts.unresolvedTrials, balanceStages: balanceValidation.offModelStages },
    diagnostics: { replay: replay.diagnostics } };
}

// Compact board evidence retains actual completion, typed stopped requests and inherited
// coverage. Prefix visit counts are diagnostics, never a claim of all action histories.
export function model11BoardRow(inputs, flopArtifact, laterArtifact, binding, board) {
  const bindingHash = contentHash(binding), expectedCoverage = expectedModel11LaterCoverage(inputs, board);
  if (expectedCoverage === null) return { board: board.id, bindingHash, unreachable: true, findings: [], complete: true,
    stages: [], prefixCounts: { requested: 0, evaluated: 0, provedModelUnreachable: 0, unresolved: 0 }, offModelStages: 0 };
  const plan = { ...binding.plan, boardList: [board] };
  const balance = checkModel11Balance(inputs, flopArtifact, laterArtifact, { boardList: [board], street: plan.street, authored: true });
  const validation = validateModel11Balance(plan, binding, balance);
  const later = balance.results.find(row => row.street === 'later');
  if (later?.complete && !same(later.coverage, expectedCoverage)) gateFail('Actual later-street coverage differs from exact inherited seeded support proof');
  const root = balance.prefixCoverage.find(row => row.prefix.board.length === 3 && Object.values(row.prefix.path).every(actions => actions.length === 0));
  const flopRoot = root && !['proved-model-unreachable', 'off-model-observed-action'].includes(root.state) && root.methods.includes('observableMix') ? {
    request: { board: root.prefix.board, path: root.prefix.path }, prefixIdentity: root.prefixIdentity,
    actor: root.prefix.pending.seat, evaluatedCombos: Object.values(root.lawStatuses).reduce((sum, count) => sum + count, 0) } : null;
  const stages = balance.results.map(row => row.complete ? { street: row.street, complete: true }
    : { street: row.street, complete: false, status: row.status, stoppedAt: row.stoppedAt });
  return { board: board.id, bindingHash, complete: validation.complete, stages, flopRoot,
    ...(later?.complete ? { later_coverage: later.coverage } : {}),
    // Preserve original all-board summary exclusions. They remain enforced in the
    // representative whole-board aggregate, and are retained separately here.
    globalFindings: validation.findings.filter(f => f.street === 'later' && ['no-overrides', 'role-copy'].includes(f.check)),
    findings: validation.findings.filter(f => !(f.street === 'later' && ['no-overrides', 'role-copy'].includes(f.check)))
      .map(({ check, severity, node, street, direction }) => ({ check, severity, node, street, ...(direction ? { direction } : {}) })),
    prefixCounts: validation.prefixCounts, modelUnreachableProofs: validation.modelUnreachableProofs, modelUnreachablePrefixes: validation.modelUnreachablePrefixes, offModelStages: validation.offModelStages };
}

export function validateModel11BoardRow(inputs, binding, board, row, { readProof = ref => ref, verifyProof } = {}) {
  const expectedCoverage = expectedModel11LaterCoverage(inputs, board);
  if (!row || row.board !== board.id || row.bindingHash !== contentHash(binding) || !Array.isArray(row.findings) ||
      typeof row.complete !== 'boolean' || !Array.isArray(row.stages) || !exactKeys(row.prefixCounts, ['requested', 'evaluated', 'provedModelUnreachable', 'unresolved']) ||
      Object.values(row.prefixCounts).some(value => !Number.isSafeInteger(value) || value < 0) || !Number.isSafeInteger(row.offModelStages) || row.offModelStages < 0) gateFail('Malformed model11 checkpoint');
  if (expectedCoverage === null) {
    if (!exactKeys(row, ['board', 'bindingHash', 'unreachable', 'findings', 'complete', 'stages', 'prefixCounts', 'offModelStages']) || row.unreachable !== true || !row.complete || row.findings.length || row.stages.length || Object.values(row.prefixCounts).some(Boolean) || row.offModelStages) gateFail('Invalid proved-unreachable checkpoint');
    return;
  }
  const streets = binding.plan.street === 'all' ? ['flop', 'later'] : [binding.plan.street];
  if (row.unreachable !== undefined || !same(row.stages.map(stage => stage.street), streets) || row.complete !== row.stages.every(stage => stage.complete === true) ||
      row.offModelStages !== row.stages.filter(stage => !stage.complete).length || !Array.isArray(row.globalFindings) || !Array.isArray(row.modelUnreachableProofs) || !Array.isArray(row.modelUnreachablePrefixes)) gateFail('Checkpoint has incomplete street accounting');
  for (const stage of row.stages) {
    if (stage.complete === true) { if (!exactKeys(stage, ['street', 'complete'])) gateFail('Unexpected complete stage fields'); }
    else if (!exactKeys(stage, ['street', 'complete', 'status', 'stoppedAt']) || stage.complete !== false || stage.status !== 'off-model-observed-action' || !stage.stoppedAt?.request || !row.findings.some(f => f.street === stage.street && f.check === 'model11-off-model-coverage' && f.severity === 'error')) gateFail('Stopped stage lacks typed off-model evidence');
  }
  const hasLater = row.stages.some(stage => stage.street === 'later' && stage.complete);
  if (!exactKeys(row, ['board', 'bindingHash', 'complete', 'stages', 'flopRoot', ...(hasLater ? ['later_coverage'] : []), 'globalFindings', 'findings', 'prefixCounts', 'modelUnreachableProofs', 'modelUnreachablePrefixes', 'offModelStages']) ||
      hasLater && !same(row.later_coverage, expectedCoverage)) gateFail('Checkpoint later coverage is not the exact four-turn/twelve-river inherited proof');
  const c = row.prefixCounts;
  if (row.complete && c.requested === 0) gateFail('A reachable completed board cannot have empty requested-prefix coverage');
  if (streets.includes('flop')) {
    if (!exactKeys(row.flopRoot, ['request', 'prefixIdentity', 'actor', 'evaluatedCombos']) || c.evaluated < 1) gateFail('Reachable flop/all scope requires an evaluated initial decision');
    const root = createDecisionPrefix(inputs, { board: board.cards, path: { flop: [] } }, inputs.config);
    if (!same(root, createDecisionPrefix(inputs, row.flopRoot.request, inputs.config)) || row.flopRoot.prefixIdentity !== contentHash(root) ||
        row.flopRoot.actor !== root.pending.seat || row.flopRoot.evaluatedCombos !== seatRange(inputs, root.pending.seat, root.board).length || row.flopRoot.evaluatedCombos < 1) gateFail('Evaluated flop root does not cover the exact live base support');
  } else if (row.flopRoot !== null) gateFail('Later-only scope cannot claim a flop root evaluation');
  if (c.requested !== c.evaluated + c.provedModelUnreachable + c.unresolved || c.unresolved !== row.offModelStages ||
      (row.modelUnreachableProofs.length === 0) !== (c.provedModelUnreachable === 0)) gateFail('Checkpoint effective-prefix partition differs');
  const proofs = row.modelUnreachableProofs.map(readProof);
  if (proofs.length && typeof verifyProof !== 'function') gateFail('Persisted exact-zero evidence requires full semantic verification, not self hashes');
  if (new Set(proofs.map(proof => proof.proofHash)).size !== proofs.length) gateFail('Duplicate exact-zero certificate');
  for (const proof of proofs) {
    const { proofHash, ...body } = proof;
    if (proof.kind !== 'model11-exact-zero-historical-action' || proof.version !== 1 || proofHash !== contentHash(body) ||
        !same(proof.modelIdentity, binding.execution.model) || proof.beliefIdentity !== binding.belief.identity ||
        proof.artifactProvenanceIdentity !== contentHash(binding.artifactProvenance) || !proof.rows?.length ||
        proof.rows.some(item => !Number.isFinite(item.beforeWeight) || item.beforeWeight <= 0 || item.physicalMass !== 0 || item.afterWeight !== 0) ||
        proof.afterTotal !== 0 || proof.underflow !== false) gateFail('Checkpoint exact-zero evidence is malformed/stale');
  }
  if (row.modelUnreachablePrefixes.length !== c.provedModelUnreachable || new Set(row.modelUnreachablePrefixes.map(item => item.prefixIdentity)).size !== c.provedModelUnreachable) gateFail('Missing or duplicate model-unreachable prefix evidence');
  for (const item of row.modelUnreachablePrefixes) {
    if (!exactKeys(item, ['request', 'prefixIdentity', 'proofHash'])) gateFail('Malformed model-unreachable prefix reference');
    const prefix = createDecisionPrefix(inputs, item.request, inputs.config), proof = proofs.find(p => p.proofHash === item.proofHash);
    if (!proof || contentHash(prefix) !== item.prefixIdentity || !same([...prefix.board.slice(0, 3)].sort((a, b) => a - b), [...board.cards].sort((a, b) => a - b))) gateFail('Certificate mapped to another board or unverified prefix');
    assertZeroProofAncestor(proof, prefix);
    const verification = verifyProof(proof, item.request);
    if (verification?.eligible !== true || verification.proofHash !== proof.proofHash) gateFail('Persisted exact-zero evidence did not pass full support/law verification');
  }
  if (proofs.some(proof => !row.modelUnreachablePrefixes.some(item => item.proofHash === proof.proofHash))) gateFail('Unreferenced model-unreachable certificate');
  for (const finding of [...row.findings, ...row.globalFindings]) if (!['warn', 'error'].includes(finding.severity) || !streets.includes(finding.street) || typeof finding.check !== 'string' || typeof finding.node !== 'string') gateFail('Malformed checkpoint finding');
  if (row.globalFindings.some(f => f.street !== 'later' || !['no-overrides', 'role-copy'].includes(f.check)) || row.findings.some(f => f.street === 'later' && ['no-overrides', 'role-copy'].includes(f.check))) gateFail('Inherited global/per-board finding scope differs');
}

export function runModel11AllBoards(inputs, flopArtifact, laterArtifact, binding, checkpointRoot, { assertUnchanged, onBoard = () => {} } = {}) {
  if (binding.plan.kind !== 'all-boards' || typeof checkpointRoot !== 'string' || typeof assertUnchanged !== 'function') gateFail('Explicit all-board plan, checkpoint directory and identity recheck required');
  const boardList = binding.plan.boardList;
  // Existing per-board completeness fields are only emitted for the new HU-after-
  // multiway spot class. Do not synthesize those measurements for original45.
  if (!inputs.spot.history) gateFail('This all-board driver requires the HU-after-multiway history/coverage contract');
  assertUnchanged();
  const cache = openBoardCheckpoints(checkpointRoot, binding, boardList.map(board => board.id));
  const readProof = ref => {
    if (!exactKeys(ref, ['proofHash', 'bytes', 'sha256']) || !/^[a-f0-9]{64}$/.test(ref.proofHash)) gateFail('Invalid exact-zero proof reference');
    const path = `${ref.proofHash}.proof.json`, record = auditFileRecord(cache.dir, path);
    if (record.sha256 !== ref.sha256 || record.bytes !== ref.bytes) gateFail('Exact-zero checkpoint evidence changed');
    const envelope = JSON.parse(readFileSync(join(cache.dir, path), 'utf8'));
    if (!exactKeys(envelope, ['bindingHash', 'proof']) || envelope.bindingHash !== contentHash(binding) || envelope.proof.proofHash !== ref.proofHash) gateFail('Exact-zero checkpoint evidence belongs to another gate');
    return envelope.proof;
  };
  let proofExecution = null;
  const verifiedProofs = new Map();
  const verifyProof = (proof, request) => {
    // The caller always rechecks the target ancestor. Semantic support/law proof
    // is memoized only after full replay under this exact immutable binding.
    if (!verifiedProofs.has(proof.proofHash)) {
      proofExecution ??= createModel11Execution(inputs, flopArtifact, laterArtifact);
      verifiedProofs.set(proof.proofHash, verifyZeroLikelihoodProof(proofExecution, proof, request));
    }
    return verifiedProofs.get(proof.proofHash);
  };
  try {
  for (const board of boardList) {
    if (cache.rows.has(board.id)) validateModel11BoardRow(inputs, binding, board, cache.rows.get(board.id), { readProof, verifyProof });
    else {
      assertUnchanged();
      const row = model11BoardRow(inputs, flopArtifact, laterArtifact, binding, board);
      validateModel11BoardRow(inputs, binding, board, row, { verifyProof });
      assertUnchanged();
      if (!row.unreachable) row.modelUnreachableProofs = row.modelUnreachableProofs.map(proof => {
        const path = `${proof.proofHash}.proof.json`;
        writeImmutableAllBoardOutput(join(cache.dir, path), JSON.stringify({ bindingHash: contentHash(binding), proof }) + '\n');
        const { bytes, sha256 } = auditFileRecord(cache.dir, path);
        return { proofHash: proof.proofHash, bytes, sha256 };
      });
      validateModel11BoardRow(inputs, binding, board, row, { readProof, verifyProof });
      cache.write(row); onBoard(row, cache.rows.size);
    }
    proofExecution?.releaseBoardCaches();
  }
  if (cache.rows.size !== boardList.length) gateFail('All-board checkpoint set is incomplete');
  assertUnchanged();
  const rows = boardList.map(board => cache.rows.get(board.id));
  for (let i = 0; i < rows.length; i++) validateModel11BoardRow(inputs, binding, boardList[i], rows[i], { readProof, verifyProof });
  const summary = summarizeCompanionRows(rows), provedUnreachable = rows.filter(row => row.unreachable).length;
  const evaluated = rows.filter(row => !row.unreachable && row.complete).length, unresolved = rows.filter(row => !row.complete).length;
  const offModelStages = rows.reduce((total, row) => total + row.offModelStages, 0);
  const prefixCounts = rows.reduce((total, row) => { for (const key of Object.keys(total)) total[key] += row.prefixCounts[key]; return total; },
    { requested: 0, evaluated: 0, provedModelUnreachable: 0, unresolved: 0 });
  const globalFindings = [...new Map(rows.flatMap(row => row.globalFindings ?? []).map(f => [contentHash(f), f])).values()];
  const fullScope = binding.plan.scope === 'full' && binding.plan.street === 'all' && boardList.length === 1755;
  const fullScopePassed = fullScope && unresolved === 0 && summary.errors === 0 && evaluated > 0 &&
    !globalFindings.some(f => f.severity === 'error') && summary.later_coverage.turn_boards > 0 && summary.later_coverage.river_runouts > 0;
  return { kind: 'model11-all-board-gate-result', version: 1, binding, bindingHash: contentHash(binding), checkpointIdentityHash: cache.key,
    status: unresolved ? 'blocked-off-model-coverage' : summary.errors || globalFindings.some(f => f.severity === 'error') ? 'completed-with-quality-errors'
      : fullScopePassed ? 'all-board-numerical-gate-complete-unapproved' : 'diagnostic-complete-not-acceptance',
    acceptance: 'not-accepted; matching full representative evidence and independent review remain required',
    complete: unresolved === 0, fullScopePassed, counts: { requestedBoards: boardList.length, evaluatedBoards: evaluated,
      provedUnreachableBoards: provedUnreachable, unresolvedBoards: unresolved, offModelStages,
      boardsWithProvedModelUnreachablePrefixes: rows.filter(row => row.prefixCounts.provedModelUnreachable > 0).length },
    prefixCounts,
    inheritedSummary: summary, globalFindings, rows, rowHashes: rows.map(contentHash),
    coverageScope: 'all selected canonical flops and declared streets; inherited representative paths/runouts, not every action history' };
  } finally { proofExecution?.releaseBoardCaches(); }
}
