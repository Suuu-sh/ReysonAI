// Explicit fixed pilot operations; importing this file starts no work or process.
import { pathToFileURL } from 'node:url';
import { gateFail } from './model11-gate-contract.mjs';
import { PILOT1755_SPOT, loadPilot1755Context, preparePilot1755, runPilot1755Lane, finalizePilot1755 } from './model11-allboard-lanes.mjs';
export function parsePilot1755Arguments(args) {
  const options = {}, values = ['--operation', '--lane', '--spec', '--spec-sha256', '--spot', '--supervision', '--supervision-sha256', '--gate-operation'];
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key in options) gateFail('Duplicate pilot argument');
    if (['--execute-full', '--require-existing'].includes(key)) { options[key] = true; continue; }
    if (!values.includes(key) || !args[index + 1] || args[index + 1].startsWith('--')) gateFail('Unknown/missing explicit pilot argument');
    options[key] = args[++index];
  }
  const operation = options['--operation'];
  if (!['prepare', 'lane', 'merge-validate-encode'].includes(operation) || !options['--spec'] || !options['--spec-sha256'] || options['--spot'] !== PILOT1755_SPOT) gateFail('Explicit reviewed pilot operation/spec/spot required');
  if ((operation === 'lane') !== ('--lane' in options) || operation === 'lane' && !/^[0-3]$/.test(options['--lane'])) gateFail('Lane must be one fixed index0..3');
  if (operation === 'merge-validate-encode') {
    if (options['--require-existing'] !== true || options['--gate-operation'] !== 'all-boards' || !options['--supervision'] || !options['--supervision-sha256'] || options['--execute-full']) gateFail('Finalization requires terminal producer receipt and existing-only all-boards operation');
  } else if (options['--execute-full'] !== true || ['--require-existing', '--gate-operation', '--supervision', '--supervision-sha256'].some(key => key in options)) gateFail('Prepare/lane require the separate explicit full-execution grant');
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = parsePilot1755Arguments(process.argv.slice(2));
  const context = loadPilot1755Context(options['--spec'], options['--spec-sha256']);
  if (options['--operation'] === 'prepare') console.log(JSON.stringify(preparePilot1755(context)));
  else if (options['--operation'] === 'lane') console.log(JSON.stringify(runPilot1755Lane(context, Number(options['--lane']))));
  else {
    const result = finalizePilot1755(context, options['--supervision'], options['--supervision-sha256']);
    process.stdout.write(result.log); console.log(JSON.stringify({ output: result.path, exitCode: result.exitCode })); process.exitCode = result.exitCode;
  }
}
