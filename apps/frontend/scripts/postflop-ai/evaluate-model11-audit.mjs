// Explicit one-process offline driver. No argument or default invocation starts a loop.
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadInputs } from './inputs.mjs';
import { captureModel11GateSource, model11GateFile } from './model11-gate-source.mjs';
import { resolveModel11GatePlan, same, gateFail } from './model11-gate-contract.mjs';
import { model11GateBinding, produceModel11Representative, auditModel11Representative, runModel11AllBoards } from './model11-gate-drivers.mjs';
import { contentHash } from './effective-law-identity.mjs';
import { writeImmutableAllBoardOutput } from './all-board-checkpoints.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
export function parseModel11GateArguments(args) {
  const options = {}, allowed = ['--operation', '--spot', '--flop', '--later', '--plan', '--output', '--report', '--checkpoints'];
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--execute-full') { if (options.executeFull) gateFail('Duplicate full-execution flag'); options.executeFull = true; continue; }
    if (!allowed.includes(key) || !args[i + 1] || args[i + 1].startsWith('--') || key in options) gateFail('Explicit --operation report|audit|all-boards --spot ID --flop FILE --later FILE --plan FILE --output NEW_FILE required; audit also --report FILE; all-boards also --checkpoints DIR; full plans also --execute-full');
    options[key] = args[++i];
  }
  for (const key of allowed.slice(0, 6)) if (!(key in options)) gateFail(`Missing ${key}`);
  if (!['report', 'audit', 'all-boards'].includes(options['--operation']) ||
      (options['--operation'] === 'audit') !== ('--report' in options) ||
      (options['--operation'] === 'all-boards') !== ('--checkpoints' in options)) gateFail('Operation/report/checkpoint arguments disagree');
  return options;
}

export function validateModel11GateReceipt(receipt, { operation, binding, reportRecord = null }) {
  if (!receipt || receipt.kind !== 'model11-gate-execution-receipt' || receipt.version !== 1 || receipt.operation !== operation ||
      !same(receipt.sourceStart, binding.source) || !same(receipt.sourceEnd, binding.source) || !same(receipt.filesStart, binding.files) || !same(receipt.filesEnd, binding.files) ||
      !same(receipt.result?.binding, binding) || receipt.resultHash !== contentHash(receipt.result) ||
      !Number.isFinite(Date.parse(receipt.startedAt)) || !Number.isFinite(Date.parse(receipt.completedAt)) || Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt) ||
      !Array.isArray(receipt.command) || !receipt.command.includes(binding.spot) || !receipt.command.includes(operation) ||
      typeof receipt.execution?.node !== 'string' || typeof receipt.execution?.platform !== 'string' || typeof receipt.execution?.arch !== 'string' ||
      typeof receipt.log?.text !== 'string' || !receipt.log.text || receipt.log.sha256 !== digest(receipt.log.text) || ![0, 1].includes(receipt.exitCode) ||
      !same(receipt.reportInput, reportRecord)) gateFail('Missing, stale or inconsistent actual model11 gate execution receipt');
  const blocked = receipt.result.status === 'blocked-off-model-coverage' || receipt.result.status === 'completed-with-quality-errors';
  if (receipt.exitCode !== (blocked ? 1 : 0)) gateFail('Receipt exit code disagrees with gate result');
  return receipt.result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseModel11GateArguments(process.argv.slice(2));
  // Reject existing output before any numerical work. The final writer also rejects
  // symlink ancestors, partial writes, overwrite races and nonidentical old bytes.
  try { lstatSync(options['--output']); gateFail('Output already exists; use a new path'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const sourceStart = captureModel11GateSource(), startedAt = new Date().toISOString(), started = performance.now();
  const captureFiles = () => Object.fromEntries(['flop', 'later', 'plan'].map(key => [key, model11GateFile(options[`--${key}`])]));
  const filesStart = captureFiles(), json = path => JSON.parse(readFileSync(path, 'utf8'));
  const inputs = loadInputs(options['--spot']), flop = json(options['--flop']), later = json(options['--later']);
  const plan = resolveModel11GatePlan(inputs, json(options['--plan']), { executeFull: options.executeFull === true });
  if ((options['--operation'] === 'all-boards') !== (plan.kind === 'all-boards')) gateFail('Operation does not match the explicit plan');
  const binding = model11GateBinding(inputs, flop, later, plan, sourceStart, filesStart);
  const assertUnchanged = () => {
    if (!same(captureModel11GateSource(), sourceStart) || !same(captureFiles(), filesStart) || loadInputs(inputs.spot.id).fingerprint !== inputs.fingerprint) gateFail('Source, raw input, artifact or plan bytes changed during execution');
  };
  assertUnchanged();
  let result, reportInput = null;
  if (options['--operation'] === 'report') result = produceModel11Representative(inputs, flop, later, binding);
  else if (options['--operation'] === 'audit') {
    reportInput = model11GateFile(options['--report']);
    const saved = validateModel11GateReceipt(json(options['--report']), { operation: 'report', binding });
    result = auditModel11Representative(inputs, flop, later, binding, saved);
    if (!same(model11GateFile(options['--report']), reportInput)) gateFail('Saved report bytes changed during replay');
  } else result = runModel11AllBoards(inputs, flop, later, binding, options['--checkpoints'], { assertUnchanged,
    onBoard: (row, count) => console.log(JSON.stringify({ board: row.board, checkpointed: count, requested: plan.boardList.length, complete: row.complete })) });
  assertUnchanged();
  const exitCode = ['blocked-off-model-coverage', 'completed-with-quality-errors'].includes(result.status) ? 1 : 0;
  const log = JSON.stringify({ spot: inputs.spot.id, operation: options['--operation'], scope: plan.scope, status: result.status,
    bindingHash: contentHash(binding), fullScopePassed: result.fullScopePassed ?? false, counts: result.counts }) + '\n';
  const receipt = { kind: 'model11-gate-execution-receipt', version: 1, operation: options['--operation'],
    startedAt, completedAt: new Date().toISOString(), command: process.argv, exitCode,
    execution: { node: process.version, platform: process.platform, arch: process.arch },
    sourceStart, sourceEnd: captureModel11GateSource(), filesStart, filesEnd: captureFiles(), reportInput,
    result, resultHash: contentHash(result), log: { text: log, sha256: digest(log) },
    diagnostics: { elapsedMs: performance.now() - started, memoryAtReturn: process.memoryUsage(), processLifetimeMaxRssKiB: process.resourceUsage().maxRSS,
      memoryScope: 'process-lifetime high-water; heap limit is not an RSS cap' } };
  validateModel11GateReceipt(receipt, { operation: options['--operation'], binding, reportRecord: reportInput });
  writeImmutableAllBoardOutput(options['--output'], JSON.stringify(receipt, null, 2) + '\n');
  process.stdout.write(log); process.exitCode = exitCode;
}
