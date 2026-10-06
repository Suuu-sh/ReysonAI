// Fixed current case CLI. Run under the existing owned-process supervisor.
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadContext, requirePrepared, file, read, write } from '../co-bb-squeeze-btncall-mc720k-five-workers/context.mjs';
import { loadScopedAuditApi, createScopedManifest, validateScopedManifest, createScopedBinding, scanStoredCell,
  assertExactEvidenceFiles, replayAndCompareCell, advanceUnselectedCell, runCurrentCacheControls, AUDIT_KIND, LIMITATIONS } from './scoped-audit.mjs';

const base = dirname(fileURLToPath(import.meta.url)), planSha = 'cae03aa4fd85ad61955b68c88d2a262cef59d7038ea79ae39a773c3e8cf8d318';
const [mode, ...args] = process.argv.slice(2);
if (!['prepare', 'audit'].includes(mode) || (mode === 'prepare' ? args.length !== 1 : args.length !== 7)) throw new Error('prepare MANIFEST_PATH | audit MANIFEST_PATH MANIFEST_SHA SUMMARY_PATH SUMMARY_SHA RECEIPT_PATH RECEIPT_SHA NEW_OUTPUT_ROOT');
const c = loadContext(planSha); requirePrepared(c);
const api = await loadScopedAuditApi(c.p.repository), { same, gateFail, contentHash } = api;
const adapters = ['scoped-audit.mjs', 'audit-current.mjs'].map(name => file(join(base, name))).concat([
  file(join(c.p.repository, 'apps/frontend/scripts/postflop-ai/model11-selected-regression.mjs'))
]);
const binding = c.regressionBinding, witnesses = [1, 2, 59].map(cellIndex => ({ cellIndex,
  reason: cellIndex === 1 ? 'Retained adverse mean condition' : 'Retained semantic completion condition',
  evidence: file(join(base, `../trial-cost-diagnostic-20261006/current-${String(cellIndex).padStart(3, '0')}/result.json`)) }));
const assertUnchanged = () => { c.assertUnchanged(); for (const pin of adapters) if (!same(file(pin.path), pin)) gateFail('Audit adapter changed'); };
assertUnchanged();
if (mode === 'prepare') {
  const manifest = createScopedManifest(api, c.inputs, binding, witnesses);
  const value = { kind: 'hu-current-scoped-audit-prepared', version: 1, sourceCommit: c.p.commit, plan: c.planPin,
    adapters, manifest, manifestHash: contentHash(manifest), numericalWorkPerformed: false };
  assertUnchanged(); write(args[0], value);
  console.log(JSON.stringify({ prepared: file(args[0]), selectedCells: manifest.rows.length, selectedTrials: manifest.selectedTrials, advancedRngTrials: manifest.advancedRngTrials }));
} else {
  const [manifestPath, manifestSha, summaryPath, summarySha, receiptPath, receiptSha, output] = args;
  const pin = (path, expected) => { const value = file(path); if (value.sha256 !== expected) gateFail('Explicit source file pin differs'); return value; };
  const manifestPin = pin(manifestPath, manifestSha), summaryPin = pin(summaryPath, summarySha), receiptPin = pin(receiptPath, receiptSha);
  const prepared = read(manifestPin), summary = read(summaryPin), producer = read(receiptPin), manifest = prepared.manifest;
  if (prepared.kind !== 'hu-current-scoped-audit-prepared' || prepared.version !== 1 || !same(prepared.plan, c.planPin) ||
      !same(prepared.adapters, adapters) || prepared.manifestHash !== contentHash(manifest) || prepared.numericalWorkPerformed !== false) gateFail('Audit preparation differs');
  validateScopedManifest(api, c.inputs, binding, manifest);
  if (summary.kind !== 'model11-per-policy-monte-carlo-72x10000-summary' || summary.version !== 1 || summary.spot !== c.p.spot ||
      summary.bindingHash !== contentHash(binding) || summary.requestedStrata !== 72 || summary.requestedTrials !== 720000 ||
      !Array.isArray(summary.cells) || summary.cells.length !== 72 || summary.oldFullReplayPassed !== false || summary.policyAccepted !== false ||
      !same(summary.first64Parity, { comparedCells: 72, equalCells: 72, freshReplayPerformed: false }) ||
      producer.kind !== 'next-hu-five-worker-owned-supervision' || producer.status !== 'COMPLETE_NOT_ACCEPTED' ||
      producer.mode !== 'regression' || producer.sourceUnchanged !== true || producer.allCreatedChildrenReaped !== true ||
      producer.allOwnedGroupsGone !== true || producer.errors.length || producer.persistedCompleteObjects !== 72 ||
      !same(producer.regressionSummary, summaryPin) || !same(producer.plan, c.planPin) || !same(producer.adapterPins, c.adapters) ||
      !same(producer.controller, file(join(dirname(c.planPin.path), 'controller.py'))) ||
      !same(producer.review, file(producer.review.path)) || producer.completedJobs.length !== 72) gateFail('Source720k report/production receipt incomplete');
  const originals = new Map(), completionPins = [];
  for (const completed of producer.completedJobs) {
    const entry = read(completed.completion), index = entry.diagnostic?.cellIndex;
    if (!Number.isInteger(index) || index < 0 || index >= 72 || originals.has(index) ||
        !same(file(completed.completion.path), completed.completion) || !same(entry.started.plan, c.planPin) ||
        !same(entry.started.worker, file(join(dirname(c.planPin.path), 'regression.mjs'))) ||
        !same(entry.started.review, producer.review) || !same(entry.started.process, { pid: completed.pid, startTicks: completed.startTicks }) ||
        !same(read(entry.started.job), completed.job) || completed.exitCode !== 0 ||
        !same(completed.nativeValidation, entry.nativeValidation) || !same(completed.timing, entry.timing)) gateFail('Duplicate/foreign production completion');
    originals.set(index, entry); completionPins.push(completed.completion);
  }
  const selectedBinding = createScopedBinding(api, binding, summaryPin, manifest, adapters);
  if (!resolve(output).startsWith(base + '/') || existsSync(output)) gateFail('New isolated audit output directory required');
  mkdirSync(output);
  const start = performance.now(), startCpu = process.cpuUsage(), scans = [], comparisons = [], rng = [], receipts = [];
  let scanSeconds = 0, replaySeconds = 0, advancedRngTrials = 0, selectedStrategyTrials = 0;
  for (const [index, cell] of c.cells.entries()) {
    assertUnchanged();
    const store = api.openCompletionRepresentativeEvidence(join(c.p.runRoot, 'regression/cells', String(index).padStart(3, '0')), binding);
    const receipt = originals.get(index), sourceRecord = receipt.diagnostic.rawCell;
    const saved = store.read(sourceRecord.path, sourceRecord), record = { ...sourceRecord, numericalHash: contentHash(saved) };
    let at = performance.now();
    const scan = scanStoredCell(api, c.inputs, binding, store, index, cell, record, receipt);
    assertExactEvidenceFiles(api, store, scan.evidenceFiles);
    const d = summary.cells[index];
    if (!same(d, receipt.diagnostic) || d.cellIndex !== index || d.requestedTrials !== 10000 || d.complete !== true ||
        d.first64Parity?.trialsEqual !== true || d.first64Parity?.proofsEqual !== true || d.first64Parity?.freshReplayPerformed !== false ||
        d.attempted !== scan.trialCount || d.completed !== (saved.row.completed ?? 0) || d.unresolved !== (saved.row.unresolvedCount ?? 0) ||
        d.provedBaseUnreachableTrials !== (saved.unreachable ? 10000 : 0) ||
        !same({ candidate: d.candidate, baseline: d.baseline, delta: d.delta }, scan.statistics ?? { candidate: null, baseline: null, delta: null }) ||
        !same(d.normalIntervals, saved.unreachable ? null : { candidate: saved.row.candidate_ev_bb?.ci95 ?? null,
          baseline: saved.row.baseline_ev_bb?.ci95 ?? null, delta: saved.row.delta_bb?.ci95 ?? null })) gateFail('Source report native row/EV/statistic accounting differs');
    scanSeconds += (performance.now() - at) / 1000;
    scans.push({ cellIndex: index, cell, record, row: saved.row, trialCount: scan.trialCount, proofBodyHashes: scan.proofBodyHashes });
    receipts.push(file(receipt.started.job.path.replace(/\.json$/, '.completed.json')));
    const row = manifest.rows.find(row => row.cellIndex === index); at = performance.now();
    if (row) {
      const fresh = api.openCompletionRepresentativeEvidence(join(output, 'selected', String(index).padStart(3, '0')), selectedBinding, { fresh: true });
      const compared = replayAndCompareCell(api, c.inputs, c.flop, c.later, binding, store, record, selectedBinding, fresh, row).compared;
      comparisons.push(compared); advancedRngTrials += compared.advancedRngTrials; selectedStrategyTrials += compared.selectedTrials;
      rng.push({ cellIndex: index, advancedRngTrials: compared.advancedRngTrials, strategyTrials: compared.selectedTrials, rngStreamSha256: compared.rngStreamSha256 });
    } else {
      const advanced = advanceUnselectedCell(api, c.inputs, binding, cell); advancedRngTrials += advanced.advancedRngTrials; rng.push({ cellIndex: index, ...advanced });
    }
    replaySeconds += (performance.now() - at) / 1000;
    write(join(output, `${String(index).padStart(3, '0')}.audit.json`), { sourceRecord: record, productionReceipt: receipts.at(-1),
      storedTrials: scan.trialCount, fullProofBodyHashes: scan.proofBodyHashes, replay: comparisons.at(-1)?.cellIndex === index ? comparisons.at(-1) : null, rng: rng.at(-1) });
    console.log(JSON.stringify({ scannedCells: index + 1, selectedStrategyTrials, advancedRngTrials }));
  }
  const completedTrials = scans.reduce((n, r) => n + (r.row.completed ?? 0), 0), unreachableTrials = scans.filter(r => r.row.status === 'unreachable-base-deal').length * 10000;
  const unresolvedTrials = scans.reduce((n, r) => n + (r.row.unresolvedCount ?? 0), 0);
  if (completedTrials !== summary.actualCompletedTrials || unreachableTrials !== summary.provedBaseUnreachableTrials || unresolvedTrials !== summary.unresolvedTrials ||
      completedTrials + unreachableTrials + unresolvedTrials !== 720000 || advancedRngTrials !== 720000 || selectedStrategyTrials !== manifest.selectedTrials ||
      !same(summary.negativeMeanCellIndices, summary.cells.filter(d => d.delta !== null && d.delta.mean < 0).map(d => d.cellIndex))) gateFail('Full aggregate or selected coverage differs');
  const controlsStart = performance.now(), cacheControls = runCurrentCacheControls(api, c.inputs, c.flop, c.later, binding), cacheControlSeconds = (performance.now() - controlsStart) / 1000;
  assertUnchanged();
  for (const savedPin of [manifestPin, summaryPin, receiptPin, ...completionPins]) if (!same(file(savedPin.path), savedPin)) gateFail('Pinned generation evidence changed during audit');
  const used = process.cpuUsage(startCpu), result = { kind: AUDIT_KIND, version: 1, status: 'scoped-replay-and-full-stored-integrity-passed-not-policy-acceptance',
    sourceCommit: c.p.commit, binding: selectedBinding, bindingHash: contentHash(selectedBinding), manifest: manifestPin, originalSummary: summaryPin, productionReceipt: receiptPin,
    counts: { storedCells: scans.length, storedTrials: scans.reduce((n, r) => n + r.trialCount, 0), completedTrials, unreachableTrials, unresolvedTrials,
      selectedCells: comparisons.length, selectedStrategyTrials, advancedRngTrials, extraCacheControlHandExecutions: cacheControls.handExecutions },
    fullStoredEvidenceHash: contentHash(scans), productionSemanticReceipts: receipts, numericalComparisons: comparisons, rngSchedules: rng, cacheControls,
    warnings: scans.filter(r => r.row.delta_bb?.ci95?.[1] < 0).map(r => `${r.cell.board}|${r.cell.opponent}|${r.cell.hero}: candidate below reference (${r.row.delta_bb.mean}bb)`),
    timing: { totalWallSeconds: (performance.now() - start) / 1000, fullStoredScanSeconds: scanSeconds, selectedReplayAndAllRngSeconds: replaySeconds,
      cacheControlSeconds, cpuUserSeconds: used.user / 1e6, cpuSystemSeconds: used.system / 1e6, processLifetimePeakRssKiB: process.resourceUsage().maxRSS },
    limitations: [...LIMITATIONS], freshFull720kReplayPerformed: false, policyAccepted: false, productionAuthorized: false };
  write(join(output, 'audit-result.json'), result); console.log(JSON.stringify({ result: file(join(output, 'audit-result.json')), counts: result.counts, timing: result.timing }));
}
