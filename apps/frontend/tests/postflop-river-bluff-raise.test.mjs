import test from 'node:test';
import assert from 'node:assert/strict';
import { loadInputs, readArtifact } from '../scripts/postflop-ai/inputs.mjs';
import { buildLaterView } from '../scripts/postflop-ai/local-view.mjs';
import { explainLaterCombo } from '../scripts/postflop-ai/explain-later.ts';
import { buildPostflopExplanation } from '../src/estimated/postflop-explanation.ts';

// BB facing a 33% river bet on 8d5h4s Js Th (BTN open, BB call).
const inputs = loadInputs('BTN_open_BB_call');
const candidate = readArtifact(inputs.spot, 'candidate'), laterCandidate = readArtifact(inputs.spot, 'laterCandidate');
const line = { flop: '8d5h4s', flopActions: 'bet33,call', turn: 'Js', turnActions: 'check,check', river: 'Th', riverActions: 'check,bet33' };
const view = buildLaterView(line, inputs, candidate, laterCandidate);
const combos = view.rows.flatMap(row => row.combos);

test('river bluff raises are concentrated on a few air combos, not spread over every air hand', () => {
  assert.equal(view.node, 'river_oop_vs_33');
  const air = combos.filter(item => item.tier === 'air');
  const raising = air.filter(item => item.mix.raise > 0);
  assert.ok(raising.length > 0, 'some air combos bluff-raise');
  assert.ok(raising.length < air.length / 4, 'most air combos never raise');
  // Selected bluffs raise fully; at most one combo sits on the budget boundary.
  assert.ok(raising.filter(item => item.mix.raise < 0.999).length <= 1);
});

test('medium hands never raise a river bet', () => {
  for (const item of combos.filter(item => item.tier === 'medium')) assert.equal(item.mix.raise, 0, item.cards);
});

test('the explanation gives the blocker reason for a bluff raise and for a skipped bluff', () => {
  const policies = { flopPolicy: candidate.policy, laterPolicy: laterCandidate.policy };
  const raise = combos.find(item => item.tier === 'air' && item.mix.raise === 1);
  const skip = combos.find(item => item.tier === 'air' && item.mix.raise === 0 && item.mix.fold === 1);
  for (const [item, phrase] of [[raise, '降りずにレイズします'], [skip, 'この手はレイズせず降ります']]) {
    const facts = explainLaterCombo({ ...line, cards: item.cards, inputs, ...policies });
    assert.ok(facts.betting.bluff_raise, item.cards);
    const text = buildPostflopExplanation({ locale: 'ja', node: facts.node, hand: item.cards, actionMix: item.mix,
      explain: facts, board: '8d5h4sJsTh', cards: item.cards }).headline;
    assert.match(text, /相手の強い手（レイズに続ける手）を/);
    assert.ok(text.includes(phrase), text);
  }
});
