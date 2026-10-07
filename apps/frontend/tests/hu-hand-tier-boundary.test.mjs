import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { handTier } from '../scripts/postflop-ai/hu-hand-tier.ts';
import { parseCards } from '../scripts/postflop-ai/model.ts';
import { mw3HandTier } from '../scripts/postflop-ai/mw3-hand-features.mjs';

const huConsumers = ['balance.mjs', 'defence.ts', 'explain-later.ts', 'explain.mjs', 'generate.mjs',
  'later-policy.ts', 'policy.ts', 'range-facts.ts', 'simulation.mjs', 'views.ts'];
test('every HU classifier consumer imports the private-card implementation; MW3 helper bytes stay exact', () => {
  const root = new URL('../scripts/postflop-ai/', import.meta.url);
  const model = readFileSync(new URL('model.ts', root));
  assert.equal(createHash('sha256').update(model).digest('hex'), 'fcbf13b6f8b1c3f72b8a81dcc626de89abc4c385d840163feb4bd78ca631732f');
  const actual = [];
  for (const name of readdirSync(root).filter(name => /\.(?:mjs|ts)$/.test(name) && !['model.ts', 'hu-hand-tier.ts'].includes(name))) {
    const source = readFileSync(new URL(name, root), 'utf8');
    assert.doesNotMatch(source, /import\s*\{[^}]*\bhandTier\b[^}]*\}\s*from\s*['"]\.\/model\.ts['"]/, name);
    assert.doesNotMatch(source, /import\s*\*\s*as\s*\w+\s*from\s*['"]\.\/model\.ts['"]/, name);
    if (/from\s*['"]\.\/hu-hand-tier\.ts['"]/.test(source)) actual.push(name);
    if (name.startsWith('mw3-')) assert.doesNotMatch(source, /hu-hand-tier/, name);
  }
  assert.deepEqual(actual.sort(), [...huConsumers].sort());
  const source = readFileSync(new URL('hu-hand-tier.ts', root), 'utf8');
  assert.doesNotMatch(source, /from\s*['"]\.\/model\.ts['"]/, 'no cycle through the frozen module');
});

test('HU98 paired-board semantics remain corrected across flop, turn and river while MW3 stays independent', () => {
  for (const [hole, board, expected] of [
    ['QcQd', 'KhKd4s', 'medium'], ['AcAd', 'KhKd4s', 'strong'],
    ['7c6c', 'QsQhQd', 'air'], ['7c6c', 'QsQhQdAc', 'air'],
    ['7c6c', 'QsQhQdAc2d', 'air'], ['AhKs', 'KhKd2s', 'monster'],
    ['QhJc', 'KhKdQs2s', 'medium'],
  ]) assert.equal(handTier(parseCards(hole, 2), parseCards(board, board.length / 2)), expected, `${hole}/${board}`);
  assert.equal(mw3HandTier(parseCards('7c6c', 2), parseCards('QsQhQd', 3)), 'medium');
});
