import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadMw3Inputs } from '../scripts/postflop-ai/mw3-inputs.mjs';
import { buildMw3BrowserInputs, verifyMw3BrowserCandidate } from '../scripts/postflop-ai/mw3-browser-inputs.mjs';
const read = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
const datasets = Object.fromEntries(['opening-ranges', 'preflop-ranges', 'multiway-responses'].map(name => [name, read(name)]));
test('browser and Node input material/fingerprint are exactly identical without HU substitutions', async () => {
  const id = 'CO_open_BTN_call_BB_call';
  assert.deepEqual(await buildMw3BrowserInputs(id, datasets), loadMw3Inputs(id));
  await assert.rejects(() => buildMw3BrowserInputs(id, { ...datasets, 'multiway-responses': datasets['preflop-ranges'] }));
  await assert.rejects(() => buildMw3BrowserInputs('CO_open_SB_call_BB_call', datasets), /Unreachable/);
});
test('browser rejects absent and stale source/implementation identities before decoding any policy', async () => {
  const inputs = await buildMw3BrowserInputs('CO_open_BTN_call_BB_call', datasets);
  await assert.rejects(() => verifyMw3BrowserCandidate(inputs, {}, { stage: 'flop', expectedImplementationHash: 'a'.repeat(64), expectedPolicyHash: 'b'.repeat(64) }), /stale/);
});
