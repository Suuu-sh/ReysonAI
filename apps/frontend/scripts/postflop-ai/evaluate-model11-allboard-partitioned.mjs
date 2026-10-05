// Explicit all-board gate entry; only final encoding differs from the frozen original.
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadInputs } from './inputs.mjs';
import { AUDIT_REPOSITORY, auditFileRecord, captureSourceGraph } from './audit-identity.mjs';
import { captureModel11GateSource, model11GateFile } from './model11-gate-source.mjs';
import { resolveModel11GatePlan, same, gateFail } from './model11-gate-contract.mjs';
import { model11GateBinding, runModel11AllBoards } from './model11-gate-drivers.mjs';
import { parseModel11GateArguments, validateModel11GateReceipt } from './evaluate-model11-audit.mjs';
import { partitionModel11AllBoardReceipt, materializeModel11AllBoardReceipt } from './model11-allboard-partitioned-output.mjs';
import { contentHash } from './effective-law-identity.mjs';
import { writeImmutableAllBoardOutput } from './all-board-checkpoints.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
export const MODEL11_ALLBOARD_OUTPUT_ROOTS = ['apps/frontend/scripts/postflop-ai/evaluate-model11-allboard-partitioned.mjs'];
const manifestPath = 'apps/frontend/tests/fixtures/model11-allboard-partitioned-source-graph.json';
export function captureModel11AllBoardOutputSource({ root = AUDIT_REPOSITORY } = {}) {
  const strict = captureModel11GateSource({ root }), sources = captureSourceGraph({ root, roots: MODEL11_ALLBOARD_OUTPUT_ROOTS });
  const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'));
  if (!same(manifest, { kind: 'model11-allboard-partitioned-closed-output-inventory', version: 1, roots: MODEL11_ALLBOARD_OUTPUT_ROOTS, sources })) gateFail('All-board output source differs from reviewed closed inventory');
  const body = { kind: 'model11-allboard-lossless-output-source-identity', version: 1, strict,
    output: { roots: MODEL11_ALLBOARD_OUTPUT_ROOTS, inventory: auditFileRecord(root, manifestPath), sources } };
  return { ...body, identityHash: contentHash(body) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseModel11GateArguments(process.argv.slice(2));
  if (options['--operation'] !== 'all-boards') gateFail('This entry point only encodes the original explicit all-board operation');
  try { lstatSync(options['--output']); gateFail('Output already exists; use a new receipt path'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const outputSourceStart = captureModel11AllBoardOutputSource(), sourceStart = outputSourceStart.strict, startedAt = new Date().toISOString(), started = performance.now();
  const captureFiles = () => Object.fromEntries(['flop', 'later', 'plan'].map(key => [key, model11GateFile(options[`--${key}`])]));
  const filesStart = captureFiles(), json = path => JSON.parse(readFileSync(path, 'utf8'));
  const inputs = loadInputs(options['--spot']), flop = json(options['--flop']), later = json(options['--later']);
  const plan = resolveModel11GatePlan(inputs, json(options['--plan']), { executeFull: options.executeFull === true });
  if (plan.kind !== 'all-boards') gateFail('Original all-board plan required');
  const binding = model11GateBinding(inputs, flop, later, plan, sourceStart, filesStart);
  const assertUnchanged = () => {
    if (!same(captureModel11AllBoardOutputSource(), outputSourceStart) || !same(captureFiles(), filesStart) || loadInputs(inputs.spot.id).fingerprint !== inputs.fingerprint) gateFail('All-board numerical/output source, raw inputs, artifacts or plan changed');
  };
  assertUnchanged();
  const result = runModel11AllBoards(inputs, flop, later, binding, options['--checkpoints'], { assertUnchanged,
    onBoard: (row, count) => console.log(JSON.stringify({ board: row.board, checkpointed: count, requested: plan.boardList.length, complete: row.complete })) });
  assertUnchanged();
  const exitCode = ['blocked-off-model-coverage', 'completed-with-quality-errors'].includes(result.status) ? 1 : 0;
  const log = JSON.stringify({ spot: inputs.spot.id, operation: 'all-boards', scope: plan.scope, status: result.status,
    bindingHash: contentHash(binding), fullScopePassed: result.fullScopePassed, counts: result.counts, encoding: 'existing-immutable-checkpoint-partitions' }) + '\n';
  const receipt = { kind: 'model11-gate-execution-receipt', version: 1, operation: 'all-boards', startedAt, completedAt: new Date().toISOString(), command: process.argv, exitCode,
    execution: { node: process.version, platform: process.platform, arch: process.arch }, sourceStart, sourceEnd: captureModel11GateSource(), filesStart, filesEnd: captureFiles(), reportInput: null,
    result, resultHash: contentHash(result), log: { text: log, sha256: digest(log) }, diagnostics: { elapsedMs: performance.now() - started,
      memoryAtReturn: process.memoryUsage(), processLifetimeMaxRssKiB: process.resourceUsage().maxRSS, memoryScope: 'process-lifetime high-water; heap limit is not an RSS cap' } };
  validateModel11GateReceipt(receipt, { operation: 'all-boards', binding });
  const partitioned = partitionModel11AllBoardReceipt(receipt, options['--checkpoints'], { outputSourceStart, outputSourceEnd: captureModel11AllBoardOutputSource() });
  if (!same(materializeModel11AllBoardReceipt(partitioned, options['--checkpoints'], { binding, outputSource: outputSourceStart }), receipt)) gateFail('All-board encoding changed original receipt fields');
  assertUnchanged();
  writeImmutableAllBoardOutput(options['--output'], JSON.stringify(partitioned, null, 2) + '\n');
  process.stdout.write(log); process.exitCode = exitCode;
}
