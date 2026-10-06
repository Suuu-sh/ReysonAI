// Current co-coldcall case only. Reuse actual producer semantics; zero fresh semantic passes.
import { readFileSync, readdirSync, lstatSync, mkdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { loadContext, checkLaunchReview, requirePrepared, fiveIndices, file } from '../co-coldcall-optimized-five-workers/context.mjs';
import { pilotJSON } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-allboard-lanes.mjs';
import { openBoardCheckpoints, writeImmutableAllBoardOutput } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/all-board-checkpoints.mjs';
import { summarizeCompanionRows } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/all-board-companion.mjs';
import { partitionModel11AllBoardReceipt, materializeModel11AllBoardReceipt } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-allboard-partitioned-output.mjs';
import { validateModel11GateReceipt } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/evaluate-model11-audit.mjs';
import { contentHash, canonicalJson } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/effective-law-identity.mjs';
import { same, exactKeys, gateFail } from '../../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/model11-gate-contract.mjs';
const base = dirname(fileURLToPath(import.meta.url));
const CASE_SHA = '080f5c92891b403f0742a00a33e3d38ebb102adc43bccbd5f4798a789e870fb9';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const requireThat = (condition, message) => { if (!condition) gateFail(message); };
const onlyFiles = (dir, names) => requireThat(same(readdirSync(dir).sort(), [...names].sort()) && [...names].every(name => { const s = lstatSync(join(dir, name)); return s.isFile() && !s.isSymbolicLink(); }), 'Extra/missing/nonregular evidence file');
const requireAbsent = path => { try { lstatSync(path); gateFail('Existing path must be preserved: ' + path); } catch (error) { if (error.code !== 'ENOENT') throw error; } };
function verifyFullLosslessBytes(original,restored){
 const first=canonicalJson(original),second=canonicalJson(restored);
 const firstBytes=Buffer.byteLength(first,'utf8'),secondBytes=Buffer.byteLength(second,'utf8');
 const firstSha256=createHash('sha256').update(first,'utf8').digest('hex'),secondSha256=createHash('sha256').update(second,'utf8').digest('hex');
 if(first!==second||firstBytes!==secondBytes||firstSha256!==secondSha256)gateFail('Full canonical receipt bytes/hash differ');
 return {encoding:'UTF-8 of frozen canonicalJson; complete receipt, all1755 rows',bytes:firstBytes,sha256:firstSha256,fullBytesEqual:true,fullHashEqual:true};
}
// Exact original aggregate/status statements; semantic validation is attributed to producers.
function aggregateProducerVerifiedRows(binding, cache) {
  const boardList = binding.plan.boardList, rows = boardList.map(board => cache.rows.get(board.id));
  requireThat(cache.rows.size === 1755 && rows.every(Boolean), 'Exact existing1755 rows required');
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
}
export function finalizeRecovery(producerSha256, reviewedSha256) {
  requireThat(/^[a-f0-9]{64}$/.test(producerSha256) && /^[a-f0-9]{64}$/.test(reviewedSha256), 'Exact producer and reviewed adapter hashes required');
  const pinned = new Map(), pin = (path, expected) => { const actual = file(resolve(path)); requireThat(!expected || same(actual, expected), 'Pinned evidence changed: ' + path); const prior = pinned.get(actual.path); requireThat(!prior || same(prior, actual), 'Evidence changed between reads'); pinned.set(actual.path, actual); return actual; };
  const read = (path, expected) => pilotJSON(resolve(path), pin(path, expected));
  const self = pin(fileURLToPath(import.meta.url)), casePin = pin(join(base, 'case.json'));
  requireThat(self.sha256 === reviewedSha256 && casePin.sha256 === CASE_SHA, 'Reviewed finalizer/case bytes differ');
  const spec = read(casePin.path, casePin), finalRoot = join(base, 'finalized-v1'), checkpointRoot = join(finalRoot, 'checkpoints'); requireAbsent(finalRoot);
  for (const ref of [spec.plan, spec.prepared, spec.boardReview, spec.caseReview, spec.node.binary, ...spec.adapterPins, ...spec.numericalPins]) pin(ref.path, ref);
  const c = loadContext(spec.plan.sha256); requirePrepared(c);
  requireThat(c.p.spot === spec.spot && c.p.repository === spec.repository && c.p.commit === spec.commit && same(c.adapters, spec.adapterPins), 'CO coldcall source/case differs');
  const reviewPin = checkLaunchReview(c, spec.boardReview.path, spec.boardReview.sha256, 'boards'), review = read(reviewPin.path, reviewPin);
  requireThat(review.boundedCaseReview.evidence.some(ref => same(ref, spec.caseReview)), 'Bounded case review missing from actual board authorization');
  const retainedCaseLimitation = { review: spec.caseReview, annotation: spec.retainedCaseLimitation };
  for (const ref of [...review.commonEvidence, review.pilotScopedAcceptance.file, ...review.boundedCaseReview.evidence]) pin(ref.path, ref);
  const producerPin = pin(spec.producerReceiptPath), producer = read(producerPin.path, producerPin), attemptRoot = dirname(producerPin.path), root = c.p.runRoot;
  requireThat(producerPin.sha256 === producerSha256 && attemptRoot === join(root, 'attempts', spec.attempt), 'Exact fixed-attempt terminal producer SHA required');
  requireThat(producer.kind === 'next-hu-five-worker-owned-supervision' && producer.version === 1 && producer.mode === 'boards' && producer.attempt === spec.attempt && producer.status === 'COMPLETE_NOT_ACCEPTED' && producer.sourceUnchanged === true && producer.persistedCompleteObjects === 1755 && producer.allCreatedChildrenReaped === true && producer.allOwnedGroupsGone === true && same(producer.errors, []) && same(producer.stoppedJobs, []) && same(producer.remainingOwnedMembers, []) && same(producer.plan, c.planPin) && same(producer.review, reviewPin) && same(producer.adapterPins, c.adapters) && same(producer.controller, c.adapters.find(ref => basename(ref.path) === 'controller.py')) && producer.oldFullReplayPassed === false && producer.policyAccepted === false, 'Complete truthful five-worker terminal required');
  const terminalPin = pin(join(attemptRoot, 'terminal.json')), { persistedCompleteObjects, ...terminalShape } = producer;
  requireThat(same(read(terminalPin.path, terminalPin), { ...terminalShape, sourceUnchanged: false }), 'Owned terminal-before-postflight differs');
  requireThat(producer.aggregatePeakRssKiB <= c.p.limits.aggregateRssMiB * 1024 && producer.minimumAvailableKiB >= c.p.limits.minimumAvailableMiB * 1024 && producer.seconds <= c.p.limits.wholeSeconds, 'Producer resource bounds exceeded'); requireAbsent(join(root, 'owner.lock'));
  const rowPins = new Map(), proofPins = new Map(), batchPins = [], offsets = [0, 0, 0, 0, 0], counts = [0, 0, 0, 0, 0], jobNames = new Set(), logNames = new Set();
  const worker = c.adapters.find(ref => basename(ref.path) === 'worker.mjs'), boardDir = lane => join(root, `lane-${lane}`, 'checkpoints', c.checkpointIdentityHash);
  for (const batch of producer.completedJobs) {
    const job = batch.job, lane = job.lane; requireThat(Number.isInteger(lane) && lane >= 0 && lane < 5, 'Invalid fixed lane');
    const id = `boards-lane${lane}-${String(counts[lane]).padStart(4, '0')}`, indices = fiveIndices(lane).slice(offsets[lane], offsets[lane] + 8), expected = { kind: 'next-hu-canonical-job', mode: 'batch', attempt: spec.attempt, id, lane, planSha256: c.planPin.sha256, reviewSha256: reviewPin.sha256, indices };
    requireThat(indices.length > 0 && same(job, expected) && batch.exitCode === 0 && Number.isInteger(batch.pid) && batch.pid > 0 && /^[0-9]+$/.test(batch.startTicks) && batch.peakRssKiB <= c.p.limits.groupRssMiB * 1024 && batch.seconds <= c.p.limits.childSeconds, 'Batch assignment/process/resource differs');
    const jobPin = pin(join(attemptRoot, 'jobs', id + '.json')), completionPin = pin(join(attemptRoot, 'jobs', id + '.completed.json'), batch.completion), complete = read(completionPin.path, completionPin), started = read(join(attemptRoot, 'jobs', id + '.started.json'));
    const launch = read(join(attemptRoot, id + '.launch.json')), command = [c.p.node.path, '--max-old-space-size=512', worker.path, 'batch', jobPin.path, c.planPin.sha256, reviewPin.path, reviewPin.sha256];
    requireThat(same(read(jobPin.path, jobPin), job) && same(read(join(attemptRoot, id + '.terminal.json')), batch) && same(launch, { pid: batch.pid, startTicks: batch.startTicks, job: jobPin, command }), 'Actual launch/job/terminal differs');
    requireThat(complete.kind === 'next-hu-canonical-batch-complete-not-accepted' && complete.version === 1 && same(complete.started, started) && started.kind === 'next-hu-canonical-batch-start' && same(started.plan, c.planPin) && same(started.job, jobPin) && same(started.worker, worker) && same(started.review, reviewPin) && started.bindingHash === c.bindingHash && started.checkpointIdentityHash === c.checkpointIdentityHash && same(started.process, { pid: batch.pid, startTicks: batch.startTicks }) && complete.generatedBoards === indices.length && complete.inspectedBoards === 0 && complete.fullGatePassed === false && complete.policyAccepted === false && same(complete.completed.map(row => row.index), indices), 'Actual producer semantic-validation attribution differs');
    for (const item of complete.completed) {
      requireThat(exactKeys(item, ['index', 'board', 'checkpoint', 'proofs']) && item.board === c.boardIds[item.index] && item.checkpoint.path === `${item.board}.json` && !rowPins.has(item.index), 'Duplicate/foreign produced checkpoint');
      const dir = boardDir(lane), ref = pin(join(dir, item.checkpoint.path), { ...item.checkpoint, path: join(dir, item.checkpoint.path) }), envelope = read(ref.path, ref), row = envelope.row;
      requireThat(envelope.key === c.checkpointIdentityHash && row?.board === item.board && row.bindingHash === c.bindingHash && row.complete === true && same(item.proofs, (row.modelUnreachableProofs ?? []).map(proof => ({ path: proof.proofHash + '.proof.json', bytes: proof.bytes, sha256: proof.sha256 }))), 'Completed envelope/proof reference closure differs'); rowPins.set(item.index, ref);
      for (const proof of item.proofs) { requireThat(exactKeys(proof, ['path', 'bytes', 'sha256']) && /^[a-f0-9]{64}\.proof\.json$/.test(proof.path) && Number.isSafeInteger(proof.bytes) && proof.bytes > 0 && proof.bytes <= 16 * 1024 * 1024, 'Invalid proof reference'); const record = pin(join(dir, proof.path), { ...proof, path: join(dir, proof.path) }); requireThat(!proofPins.has(proof.path) || proofPins.get(proof.path).sha256 === record.sha256 && proofPins.get(proof.path).bytes === record.bytes, 'Proof filename conflict'); proofPins.set(proof.path, record); }
    }
    offsets[lane] += indices.length; counts[lane]++; batchPins.push({ completion: completionPin, terminal: pin(join(attemptRoot, id + '.terminal.json')), launch: pin(join(attemptRoot, id + '.launch.json')) });
    for (const suffix of ['.json', '.started.json', '.completed.json']) jobNames.add(id + suffix); logNames.add(id + '.log'); pin(join(attemptRoot, 'logs', id + '.log'));
  }
  requireThat(same(offsets, [351, 351, 351, 351, 351]) && same(counts, [44, 44, 44, 44, 44]) && rowPins.size === 1755 && c.boardIds.every((_, i) => rowPins.has(i)), 'Exact220-batch/1755 unique producer-verified union required');
  onlyFiles(join(attemptRoot, 'jobs'), jobNames); onlyFiles(join(attemptRoot, 'logs'), logNames);
  const identities = [];
  for (let lane = 0; lane < 5; lane++) {
    const dir = boardDir(lane), allowed = new Set(['identity.json']); requireThat(same(readdirSync(dirname(dir)), [c.checkpointIdentityHash]), 'Foreign binding'); identities.push(pin(join(dir, 'identity.json')));
    for (const index of fiveIndices(lane)) { allowed.add(`${c.boardIds[index]}.json`); for (const proof of read(rowPins.get(index).path, rowPins.get(index)).row.modelUnreachableProofs ?? []) allowed.add(proof.proofHash + '.proof.json'); }
    onlyFiles(dir, allowed);
  }
  requireThat(identities.every(ref => ref.sha256 === identities[0].sha256 && ref.bytes === identities[0].bytes), 'Lane identities differ');
  const assertEvidence = () => { requireAbsent(join(root, 'owner.lock')); for (const ref of pinned.values()) requireThat(same(file(ref.path), ref), 'Producer/source/evidence bytes changed'); };
  assertEvidence(); mkdirSync(finalRoot); const cache = openBoardCheckpoints(checkpointRoot, c.binding, c.boardIds);
  requireThat(file(join(cache.dir, 'identity.json')).sha256 === identities[0].sha256, 'Merged identity differs');
  const copyExact = ref => { requireThat(same(file(ref.path), ref), 'Source changed before copy'); const bytes = readFileSync(ref.path); requireThat(bytes.length === ref.bytes && hash(bytes) === ref.sha256, 'Copy read changed'); const target = join(cache.dir, basename(ref.path)); writeImmutableAllBoardOutput(target, bytes); requireThat(same(file(target), { ...ref, path: target }), 'Copied bytes differ'); };
  for (const ref of proofPins.values()) copyExact(ref); for (let index = 0; index < 1755; index++) copyExact(rowPins.get(index));
  const mergedPins = readdirSync(cache.dir).sort().map(name => file(join(cache.dir, name))), assertAllBytes = () => { assertEvidence(); onlyFiles(cache.dir, new Set(mergedPins.map(ref => basename(ref.path)))); for (const ref of mergedPins) requireThat(same(file(ref.path), ref), 'Final storage bytes changed'); };
  assertAllBytes(); const startedAt = new Date().toISOString(), started = performance.now(), result = aggregateProducerVerifiedRows(c.binding, openBoardCheckpoints(checkpointRoot, c.binding, c.boardIds));
  const exitCode = ['blocked-off-model-coverage', 'completed-with-quality-errors'].includes(result.status) ? 1 : 0;
  const log = JSON.stringify({ spot: spec.spot, operation: 'all-boards', status: result.status, semanticEvidenceReused: true, freshWholeSetSemanticPasses: 0, numericalGeneration: 0, componentOnly: true }) + '\n';
  const receipt = { kind: 'model11-gate-execution-receipt', version: 1, operation: 'all-boards', startedAt, completedAt: new Date().toISOString(), command: process.argv, exitCode, execution: { node: process.version, platform: process.platform, arch: process.arch }, sourceStart: c.source, sourceEnd: c.source, filesStart: c.files, filesEnd: c.files, reportInput: null, result, resultHash: contentHash(result), log: { text: log, sha256: hash(log) }, diagnostics: { elapsedMs: performance.now() - started, processLifetimeMaxRssKiB: process.resourceUsage().maxRSS, operationalProvenance: { kind: 'co-coldcall-producer-verified-aggregate', finalizer: self, case: casePin, prepared: spec.prepared, boardReview: reviewPin, caseReview: spec.caseReview, producer: producerPin, producerTerminal: terminalPin, batches: batchPins }, semanticEvidenceReused: true, producerVerifiedBoards: 1755, freshWholeSetSemanticPasses: 0, retainedCaseLimitation, originalWhole1755DriverExecuted: false, originalConsumerFreshSemanticReplay: false, numericalGeneration: 0, fullReplay: false, policyAccepted: false, model11Adoption: false } };
  validateModel11GateReceipt(receipt, { operation: 'all-boards', binding: c.binding });
  const saved = partitionModel11AllBoardReceipt(receipt, checkpointRoot, { outputSourceStart: c.source.output, outputSourceEnd: c.source.output }), restored = materializeModel11AllBoardReceipt(saved, checkpointRoot, { binding: c.binding, outputSource: c.source.output }), lossless = verifyFullLosslessBytes(receipt, restored);
  requireThat(lossless.sha256 === saved.originalReceiptHash, 'Full canonical receipt hash differs from frozen partition identity'); assertAllBytes();
  const path = join(finalRoot, 'allboard-partitioned.json'); writeImmutableAllBoardOutput(path, JSON.stringify(saved, null, 2) + '\n');
  const component = { kind: 'co-coldcall-producer-verified-aggregate', version: 1, spot: spec.spot, bindingHash: c.bindingHash, complete: result.complete && result.fullScopePassed && exitCode === 0, full1755ComponentPassed: result.fullScopePassed, producerVerifiedBoards: 1755, semanticEvidenceReused: true, freshWholeSetSemanticPasses: 0, originalConsumerFreshSemanticReplay: false, originalWhole1755DriverExecuted: false, numericalGeneration: 0, producerOwnershipTerminated: true, retainedCaseLimitation, fullLosslessStorageCheck: lossless, partitionedReceipt: file(path), checkpointRoot, producerReceipt: producerPin, boundedCaseReview: spec.caseReview, fullReplay: false, policyAccepted: false, model11Adoption: false };
  writeImmutableAllBoardOutput(join(finalRoot, 'producer-verified-component.json'), JSON.stringify(component, null, 2) + '\n'); return { path, exitCode, log };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  requireThat(process.argv.length === 9 && same([process.argv[2], process.argv[4], process.argv[6], process.argv[7], process.argv[8]], ['--producer-sha256', '--reviewed-sha256', '--require-existing', 'all-boards', 'CO_open_BTN_3bet_SB_call_CO_fold']), 'Explicit current co-coldcall existing-only command required');
  const result = finalizeRecovery(process.argv[3], process.argv[5]); process.stdout.write(result.log); console.log(JSON.stringify({ output: result.path, exitCode: result.exitCode })); process.exitCode = result.exitCode;
}
