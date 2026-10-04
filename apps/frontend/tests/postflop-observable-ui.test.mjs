import test from 'node:test';
import assert from 'node:assert/strict';
import { POSTFLOP_SPOTS, spotById } from '../scripts/postflop-ai/spots.mjs';
import { replayObservableStreet } from '../scripts/postflop-ai/observable-actions.mjs';
import { flopDecision, laterDecision, laterStart, replayLater, buildFlopActionBlocks,
  buildLaterActionBlocks, canonicalStreetActions, hasObservablePostflopActions } from '../src/estimated/postflop-trial.ts';
import { decodeRangeUrl, encodeRangeUrl } from '../src/estimated/range-url.ts';

const representative = spotById('UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
const contextFor = spot => ({ spotId: spot.id, ip: spot.ip, oop: spot.oop, potBb: spot.potBb, stackBb: spot.stackBb, tree: spot.tree, pilotAvailable: true });
const context = contextFor(representative);
const streetStart = () => {
  const flop = laterStart(['bet33', 'call'], context);
  const turn = replayLater('turn', ['bet75', 'call'], flop, context);
  return { pot: turn.pot, stacks: turn.stacks, lastAggressor: turn.lastAggressor };
};
const url = river => '/analyze/ranges?gametype=cash-6max&depth=100&preflop_actions=R2.5-C-F-F-F-R13-F-C'
  + '&board=Ac7d2h&flop_actions=B33-C&turn=9h&turn_actions=B75-C&river=Jd&river_actions=' + river + '&hand=AKs';

test('UI context opts in through verified catalog spotId; all legacy geometries stay outside the action model', () => {
  assert.equal(context.history, undefined);
  assert.equal(hasObservablePostflopActions(context), true);
  for (const spot of POSTFLOP_SPOTS.filter(spot => !spot.history)) assert.equal(hasObservablePostflopActions(contextFor(spot)), false, spot.id);
  assert.equal(hasObservablePostflopActions(undefined), false);
});

test('new-HU Range shows one actual all-in action and every imported river alias has the same full decision', () => {
  const start = streetStart();
  assert.deepEqual(start.stacks, { ip: 41.32, oop: 41.32 });
  assert.equal(start.pot, 120.36);
  const before = laterDecision('river', ['check'], start, context);
  assert.deepEqual(before.options.map(item => item.action), ['check', 'allin']);
  assert.equal(before.labels.allin, 'All-in 41.32');
  assert.equal(before.labelsJa.allin, 'オールイン 41.32');
  const expected = laterDecision('river', ['check', 'allin'], start, context);
  assert.equal(expected.node, 'river_oop_vs_allin');
  assert.deepEqual(expected.options.map(item => item.action), ['fold', 'call']);
  for (const alias of ['bet33', 'bet75', 'bet125', 'allin']) {
    assert.deepEqual(laterDecision('river', ['check', alias], start, context), expected);
    assert.deepEqual(canonicalStreetActions('river', ['check', alias], start, context), ['check', 'allin']);
  }
});

test('flop and turn without explicit allin use a real node but only one physical all-in option', () => {
  const spot = POSTFLOP_SPOTS.find(spot => spot.history && spot.potBb === 79);
  assert.ok(spot, 'real high-pot catalog geometry');
  const ctx = contextFor(spot), decision = flopDecision([], ctx);
  const allins = decision.options.filter(option => option.allIn);
  assert.equal(allins.length, 1);
  assert.equal(allins[0].action, 'bet75');
  assert.match(allins[0].label, /^All-in /);
  assert.deepEqual(flopDecision(['bet75'], ctx), flopDecision(['bet125'], ctx));
  assert.equal(buildFlopActionBlocks(['bet125'], ctx).find(block => block.kind === 'flop').chosen, 'bet75');
  const start = { pot: 120.36, stacks: { ip: 41.32, oop: 41.32 }, lastAggressor: null };
  const turn = laterDecision('turn', [], start, context);
  assert.deepEqual(turn.options.map(item => item.action), ['check', 'bet33']);
  assert.equal(turn.labels.bet33, 'All-in 41.32');
  assert.equal(turn.labelsJa.bet33, 'オールイン 41.32');
});

test('old impossible raise remains effective call, explicit allin raise and any effective-call suffix reject', () => {
  const start = streetStart();
  assert.deepEqual(canonicalStreetActions('river', ['check', 'bet75', 'raise'], start, context), ['check', 'allin', 'call']);
  assert.throws(() => canonicalStreetActions('river', ['check', 'allin', 'raise'], start, context), /Illegal/);
  assert.throws(() => canonicalStreetActions('river', ['check', 'bet75', 'raise', 'fold'], start, context), /Illegal/);
});

test('percentage URL tokens retain old legality and decode to the same river class without losing board intent', () => {
  const expected = decodeRangeUrl(url('X-AI'));
  assert.deepEqual(expected.riverActions, ['check', 'allin']);
  assert.equal(expected.riverCard, 'Jd');
  for (const alias of ['B33', 'B75', 'B125', 'AI']) {
    const decoded = decodeRangeUrl(url(`X-${alias}`));
    assert.deepEqual(decoded, expected);
    assert.equal(new URL(encodeRangeUrl(decoded), 'https://example.invalid').searchParams.get('river_actions'), 'X-AI');
  }
  assert.deepEqual(decodeRangeUrl(url('X-B75-R')).riverActions, ['check', 'allin', 'call']);
  assert.deepEqual(decodeRangeUrl(url('X-AI-R')).riverActions, ['check', 'allin']);
  assert.deepEqual(decodeRangeUrl(url('X-B75-R-F')).riverActions, ['check', 'allin', 'call']);
});

test('new-HU action strip highlights the canonical river choice and preserves the completed showdown', () => {
  const blocks = buildLaterActionBlocks({ flopActions: ['bet33', 'call'], turnCard: '9h', turnActions: ['bet75', 'call'],
    riverCard: 'Jd', riverActions: ['check', 'bet75', 'raise'] }, context);
  const chosen = blocks.filter(block => block.street === 'river' && block.kind === 'flop').map(block => block.chosen);
  assert.deepEqual(chosen, ['check', 'allin', 'call']);
  assert.match(blocks.at(-1).result, /ショウダウン|ショーダウン/);
});

test('all407 new catalog entry geometries share the pure transition projection and class option count', () => {
  const spots = POSTFLOP_SPOTS.filter(spot => spot.history && spot.reachable);
  assert.equal(spots.length, 407);
  for (const spot of spots) {
    const replay = replayObservableStreet({ spot, street: 'flop', actions: [] });
    const shown = flopDecision([], contextFor(spot));
    assert.equal(shown.node, replay.state.node, spot.id);
    assert.equal(shown.potBb, replay.pot, spot.id);
    assert.deepEqual(shown.options.map(item => item.action), replay.observation.classes.map(item => item.action), spot.id);
    for (const group of replay.observation.classes) {
      const option = shown.options.find(item => item.action === group.action);
      assert.equal(option.allIn, group.allIn, spot.id);
      assert.equal(option.amountBb, group.action === 'call' ? group.paid : group.amountBb, spot.id);
    }
  }
});


test('encoding an old raw state emits one canonical URL and leaves its input unchanged', () => {
  const state = { ...decodeRangeUrl(url('X-AI')), riverActions: ['check', 'bet125'] };
  const before = structuredClone(state);
  assert.equal(new URL(encodeRangeUrl(state), 'https://example.invalid').searchParams.get('river_actions'), 'X-AI');
  assert.deepEqual(state, before);
});

test('actual Range titles and Agent labels use all-in metadata, including singleton size tokens', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: 'automatic' } });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    const { nodeTitle, laterNodeTitle } = await server.ssrLoadModule('/src/estimated/PostflopTrial.tsx');
    const { actionLabel, AgentActionSizeHint } = await server.ssrLoadModule('/src/agent/AgentTable.tsx');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    for (const key of ['bet33', 'bet75', 'bet125']) {
      assert.equal(renderToStaticMarkup(createElement(AgentActionSizeHint, { option: { key, allIn: true } })), '', `${key}: no nominal percent below physical all-in`);
      assert.equal(renderToStaticMarkup(createElement(AgentActionSizeHint, { option: { key } })), `<small>${key.slice(3)}%</small>`, `${key}: unchanged legacy hint`);
    }
    const { LOCALE_KEY, rememberLocale, productLocale } = await server.ssrLoadModule('/src/locale.ts');
    const saved = new Map();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
      getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value),
    } } });
    const decision = { actor: 'HJ', facedAction: { action: 'bet75', allIn: true, amountBb: 60.5 } };
    rememberLocale('en');
    assert.equal(saved.get(LOCALE_KEY), 'en');
    assert.equal(productLocale(), 'en');
    assert.equal(nodeTitle('ip_vs_75', context, decision), 'HJ · facing an all-in');
    assert.equal(laterNodeTitle('turn_ip_vs_33', context, 'turn', decision), 'HJ · Turn · facing an all-in');
    assert.equal(actionLabel({ action: 'bet75', to: 60.5, allIn: true }), 'All-in 60.5');
    assert.equal(actionLabel({ action: 'bet75', to: 59.25 }), 'Bet 59.25', 'legacy entries have no added metadata');
    rememberLocale('ja');
    assert.equal(productLocale(), 'ja');
    assert.equal(nodeTitle('ip_vs_75', context, decision), 'HJ · オールインへの応答');
    assert.equal(laterNodeTitle('turn_ip_vs_33', context, 'turn', decision), 'HJ · ターン · オールインへの応答');
    assert.equal(actionLabel({ action: 'bet75', to: 60.5, allIn: true }), 'オールイン 60.5');
    assert.equal(actionLabel({ action: 'bet75', to: 59.25 }), 'ベット 59.25');
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
    await server.close();
  }
});
