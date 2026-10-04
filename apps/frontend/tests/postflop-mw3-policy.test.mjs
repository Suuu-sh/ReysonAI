import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMw3Catalog } from '../scripts/postflop-ai/mw3-inputs.mjs';
import { mw3Decision, replayMw3 } from '../scripts/postflop-ai/mw3-engine.mjs';
import { describeMw3Node, probeMw3Hand } from '../scripts/postflop-ai/mw3-tree.mjs';
import { mw3AnySelector, mw3PolicyMix, selectMw3Rule, validateMw3Policy } from '../scripts/postflop-ai/mw3-policy.mjs';
import { parseCards, TIERS } from '../scripts/postflop-ai/model.mjs';
const spot = loadMw3Catalog()[0], probe = probeMw3Hand(spot), board = parseCards('As7d2c', 3), hole = parseCards('KhQd', 2);
// Test fixture only: never saved, registered, published or used as a runtime reference.
function fixture() {
  return { version: 1, kind: 'ai_estimate_not_gto', spot_id: spot.id, streets: ['flop'],
    rules: Object.keys(probe.nodes).filter(node => node.startsWith('mw3_flop_')).flatMap(node => TIERS.map(tier => {
      const actions = describeMw3Node(node).actions;
      return { node, tier, when: mw3AnySelector(), priority: 0, mix: Object.fromEntries(actions.map((action, i) => [action, i ? 0 : 100])) };
    })) };
}
const options = { spotId: spot.id, nodes: probe.nodes };
test('every witnessed flop node/tier requires an exact own-policy fallback', () => {
  const good = fixture(); assert.equal(validateMw3Policy(good, options), good);
  const missing = fixture(); missing.rules.pop(); assert.throws(() => validateMw3Policy(missing, options), /Missing/);
  const illegal = fixture(); illegal.rules[0].mix.call = 0; assert.throws(() => validateMw3Policy(illegal, options), /action mix/);
  const bad = fixture(); bad.rules[0].mix.check = Number.NaN; assert.throws(() => validateMw3Policy(bad, options), /action mix/);
  const wrongSpot = fixture(); wrongSpot.spot_id = 'BTN_open_BB_call'; assert.throws(() => validateMw3Policy(wrongSpot, options), /envelope/);
});
test('equal-priority overlapping shape/height overrides and impossible context selectors fail', () => {
  const policy = fixture(), base = policy.rules[0];
  policy.rules.push({ ...structuredClone(base), priority: 10, when: { ...mw3AnySelector(), texture: 'dry' } });
  policy.rules.push({ ...structuredClone(base), priority: 10, when: { ...mw3AnySelector(), texture: 'high' } });
  assert.throws(() => validateMw3Policy(policy, options), /Ambiguous/);
  const impossible = fixture(); impossible.rules.push({ ...structuredClone(impossible.rules[0]), priority: 10,
    when: { ...mw3AnySelector(), response: 'cold' } });
  assert.throws(() => validateMw3Policy(impossible, options), /Unreachable/);
});
test('saved frequencies including facing fold/call are returned unchanged and no HU fallback exists', () => {
  const policy = fixture(), table = replayMw3(spot, { flop: ['bet33'] }), decision = mw3Decision(table);
  const base = policy.rules.find(rule => rule.node === decision.node && rule.tier === 'air');
  base.mix = { fold: 87, call: 11, raise: 2 }; validateMw3Policy(policy, options);
  assert.deepEqual(mw3PolicyMix(policy, decision, hole, board), base.mix);
  assert.throws(() => mw3PolicyMix(null, decision, hole, board), /Missing/);
  assert.throws(() => selectMw3Rule(policy, { ...decision, node: 'btn_first' }, 'air', board), /Uncovered/);
});
test('higher-priority exact contexts override only their own stored mix', () => {
  const policy = fixture(), table = replayMw3(spot, { flop: ['bet33'] }), decision = mw3Decision(table);
  const base = policy.rules.find(rule => rule.node === decision.node && rule.tier === 'air');
  const extra = { ...structuredClone(base), priority: 20, when: { ...mw3AnySelector(), players: 3, position: decision.activePosition,
    response: decision.responseType, price: decision.priceBand, spr: decision.sprBand }, mix: { fold: 81, call: 14, raise: 5 } };
  policy.rules.push(extra); validateMw3Policy(policy, options);
  assert.deepEqual(mw3PolicyMix(policy, decision, hole, board), extra.mix);
  assert.equal(selectMw3Rule(policy, { ...decision, players: 2 }, 'air', board).priority, 0);
});

test('artifact checks pin source, complete policy, implementation semantics and Astra provenance', async () => {
  const { loadMw3Inputs } = await import('../scripts/postflop-ai/mw3-inputs.mjs');
  const { makeMw3Artifact, verifyMw3Artifact, readMw3Artifact } = await import('../scripts/postflop-ai/mw3-artifacts.mjs');
  const inputs = loadMw3Inputs(spot.id);
  const artifact = makeMw3Artifact(inputs, fixture(), { authorTask: 'test-fixture-never-published', generatedAt: '2026-10-04T00:00:00Z' });
  assert.equal(verifyMw3Artifact(inputs, artifact), artifact);
  for (const key of ['source_hash', 'policy_hash', 'implementation_hash', 'model']) {
    const stale = structuredClone(artifact); stale.metadata[key] = 'wrong';
    assert.throws(() => verifyMw3Artifact(inputs, stale), /stale/);
  }
  assert.throws(() => verifyMw3Artifact(inputs, artifact, { kind: 'laterCandidate' }), /street scope/);
  assert.throws(() => readMw3Artifact({ ...inputs, spot: { ...inputs.spot, slug: 'test-deliberately-unrecorded-mw3' } }, 'candidate'), /no policy fallback/);
});
