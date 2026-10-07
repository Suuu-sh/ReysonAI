import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';
import { LOCALE_KEY } from '../src/locale.ts';
import { displayModeKey } from '../src/profile.ts';
import { translateProductCopy } from '../src/i18n.ts';

let dom, server, RangeWorkspace;
const globals = new Map();
before(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://reysonai.test/app', pretendToBeVisual: true });
  for (const name of ['window', 'document', 'Node', 'NodeFilter', 'Element', 'MutationObserver', 'IS_REACT_ACT_ENVIRONMENT']) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] });
  }
  window.HTMLElement.prototype.scrollTo = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  ({ RangeWorkspace } = await server.ssrLoadModule('/src/estimated/RangeWorkspace.tsx'));
});
after(async () => {
  await server?.close();
  dom?.window.close();
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

const settle = async predicate => {
  for (let attempt = 0; attempt < 50 && !predicate(); attempt++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  assert.ok(predicate(), 'workspace finished loading the saved ranges');
};
const click = async element => { assert.ok(element); await act(async () => element.click()); };
const panel = seat => document.querySelector(`.matrix-panel[aria-label="${seat}のレンジ"]`);
const cell = (seat, hand) => [...panel(seat).querySelectorAll('.matrix button')].find(button => button.querySelector('strong')?.textContent === hand);

async function withWorkspace(squeezeResponse, run, locale = 'ja') {
  window.history.replaceState(null, '', '/app');
  window.sessionStorage.clear(); window.localStorage.clear();
  window.localStorage.setItem(LOCALE_KEY, locale);
  window.localStorage.setItem(displayModeKey, 'standard');
  window.sessionStorage.setItem('reysonai:estimated-selection:v1', JSON.stringify({ rangeType: 'response', opener: 'UTG', hero: 'BB', callers: ['HJ'], pendingRaise: 'squeeze', squeezeResponse, continuationActions: [], selected: '72o' }));
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(createElement(RangeWorkspace)));
    await settle(() => panel(squeezeResponse.length ? 'HJ' : 'UTG'));
    await run();
  } finally { await act(async () => root.unmount()); }
}

test('real bounded workspace carries the unreachable marker and explanation into HandBreakdown', async () => {
  await withWorkspace([], async () => {
    assert.match(cell('UTG', '72o').className, /unreachable-hand/);
    assert.match(cell('UTG', '72o').getAttribute('aria-label'), /この履歴では到達不能/);
    await click(cell('UTG', '72o'));
    const detail = document.querySelector('.detail-column');
    assert.match(detail.textContent, /対象外（到達不能）/);
    assert.match(detail.textContent, /このハンドはこの履歴に到達しません/);
    assert.equal(detail.querySelector('.bars'), null);
    assert.doesNotMatch(detail.textContent, /100\.0%/);
    assert.doesNotMatch(detail.textContent, /既存3bet頻度/);
    await click(cell('UTG', 'AA'));
    assert.doesNotMatch(document.querySelector('.detail-column').textContent, /対象外（到達不能）/);
    assert.ok(document.querySelector('.detail-column .bars'));
    await click(cell('UTG', 'AJs'));
    assert.doesNotMatch(document.querySelector('.detail-column').textContent, /対象外（到達不能）/);
    assert.match(document.querySelector('.detail-column .bars').textContent, /fold.*100\.0%/);
  });
});

test('terminal comparison keeps the squeezer, masks the caller, and preserves reachable AA details', async () => {
  await withWorkspace(['fold', 'call'], async () => {
    await settle(() => panel('BB'));
    assert.equal(panel('UTG'), null);
    assert.match(cell('HJ', '72o').className, /unreachable-hand/);
    assert.doesNotMatch(cell('BB', '72o').className, /unreachable-hand/);
    await click(cell('HJ', 'AA'));
    assert.doesNotMatch(document.querySelector('.detail-column').textContent, /対象外（到達不能）/);
    await click(document.querySelector('.hand-close'));
    assert.ok(panel('HJ') && panel('BB'));
  });
});

test('history-specific accessible copy and detail stay localized in all four product languages', async () => {
  for (const [locale, reason, description] of [
    ['ja', /この履歴では到達不能/, /このハンドはこの履歴に到達しません/],
    ['en', /Unreachable in this history/, /This hand cannot reach this history/],
    ['zh-CN', /在此行动历史中无法到达/, /此手牌无法到达这段行动历史/],
    ['es', /No alcanzable en este historial/, /Esta mano no puede alcanzar este historial/],
  ]) {
    await withWorkspace([], async () => {
      const label = cell('UTG', '72o').getAttribute('aria-label');
      assert.match(label, reason, locale);
      assert.equal(translateProductCopy(label, locale), label, `${locale} accessible copy is stable`);
      await click(cell('UTG', '72o'));
      const text = document.querySelector('.detail-column .state').textContent;
      assert.match(text, description, locale);
      // The paragraph must survive the product's presentation translation pass.
      const paragraph = document.querySelector('.detail-column .state-content').textContent;
      assert.equal(translateProductCopy(paragraph, locale), paragraph, locale);
    }, locale);
  }
});

test('rewinding a bounded action block keeps its unreachable model when opening details', async () => {
  await withWorkspace([], async () => {
    await click([...document.querySelectorAll('.action-seat-position')].at(-1));
    assert.ok(document.querySelector('.action-seat.range-selected'));
    assert.match(cell('UTG', '72o').getAttribute('aria-label'), /この履歴では到達不能/);
    await click(cell('UTG', '72o'));
    assert.match(document.querySelector('.detail-column .state').textContent, /このハンドはこの履歴に到達しません/);
    assert.equal(document.querySelector('.detail-column .bars'), null);
  });
});
