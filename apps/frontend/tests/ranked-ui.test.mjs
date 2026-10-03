import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TIERS, TIER_EN, emptyRankState } from '../src/trainer/rank-store.ts';

const bundle = await build({ stdin: { contents: 'export { RankLadder } from "./src/trainer/RankBadge.tsx"; export { Leaderboard } from "./src/trainer/Leaderboard.tsx";', resolveDir: process.cwd(), loader: 'tsx' }, plugins: [{ name: 'canonical-rank-store', setup(build) { build.onResolve({ filter: /rank-store\.ts$/ }, () => ({ path: new URL('../src/trainer/rank-store.ts', import.meta.url).href, external: true })); } }], bundle: true, write: false, platform: 'node', format: 'esm', external: ['react'], jsx: 'automatic' });
const { RankLadder, Leaderboard } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text.replace(/from "(react(?:\/jsx-runtime)?)"/g, (_, name) => `from "${import.meta.resolve(name)}"`)).toString('base64')}`);
test('every rank has a PNG asset and ladder uses canonical thresholds', () => {
  const html = renderToStaticMarkup(React.createElement(RankLadder, { rating: 1000 }));
  for (const tier of TIERS) {
    const png = readFileSync(new URL(`../public/ranks/${TIER_EN[tier.name].toLowerCase()}.png`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.ok(html.includes(`${tier.min.toLocaleString()}+`));
  }
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
});
test('empty leaderboard is honest and offers a path back', () => {
  const html = renderToStaticMarkup(React.createElement(Leaderboard, { rank: emptyRankState(), onBack() {} }));
  assert.ok(html.includes('最初の一歩を踏み出そう'));
  assert.ok(html.includes('あと3試合'));
  assert.ok(!html.includes('<tbody>'));
});
test('populated leaderboard shows real tiers, self marker, placement and history', () => {
  const now = Date.now();
  const matches = [0,1,2].map(i => ({ at: now - i * 1000, before: 1000, after: 1120, accuracy: .8, answered: 20 }));
  const html = renderToStaticMarkup(React.createElement(Leaderboard, { rank: { rating: 1120, peak: 1120, matches }, profile: { nickname: 'Tester' }, onBack() {} }));
  assert.ok(html.includes('gold.png'));
  assert.ok(html.includes('Tester'));
  assert.ok(html.includes('leaderboard-player'));
  assert.ok(html.includes('leaderboard-history'));
  assert.ok(html.includes('この期間の順位が確定しています。'));
});
