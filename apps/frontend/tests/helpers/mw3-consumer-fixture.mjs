// Synthetic test fixture only: never persisted, registered in the build approval
// list, published, or substituted for an authored strategy.
import { dataset } from '../../src/estimated/datasets.ts';
import { buildMw3BrowserInputs } from '../../scripts/postflop-ai/mw3-browser-inputs.mjs';
import { mw3RequiredPolicyNodes } from '../../scripts/postflop-ai/mw3-tree.mjs';
import { mw3AnySelector } from '../../scripts/postflop-ai/mw3-policy.mjs';
import { MW3_TIERS } from '../../scripts/postflop-ai/mw3-hand-features.mjs';
import { mw3TextSha } from '../../scripts/postflop-ai/mw3-delivery.mjs';
import { prepareMw3Transport } from '../../scripts/postflop-ai/mw3-transport.mjs';
import { createMw3DeliveryClient } from '../../src/estimated/mw3-browser.ts';
export const sourceNames = ['opening-ranges', 'preflop-ranges', 'multiway-responses'];
export const datasets = Object.fromEntries(sourceNames.map(name => [name, dataset(name)]));
const inputCache = new Map();
export function inputsFor(id) {
  if (!inputCache.has(id)) inputCache.set(id, buildMw3BrowserInputs(id, datasets));
  return inputCache.get(id);
}
export const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
export const safeAction = descriptor => descriptor.actions.includes('check') ? 'check' : 'call';
export async function deliveryFixture({ id = 'CO_open_BTN_call_BB_call', choose = safeAction, mutate = () => {} } = {}) {
  const inputs = await inputsFor(id), nodes = mw3RequiredPolicyNodes(), transports = new Map(), pins = [];
  for (const [stage, streets] of [['flop', ['flop']], ['later', ['turn', 'river']]]) {
    const policy = { version: 3, kind: 'ai_estimate_not_gto', spot_id: id, streets,
      rules: Object.entries(nodes).filter(([, descriptor]) => streets.includes(descriptor.street)).flatMap(([node, descriptor]) => MW3_TIERS.map(tier => {
        const pick = choose(descriptor, tier);
        return { node, tier, when: mw3AnySelector(), priority: 0,
          mix: Object.fromEntries(descriptor.actions.map(action => [action, action === pick ? 100 : 0])) };
      })) };
    mutate(policy, stage);
    const policyHash = await mw3TextSha(JSON.stringify(policy));
    const metadata = { schema_version: 3, spot: id, source_hash: inputs.fingerprint, implementation_hash: 'a'.repeat(64),
      policy_hash: policyHash, strategy_type: 'ai_estimate_not_gto', model: 'gpt-6-astra' };
    const transport = await prepareMw3Transport({ metadata, policy }, stage);
    transports.set(transport.deliveryHash, transport);
    pins.push({ spotId: id, stage, deliveryHash: transport.deliveryHash, sourceHash: inputs.fingerprint,
      implementationHash: metadata.implementation_hash, policyHash });
  }
  const readers = {
    registry: pins, readDataset: async name => datasets[name],
    readManifest: async hash => transports.get(hash).headerText,
    readPart: async (hash, part) => { const row = transports.get(hash).parts[part]; return { part: row.part, body: row.body }; },
  };
  return { id, inputs, nodes, transports, pins, readers, client: createMw3DeliveryClient(readers) };
}
export function repinHeader(fixture, stage, change) {
  return (async () => {
    const pin = fixture.pins.find(item => item.stage === stage), old = fixture.transports.get(pin.deliveryHash);
    const header = structuredClone(old.header); change(header);
    const headerText = JSON.stringify(header), deliveryHash = await mw3TextSha(headerText);
    fixture.transports.set(deliveryHash, { ...old, header, headerText, deliveryHash });
    return { ...fixture.readers, registry: fixture.pins.map(item => item === pin ? { ...item, deliveryHash } : item) };
  })();
}
