import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createServer } from 'vite';

// Mount the real workspace and asynchronous source loader. Only the expensive
// postflop visualization/computation is replaced: this test owns hydration,
// history and effects, not numerical strategy evaluation.
const workspace = fileURLToPath(new URL('..', import.meta.url));
const rootPath = '/analyze/ranges';
const riverQuery = 'gametype=cash-6max&depth=100&preflop_actions=R2.5-C-F-F-F-R13-F-C&board=Ks7h2d&flop_actions=X-X&turn=3c&turn_actions=X-X&river=4s&river_actions=X-X&hand=AA';
const riverUrl = `${rootPath}?${riverQuery}`;
const macRiverUrl = `${rootPath}?gametype=cash-6max&depth=100&preflop_actions=R2.5-C-F-F-F-R13-F-C&board=AhKd7c&flop_actions=X-X&turn=Qh&turn_actions=X-X&river=2d&river_actions=X-X&hand=AKo`;
const sourceFiles = new Map();
function source(name) {
  if (!sourceFiles.has(name)) sourceFiles.set(name, JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url), 'utf8')));
  return sourceFiles.get(name);
}
const pending = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const original = new Map();
const globalNames = ['window', 'document', 'Node', 'NodeFilter', 'Element', 'MutationObserver', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'];
let dom, server, root, Workspace, dataModule, accountModule, accountFixture, requests, gates, failed, historyWrites;
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const params = () => new URLSearchParams(window.location.search);
const shown = () => { const node = document.querySelector('[data-postflop-state]'); return node ? JSON.parse(node.getAttribute('data-postflop-state')) : null; };
async function flush() { await act(async () => { await settle(); }); }
async function open(url, { block = [], fail = [], policyFailure = null, product = false, accountUser = { id: 'hydration-test', verified: true }, accountProfile = { level: 'intermediate', nickname: 'Saved account profile' }, guestProfile = null, sourceOverrides = {} } = {}) {
  if (root) { await act(async () => root.unmount()); root = null; }
  await accountModule?.saveAccountData();
  if (server) { await server.close(); server = null; }
  dom?.window.close();
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: `https://reysonai.test${url}`, pretendToBeVisual: true });
  for (const name of globalNames.filter(name => name !== 'fetch')) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] });
  window.HTMLElement.prototype.scrollTo = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  requests = []; gates = new Map(block.map(name => [name, pending()])); failed = new Set(fail); historyWrites = [];
  for (const method of ['pushState', 'replaceState']) {
    const write = window.history[method].bind(window.history);
    window.history[method] = (...args) => { historyWrites.push(new URL(String(args[2]), window.location.href).href); return write(...args); };
  }
  if (guestProfile) window.localStorage.setItem('reysonai:profile:v1', JSON.stringify(guestProfile));
  let currentUser = accountUser;
  let accountData = product && accountProfile ? { 'reysonai:profile:v1': accountProfile } : {};
  accountFixture = { setIdentity(user, profile) {
    currentUser = user;
    accountData = profile ? { 'reysonai:profile:v1': profile } : {};
  } };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), window.location.href);
    if (url.pathname === '/v1/account/session') {
      requests.push('account-session');
      if (gates.has('account-session')) await gates.get('account-session').promise;
      if (failed.has('account-session')) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => ({ user: currentUser }) };
    }
    if (url.pathname === '/v1/account/data') {
      requests.push('account-data');
      if (gates.has('account-data')) await gates.get('account-data').promise;
      if (failed.has('account-data')) return { ok: false, status: 500, json: async () => ({}) };
      if (options.method === 'POST') accountData = JSON.parse(options.body).data;
      return { ok: true, json: async () => ({ version: 1, data: accountData }) };
    }
    if (url.pathname === '/v1/account/logout') { currentUser = null; return { ok: true, json: async () => ({}) }; }
    if ((url.pathname.includes('/postflop/spot') || url.pathname === '/local-postflop-spot') && policyFailure) return policyFailure === 'missing'
      ? { ok: false, status: 404, json: async () => ({ error: 'Missing saved policy' }) }
      : { ok: true, json: async () => ({ kind: 'malformed', spot: {} }) };
    const name = url.pathname.split('/v1/preflop/datasets/')[1];
    if (name) {
      requests.push(name);
      if (gates.has(name)) await gates.get(name).promise;
      if (failed.has(name)) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, json: async () => sourceOverrides[name] ?? source(name) };
    }
    throw new Error(`Unexpected hydration fetch: ${url.pathname}`);
  };
  server = await createServer({ root: workspace, configFile: false, server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' }, plugins: [{ name: 'hydration-test-boundaries', enforce: 'pre',
      transform(code, id) {
        if (process.env.PRODUCT_HYDRATION_BASELINE_SOURCE && id.endsWith('/src/ProductApp.tsx')) return readFileSync(process.env.PRODUCT_HYDRATION_BASELINE_SOURCE, 'utf8');
        if (process.env.RANGE_HYDRATION_BASELINE_SOURCE && id.endsWith('/src/estimated/RangeWorkspace.tsx')) return readFileSync(process.env.RANGE_HYDRATION_BASELINE_SOURCE, 'utf8');
        if (id.endsWith('/src/estimated/datasets.ts')) return code.replace(/^const nodeFs = .*;$/m, 'const nodeFs = () => undefined;');
        if (!policyFailure && id.endsWith('/src/estimated/PostflopTrial.tsx')) return `import { createElement } from 'react';
          export const suitLabels = { s: '♠', h: '♥', d: '♦', c: '♣' };
          export const FlopCardDialog = () => null;
          export const StreetCardDialog = () => null;
          export const PostflopTrial = props => createElement('section', { 'data-postflop-state': JSON.stringify(props) }, 'Postflop state');`;
      },
    }] });
  dataModule = await server.ssrLoadModule('/src/estimated/datasets.ts');
  await dataModule.preloadDatasets(dataModule.APP_DATASETS);
  accountModule = await server.ssrLoadModule('/src/account/session.ts');
  if (product) ({ default: Workspace } = await server.ssrLoadModule('/src/ProductApp.tsx'));
  else {
    await accountModule.refreshAccount();
    ({ EstimatedRanges: Workspace } = await server.ssrLoadModule('/src/estimated/RangeWorkspace.tsx'));
  }
  root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(createElement(StrictMode, null, createElement(Workspace))); });
  await flush();
}
async function release(name) { await act(async () => { gates.get(name).resolve(); await settle(); }); await flush(); }
const assertRiverUrl = (url = riverUrl) => {
  const expected = new URL(url, window.location.href).searchParams;
  assert.equal(params().get('board'), expected.get('board'));
  assert.equal(params().get('turn'), expected.get('turn'));
  assert.equal(params().get('river'), expected.get('river'));
  assert.equal(params().get('river_actions'), 'X-X');
};
const assertRiverState = (url = riverUrl) => {
  const expected = new URL(url, window.location.href).searchParams;
  const state = shown();
  assert.ok(state, 'postflop component is mounted after source validation');
  assert.deepEqual(state.cards, expected.get('board').match(/../g));
  assert.deepEqual(state.actions, ['check', 'check']);
  assert.equal(state.turnCard, expected.get('turn')); assert.deepEqual(state.turnActions, ['check', 'check']);
  assert.equal(state.riverCard, expected.get('river')); assert.deepEqual(state.riverActions, ['check', 'check']);
};
before(() => { for (const name of globalNames) original.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); });
after(async () => {
  if (root) await act(async () => root.unmount());
  await accountModule?.saveAccountData();
  await server?.close(); dom?.window.close();
  for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
});

test('direct river URL and reload survive delayed continuation-source hydration in StrictMode', async () => {
  for (let reload = 0; reload < 2; reload++) {
    await open(riverUrl, { block: ['squeeze-responses'] });
    assert.ok(requests.includes('squeeze-responses'));
    assertRiverUrl();
    await release('squeeze-responses');
    assertRiverUrl(); assertRiverState();
  }
});

test('a temporarily missing source preserves valid board intent and retry restores the same river', async () => {
  await open(riverUrl, { fail: ['squeeze-responses'] });
  assertRiverUrl();
  assert.equal(shown(), null, 'missing sources must not show an unvalidated strategy');
  failed.delete('squeeze-responses');
  const retry = [...document.querySelectorAll('button')].find(button => button.textContent === 'Retry saved ranges');
  assert.ok(retry);
  await act(async () => { retry.click(); await settle(); }); await flush();
  assertRiverUrl(); assertRiverState();
});

async function traverse(method) {
  const event = new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }));
  await act(async () => { window.history[method](); await event; });
  await flush();
}

test('Back and Forward restore the query atomically without stale street-reset effects', async () => {
  await open(riverUrl);
  assertRiverState();
  const flopUrl = `${rootPath}?gametype=cash-6max&depth=100&preflop_actions=R2.5-C-F-F-F-R13-F-C&board=Qh8d2c&hand=KQs`;
  await act(async () => { window.history.pushState({}, '', flopUrl); window.dispatchEvent(new window.PopStateEvent('popstate')); });
  await flush();
  assert.deepEqual(shown().cards, ['Qh', '8d', '2c']);
  assert.equal(shown().turnCard, ''); assert.equal(shown().riverCard, '');
  await traverse('back');
  assertRiverUrl(); assertRiverState();
  await traverse('forward');
  assert.equal(params().get('board'), 'Qh8d2c');
  assert.equal(params().has('turn'), false); assert.equal(params().has('river'), false);
  assert.deepEqual(shown().cards, ['Qh', '8d', '2c']);
});

test('late source resolution cannot resurrect the river after navigating to a different history', async () => {
  await open(riverUrl, { block: ['squeeze-responses'] });
  const preflopUrl = `${rootPath}?gametype=cash-6max&depth=100&preflop_actions=F-F-F-R2.5-F&hand=AKo`;
  await act(async () => { window.history.pushState({}, '', preflopUrl); window.dispatchEvent(new window.PopStateEvent('popstate')); });
  await flush();
  assert.equal(params().has('board'), false);
  await release('squeeze-responses');
  assert.equal(params().get('preflop_actions'), 'F-F-F-R2.5-F');
  assert.equal(params().has('board'), false); assert.equal(params().has('turn'), false); assert.equal(params().has('river'), false);
  assert.equal(shown(), null);
  await traverse('back');
  assertRiverUrl(); assertRiverState();
});

test('invalid cards and illegal street tails still canonicalize to the legal prefix', async () => {
  await open(riverUrl.replace('river=4s', 'river=Ks'));
  assert.equal(params().get('board'), 'Ks7h2d'); assert.equal(params().get('turn'), '3c');
  assert.equal(params().has('river'), false); assert.equal(shown().riverCard, '');
  await open(riverUrl.replace('board=Ks7h2d', 'board=KsKs2d'));
  assert.equal(params().has('board'), false); assert.equal(params().has('turn'), false); assert.equal(params().has('river'), false);
  assert.equal(shown(), null);
  await open(riverUrl.replace('flop_actions=X-X', 'flop_actions=F-X'));
  assert.equal(params().get('board'), 'Ks7h2d'); assert.equal(params().get('flop_actions'), '');
  assert.equal(params().has('turn'), false); assert.equal(params().has('river'), false);
});


test('the exact Mac Showdown URL survives delayed load, source failure, retry and a fresh reload', async () => {
  await open(macRiverUrl, { block: ['squeeze-responses'], fail: ['squeeze-responses'] });
  assertRiverUrl(macRiverUrl);
  await release('squeeze-responses');
  assertRiverUrl(macRiverUrl);
  failed.delete('squeeze-responses');
  const retry = [...document.querySelectorAll('button')].find(button => button.textContent === 'Retry saved ranges');
  await act(async () => { retry.click(); await settle(); }); await flush();
  assertRiverUrl(macRiverUrl); assertRiverState(macRiverUrl);
  assert.match(document.querySelector('.action-path').textContent, /Showdown/);
  const restored = window.location.pathname + window.location.search;
  await open(restored, { block: ['squeeze-responses'] });
  assertRiverUrl(macRiverUrl);
  await release('squeeze-responses');
  assertRiverUrl(macRiverUrl); assertRiverState(macRiverUrl);
});

test('real postflop component policy errors leave restored cards and URL intact', async () => {
  for (const policyFailure of ['missing', 'malformed']) {
    await open(macRiverUrl.replace('river_actions=X-X', 'river_actions='), { policyFailure });
    assert.equal(params().get('board'), 'AhKd7c'); assert.equal(params().get('turn'), 'Qh'); assert.equal(params().get('river'), '2d');
    assert.ok(document.querySelector('.postflop-trial'));
    const expected = policyFailure === 'missing' ? /Missing saved policy/ : /局面または形式が一致しません/;
    assert.match(document.querySelector('.postflop-trial').textContent, expected);
    assert.equal(document.querySelector('.postflop-range-layout'), null, 'missing/malformed policy must not fabricate a range');
  }
});


test('full ProductApp hydrates an account-only profile before routing the exact Mac river URL', async () => {
  await open(macRiverUrl, { product: true, block: ['account-session', 'account-data', 'squeeze-responses'] });
  assert.equal(window.localStorage.getItem('reysonai:profile:v1'), null, 'no guest-local profile');
  assert.ok(document.querySelector('.app-loading'));
  assert.equal(window.location.pathname, rootPath); assertRiverUrl(macRiverUrl);
  await release('account-session');
  assert.ok(document.querySelector('.app-loading'));
  assert.equal(window.location.pathname, rootPath); assertRiverUrl(macRiverUrl);
  await release('account-data');
  assert.equal(window.location.pathname, rootPath); assertRiverUrl(macRiverUrl);
  assert.equal(document.querySelector('.onboarding'), null, 'resolved account profile must never show onboarding');
  assert.ok(historyWrites.every(url => new URL(url).pathname !== '/welcome'), 'startup must never replace the deep route with /welcome');
  await release('squeeze-responses');
  assertRiverUrl(macRiverUrl); assertRiverState(macRiverUrl);
  assert.match(document.querySelector('.action-path').textContent, /Showdown/);
  const other = `${rootPath}?gametype=cash-6max&depth=100&preflop_actions=F-F-F-R2.5-F&hand=AKo`;
  await act(async () => { window.history.pushState({}, '', other); window.dispatchEvent(new window.PopStateEvent('popstate')); }); await flush();
  assert.equal(shown(), null);
  await traverse('back'); assertRiverUrl(macRiverUrl); assertRiverState(macRiverUrl);
  await traverse('forward'); assert.equal(params().has('board'), false); assert.equal(shown(), null);
});

async function finishOnboarding() {
  const radio = document.querySelector('input[name="level"][value="intermediate"]');
  assert.ok(radio, 'genuine onboarding exposes its level input');
  await act(async () => radio.click());
  await act(async () => document.querySelector('.onboarding form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  await flush();
}

test('genuine account onboarding restores the deep URL before the range child mounts', async () => {
  await open(macRiverUrl, { product: true, accountProfile: null, block: ['account-session'] });
  assert.equal(window.location.pathname, rootPath);
  await release('account-session');
  assert.equal(window.location.pathname, '/welcome'); assert.ok(document.querySelector('.onboarding'));
  assert.equal(shown(), null);
  await finishOnboarding();
  assert.equal(window.location.pathname, rootPath); assertRiverUrl(macRiverUrl); assertRiverState(macRiverUrl);
});

test('guest onboarding and logout retain their own profile lifecycle', async () => {
  const preflop = `${rootPath}?gametype=cash-6max&depth=100&preflop_actions=F-F-F-R2.5-F&hand=AKo`;
  await open(preflop, { product: true, accountUser: null, accountProfile: null, block: ['account-session'] });
  assert.equal(window.location.pathname, rootPath);
  await release('account-session');
  assert.equal(window.location.pathname, '/welcome'); assert.ok(document.querySelector('.onboarding'));
  await finishOnboarding();
  assert.equal(window.location.pathname, rootPath);
  assert.ok(JSON.parse(window.localStorage.getItem('reysonai:profile:v1')).level);
  assert.ok(document.querySelector('.action-path'));
  await open(preflop, { product: true, guestProfile: null });
  assert.equal(document.querySelector('.onboarding'), null);
  await act(async () => accountModule.logoutAccount()); await flush();
  assert.equal(window.location.pathname, '/welcome');
  assert.ok(document.querySelector('.onboarding'), 'signed-out account profile must not leak into guest state');
  assert.equal(window.localStorage.getItem('reysonai:profile:v1'), null);
});

test('an asynchronously proved-unreachable terminal clears board intent while malformed sources fail closed', async () => {
  const impossible = macRiverUrl.replace('R2.5-C-F-F-F-R13-F-C', 'F-F-F-R2.5-C-R13-F-C');
  await open(impossible, { block: ['squeeze-responses'] });
  assert.equal(params().get('board'), 'AhKd7c', 'unknown source support is not yet proof of an invalid history');
  await release('squeeze-responses');
  assert.equal(params().has('board'), false); assert.equal(params().has('turn'), false); assert.equal(params().has('river'), false);
  assert.equal(shown(), null); assert.match(document.querySelector('.action-path').textContent, /Unreachable history/);
  const malformed = structuredClone(source('squeeze-responses'));
  const spot = malformed.spots.find(spot => spot.id === 'UTG_vs_BB_squeeze_HJcall');
  spot.four_bet_size_bb = 99;
  for (const row of spot.hands) if (row.four_bet > 0) row.four_bet_size_bb = 99;
  await open(macRiverUrl, { block: ['squeeze-responses'], sourceOverrides: { 'squeeze-responses': malformed } });
  await release('squeeze-responses');
  assertRiverUrl(macRiverUrl);
  assert.equal(shown(), null, 'malformed data never bypasses source validation');
  assert.match(document.body.textContent, /Could not load ranges|不正/);
});

for (const endpoint of ['account-session', 'account-data']) for (const retryMode of ['batched', 'delayed']) {
  test(`failed ${endpoint} hydration recovers the deep URL with ${retryMode} retry`, async () => {
    await open(macRiverUrl, { product: true, block: [endpoint], fail: [endpoint] });
    assert.ok(document.querySelector('.app-loading'));
    assertRiverUrl(macRiverUrl);
    assert.equal(document.querySelector('.account-chip'), null);
    await release(endpoint);
    assert.equal(accountModule.accountSnapshot().error, 'request');
    assert.equal(accountModule.accountStorage().getItem('reysonai:profile:v1'), null);
    assert.equal(shown(), null, 'failed hydration must not mount an authenticated strategy');
    assert.equal(document.querySelector('.account-chip'), null);
    // With no readable profile, the existing app presents onboarding. A later
    // explicit retry must restore the original query before mounting ranges.
    assert.equal(window.location.pathname, '/welcome');
    assert.ok(document.querySelector('.onboarding'));
    failed.delete(endpoint);
    if (retryMode === 'delayed') {
      gates.set(endpoint, pending());
      let refresh;
      await act(async () => { refresh = accountModule.refreshAccount(); await settle(); });
      assert.ok(document.querySelector('.app-loading'));
      await release(endpoint); await refresh; await flush();
    } else {
      await act(async () => accountModule.refreshAccount()); await flush();
    }
    assert.equal(accountModule.accountSnapshot().error, '');
    assert.equal(window.location.pathname, rootPath);
    assert.equal(document.querySelector('.account-chip-text strong')?.textContent, 'Saved account profile');
    assertRiverUrl(macRiverUrl); assertRiverState(macRiverUrl);
    assert.equal(window.localStorage.getItem('reysonai:profile:v1'), null);
  });
}

test('authenticated identity A to B hides the previous profile until B data is ready', async () => {
  const profileA = { level: 'beginner', nickname: 'Account A' };
  const profileB = { level: 'intermediate', nickname: 'Account B' };
  await open(macRiverUrl, { product: true, accountUser: { id: 'account-a', verified: true }, accountProfile: profileA });
  assert.equal(document.querySelector('.account-chip-text strong')?.textContent, profileA.nickname);
  assertRiverState(macRiverUrl);
  await accountModule.saveAccountData();
  accountFixture.setIdentity({ id: 'account-b', verified: true }, profileB);
  gates.set('account-session', pending()); gates.set('account-data', pending());
  let refresh;
  await act(async () => { refresh = accountModule.refreshAccount(); await settle(); });
  assert.ok(document.querySelector('.app-loading'));
  assert.equal(document.querySelector('.account-chip'), null); assertRiverUrl(macRiverUrl);
  await release('account-session');
  assert.ok(document.querySelector('.app-loading'));
  assert.equal(document.querySelector('.account-chip'), null);
  assert.equal(accountModule.accountStorage().getItem('reysonai:profile:v1'), null, 'A data was cleared at the identity boundary');
  assertRiverUrl(macRiverUrl);
  await release('account-data'); await refresh; await flush();
  assert.equal(document.querySelector('.account-chip-text strong')?.textContent, profileB.nickname);
  assert.deepEqual(JSON.parse(accountModule.accountStorage().getItem('reysonai:profile:v1')), profileB);
  assert.ok(!document.body.textContent.includes(profileA.nickname));
  assert.equal(document.querySelector('.onboarding'), null);
  assert.ok(historyWrites.every(url => new URL(url).pathname !== '/welcome'));
  assertRiverUrl(macRiverUrl); assertRiverState(macRiverUrl);
  const preflop = `${rootPath}?gametype=cash-6max&depth=100&preflop_actions=F-F-F-R2.5-F&hand=AKo`;
  await act(async () => { window.history.pushState({}, '', preflop); window.dispatchEvent(new window.PopStateEvent('popstate')); }); await flush();
  await traverse('back');
  assertRiverUrl(macRiverUrl); assertRiverState(macRiverUrl);
  assert.equal(document.querySelector('.account-chip-text strong')?.textContent, profileB.nickname);
  assert.equal(window.localStorage.getItem('reysonai:profile:v1'), null);
});

test('a different saved guest profile never replaces the authenticated account profile', async () => {
  const guestProfile = { level: 'beginner', nickname: 'Local guest' };
  const accountProfile = { level: 'intermediate', nickname: 'Account owner' };
  await open(macRiverUrl, { product: true, guestProfile, accountProfile, block: ['account-session', 'account-data'] });
  assert.equal(document.querySelector('.account-chip'), null); assertRiverUrl(macRiverUrl);
  await release('account-session');
  assert.equal(document.querySelector('.account-chip'), null); assertRiverUrl(macRiverUrl);
  await release('account-data');
  assert.equal(document.querySelector('.account-chip-text strong')?.textContent, accountProfile.nickname);
  assert.deepEqual(JSON.parse(accountModule.accountStorage().getItem('reysonai:profile:v1')), accountProfile);
  assert.deepEqual(JSON.parse(window.localStorage.getItem('reysonai:profile:v1')), guestProfile);
  assert.ok(historyWrites.every(url => new URL(url).pathname !== '/welcome'));
  assertRiverUrl(macRiverUrl); assertRiverState(macRiverUrl);
  await act(async () => accountModule.logoutAccount()); await flush();
  assert.equal(accountModule.accountSnapshot().user, null);
  assert.equal(document.querySelector('.account-chip-text strong')?.textContent, guestProfile.nickname);
  assert.ok(!document.body.textContent.includes(accountProfile.nickname));
  assert.deepEqual(accountModule.exportAccountData().data, {});
  assert.deepEqual(JSON.parse(window.localStorage.getItem('reysonai:profile:v1')), guestProfile);
  assert.equal(window.location.pathname, rootPath); assertRiverUrl(macRiverUrl);
});


test('an imported adopted-v7 size label survives delayed sources, retry and Back/Forward', async () => {
  const aliasUrl = `${rootPath}?gametype=cash-6max&depth=100&preflop_actions=R2.5-C-F-F-F-R13-F-C&board=Ac7d2h&flop_actions=B33-C&turn=9h&turn_actions=B75-C&river=Jd&river_actions=X-B75&hand=AKs`;
  const checkUrl = (river, action = "X-B75") => {
    assert.equal(params().get('board'), 'Ac7d2h'); assert.equal(params().get('turn'), '9h');
    assert.equal(params().get('river'), river); assert.equal(params().get('river_actions'), action);
  };
  await open(aliasUrl, { block: ['squeeze-responses'], fail: ['squeeze-responses'] });
  checkUrl('Jd');
  await release('squeeze-responses'); checkUrl('Jd');
  assert.equal(shown(), null);
  failed.delete('squeeze-responses');
  const retry = [...document.querySelectorAll('button')].find(button => button.textContent === 'Retry saved ranges');
  await act(async () => { retry.click(); await settle(); }); await flush();
  checkUrl('Jd'); assert.deepEqual(shown().riverActions, ['check', 'bet75']);
  const newer = aliasUrl.replace('river=Jd', 'river=4h').replace('X-B75', 'X-B125');
  await act(async () => { window.history.pushState({}, '', newer); window.dispatchEvent(new window.PopStateEvent('popstate')); }); await flush();
  checkUrl('4h', 'X-B125'); assert.equal(shown().riverCard, '4h');
  await traverse('back'); checkUrl('Jd'); assert.equal(shown().riverCard, 'Jd');
  await traverse('forward'); checkUrl('4h', 'X-B125'); assert.equal(shown().riverCard, '4h');
});
