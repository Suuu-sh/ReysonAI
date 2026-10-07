import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';
import { referencePolicyFor, NODES } from '../scripts/postflop-ai/policy.ts';
import { referenceLaterPolicy, laterPolicyMix } from '../scripts/postflop-ai/later-policy.ts';
import { LATER_NODES } from '../scripts/postflop-ai/later-tree.ts';
import { defenceFor, replayDecision, comboId, rankTable, defenceVersionFor } from '../scripts/postflop-ai/defence.ts';
import { playedActionMass, projectActionMix } from '../scripts/postflop-ai/observable-actions.mjs';
import { parseCards } from '../scripts/postflop-ai/model.ts';
import { compileRiverCallEv, exactRiverCallEv } from '../scripts/postflop-ai/exact-river-call-ev.mjs';
import { exactActionEv } from '../scripts/postflop-ai/exact-ev.mjs';
import { simulationReport } from '../scripts/postflop-ai/simulation.mjs';

const inputs = loadInputs('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
const flop = referencePolicyFor(inputs.spot.tree), later = referenceLaterPolicy();
const board = parseCards('Ac7d2h9hJd', 5), hero = parseCards('AsKs', 2);
const path = { flop: ['bet33', 'call'], turn: ['bet75', 'call'], river: ['check'] };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-11, `${actual} != ${expected}`);

test('new-HU every alias agrees in reach, response, cap/floor/ceiling, facts and exact EV sign', () => {
  const beforeBytes = JSON.stringify([flop, later]);
  const defence = defenceFor(inputs, flop, later);
  let expected;
  for (const alias of ['bet33', 'bet75', 'bet125', 'allin']) {
    const table = replayDecision(inputs, board, { ...path, river: ['check', alias] });
    const node = table.log.at(-1).node, context = defence.context(table, board, node);
    const base = defence.baseMix(table, board, node, hero), mix = defence.mix(table, board, node, hero, base);
    const result = { node, path: table.path, bettor: Array.from(defence.rangeOf(table, board, context.bettor)),
      defender: Array.from(defence.rangeOf(table, board, context.defender)),
      mix, facts: defence.facts(table, board, node, hero, base),
      ev: exactRiverCallEv(compileRiverCallEv(context, rankTable(board).score), hero),
      floor: defence.floorOf(context), ceiling: defence.ceilingOf(context), capped: context.capped, facedCap: context.facedCap };
    assert.equal(node, 'river_oop_vs_allin'); assert.equal(context.wager, 41.32); assert.equal(context.call, 41.32);
    assert.deepEqual(result.facedCap.aliases, ['bet33', 'bet75', 'bet125', 'allin']);
    assert.equal(result.capped, result.facedCap.removedBluff > 0);
    if (!expected) expected = result; else assert.deepEqual(result, expected);
    for (const requested of ['river_oop_vs_33', 'river_oop_vs_75', 'river_oop_vs_125', 'river_oop_vs_allin']) {
      assert.deepEqual(defence.mix(table, board, requested, hero, laterPolicyMix(later, requested, hero, board, table.log.at(-1).line)), mix);
    }
  }
  assert.equal(JSON.stringify([flop, later]), beforeBytes, 'policy bytes remain unchanged');
});

test('observed reach equals the sum of final capped played-label likelihoods', () => {
  const defence = defenceFor(inputs, flop, later), before = replayDecision(inputs, board, path);
  const entry = before.log.at(-1), cap = defence.betting(before, board, entry.node);
  const after = replayDecision(inputs, board, { ...path, river: ['check', 'bet75'] });
  const prior = defence.rangeOf(before, board, entry.seat), posterior = defence.rangeOf(after, board, entry.seat);
  let support = 0, removedBluff = 0;
  for (let id = 0; id < prior.length; id++) if (prior[id] > 0) {
    const combo = [Math.floor(id / 52), id % 52], base = defence.baseMix(before, board, entry.node, combo);
    const final = defence.mix(before, board, entry.node, combo, base);
    const played = playedActionMass(final, entry.observation.actions);
    const sum = ['bet33', 'bet75', 'bet125', 'allin'].reduce((total, label) => total + played[label], 0);
    close(posterior[id], prior[id] * sum / 100);
    close(projectActionMix(final, entry.observation).allin, sum);
    const expected = defence.observableMix(before, board, entry.node, combo, base);
    close(expected.allin, sum); close(expected.check + expected.allin, 100);
    if (sum > 0) support++;
    if (cap?.kind[id] === 2) {
      // At this low SPR the only reroute can move allin to bet125, in the same
      // observable class; its total betting mass is unchanged before the cap.
      const original = playedActionMass(base, entry.observation.actions);
      const pre = ['bet33', 'bet75', 'bet125', 'allin'].reduce((total, label) => total + original[label], 0);
      removedBluff += prior[id] * Math.max(0, pre - sum) / 100;
    }
  }
  assert.ok(support > 0);
  close(cap.observedCaps[0].removedBluff, removedBluff);
  assert.equal(cap.observedCaps[0].wasReduced, removedBluff > 0);
});

test('raw no-cap projection does not invoke or invent bluff caps', () => {
  const raw = defenceFor(inputs, flop, later, { bluffCap: false });
  const table = replayDecision(inputs, board, path), node = table.log.at(-1).node;
  assert.equal(raw.betting(table, board, node), null);
  const base = raw.baseMix(table, board, node, hero);
  assert.deepEqual(raw.mix(table, board, node, hero, base), base);
  assert.deepEqual(raw.observableMix(table, board, node, hero, base), projectActionMix(base, table.log.at(-1).observation));
});

test('exact EV aggregates physical classes before prune, including individually tiny aliases', () => {
  const tiny = .0003, total = 4 * tiny / 100;
  const fake = {
    baseMix(_table, _board, node) {
      if (node === 'river_ip_first') return { check: 100 - 4 * tiny, bet33: tiny, bet75: tiny, bet125: tiny, allin: tiny };
      const actions = NODES[node] ?? LATER_NODES[node];
      return Object.fromEntries(actions.map(action => [action, action === 'check' || action === 'fold' ? 100 : 0]));
    }, betting: () => null, context: () => null, trimRiverCaches() {},
  };
  const args = { spot: inputs.spot, defence: fake, rootPath: { ...path, river: [] }, finals: [board],
    expectedNode: 'river_oop_first', heroGroups: [{ key: 'AA', items: [{ combo: parseCards('AsAh', 2), weight: 1 }] }],
    oppItems: [{ combo: parseCards('KsKh', 2), weight: 1 }] };
  const pruned = exactActionEv({ ...args, prune: 1e-5 }), unpruned = exactActionEv({ ...args, prune: 0 });
  assert.deepEqual(pruned.actions, ['check', 'allin']);
  close(pruned.rows.get('AA').ev[0], unpruned.rows.get('AA').ev[0]);
  close(pruned.rows.get('AA').ev[0], (1 - total) * (120.36 - 3));
});

test('computed and raw new-HU reports both carry model10 action identity; legacy report schema stays unchanged', () => {
  assert.equal(defenceVersionFor(inputs), 10);
  for (const computedDefence of [false, true]) {
    const report = simulationReport(inputs, flop, 1, later, [], { computedDefence });
    assert.equal(report.action_model_version, 10);
    assert.equal(report.defence_version, computedDefence ? 10 : undefined);
  }
  const legacy = loadInputs('BTN_open_BB_call');
  assert.equal(defenceVersionFor(legacy), 7);
  const report = simulationReport(legacy, referencePolicyFor(legacy.spot.tree), 1, later, [], { computedDefence: false });
  assert.equal('action_model_version' in report, false);
  assert.equal('defence_version' in report, false);
});
