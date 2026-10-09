// Pure argument validation; unit tests never invoke candidate generation.
const PILOT = 'CO_open_BTN_call_BB_call';
export const MW3_GATE_FLAGS = Object.freeze(['--all-flops', '--later', '--joint', '--simulate', '--replay']);
export function parseMw3AuthorArgs(args, { gate = false } = {}) {
  const values = {}, actions = [];
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (gate && MW3_GATE_FLAGS.includes(key)) {
      if (actions.includes(key)) throw new Error('Repeated Mw3 gate phase');
      actions.push(key); continue;
    }
    if (!['--spot', '--model', '--source-hash'].includes(key) || Object.hasOwn(values, key)) throw new Error('Unknown or repeated Mw3 argument');
    const value = args[++index];
    if (typeof value !== 'string' || value.startsWith('--')) throw new Error('Missing explicit Mw3 argument value');
    values[key] = value;
  }
  if (Object.keys(values).length !== 3 || !/^[A-Za-z0-9_]{1,100}$/.test(values['--spot']) || values['--spot'] === PILOT ||
      values['--model'] !== 'gpt-6-astra' || !/^[a-f0-9]{64}$/.test(values['--source-hash']) || gate && !actions.length) {
    throw new Error('Specify an authored non-pilot --spot, --model gpt-6-astra and --source-hash; gate phases must be explicit. The accepted pilot retains its original CLI.');
  }
  return { spotId: values['--spot'], model: values['--model'], sourceHash: values['--source-hash'], actions };
}
