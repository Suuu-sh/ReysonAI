// Explicit offline opt-in report/audit, with no default or implicit full execution.
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadInputs } from './inputs.mjs';
import { model11GateFile } from './model11-gate-source.mjs';
import { resolveModel11GatePlan, exactKeys, same, gateFail } from './model11-gate-contract.mjs';
import { contentHash } from './effective-law-identity.mjs';
import { writeImmutableAllBoardOutput } from './all-board-checkpoints.mjs';
import { captureCompletionRepresentativeSource } from './model11-completion-representative-source.mjs';
import { model11CompletionRepresentativeBinding } from './model11-completion-representative-contract.mjs';
import { produceModel11CompletionRepresentative, auditModel11CompletionRepresentative } from './model11-completion-representative.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
export function parseCompletionRepresentativeArguments(args) {
  const options = {}, required = ['--operation', '--spot', '--flop', '--later', '--plan', '--output', '--evidence'], optional = ['--report', '--report-evidence'];
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--execute-full') { if (options.executeFull) gateFail('Duplicate full-execution flag'); options.executeFull = true; continue; }
    if (![...required, ...optional].includes(key) || !args[i + 1] || args[i + 1].startsWith('--') || key in options) gateFail('Explicit completion representative --operation report|audit --spot --flop --later --plan --output --evidence required; audit adds --report --report-evidence; full adds --execute-full');
    options[key] = args[++i];
  }
  if (required.some(key => !(key in options)) || !['report', 'audit'].includes(options['--operation']) ||
      optional.some(key => (key in options) !== (options['--operation'] === 'audit'))) gateFail('Missing or inconsistent explicit completion report/audit arguments');
  return options;
}
export function validateCompletionRepresentativeReceipt(receipt, { operation, binding, reportRecord = null }) {
  if (!exactKeys(receipt, ['kind', 'version', 'operation', 'startedAt', 'completedAt', 'command', 'exitCode', 'execution', 'sourceStart', 'sourceEnd', 'filesStart', 'filesEnd', 'reportInput', 'result', 'resultHash', 'log', 'diagnostics']) ||
      receipt.kind !== 'model11-completion-representative-execution-receipt' || receipt.version !== 1 || receipt.operation !== operation ||
      !same(receipt.sourceStart, binding.source) || !same(receipt.sourceEnd, binding.source) || !same(receipt.filesStart, binding.files) || !same(receipt.filesEnd, binding.files) ||
      !same(receipt.result?.binding, binding) || receipt.resultHash !== contentHash(receipt.result) || !same(receipt.reportInput, reportRecord) ||
      !Number.isFinite(Date.parse(receipt.startedAt)) || !Number.isFinite(Date.parse(receipt.completedAt)) || Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt) ||
      !Array.isArray(receipt.command) || !receipt.command.includes(binding.spot) || !receipt.command.includes(operation) ||
      typeof receipt.execution?.node !== 'string' || typeof receipt.execution?.platform !== 'string' || typeof receipt.execution?.arch !== 'string' ||
      typeof receipt.log?.text !== 'string' || !receipt.log.text || receipt.log.sha256 !== digest(receipt.log.text)) gateFail('Missing/stale completion execution receipt');
  const blocked = ['blocked-off-model-coverage', 'completed-with-quality-errors'].includes(receipt.result.status);
  if (receipt.exitCode !== (blocked ? 1 : 0)) gateFail('Completion receipt exit code differs');
  return receipt.result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parseCompletionRepresentativeArguments(process.argv.slice(2));
  try { lstatSync(options['--output']); gateFail('Output already exists; choose a new receipt file'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const json = path => JSON.parse(readFileSync(path, 'utf8')), sourceStart = captureCompletionRepresentativeSource(), startedAt = new Date().toISOString(), started = performance.now();
  const captureFiles = () => Object.fromEntries(['flop', 'later', 'plan'].map(key => [key, model11GateFile(options[`--${key}`])]));
  const filesStart = captureFiles(), inputs = loadInputs(options['--spot']), flop = json(options['--flop']), later = json(options['--later']);
  const plan = resolveModel11GatePlan(inputs, json(options['--plan']), { executeFull: options.executeFull === true });
  const binding = model11CompletionRepresentativeBinding(inputs, flop, later, plan, sourceStart, filesStart);
  const assertUnchanged = () => {
    if (!same(captureCompletionRepresentativeSource(), sourceStart) || !same(captureFiles(), filesStart) || loadInputs(inputs.spot.id).fingerprint !== inputs.fingerprint) gateFail('Source/raw input/artifact/plan changed during completion gate');
  };
  assertUnchanged(); let result, reportInput = null;
  const runtimeOptions = { assertUnchanged, onCell: (row, count, requested) => console.log(JSON.stringify({ cell: count, requested, board: row.board, opponent: row.opponent, hero: row.hero, status: row.status })) };
  if (options['--operation'] === 'report') result = produceModel11CompletionRepresentative(inputs, flop, later, binding, options['--evidence'], runtimeOptions);
  else {
    reportInput = model11GateFile(options['--report']);
    if (reportInput.bytes > 16 * 1024 * 1024) gateFail('Saved completion receipt exceeds the immutable writer16MiB bound');
    const saved = validateCompletionRepresentativeReceipt(json(options['--report']), { operation: 'report', binding });
    result = auditModel11CompletionRepresentative(inputs, flop, later, binding, saved, options['--report-evidence'], options['--evidence'], runtimeOptions);
    if (!same(model11GateFile(options['--report']), reportInput)) gateFail('Saved report changed during fresh replay');
  }
  assertUnchanged();
  const exitCode = ['blocked-off-model-coverage', 'completed-with-quality-errors'].includes(result.status) ? 1 : 0;
  const log = JSON.stringify({ spot: inputs.spot.id, operation: options['--operation'], scope: plan.scope, kind: result.kind, status: result.status,
    bindingHash: contentHash(binding), fullScopePassed: result.fullScopePassed ?? false, counts: result.counts }) + '\n';
  const receipt = { kind: 'model11-completion-representative-execution-receipt', version: 1, operation: options['--operation'], startedAt, completedAt: new Date().toISOString(),
    command: process.argv, exitCode, execution: { node: process.version, platform: process.platform, arch: process.arch },
    sourceStart, sourceEnd: captureCompletionRepresentativeSource(), filesStart, filesEnd: captureFiles(), reportInput,
    result, resultHash: contentHash(result), log: { text: log, sha256: digest(log) },
    diagnostics: { elapsedMs: performance.now() - started, memoryAtReturn: process.memoryUsage(), processLifetimeMaxRssKiB: process.resourceUsage().maxRSS,
      memoryScope: 'process-lifetime high-water; heap limit is not an RSS cap' } };
  validateCompletionRepresentativeReceipt(receipt, { operation: options['--operation'], binding, reportRecord: reportInput });
  writeImmutableAllBoardOutput(options['--output'], JSON.stringify(receipt, null, 2) + '\n');
  process.stdout.write(log); process.exitCode = exitCode;
}
