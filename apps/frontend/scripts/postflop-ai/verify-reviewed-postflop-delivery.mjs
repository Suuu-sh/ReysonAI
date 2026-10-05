// Fixed accepted-byte conversion only. No execute, authoring, audit or remote mode.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareDelivery } from './reviewed-postflop-delivery.mjs';
export function parseDeliveryArguments(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!['--index', '--review', '--out', '--check-bundle'].includes(arg) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Required: --index PATH --review PATH --out LOCAL [--check-bundle LOCAL]');
    const key = { '--index': 'indexPath', '--review': 'reviewPath', '--out': 'out', '--check-bundle': 'checkBundle' }[arg];
    if (Object.hasOwn(options, key)) throw new Error('Duplicate argument');
    options[key] = argv[++i];
  }
  if (!options.indexPath || !options.reviewPath || !options.out) throw new Error('Formal delivery requires index, independent review and ignored output');
  return options;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = prepareDelivery(parseDeliveryArguments(process.argv.slice(2)));
  console.log(JSON.stringify({ status: result.status, out: result.out, sql: result.sql, accepted_spots: result.accepted_spots, serial_worker_telemetry: result.serial_worker_telemetry }));
}
