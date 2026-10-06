// One-shot timing diagnostic only. Does not create or alter a gate/acceptance contract.
import { readFileSync, mkdirSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const startedAt = new Date().toISOString(), callerStarted = performance.now();
const base = dirname(fileURLToPath(import.meta.url)), output = join(base, 'run-once-v1');
const hashFile = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const self = fileURLToPath(import.meta.url);
if (process.argv.length !== 3 || !/^[a-f0-9]{64}$/.test(process.argv[2]) || hashFile(self) !== process.argv[2]) throw new Error('Exact independently reviewed caller SHA required');
const contextPath = join(base, '../hu-final-recovery/co-sb-coldcall-optimized-five-workers/context.mjs');
if (hashFile(contextPath) !== 'b754f94fb41959d7eaa778599356ed66f44c2e0939c840de3fa2a69c26ab5e03') throw new Error('Existing context bytes changed');
const { loadContext, requirePrepared, write, file } = await import('../hu-final-recovery/co-sb-coldcall-optimized-five-workers/context.mjs');
const { checkModel11Balance } = await import('../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/gate-model11.mjs');
const { contentHash } = await import('../hu-model11-prefix-key-execution/apps/frontend/scripts/postflop-ai/effective-law-identity.mjs');
const c = loadContext('74ba21f156f08e24a158f028a2c4f1c4505e59232bbe3598f817a62ab23cd7e0');
requirePrepared(c);
if (c.p.commit !== '4b6b39a613afe72a2362f85aa93a305cd61b3586' || c.boardIds.length !== 1755) throw new Error('Wrong frozen source or board catalog');
const acceptancePath = join(base, '../hu-final-recovery/co-sb-coldcall-producer-verified-finalization/scoped-acceptance.json');
if (hashFile(acceptancePath) !== 'd8d23469051ab75ef5278bff87a2ecf8986b014ebd00973b4602ed1fec25a774') throw new Error('Accepted case receipt bytes changed');
const acceptance = JSON.parse(readFileSync(acceptancePath, 'utf8'));
if (acceptance.status !== 'ACCEPTED_UNDER_REVISED_SCOPED_NUMERICAL_CONTRACT' || acceptance.spot !== c.p.spot ||
    acceptance.source.commit !== c.p.commit || acceptance.source.closedIdentityHash !== c.source.identityHash ||
    acceptance.source.inputFingerprint !== c.inputs.fingerprint ||
    acceptance.policies.flop.file.sha256 !== c.p.pair.flop.sha256 || acceptance.policies.later.file.sha256 !== c.p.pair.later.sha256) throw new Error('Accepted case/source/pair differs');
c.assertUnchanged();
mkdirSync(output); // Existing run is preserved; this diagnostic never resumes or reruns it.
mkdirSync(join(output, 'boards'));
write(join(output, 'started.json'), {
  kind: 'model11-flop-only-timing-not-acceptance', version: 1, startedAt, spot: c.p.spot,
  caller: file(self), context: file(contextPath), acceptedCase: file(acceptancePath),
  existingPlanPin: c.planPin, source: c.source, inputsFingerprint: c.inputs.fingerprint, policies: c.p.pair,
  requestedBoards: 1755, boardList: c.binding.plan.boardList, street: 'flop', authored: true,
  workers: 1, acceptance: false, coverageContractChanged: false, fullReplay: false,
  outerLimits: { heapMiB: 512, ownedRssMiB: 900, hostAvailableFloorMiB: 2048, seconds: 120 },
  preparationElapsedMs: performance.now() - callerStarted,
});
let completedBoards = 0, kernelCallWallMs = 0;
const loopStarted = performance.now();
for (const [index, board] of c.binding.plan.boardList.entries()) {
  c.assertUnchanged();
  const before = performance.now();
  const result = checkModel11Balance(c.inputs, c.flop, c.later, { boardList: [board], street: 'flop', authored: true });
  const coreWallMs = performance.now() - before;
  c.assertUnchanged();
  if (result.selectedBoards !== 1 || result.results.length !== 1 || result.results[0].street !== 'flop') throw new Error('Diagnostic street/board scope differs');
  const name = String(index).padStart(4, '0') + '-' + board.id + '.json';
  write(join(output, 'boards', name), { kind: 'model11-flop-only-timing-board-not-acceptance', index, board,
    coreWallMs, resultHash: contentHash(result), result });
  if (result.complete) completedBoards++;
  kernelCallWallMs += coreWallMs;
  writeSync(1, JSON.stringify({ index, board: board.id, processedBoards: index + 1, completedBoards,
    complete: result.complete, coreWallMs, kernelCallWallMs, loopElapsedMs: performance.now() - loopStarted }) + '\n');
  if (!result.complete) throw new Error('Incomplete model11 flop result retained; diagnostic stopped');
}
c.assertUnchanged();
write(join(output, 'complete.json'), { kind: 'model11-flop-only-timing-not-acceptance',
  status: 'diagnostic-complete-not-acceptance', requestedBoards: 1755, completedBoards,
  kernelCallWallMs, loopElapsedMs: performance.now() - loopStarted,
  callerElapsedMs: performance.now() - callerStarted, sourceUnchanged: true,
  full1755AllStreetAcceptance: false, coverageContractChanged: false, fullReplay: false });
