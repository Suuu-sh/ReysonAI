import test from 'node:test';
import assert from 'node:assert/strict';
import { mw3BoardLocked, mw3HandFacts, mw3HandTier } from '../scripts/postflop-ai/mw3-hand-features.mjs';
import { parseCards, handTier as legacyTier } from '../scripts/postflop-ai/model.mjs';
const classify = (hole, board) => mw3HandTier(parseCards(hole, 2), parseCards(board, board.length / 2));
const facts = (hole, board) => mw3HandFacts(parseCards(hole, 2), parseCards(board, board.length / 2));

test('paired-board private pair strength uses the unpaired side card, not the shared pair rank', () => {
  assert.equal(classify('QcQd', 'KhKd7s'), 'strong'); assert.equal(classify('2c2d', 'KhKd7s'), 'medium');
  assert.equal(classify('QcQd', '7h7dKs'), 'medium'); assert.equal(classify('KsKd', 'AhAd2s'), 'strong');
  assert.equal(classify('QhJc', 'KhKdQs2s'), 'strong'); assert.equal(classify('Ah2c', 'KhKdQs2s'), 'medium');
  assert.equal(classify('2c2d', 'KhKd2s'), 'monster'); assert.equal(classify('AhKs', 'KhKd2s'), 'monster');
});
test('shared trips/two-pair have explicit private-kicker facts and are never blindly monster', () => {
  assert.equal(classify('7c6c', 'QsQhQd'), 'medium'); assert.equal(classify('AhKc', 'QsQhQd'), 'strong');
  assert.equal(classify('KcJc', 'QsQhQdAc2d'), 'strong');
  assert.equal(classify('QhJc', 'AsAdKcKd2h'), 'strong'); assert.equal(classify('7c6c', 'AsAdKcKd2h'), 'medium');
  assert.equal(facts('2c2d', 'AsAdKcKd3h').madeKind, 'boardTwoPair');
  assert.equal(legacyTier(parseCards('7c6c', 2), parseCards('QsQhQd', 3)), 'monster', 'Legacy HU meaning remains unchanged');
});
test('playsBoard is checked for every category and publicly locked boards are exact', () => {
  assert.equal(classify('7c6c', 'AsAdKcKdJh'), 'board_shared');
  assert.equal(classify('7c6c', 'AsAdAhKsKd'), 'board_shared');
  for (const board of ['AcKdQhJsTc', 'AhKhQhJhTh', 'AcAdAhAsKd', 'KcKdKhKsAd']) assert.equal(mw3BoardLocked(parseCards(board, 5)), true);
  for (const board of ['KcKdKhKsQd', 'AhKhQhJsTc', 'AcAdAhAsQd', 'AcAdAhKsKd']) assert.equal(mw3BoardLocked(parseCards(board, 5)), false);
  assert.equal(classify('7c6c', 'AcKdQhJsTc'), 'board_locked');
});
test('draws require private card participation and never exist on the river', () => {
  assert.equal(facts('Ad2s', 'AhKdQdJh').hasDraw, false, 'A shared four-card straight is not our private draw');
  assert.equal(facts('Td2s', 'AhKdQd3h').hasDraw, true);
  assert.equal(facts('Ad2s', 'AhKdQdJh3c').hasDraw, false);
  assert.throws(() => facts('AsAd', 'AsKd2c'), /Duplicate/);
});

test('public-max nuts never conflates locked boards or claims blocker-conditional hands are beatable', async () => {
  const { mw3BoardMaxScore } = await import('../scripts/postflop-ai/mw3-hand-features.mjs');
  const { evaluateContinuation } = await import('../scripts/lib/continuation-evaluator.mjs');
  assert.equal(facts('JhTh', 'AhKhQh').guaranteedPrivateNuts, true);
  assert.equal(facts('7c6c', 'AcKdQhJsTc').guaranteedPrivateNuts, false);
  assert.equal(facts('7c6c', 'AcKdQhJsTc').boardLocked, true);
  const hole = parseCards('AcKc', 2), board = parseCards('AhAdKdKs2c', 5), f = mw3HandFacts(hole, board);
  assert.equal(f.guaranteedPrivateNuts, false, 'The public maximum can require a card held by Hero');
  assert.ok(f.score < mw3BoardMaxScore(board));
  const remaining = Array.from({ length: 52 }, (_, card) => card).filter(card => ![...hole, ...board].includes(card));
  let bestActualOpponent = -Infinity;
  for (let i = 0; i < remaining.length; i++) for (let j = i + 1; j < remaining.length; j++) bestActualOpponent = Math.max(bestActualOpponent, evaluateContinuation([...board, remaining[i], remaining[j]]));
  assert.equal(bestActualOpponent, f.score, 'This Hero is actually unbeatably tied after its blockers, despite missing the public-max detector');
});

test('cached blocker-conditioned nuts exactly match full legal-opponent enumeration', async () => {
  const { mw3OpponentMaxScore, mw3BoardMaxScore } = await import('../scripts/postflop-ai/mw3-hand-features.mjs');
  const { evaluateContinuation } = await import('../scripts/lib/continuation-evaluator.mjs');
  const cases = [['AcKc', 'AhAdKdKs2c'], ['QhJd', 'AhKh8h3h2c'], ['JhTh', '9h8h7d2c'], ['Tc9c', 'AsKdQhJc2d'],
    ['AhKh', 'QhJh2c'], ['AcAd', 'Kd8s3c'], ['7c6c', 'AcKdQhJsTc']];
  for (const [h, b] of cases) {
    const hole = parseCards(h, 2), board = parseCards(b, b.length / 2), blocked = new Set([...hole, ...board]);
    const remaining = Array.from({ length: 52 }, (_, card) => card).filter(card => !blocked.has(card));
    let expected = -Infinity;
    for (let i = 0; i < remaining.length; i++) for (let j = i + 1; j < remaining.length; j++) expected = Math.max(expected, evaluateContinuation([...board, remaining[i], remaining[j]]));
    assert.equal(mw3OpponentMaxScore(hole, board), expected, `${h}/${b}`);
    assert.equal(mw3OpponentMaxScore([...hole].reverse(), [...board].reverse()), expected);
    assert.equal(mw3BoardMaxScore([...board].reverse()), mw3BoardMaxScore(board));
  }
  assert.equal(classify('AcKc', 'AhAdKdKs2c'), 'nuts');
  assert.equal(classify('QhJd', 'AhKh8h3h2c'), 'nuts');
  assert.equal(classify('JhTh', '9h8h7d2c'), 'nuts', 'Current nuts can have future redraw risk');
  assert.equal(classify('Tc9c', 'AsKdQhJc2d'), 'nuts', 'Nuts may tie');
  assert.notEqual(classify('AhKh', 'QhJh2c'), 'nuts');
  assert.notEqual(classify('AcAd', 'Kd8s3c'), 'nuts');
  assert.equal(classify('7c6c', 'AcKdQhJsTc'), 'board_locked');
});
