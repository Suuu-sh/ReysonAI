import test from 'node:test';
import assert from 'node:assert/strict';
import { mw3HandExplanation } from '../src/estimated/mw3-explanation.ts';
import { MW3_TIERS } from '../scripts/postflop-ai/mw3-hand-features.mjs';
test('three-player hand explanations cover every tier in all four product languages without HU or EV claims', () => {
  for (const locale of ['en', 'ja', 'zh-CN', 'es']) for (const tier of MW3_TIERS) {
    const text = mw3HandExplanation({ tier, street: 'turn', locale });
    assert.ok(text.length > 25); assert.ok(!text.includes('undefined')); assert.ok(!/\bEV\b|GTO|MDF|head[s-]?up/i.test(text));
  }
  assert.match(mw3HandExplanation({ tier: 'nuts', street: 'turn', locale: 'en' }), /Later cards/);
  assert.doesNotMatch(mw3HandExplanation({ tier: 'nuts', street: 'river', locale: 'en' }), /Later cards/);
  assert.match(mw3HandExplanation({ tier: 'board_shared', street: 'river', locale: 'en' }), /may still improve/);
  assert.match(mw3HandExplanation({ tiers: ['strong', 'medium'], street: 'flop', locale: 'en' }), /weighted average/);
  assert.throws(() => mw3HandExplanation({ tier: 'unrecognized', locale: 'en' }), /Unknown/);
});
