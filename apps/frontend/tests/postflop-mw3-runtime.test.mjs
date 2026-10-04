import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMw3Inputs } from '../scripts/postflop-ai/mw3-inputs.mjs';
import { probeMw3Hand, describeMw3Node } from '../scripts/postflop-ai/mw3-tree.mjs';
import { mw3AnySelector, validateMw3Policy } from '../scripts/postflop-ai/mw3-policy.mjs';
import { mw3DecisionView, playMw3WithPolicies } from '../scripts/postflop-ai/mw3-runtime.mjs';
import { parseCards, TIERS } from '../scripts/postflop-ai/model.mjs';
import { seededRandom } from '../scripts/lib/equity.mjs';
const inputs = loadMw3Inputs('CO_open_BTN_call_BB_call'), contract = probeMw3Hand(inputs.spot);
const make = streets => validateMw3Policy({ version: 1, kind: 'ai_estimate_not_gto', spot_id: inputs.spot.id, streets,
  rules: Object.keys(contract.nodes).filter(node => streets.includes(describeMw3Node(node).street)).flatMap(node => TIERS.map(tier => {
    const actions = describeMw3Node(node).actions, selected = actions.includes('check') ? 'check' : 'fold';
    return { node, tier, when: mw3AnySelector(), priority: 0, mix: Object.fromEntries(actions.map(action => [action, action === selected ? 100 : 0])) };
  })) }, { spotId: inputs.spot.id, nodes: contract.nodes });
const policies = { flop: make(['flop']), later: make(['turn', 'river']) };
const board = parseCards('As7d2c3h4h', 5), hands = { BB: parseCards('KhQd', 2), CO: parseCards('AhAd', 2), BTN: parseCards('7c7h', 2) };
test('range adapter shows exactly three participants and distinguishes current strategy from historical reach', () => {
  const view = mw3DecisionView(inputs, policies, { board: board.slice(0, 3), paths: { flop: [] } });
  assert.equal(view.participants.length, 3);
  assert.equal(view.participants.filter(item => item.acting).length, 1);
  assert.equal(view.participants[0].seat, 'BB'); assert.equal(view.participants[0].actions.check, 1);
  assert.ok(view.participants.slice(1).every(item => item.actions === null && item.displayKind === 'historical_policy_reach'));
  assert.equal(view.explanationFacts.computedDefence, false);
  assert.throws(() => mw3DecisionView(inputs, {}, { board: board.slice(0, 3), paths: { flop: [] } }), /own saved/);
});
test('Agent adapter is repeatable, pauses on the human, resumes through river and settles all three seats', () => {
  const awaiting = playMw3WithPolicies(inputs, policies, { hands, board, human: 'BB', random: seededRandom(27) });
  assert.equal(awaiting.status, 'awaiting'); assert.equal(awaiting.pending.seat, 'BB'); assert.equal(awaiting.board.length, 3);
  const run = () => playMw3WithPolicies(inputs, policies, { hands, board, human: 'BB', humanActions: ['check', 'check', 'check'], random: seededRandom(27) });
  const result = run(); assert.deepEqual(result, run());
  assert.equal(result.status, 'done'); assert.equal(result.board.length, 5); assert.equal(result.table.log.length, 9);
  assert.equal(result.settlement.winner, 'CO'); assert.equal(result.settlement.rakeBb, 0.4);
  assert.throws(() => playMw3WithPolicies(inputs, policies, { hands, board, human: 'BB', humanActions: ['check', 'check', 'check', 'check'], random: seededRandom(27) }), /after hand completion/);
});
