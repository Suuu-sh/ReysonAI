import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';
import { defenceFor, replayDecision, comboId } from '../scripts/postflop-ai/defence.ts';
import { parseCards } from '../scripts/postflop-ai/model.ts';
import { REPRESENTATIVE, foundationPair, hash, probe, numericGolden, exactCallEvidence } from './helpers/river-floor-regression.mjs';

const original = loadInputs(REPRESENTATIVE), pair = foundationPair();
const boardText = 'Ac7d2h9hJd', board = parseCards(boardText, 5), hero = parseCards('AsKs', 2);
const prefix = { flop: ['bet33', 'call'], turn: ['bet75', 'call'], river: ['check'] };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('preserved real-v3 four aliases independently rebuild identical full-range facts and negative AsKs sign', () => {
  const preserved = hash(pair);
  let expected;
  for (const alias of ['bet33', 'bet75', 'bet125', 'allin']) {
    const inputs = { ...original }; // isolate Defence contexts for each old input spelling
    const p = probe(inputs, pair, { board: boardText, path: { ...prefix, river: ['check', alias] } });
    assert.equal(p.entry.node, 'river_oop_vs_allin');
    assert.equal(p.context.call, 41.32); assert.equal(p.context.potBefore, 120.36);
    const support = exactCallEvidence(p.context, comboId(...hero));
    assert.equal(support.status, 'known'); assert.equal(support.sign, -1, 'pooling does not make the known negative hand profitable');
    const actual = {
      path: p.table.path, numeric: numericGolden(p), rows: p.rows,
      ownReach: Array.from(p.defence.rangeOf(p.table, p.board, p.context.defender)),
      bettorReach: Array.from(p.defence.rangeOf(p.table, p.board, p.context.bettor)),
      floor: p.context.floor, ceiling: p.context.ceiling, cap: p.context.facedCap,
      facts: p.defence.facts(p.table, p.board, p.entry.node, hero, p.defence.baseMix(p.table, p.board, p.entry.node, hero)), support,
    };
    if (!expected) expected = actual; else assert.deepEqual(actual, expected, alias);
    for (const row of p.rows) {
      const evidence = exactCallEvidence(p.context, row.id);
      if (evidence.status === 'known' && evidence.sign < 0) assert.ok(row.mix.call <= row.raw.call, `${alias}/${row.id}: no negative-call floor addition`);
    }
    p.defence.releaseBoardCaches();
  }
  assert.equal(hash(pair), preserved);
});

test('real-v3 pooled support is the unnormalized sum of post-cap label masses, retaining actual cap provenance', () => {
  const inputs = { ...original }, model = defenceFor(inputs, pair.candidate.policy, pair.laterCandidate.policy);
  const before = replayDecision(inputs, board, prefix), entry = before.log.at(-1);
  const after = replayDecision(inputs, board, { ...prefix, river: ['check', 'bet125'] });
  const preReach = model.rangeOf(before, board, entry.seat), actual = model.rangeOf(after, board, entry.seat);
  const cap = model.betting(before, board, entry.node);
  let removed = 0, valueAfter = 0, bluffAfter = 0, positive = 0;
  for (let id = 0; id < preReach.length; id++) if (preReach[id] > 0) {
    const combo = [Math.floor(id / 52), id % 52];
    const raw = model.baseMix(before, board, entry.node, combo);
    const final = model.mix(before, board, entry.node, combo, raw);
    // Every aggressive member belongs to this class, so the ordered sampler's
    // exact complement of the first (check) interval is its full probability.
    // This independent identity does not call the production projection helper.
    const playedBet = 100 - Math.min(100, Math.max(0, final.check));
    const beforeBet = 100 - Math.min(100, Math.max(0, raw.check));
    const expected = preReach[id] * playedBet / 100;
    close(actual[id], expected);
    if (expected > 0) positive++;
    if (cap.kind[id] === 1) valueAfter += expected;
    if (cap.kind[id] === 2) {
      bluffAfter += expected;
      removed += preReach[id] * Math.max(0, beforeBet - playedBet) / 100;
    }
  }
  assert.ok(positive > 0);
  const observed = cap.observedCaps.find(item => item.action === 'allin');
  close(observed.valueAfter, valueAfter); close(observed.bluffAfter, bluffAfter); close(observed.removedBluff, removed);
  assert.equal(observed.wasReduced, removed > 0);
  assert.equal(model.context(after, board, after.log.at(-1).node).capped, removed > 0);
  model.releaseBoardCaches();
});
