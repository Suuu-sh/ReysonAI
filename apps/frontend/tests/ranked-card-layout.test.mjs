import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

let server, TrainerHome, emptyRankState;
const oldWindow = globalThis.window;
before(async () => {
  server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true }, root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom' });
  ({ TrainerHome } = await server.ssrLoadModule('/src/trainer/DrillLibrary.tsx'));
  ({ emptyRankState } = await server.ssrLoadModule('/src/trainer/rank-store.ts'));
});
after(async () => { globalThis.window = oldWindow; await server?.close(); });
const noop = () => {};
for (const locale of ['en', 'ja', 'zh-CN', 'es']) {
  test(`Ranked card keeps core content without redundant rating details in ${locale}`, () => {
    globalThis.window = { localStorage: { getItem: key => key === 'reysonai:locale:v1' ? locale : null } };
    const props = { drills: [], reviewCount: 0, rank: { ...emptyRankState(), rating: 1000, peak: 1100, remaining: 3 }, rankedReady: true, onOpenDrills: noop, onCreate: noop, onStartReview: noop, onResume: noop, onStartRanked: noop, onOpenRanking: noop, onStartAgent: noop };
    const doc = new JSDOM(renderToStaticMarkup(createElement(TrainerHome, props))).window.document;
    const card = doc.querySelector('.is-ranked');
    assert.equal(card.querySelectorAll('.mode-foot .rank-ladder li').length, 7);
    assert.ok(card.querySelector('.rank-ladder-legend-copy').textContent.trim());
    assert.equal(card.querySelector('.ranked-stats'), null);
    assert.equal(card.querySelector('.ranked-bar'), null);
    assert.doesNotMatch(card.textContent, /1,100/);
    assert.equal(card.querySelectorAll('button').length, 2);
    assert.ok([...card.querySelectorAll('button')].every(button => !button.disabled && button.textContent.trim()));
    assert.equal(card.querySelector('.mode-quota'), null);
    assert.ok(card.querySelector('.mode-body > p').textContent.trim());
    const closed = renderToStaticMarkup(createElement(TrainerHome, { ...props, rankedReady: false }));
    assert.match(closed, /is-coming-soon/);
    assert.doesNotMatch(closed, /ranked-stats|ranked-bar/);
  });
}
test('sizing changes stay scoped to live Trainer home cards', async () => {
  const css = await readFile(new URL('../src/trainer/trainer.css', import.meta.url), 'utf8');
  assert.match(css, /\.trainer-home \.is-ranked:not\(\.is-coming-soon\) \.ranked-emblem \{ width: 104px; height: 104px; \}/);
  assert.match(css, /\.trainer-home \.is-ranked:not\(\.is-coming-soon\) \.mode-actions \{ grid-template-columns: 1fr 1fr; \}/);
  assert.match(css, /\.ranked-ring \.arc, \.mode-block\.is-ranked \.rank-ladder::after, \.mode-block\.is-ranked \.ranked-bar b \{ animation: none; \}/);
});
