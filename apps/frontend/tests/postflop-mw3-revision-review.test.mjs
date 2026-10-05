// Independent review regressions for the new three-player classifier/transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mw3HandFacts, mw3HandTier } from '../scripts/postflop-ai/mw3-hand-features.mjs';
import { evaluateContinuation } from '../scripts/lib/continuation-evaluator.ts';
import { parseCards } from '../scripts/postflop-ai/model.ts';
import { MW3_TIERS as TIERS } from '../scripts/postflop-ai/mw3-hand-features.mjs';
import { mw3AnySelector } from '../scripts/postflop-ai/mw3-policy.mjs';
import { encodeMw3Policy, decodeMw3Policy } from '../scripts/postflop-ai/mw3-policy-codec.mjs';
import { prepareMw3PolicyParts, restoreMw3PolicyParts } from '../scripts/postflop-ai/mw3-delivery.mjs';
const facts = (hole, board) => mw3HandFacts(parseCards(hole, 2), parseCards(board, board.length / 2));
function policy() {
  return { version: 3, kind: 'ai_estimate_not_gto', spot_id: 'independent-review-never-published',
    streets: ['turn', 'river'], rules: ['turn', 'river'].flatMap(street => TIERS.map(tier => ({
      node: `mw3_${street}_first_first`, tier, when: mw3AnySelector(), priority: 0,
      mix: { check: 80.125, bet33: 10.375, bet75: 7.25, bet125: 2.25 },
    }))) };
}

test('private kicker facts exclude unused hole cards and cards used as a pair', () => {
  assert.equal(facts('9h8d', 'KsKhKdQcJs').playsBoard, true);
  assert.equal(facts('9h8d', 'KsKhKdQcJs').highestPrivateKicker, null);
  assert.equal(facts('7h6d', 'AsAdKcKdJh').highestPrivateKicker, null);
  assert.equal(facts('QhQd', 'KsKh7c').highestPrivateKicker, null);
  assert.equal(facts('Ah2d', 'KsKhKdQcJs').highestPrivateKicker, 12);
});

test('a straight completion that only plays the stronger board is not a private draw', () => {
  const hole = parseCards('2cKd', 2), board = parseCards('3h4s6c7d', 4);
  assert.equal(mw3HandFacts(hole, board).hasDraw, false);
  assert.equal(mw3HandTier(hole, board), 'air');
});

test('turn private draw facts match legal one-card best-five improvements on varied boards', () => {
  for (const text of ['3h4s6c7d', 'ThJcKhAd', '2h3h7hKs', 'AsAd7c2d', '2c3d4h5s']) {
    const board = parseCards(text, 4);
    const deck = Array.from({ length: 52 }, (_, card) => card).filter(card => !board.includes(card));
    const publicScores = new Map(deck.map(card => [card, evaluateContinuation([...board, card])]));
    for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) {
      const hole = [deck[i], deck[j]], f = mw3HandFacts(hole, board);
      if (f.category >= 4) continue; // Existing made straights/flushes have separate semantics.
      const genuineOut = deck.some(card => {
        if (hole.includes(card)) return false;
        const score = evaluateContinuation([...hole, ...board, card]), category = Math.floor(score / 16 ** 5);
        return [4, 5, 8].includes(category) && score > publicScores.get(card);
      });
      assert.equal(f.hasDraw, genuineOut, `board=${text}, hole=${hole.join(',')}`);
    }
  }
});

test('classifier rejects invalid, repeated and out-of-range cards before reporting facts', () => {
  const board = parseCards('KsKh7c', 3), hole = parseCards('Ah2d', 2);
  for (const invalid of [NaN, Infinity, -1, 52, 1.5, '12', null, undefined]) {
    assert.throws(() => mw3HandFacts([invalid, hole[1]], board));
    assert.throws(() => mw3HandFacts(hole, [invalid, board[1], board[2]]));
  }
  assert.throws(() => mw3HandFacts([hole[0], hole[0]], board));
  assert.throws(() => mw3HandFacts([board[0], hole[1]], board));
});

test('dictionary key orders require strings instead of coercible nested arrays', () => {
  const root = encodeMw3Policy(policy()); root.rootOrder = root.rootOrder.map(key => [key]);
  assert.throws(() => decodeMw3Policy(root));
  const rule = encodeMw3Policy(policy()); rule.ruleOrders = rule.ruleOrders.map(order => order.map(key => [key]));
  assert.throws(() => decodeMw3Policy(rule));
});

test('manifest street identity is an exact ordered array rather than comma-coerced text', async () => {
  const prepared = await prepareMw3PolicyParts(policy());
  for (const stages of [['turn,river'], [['turn'], ['river']], ['river', 'turn'], 'turn,river', null]) {
    await assert.rejects(() => restoreMw3PolicyParts({ ...prepared.manifest, stages }, prepared.parts));
  }
});

test('fractional percentages and shuffled part transport preserve authored JSON bytes', async () => {
  const original = policy(), prepared = await prepareMw3PolicyParts(original);
  assert.equal(JSON.stringify(decodeMw3Policy(encodeMw3Policy(original))), JSON.stringify(original));
  const restored = await restoreMw3PolicyParts(prepared.manifest, [...prepared.parts].reverse());
  assert.equal(JSON.stringify(restored), JSON.stringify(original));
});
