import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildMw3RangeNavigation } from '../src/estimated/mw3-range-state.ts';
import { mw3DecisionView } from '../scripts/postflop-ai/mw3-runtime.mjs';
import { mw3OriginForSelection } from '../src/estimated/mw3-context.ts';
import { AGENT_TABLE } from '../src/agent/characters.ts';
import { mw3Copy } from '../src/estimated/mw3-copy.ts';
import { LOCALE_KEY } from '../src/locale.ts';
import { deferred, deliveryFixture } from './helpers/mw3-consumer-fixture.mjs';
const rootPath = fileURLToPath(new URL('..', import.meta.url));
const bundleDirectory = mkdtempSync(join(tmpdir(), 'reysonai-mw3-ui-'));
test.after(() => rmSync(bundleDirectory, { recursive: true, force: true }));
async function importConsumerBundle(result, name) {
  // Keep React and React DOM on the test runner's canonical module boundary.
  // File URLs also keep initialization failures from logging a huge data URL.
  const code = result.outputFiles[0].text.replace(/from "(react(?:\/[^"]+)?|react-dom(?:\/[^"]+)?|@phosphor-icons\/react)"/g,
    (_, specifier) => `from "${import.meta.resolve(specifier)}"`);
  const path = join(bundleDirectory, `${name}.mjs`);
  writeFileSync(path, code);
  return import(pathToFileURL(path).href);
}
const bundle = await build({
  stdin: { contents: 'export { useMw3RangeSession, Mw3PostflopTrial } from "./src/estimated/Mw3PostflopTrial.tsx"; export { Mw3RangeView } from "./src/estimated/Mw3RangeView.tsx"; export { ActionPath } from "./src/estimated/RangeWorkspace.tsx";', resolveDir: rootPath, loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react-dom', '@phosphor-icons/react'],
  loader: { '.css': 'empty', '.png': 'dataurl', '.webp': 'dataurl' },
  plugins: [{ name: 'canonical-consumer-boundaries', setup(builder) {
    builder.onResolve({ filter: /(?:mw3-browser|datasets|hand|locale)\.ts$/ }, args => {
      const path = fileURLToPath(new URL(args.path, `file://${args.resolveDir}/`));
      return { path: `file://${path}`, external: true };
    });
  } }],
});
const { useMw3RangeSession, Mw3PostflopTrial, Mw3RangeView, ActionPath } = await importConsumerBundle(bundle, 'range');
const fixture = await deliveryFixture(), kit = await fixture.client.load(fixture.id);
const selection = extra => ({ flopCards: ['As', '7d', '2c'], flopActions: [], turnCard: '', turnActions: [], riverCard: '', riverActions: [], ...extra });
const context = (opener = 'CO', callers = ['BTN', 'BB']) => {
  const spot = mw3OriginForSelection({ rangeType: 'response', opener, callers });
  return { kind: 'mw3_srp', spotId: spot.id, mw3Spot: spot, players: spot.seats, mw3Available: true };
};
const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); };
async function domTest(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://reysonai.test/analyze/ranges', pretendToBeVisual: true });
  const descriptors = new Map();
  for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT']) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] });
  }
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const root = createRoot(document.getElementById('root'));
  try { await run({ root, dom }); }
  finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
    }
  }
}
function Harness({ currentContext, currentSelection, client, active = true }) {
  const state = useMw3RangeSession(currentContext, currentSelection, client, active);
  return React.createElement('div', { 'data-spot': state.view?.spotId ?? '', 'data-board': state.view?.board.join(',') ?? '',
    'data-actions': state.view?.history.map(entry => entry.action).join(',') ?? '', 'data-loading': String(Boolean(state.loading)) },
  currentContext ? React.createElement(Mw3PostflopTrial, { context: currentContext, session: state, cards: currentSelection.flopCards, displayMode: 'standard' }) : null);
}
test('dedicated renderer shows three initial matrices, localized roles and exact combo controls without EV', async () => {
  await domTest(async ({ root }) => {
    const view = mw3DecisionView(kit.inputs, kit.policies, { board: [48, 22, 3], paths: { flop: [] } });
    for (const locale of ['en', 'ja', 'zh-CN', 'es']) {
      window.localStorage.setItem(LOCALE_KEY, locale);
      await act(async () => root.render(React.createElement(Mw3RangeView, { view, locale })));
      assert.equal(document.querySelectorAll('.mw3-tables > .matrix-panel').length, 3);
      const html = document.body.innerHTML;
      assert.doesNotMatch(html, /hand-ev|best.EV|GTO solution/i);
      const cell = document.querySelector('.mw3-tables .matrix-panel:first-child button:not(.unreachable-hand):not([disabled])');
      assert.ok(cell);
      await act(async () => cell.click());
      assert.equal(document.querySelectorAll('.mw3-tables > .matrix-panel').length, 3);
      assert.ok(document.querySelector('.mw3-hand-detail select'));
      assert.ok(document.querySelector('.mw3-hand-detail select').options.length > 1);
      const close = document.querySelector('.mw3-hand-detail .icon-button');
      await act(async () => close.click()); assert.equal(document.querySelector('.mw3-hand-detail'), null);
    }
  });
});
test('empty registry renders each participant unavailable; no query can activate the delivery client', () => {
  const html = renderToStaticMarkup(React.createElement(Mw3PostflopTrial, { context: context(), cards: ['', '', ''], session: { loading: false, approved: false, failed: false } }));
  assert.equal((html.match(/missing-range-panel/g) ?? []).length, 3);
  assert.ok(html.includes(mw3Copy().unavailable)); assert.doesNotMatch(html, /strategy-cell|onClick.*generate/);
});
test('late source success/failure cannot replace a newer spot or a reset even if an injected reader ignores cancellation', async () => {
  const other = await deliveryFixture({ id: 'HJ_open_CO_call_BTN_call' }), otherKit = await other.client.load(other.id);
  for (const fail of [false, true]) await domTest(async ({ root }) => {
    const gate = deferred();
    const client = { supportsSpot: () => true, load: id => id === fixture.id ? gate.promise : Promise.resolve(otherKit) };
    const render = (currentContext, active = true) => act(async () => root.render(React.createElement(Harness, { currentContext, currentSelection: selection(), client, active })));
    await render(context());
    await render(context('HJ', ['CO', 'BTN'])); await flush();
    assert.equal(document.querySelector('[data-spot]').dataset.spot, other.id);
    await act(async () => { if (fail) gate.reject(Error('superseded')); else gate.resolve(kit); }); await flush();
    assert.equal(document.querySelector('[data-spot]').dataset.spot, other.id);
    await render(null, false); await flush();
    assert.equal(document.querySelector('[data-spot]').dataset.spot, ''); assert.equal(document.querySelector('.mw3-range-view'), null);
  });
});
test('rewind and board replacement render only the newest numerical view and keep all original roles', async () => {
  await domTest(async ({ root }) => {
    const client = { supportsSpot: () => true, load: async () => kit };
    const render = currentSelection => act(async () => root.render(React.createElement(Harness, { currentContext: context(), currentSelection, client })));
    await render(selection()); await flush();
    await render(selection({ flopActions: ['check', 'check'] }));
    await render(selection()); await flush();
    assert.equal(document.querySelector('[data-actions]').dataset.actions, '');
    await render(selection({ flopCards: ['Kh', '9d', '4c'] })); await flush();
    assert.equal(document.querySelector('[data-board]').dataset.board, [45, 30, 11].join(','));
    assert.equal(document.querySelectorAll('.mw3-tables > .matrix-panel').length, 3);
  });
});

// A test-only module boundary controls the already-reached hand. Production
// AgentTablePage still imports the actual pure hand runner and accepts only its
// dedicated delivery interface; no query string or browser storage injects it.
const agentBundle = await build({ entryPoints: [fileURLToPath(new URL('../src/agent/AgentTable.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', external: ['react', 'react-dom', '@phosphor-icons/react'],
  loader: { '.css': 'empty', '.png': 'dataurl', '.webp': 'dataurl' },
  plugins: [{ name: 'test-only-reached-agent-hand', setup(builder) {
    builder.onResolve({ filter: /\/hand\.ts$|^\.\/hand\.ts$/ }, () => ({ path: 'reached-hand', namespace: 'mw3-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'mw3-test' }, () => ({ contents: 'export const categoryName = () => ""; export const playHand = setup => globalThis.__MW3_AGENT_PLAY(setup);', loader: 'js' }));
    builder.onResolve({ filter: /(?:mw3-browser|datasets|locale)\.ts$/ }, args => ({ path: new URL(args.path, `file://${args.resolveDir}/`).href, external: true }));
  } }],
});
const { AgentTablePage: ReachedAgentTable } = await importConsumerBundle(agentBundle, 'agent');
test('superseded Agent loading cannot settle a remounted new hand or write points/history', async () => {
  for (const fail of [false, true]) await domTest(async ({ root }) => {
    const gate = deferred(); let phase = 'old', loads = 0, plays = 0;
    const base = { holeCards: Object.fromEntries(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'].map(pos => [pos, ['2s', '3s']])), board: [], log: [] };
    globalThis.__MW3_AGENT_PLAY = () => { plays++; return { ...base, status: phase === 'old' ? 'needs_postflop' : 'unavailable', postflopKind: 'mw3_srp', spotId: fixture.id }; };
    const client = { supportsSpot: () => true, load: async () => { loads++; return gate.promise; } };
    try {
      await act(async () => root.render(React.createElement(ReachedAgentTable, { key: 'old', tableId: AGENT_TABLE.id, watch: true, onExit() {}, mw3Client: client })));
      await flush(); assert.equal(loads, 1);
      phase = 'new';
      await act(async () => root.render(React.createElement(ReachedAgentTable, { key: 'new', tableId: AGENT_TABLE.id, watch: true, onExit() {}, mw3Client: client })));
      await flush(); const currentPlays = plays;
      assert.match(document.querySelector('.agent-note').textContent, /unavailable/);
      await act(async () => { if (fail) gate.reject(Error('old delivery failed')); else gate.resolve(kit); }); await flush();
      assert.equal(plays, currentPlays, 'cancelled old consumer must not schedule a new hand replay');
      assert.equal(localStorage.getItem('reysonai:agent-hands:v1'), null);
      assert.equal(document.querySelector('.agent-recent'), null);
      assert.ok([...document.querySelectorAll('.agent-standings b')].every(element => element.textContent === '0'));
      assert.equal(document.querySelector('.agent-result'), null);
    } finally { delete globalThis.__MW3_AGENT_PLAY; }
  });
});
test('an injected interface cannot render an unverified copied policy kit', async () => {
  await domTest(async ({ root }) => {
    const client = { supportsSpot: () => true, load: async () => ({ ...kit }) };
    await act(async () => root.render(React.createElement(Harness, { currentContext: context(), currentSelection: selection(), client })));
    await flush();
    assert.equal(document.querySelector('.mw3-range-view'), null);
    assert.equal(document.querySelectorAll('.missing-range-panel').length, 3);
    assert.equal(document.querySelector('[data-spot]').dataset.spot, '');
  });
});
test('shared chronological strip clicks all three seats, rewinds and reaches turn/river without a separate MW3 action row', async () => {
  await domTest(async ({ root }) => {
    let current = selection();
    function StripHarness() {
      const [state, setState] = React.useState(current);
      current = state;
      const navigation = buildMw3RangeNavigation(kit.inputs.spot, state);
      return React.createElement(ActionPath, { expanded: true, blocks: navigation.blocks,
        onFlopAction: (block, action) => setState(value => ({ ...value, flopActions: [...value.flopActions.slice(0, block.flopIndex), action], turnCard: '', turnActions: [], riverCard: '', riverActions: [] })),
        onLaterAction: (block, action) => setState(value => block.street === 'turn'
          ? { ...value, turnActions: [...value.turnActions.slice(0, block.laterIndex), action], riverCard: '', riverActions: [] }
          : { ...value, riverActions: [...value.riverActions.slice(0, block.laterIndex), action] }),
        onRewindActionBlock: block => setState(value => !block.street
          ? { ...value, flopActions: value.flopActions.slice(0, block.flopIndex), turnCard: '', turnActions: [], riverCard: '', riverActions: [] }
          : block.street === 'turn' ? { ...value, turnActions: value.turnActions.slice(0, block.laterIndex), riverCard: '', riverActions: [] }
            : { ...value, riverActions: value.riverActions.slice(0, block.laterIndex) }),
        onOpenLaterCard: street => setState(value => ({ ...value, [street === 'turn' ? 'turnCard' : 'riverCard']: street === 'turn' ? '3h' : '4h' })),
      });
    }
    await act(async () => root.render(React.createElement(StripHarness)));
    const activeCheck = () => [...document.querySelectorAll('.action-seat.active .action-seat-options > button')].find(button => button.textContent === 'Check');
    for (let seat = 0; seat < 3; seat++) {
      assert.equal(document.querySelector('.action-seat.active .action-seat-position').textContent, ['BB', 'CO', 'BTN'][seat]);
      await act(async () => activeCheck().click());
    }
    assert.deepEqual(current.flopActions, ['check', 'check', 'check']);
    assert.equal(document.querySelectorAll('.mw3-actions').length, 0);
    await act(async () => document.querySelector('.action-seat-board-later').click());
    assert.equal(current.turnCard, '3h');
    for (let seat = 0; seat < 3; seat++) await act(async () => activeCheck().click());
    const river = [...document.querySelectorAll('.action-seat-board-later')].at(-1);
    await act(async () => river.click()); assert.equal(current.riverCard, '4h');
    for (let seat = 0; seat < 3; seat++) await act(async () => activeCheck().click());
    assert.deepEqual(current.riverActions, ['check', 'check', 'check']); assert.match(document.querySelector('.action-seat-end').textContent, /Showdown/);
    await act(async () => document.querySelector('.action-seat-flop .action-seat-position').click());
    assert.deepEqual(current.flopActions, []); assert.equal(current.turnCard, ''); assert.equal(current.riverCard, '');
    assert.equal(document.querySelector('.action-seat.active .action-seat-position').textContent, 'BB');
  });
});
test('actual Agent A/B/A/C hand reuse touches Table and delivery LRU without replay loops', async () => {
  const second = await deliveryFixture({ id: 'HJ_open_CO_call_BTN_call' }), third = await deliveryFixture({ id: 'UTG_open_HJ_call_BB_call' });
  const fixtures = [fixture, second, third], transports = new Map(fixtures.flatMap(item => [...item.transports]));
  const { createMw3DeliveryClient } = await import('../src/estimated/mw3-browser.ts');
  let reads = 0;
  const client = createMw3DeliveryClient({ registry: fixtures.flatMap(item => item.pins), readDataset: fixture.readers.readDataset,
    readManifest: async hash => { reads++; return transports.get(hash).headerText; },
    readPart: async (hash, part) => { const row = transports.get(hash).parts[part]; return { part, body: row.body }; } });
  await domTest(async ({ root }) => {
    const timers = new Map(); let timerId = 0, latestSetup, plays = 0;
    window.localStorage.setItem('reysonai:agent-speed', '"fast"');
    window.setTimeout = callback => { const id = ++timerId; timers.set(id, callback); return id; };
    window.clearTimeout = id => timers.delete(id);
    const ids = [fixture.id, second.id, fixture.id, third.id];
    globalThis.__MW3_AGENT_PLAY = setup => {
      latestSetup = setup; plays++;
      const handNo = Number(setup.seed.split('|').at(-1)), id = ids[handNo];
      const loaded = setup.mw3.kit(id);
      const base = { holeCards: Object.fromEntries(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'].map(pos => [pos, ['2s', '3s']])), board: [], log: [], spotId: id, postflopKind: 'mw3_srp' };
      return loaded ? { ...base, status: 'done', returns: Object.fromEntries(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'].map(pos => [pos, 0])), winners: ['CO'], pot: 8, rake: 0, showdown: false }
        : { ...base, status: 'needs_postflop' };
    };
    try {
      await act(async () => root.render(React.createElement(ReachedAgentTable, { tableId: AGENT_TABLE.id, watch: true, onExit() {}, mw3Client: client })));
      for (let handNo = 0; handNo < 4; handNo++) {
        for (let tick = 0; tick < 100 && !document.querySelector('.agent-result'); tick++) await flush();
        assert.ok(document.querySelector('.agent-result'), `hand ${handNo} must finish`);
        assert.ok(plays < 30, 'touching a cache must not cause an unbounded replay loop');
        if (handNo < 3) {
          const timer = [...timers.values()].at(-1); assert.ok(timer);
          await act(async () => timer()); await flush();
        }
      }
      assert.equal(reads, 6, 'A/B/A/C needs three deliveries, not four');
      assert.ok(latestSetup.mw3.kit(fixture.id)); assert.equal(latestSetup.mw3.kit(second.id), undefined);
      assert.equal(await client.load(fixture.id), latestSetup.mw3.kit(fixture.id)); assert.equal(reads, 6);
    } finally { delete globalThis.__MW3_AGENT_PLAY; }
  });
});
