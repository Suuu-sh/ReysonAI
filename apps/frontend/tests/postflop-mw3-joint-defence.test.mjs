import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMw3Inputs } from '../scripts/postflop-ai/mw3-inputs.mjs';
import { probeMw3Hand, describeMw3Node } from '../scripts/postflop-ai/mw3-tree.mjs';
import { mw3AnySelector, validateMw3Policy } from '../scripts/postflop-ai/mw3-policy.mjs';
import { makeMw3TupleSampler, diagnoseMw3JointFold, MW3_JOINT_SAMPLES } from '../scripts/postflop-ai/mw3-joint-defence.mjs';
import { parseCards } from '../scripts/postflop-ai/model.ts';
import { MW3_TIERS as TIERS } from '../scripts/postflop-ai/mw3-hand-features.mjs';
import { seededRandom } from '../scripts/lib/equity.ts';
const hand = text => parseCards(text, 2);
test('joint sampler rejects the full tuple rather than resampling only the later conflicting hand', () => {
  const ranges = { A: [{ combo: hand('AsAh'), weight: 1 }, { combo: hand('KsKh'), weight: 1 }],
    B: [{ combo: hand('AsAd'), weight: 1 }, { combo: hand('QsQh'), weight: 1 }], C: [{ combo: hand('JsJh'), weight: 1 }] };
  const sample = makeMw3TupleSampler(ranges, ['A', 'B', 'C']), random = seededRandom(917), counts = new Map();
  for (let i = 0; i < 20000; i++) {
    const tuple = sample(random); assert.equal(new Set(Object.values(tuple).flat()).size, 6);
    const key = `${tuple.A[0]}|${tuple.B[0]}`; counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.size, 3); for (const count of counts.values()) assert.ok(Math.abs(count / 20000 - 1 / 3) < 0.02);
});
test('joint fold diagnostics use sequential policies within each legal tuple, with fixed 20,000 minimum', () => {
  const inputs = loadMw3Inputs('CO_open_BTN_call_BB_call'), contract = probeMw3Hand(inputs.spot);
  const make = streets => validateMw3Policy({ version: 3, kind: 'ai_estimate_not_gto', spot_id: inputs.spot.id, streets,
    rules: Object.keys(contract.nodes).filter(node => streets.includes(describeMw3Node(node).street)).flatMap(node => TIERS.map(tier => {
      const actions = describeMw3Node(node).actions, chosen = actions.includes('bet33') ? 'bet33' : 'fold';
      return { node, tier, when: mw3AnySelector(), priority: 0, mix: Object.fromEntries(actions.map(action => [action, action === chosen ? 100 : 0])) };
    })) }, { spotId: inputs.spot.id, nodes: contract.nodes });
  const policies = { flop: make(['flop']), later: make(['turn', 'river']) };
  const options = { board: parseCards('As7d2c', 3), paths: { flop: [] }, action: 'bet33' };
  const result = diagnoseMw3JointFold(inputs, policies, options);
  assert.equal(result.samples, MW3_JOINT_SAMPLES); assert.equal(result.allFoldProbability, 1); assert.equal(result.continuation, 0);
  assert.equal(result.warning, 'joint_overfold'); assert.equal(result.probabilityMethod, 'mean_of_sequential_fold_products_within_joint_tuple');
  assert.throws(() => diagnoseMw3JointFold(inputs, policies, { ...options, samples: 19999 }), /at least 20000/);
});
