// Standalone observable-v10 helper coverage is historical only. Product engine assertions use adopted v7.
import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../scripts/data/postflop-ai-pilot.json' with { type: 'json' };
import catalog from '../scripts/data/hu-after-multiway-spots.json' with { type: 'json' };
import { NODES } from '../scripts/postflop-ai/tree.ts';
import { LATER_NODES } from '../scripts/postflop-ai/later-tree.ts';
import { choose } from '../scripts/postflop-ai/policy.ts';
import { createTable, playFlop, playLaterStreetsWithPolicy } from '../scripts/postflop-ai/engine.ts';
import { replayDecision } from '../scripts/postflop-ai/defence.ts';
import { actionProjection, playedActionMass, projectActionMix, replayObservableStreet, canonicalPostflopPath,
  canonicalNodeForTable, actionModelIdentity, hasCurrentActionModel } from '../scripts/postflop-ai/observable-actions.mjs';

const spot = { id: 'observable-test', ip: 'HJ', oop: 'BB', potBb: 29, stackBb: 87, tree: 'oop_leads', history: [{ action: 'open' }] };
const board = [0, 5, 10, 15, 20];
const projection = (street, overrides = {}) => actionProjection({ street, node: street === 'flop' ? 'oop_first' : `${street}_oop_first`,
  pot: 120.36, stacks: { ip: 41.32, oop: 41.32 }, committed: { ip: 0, oop: 0 }, tree: 'oop_leads', config, ...overrides });
const normalPath = { flop: ['bet33', 'call'], turn: ['bet75', 'call'], river: ['check'] };

// Pure physical grouping and probability projection: no equity calculations.
test('only river has an explicit allin node; every street groups equal physical wagers', () => {
  assert.equal(NODES.oop_vs_allin, undefined);
  assert.equal(LATER_NODES.turn_ip_vs_allin, undefined);
  assert.deepEqual(LATER_NODES.river_ip_vs_allin, ['fold', 'call']);
  for (const street of ['flop', 'turn', 'river']) {
    const p = projection(street), bets = p.classes.filter(group => group.family === 'bet');
    assert.equal(bets.length, 1);
    const group = bets[0];
    assert.equal(group.action, street === 'river' ? 'allin' : 'bet33');
    assert.deepEqual(group.aliases, ['bet33', 'bet75', 'bet125', ...(street === 'river' ? ['allin'] : [])]);
    assert.equal(group.paid, 41.32); assert.equal(group.amountBb, 41.32);
    assert.equal(group.allIn, true); assert.equal(group.canRaise, false); assert.equal(group.nextActor, 'ip');
    assert.equal(p.byAction.bet75, group);
    assert.notEqual(p.byAction.check.key, group.key);
  }
});

test('partial aliases retain singleton actions and actual effective legality', () => {
  const p = projection('turn', { pot: 100, stacks: { ip: 100, oop: 100 } });
  assert.deepEqual(p.classes.map(group => [group.action, group.aliases]), [
    ['check', ['check']], ['bet33', ['bet33']], ['bet75', ['bet75', 'bet125']],
  ]);
  assert.equal(p.byAction.bet33.paid, 33); assert.equal(p.byAction.bet33.canRaise, true);
  assert.equal(p.byAction.bet75.paid, 100); assert.equal(p.byAction.bet75.canRaise, false);
  const face = actionProjection({ street: 'turn', node: 'turn_ip_vs_75', pot: 200,
    stacks: { ip: 100, oop: 0 }, committed: { ip: 0, oop: 100 }, config });
  assert.equal(face.canRaise, false);
  assert.deepEqual(face.byAction.call.aliases, ['call', 'raise']);
  assert.equal(face.byAction.call.terminal, 'call');
  assert.notEqual(face.byAction.fold.key, projection('turn').byAction.check.key, 'zero paid is not action equivalence');
  assert.deepEqual(projectActionMix({ fold: 40, call: 51, raise: 9 }, face), { fold: 40, call: 60 });
});

test('flop and later merge thresholds preserve existing pre-rounding distinction', () => {
  const cfg = { ...config, later_all_in_merge_ratio: .332 };
  const geometry = { pot: 1.01, stacks: { ip: 1, oop: 1 }, config: cfg };
  assert.equal(projection('flop', geometry).byAction.bet33.paid, 1);
  assert.equal(projection('turn', geometry).byAction.bet33.paid, .33);
  const exact = projection('turn', { pot: 100, stacks: { ip: 100, oop: 100 }, config: { ...config, later_all_in_merge_ratio: .33 } });
  assert.equal(exact.byAction.bet33.paid, 100);
  const justBelow = projection('turn', { pot: 99.97, stacks: { ip: 100, oop: 100 }, config: { ...config, later_all_in_merge_ratio: .33 } });
  assert.equal(justBelow.byAction.bet33.paid, 32.99);
});

test('unsupported nonallin collision with legal raises and unknown nodes fail closed', () => {
  assert.throws(() => projection('turn', { pot: .01, stacks: { ip: 100, oop: 100 } }), /non-all-in collision/);
  assert.throws(() => projection('turn', { node: 'turn_ip_vs_allin' }), /Invalid observable/);
  assert.throws(() => projection('flop', { node: 'river_oop_first' }), /Invalid observable/);
  assert.throws(() => projection('turn', { stacks: { ip: NaN, oop: 100 } }), /Invalid observable/);
});

test('pool final played mass with the old ordered remainder law, never pre-cap mix', () => {
  const p = projection('river');
  const raw = { check: 20, bet33: 10, bet75: 15, bet125: 30, allin: 24.999999 };
  assert.equal(playedActionMass(raw, p.actions).allin, 25);
  assert.deepEqual(projectActionMix(raw, p), { check: 20, allin: 80 });
  for (const random of [0, .199999, .2, .29999, .3, .449999, .45, .749999, .75, .999999999]) {
    const sampled = choose(raw, random, p.actions);
    assert.equal(p.byAction[sampled].action, random < .2 ? 'check' : 'allin');
  }
  // Post-cap action masses 9+1 and 1+1/3 differ from first pooling 10+10
  // and imposing the alpha=.25 cap (which would retain 10/3 bluffs).
  const value = projectActionMix({ check: 90, bet33: 9, bet75: 1, bet125: 0, allin: 0 }, p).allin;
  const bluff = projectActionMix({ check: 98.666667, bet33: 1, bet75: .333333, bet125: 0, allin: 0 }, p).allin;
  assert.equal(value, 10);
  assert.ok(Math.abs(bluff - 1.333333) < 1e-12);
  assert.ok(Math.abs(bluff - 10 / 3) > 1);
  assert.throws(() => playedActionMass({ check: NaN, bet33: 0 }, ['check', 'bet33']), /Invalid played/);
});

test('dormant v10 helper canonicalizes river aliases but adopted v7 engine retains their labels', () => {
  for (const action of ['bet33', 'bet75', 'bet125', 'allin']) {
    const path = { ...normalPath, river: ['check', action] };
    const normalized = canonicalPostflopPath(spot, path);
    assert.deepEqual(normalized.river, ['check', 'allin']);
    assert.deepEqual(canonicalPostflopPath(spot, normalized), normalized);
    const table = replayDecision({ spot }, board, path), pending = table.log.at(-1);
    assert.equal(pending.node, `river_oop_vs_${action === 'allin' ? 'allin' : action.slice(3)}`);
    assert.equal(pending.canRaise, false);
    assert.equal(table.pot, 161.68); assert.equal(table.stacks.HJ, 0); assert.equal(table.stacks.BB, 41.32);
    assert.deepEqual(table.path.river, ['check', action]);
    assert.ok(table.log.every(entry => !entry.observation));
  }
});

test('old merged-bet impossible raise imports as call but illegal explicit-allin raise never does', () => {
  const old = { ...normalPath, river: ['check', 'bet75', 'raise'] };
  assert.deepEqual(canonicalPostflopPath(spot, old).river, ['check', 'allin', 'call']);
  assert.throws(() => canonicalPostflopPath(spot, { ...normalPath, river: ['check', 'allin', 'raise'] }), /Illegal/);
  assert.throws(() => canonicalPostflopPath(spot, { ...normalPath, river: ['check', 'bet75', 'raise', 'fold'] }), /effectively ended/);
  assert.throws(() => canonicalPostflopPath(spot, { flop: ['bet75'], turn: ['check'] }), /pending or completed/);
});

test('flop/turn aliases use real existing member nodes and cannot create a later street', () => {
  const low = { ...spot, potBb: 120.36, stackBb: 41.32 };
  for (const action of ['bet33', 'bet75', 'bet125']) {
    const table = replayDecision({ spot: low }, board.slice(0, 3), { flop: [action] });
    assert.equal(table.log.at(-1).node, `ip_vs_${action.slice(3)}`);
    assert.deepEqual(table.path.flop, [action]);
    assert.throws(() => canonicalPostflopPath(low, { flop: [action, 'call'], turn: ['check'] }), /completed hand/);
  }
  const turnStart = { pot: 100, stacks: { ip: 100, oop: 100 }, lastAggressor: null };
  for (const action of ['bet75', 'bet125']) {
    const replay = replayObservableStreet({ spot, street: 'turn', actions: [action], start: turnStart });
    assert.deepEqual(replay.actions, ['bet75']); assert.equal(replay.state.node, 'turn_ip_vs_75');
  }
});

test('legacy engine keeps raw labels, entry shapes and historical action-model identity', () => {
  const legacy = { ...spot, history: undefined };
  const tables = ['bet33', 'bet75', 'bet125', 'allin'].map(action => replayDecision({ spot: legacy }, board,
    { ...normalPath, river: ['check', action] }));
  assert.deepEqual(tables.map(table => table.log.at(-1).node), ['river_oop_vs_33', 'river_oop_vs_75', 'river_oop_vs_125', 'river_oop_vs_allin']);
  for (const table of tables) assert.ok(table.log.every(entry => !('observation' in entry)));
  assert.deepEqual(actionModelIdentity(legacy), {});
  assert.equal(hasCurrentActionModel(legacy, {}), true);
  assert.deepEqual(actionModelIdentity(spot), { action_model_version: 10 });
  assert.equal(hasCurrentActionModel(spot, {}), false);
  assert.equal(hasCurrentActionModel(spot, { action_model_version: 9 }), false);
  assert.equal(hasCurrentActionModel(spot, { action_model_version: 10 }), true);
});

test('adopted v7 sampler retains saved labels while conserving identical merged chips', () => {
  const capture = raw => {
    const table = createTable(spot), STOP = Symbol('pending');
    playFlop(table, spot.tree, (_seat, _node, step) => normalPath.flop[step], config);
    try {
      playLaterStreetsWithPolicy(table, board.slice(0, 3), board.slice(3), (_seat, node) => {
        const street = node.split('_')[0], index = table.path[street].length;
        if (street === 'turn') return normalPath.turn[index];
        if (index === 0) return 'check';
        if (index === 1) return raw;
        throw STOP;
      }, config);
    } catch (error) { if (error !== STOP) throw error; }
    return { node: table.log.at(-1).node, path: table.path, pot: table.pot, stacks: table.stacks };
  };
  const allin = capture('allin');
  for (const action of ['bet33', 'bet75', 'bet125']) {
    const actual = capture(action);
    assert.equal(actual.pot, allin.pot); assert.deepEqual(actual.stacks, allin.stacks);
    assert.equal(actual.node, `river_oop_vs_${action.slice(3)}`);
    assert.deepEqual(actual.path.river, ['check', action]);
  }
});


test('current saved catalog/config has only merged-allin opening collisions', () => {
  assert.deepEqual(config.flop_bet_fractions, [.33, .75, 1.25]);
  assert.equal(config.later_streets.turn.all_in, false);
  assert.equal(config.later_streets.river.all_in, true);
  for (const item of catalog.spots.filter(item => item.reachable)) {
    assert.ok(item.potBb >= 19 && item.potBb <= 79);
    assert.ok(item.stackBb >= 70 && item.stackBb <= 92);
    for (const street of ['flop', 'turn', 'river']) for (const role of ['ip', 'oop']) {
      const node = street === 'flop' ? role === 'ip' ? 'btn_first' : 'oop_first' : `${street}_${role}_first`;
      const p = actionProjection({ street, node, role, pot: item.potBb, stacks: { ip: item.stackBb, oop: item.stackBb },
        committed: { ip: 0, oop: 0 }, config, tree: item.tree });
      for (const group of p.classes) if (group.aliases.length > 1) assert.equal(group.allIn, true);
    }
  }
});
