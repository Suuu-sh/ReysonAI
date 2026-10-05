import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TIERS, TIER_EN, emptyRankState } from '../src/trainer/rank-store.ts';

const bundle = await build({ stdin: { contents: 'export { RankLadder } from "./src/trainer/RankBadge.tsx"; export { Leaderboard } from "./src/trainer/Leaderboard.tsx";', resolveDir: process.cwd(), loader: 'tsx' }, plugins: [{ name: 'canonical-rank-store', setup(build) { build.onResolve({ filter: /rank-store\.ts$/ }, () => ({ path: new URL('../src/trainer/rank-store.ts', import.meta.url).href, external: true })); } }], bundle: true, write: false, platform: 'node', format: 'esm', external: ['react'], jsx: 'automatic' });
const { RankLadder, Leaderboard } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text.replace(/from "(react(?:\/jsx-runtime)?)"/g, (_, name) => `from "${import.meta.resolve(name)}"`)).toString('base64')}`);
test('every rank has an inline emblem and ladder uses canonical thresholds', () => {
  const html = renderToStaticMarkup(React.createElement(RankLadder, { rating: 1000 }));
  for (const tier of TIERS) {
    assert.ok(html.includes(`data-tier="${TIER_EN[tier.name].toLowerCase()}"`));
    assert.ok(html.includes(`${tier.min.toLocaleString()}+`));
  }
  assert.ok(!html.includes('.png'));
  assert.match(html, /title="マスターのうち上位10人">Top10<\/small>/);
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
});
test('leaderboard waits for server data without assigning a local placement', () => {
  const html = renderToStaticMarkup(React.createElement(Leaderboard, { rank: emptyRankState(), onBack() {} }));
  assert.match(html, /<h1 class="trainer-home-eyebrow">[\s\S]*LEADERBOARD<\/h1>/);
  assert.doesNotMatch(html, /<h1>ランキング<\/h1>/);
  assert.match(html, /FastFoldシーズン/);
  assert.ok(html.includes('サーバーランキングを読み込み中'));
  assert.ok(html.includes('100確定ハンド'));
  assert.ok(!html.includes('<tbody>'));
});
test('local history is visible but never produces public rank rows', () => {
  const now = Date.now();
  const matches = [0,1,2].map(i => ({ at: now - i * 1000, before: 1000, after: 1120, accuracy: .8, answered: 20 }));
  const html = renderToStaticMarkup(React.createElement(Leaderboard, { rank: { rating: 1120, peak: 1120, matches }, profile: { nickname: 'Tester' }, onBack() {} }));
  assert.ok(html.includes('data-tier="gold"'));
  assert.ok(!html.includes('Tester'));
  assert.ok(!html.includes('leaderboard-player'));
  assert.ok(!html.includes('leaderboard-history'), 'legacy quiz history is never substituted for FastFold');
  assert.ok(html.includes('100確定ハンド'));
});
test('dummy leaderboard players exist only for the local dev server', async () => {
  const { demoPlayers, showDemoPlayers } = await import('../src/trainer/leaderboard-demo.ts');
  assert.equal(showDemoPlayers(), false);
  assert.deepEqual(demoPlayers('week'), demoPlayers('week'));
  assert.ok(demoPlayers('all').every(player => player.demo && player.matches >= 1 && player.rating >= 800));
  const html = renderToStaticMarkup(React.createElement(Leaderboard, { rank: emptyRankState(), onBack() {} }));
  assert.ok(!html.includes('Kaito') && !html.includes('lb-podium'));
});

test('authenticated leaderboard renders server global placement and Legend, never locally reranking', async () => {
  const { JSDOM } = await import('jsdom');
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://app.reysonai.com' });
  const oldWindow = globalThis.window, oldDocument = globalThis.document, oldFetch = globalThis.fetch;
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let calls = 0;
  globalThis.fetch = async url => {
    assert.match(url, /\/v1\/fastfold\/leaderboard$/); calls++;
    return Response.json({ season:'fastfold-v1', rows: [
      { id:'first', name:'Player first', rating:1600, bbPer100:5, hands:104, provisional:false, place:1, self:false },
      { id:'self', name:'Player self', rating:1600, bbPer100:2, hands:103, provisional:false, place:102, self:true },
    ] });
  };
  const root = createRoot(dom.window.document.getElementById('root'));
  try {
    await act(async () => { root.render(React.createElement(Leaderboard, { rank:{rating:1600,peak:1600,matches:[]},onBack(){} })); });
    const html = dom.window.document.body.innerHTML;
    assert.equal(calls,1);assert.match(html,/data-tier="legend"/);assert.match(html,/data-tier="master"/);
    assert.match(html,/>102</);assert.match(html,/Player self/);assert.doesNotMatch(html,/dummy|Kaito/);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globalThis.window=oldWindow;globalThis.document=oldDocument;globalThis.fetch=oldFetch;delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
});
