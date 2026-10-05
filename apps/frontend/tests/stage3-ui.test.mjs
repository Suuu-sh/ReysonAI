import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stage3RootDescriptors } from '../src/estimated/stage3-catalog.ts';
import { stage3TreeForRoot, normalizeStage3Selection, chooseStage3Action, appendStage3Blocks, stage3LiveSeats, withStage3Entrances } from '../src/estimated/stage3-flow.ts';
import { createStage3UiRuntime, createStage3UiLoader, withStage3Availability, stage3SourceNames } from '../src/estimated/stage3-ranges.ts';
import { stage3Copy } from '../src/estimated/stage3-copy.ts';
const names = stage3SourceNames.filter(name => name !== 'stage3-responses');
const data = Object.fromEntries(names.map(name => [name, JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url), 'utf8'))]));
const base = () => ['UTG','HJ','CO','BTN','SB','BB'].map(position => ({ key: position, position, options: [], kind: 'seat' }));
const root = stage3RootDescriptors.find(root => root.family === 'cold_four_bet_extra');

test('Stage3 root navigation retains exact history, stack, sizes and selected actor', () => {
  for (const root of stage3RootDescriptors) {
    const tree = stage3TreeForRoot(root.id);
    const state = normalizeStage3Selection(root.id);
    const blocks = appendStage3Blocks(base(), root, state);
    const current = blocks.at(-1);
    assert.equal(current.stage3Node.id, tree.root.first_decision_id);
    assert.equal(current.position, root.entrant);
    assert.equal(current.stack, String(100 - current.stage3Node.contributions_bb[root.entrant]));
    assert.deepEqual(blocks.slice(0,-1).map(block => block.position), root.history.map(event => event.seat));
    assert.deepEqual(stage3LiveSeats(blocks), current.stage3Node.live_participants);
  }
});

test('every Stage3 terminal replays with exact actor order and forced folds', () => {
  let checked = 0;
  for (const root of stage3RootDescriptors) {
    const tree = stage3TreeForRoot(root.id);
    for (const terminal of tree.terminals) {
      const actions = [terminal.parent_action];
      let node = tree.nodes.get(terminal.parent_id);
      while (node.parent_id) { actions.push(node.parent_action); node = tree.nodes.get(node.parent_id); }
      actions.reverse();
      const state = normalizeStage3Selection(root.id, actions);
      const blocks = appendStage3Blocks(base(), root, state);
      assert.equal(blocks.at(-1).stage3Terminal?.id, terminal.id);
      assert.equal(blocks.length, terminal.history.length + 1);
      assert.deepEqual(blocks.slice(0,-1).map(block => block.position), terminal.history.map(event => event.seat));
      assert.deepEqual(blocks.at(-1).postflopEvents, terminal.history);
      checked++;
    }
  }
  assert.equal(checked, 18620);
});

test('Stage3 rewinds and invalid stored actions retain only the legal prefix', () => {
  const first = appendStage3Blocks(base(), root, normalizeStage3Selection(root.id)).at(-1);
  const call = chooseStage3Action(first, 'call');
  assert.deepEqual(call.stage3Actions, ['call']);
  const second = appendStage3Blocks(base(), root, call).at(-1);
  assert.deepEqual(chooseStage3Action(second, null).stage3Actions, ['call']);
  assert.deepEqual(normalizeStage3Selection(root.id, ['call', 'garbage', 'fold']).stage3Actions, ['call']);
  assert.equal(normalizeStage3Selection('missing'), null);
  const fold = chooseStage3Action(first, 'fold');
  assert.equal(fold.stage3RootId, null);
  assert.deepEqual(fold.stage3Actions, []);
  assert.equal(fold.coldAction.action, 'raise');
});

test('rare histories use a conservative exact-source bound; missing sources stay missing', () => {
  const runtime = createStage3UiRuntime(data);
  const rare = stage3RootDescriptors.filter(root => root.rare_eligible);
  assert.equal(rare.length, 7);
  for (const root of rare) {
    const tree = stage3TreeForRoot(root.id);
    const ref = { kind:'stage3', rootId:root.id, id:tree.root.first_decision_id };
    const result = runtime.select(ref);
    assert.equal(result.status, 'rare');
    assert.ok(result.reach.joint_reach_upper_bound < 0.0001);
    assert.equal(createStage3UiRuntime({ ...data, 'opening-ranges':null }).select(ref).status, 'missing');
  }
  const tree = stage3TreeForRoot(root.id);
  assert.equal(runtime.select({ kind:'stage3', rootId:root.id, id:tree.root.first_decision_id }).status, 'missing');
});

test('missing and rare Stage3 strategies cannot enable a new action', () => {
  const state = normalizeStage3Selection(root.id);
  const raw = appendStage3Blocks(base(), root, state);
  for (const runtime of [null, createStage3UiRuntime(data)]) {
    const blocks = withStage3Availability(raw, runtime);
    assert.ok(blocks.at(-1).options.every(option => option.disabled));
  }
});

test('Stage3 lazy loader fetches no equities, coverage, audit or reasons and retries only absent sources', async () => {
  const calls = new Map();
  const load = createStage3UiLoader(async name => { calls.set(name, (calls.get(name) ?? 0)+1); return data[name] ?? null; });
  const one = load(); assert.equal(load(), one);
  const first = await one;
  assert.deepEqual(first.missingSources, ['stage3-responses']);
  await load();
  assert.equal(calls.get('stage3-responses'), 2);
  assert.ok(names.every(name => calls.get(name) === 1));
  assert.ok([...calls.keys()].every(name => !/equities|coverage|audit|reasons\//.test(name)));
});

test('Stage3 omission copy is explicit in all four supported languages', () => {
  for (const locale of ['en','ja','zh-CN','es']) {
    assert.ok(stage3Copy('rare', locale));
    assert.match(stage3Copy('rareDetail', locale), /0[.,]01%/);
  }
});

test('Stage3 shared URLs retain each root and validated deep choices', async () => {
  const { encodeRangeUrl, decodeRangeUrl, buildRangeUrlActionBlocks } = await import('../src/estimated/range-url.ts');
  for (const root of stage3RootDescriptors) {
    const tree = stage3TreeForRoot(root.id);
    for (const terminal of [tree.terminals[0], tree.terminals.at(-1)]) {
      const actions = [terminal.parent_action];
      let node = tree.nodes.get(terminal.parent_id);
      while (node.parent_id) { actions.push(node.parent_action); node = tree.nodes.get(node.parent_id); }
      const state = normalizeStage3Selection(root.id, actions.reverse());
      const restored = decodeRangeUrl(encodeRangeUrl(state));
      assert.equal(restored.stage3RootId, root.id);
      assert.deepEqual(restored.stage3Actions, state.stage3Actions);
      assert.equal(buildRangeUrlActionBlocks(restored).at(-1).stage3Terminal.id, terminal.id);
    }
  }
});

test('Stage3 histories never borrow a HU postflop policy', async () => {
  const { completedFlopContext } = await import('../src/estimated/postflop-trial.ts');
  const terminal = stage3TreeForRoot(root.id).terminals.find(node => node.terminal === 'flop');
  const tree = stage3TreeForRoot(root.id), actions = [terminal.parent_action];
  let node = tree.nodes.get(terminal.parent_id);
  while (node.parent_id) { actions.push(node.parent_action); node = tree.nodes.get(node.parent_id); }
  const state = normalizeStage3Selection(root.id, actions.reverse());
  const blocks = appendStage3Blocks(base(), root, state);
  const context = completedFlopContext({ ...state, actionBlocks:blocks, isDefaultTable:true });
  assert.equal(context.pilotAvailable, false);
  assert.equal(context.spotId, null);
  assert.deepEqual(context.players, terminal.live_participants);
});

test('an already-folded BB legacy path does not revive a Stage3 pending decision', async () => {
  const { stage3RootForSelection } = await import('../src/estimated/stage3-flow.ts');
  const { encodeRangeUrl, decodeRangeUrl } = await import('../src/estimated/range-url.ts');
  const state = { rangeType:'response', opener:'UTG', hero:'BB', callers:['HJ','CO','BTN'], foldedHero:true, pendingRaise:null };
  assert.equal(stage3RootForSelection(state), null);
  const url = encodeRangeUrl(state);
  assert.ok(!url.includes('stage3_root'));
  assert.equal(decodeRangeUrl(url).foldedHero, true);
});

test('fourth-caller UI validates a predecessor against its own exact root', async () => {
  // Broad structural-only fixtures, never published or accepted by the offline
  // strategy audit. They exercise a currently rare branch without editing data.
  const { hands } = await import('../src/data.ts');
  const { stage3Families, STAGE3_ACTIONS } = await import('../src/estimated/stage3-catalog.ts');
  const broad = Object.fromEntries(['opening-ranges','preflop-ranges','multiway-responses','multiway2-responses'].map(name => [name, structuredClone(data[name])]));
  const revise = (name, id, values) => {
    const spot = broad[name].spots.find(spot => spot.id === id);
    spot.hands = spot.hands.map(row => ({ ...row, ...values }));
  };
  revise('opening-ranges', 'UTG_open', { open:100, fold:0, open_size_bb:2.5 });
  revise('preflop-ranges', 'HJ_vs_UTG', { call:99, three_bet:1, fold:0, three_bet_size_bb:8 });
  revise('multiway-responses', 'CO_vs_UTG_HJcall', { call:99, squeeze:1, fold:0, squeeze_size_bb:12 });
  revise('multiway2-responses', 'BTN_vs_UTG_HJcall_COcall', { call:100, squeeze:0, fold:0, squeeze_size_bb:null });
  const four = stage3RootDescriptors.find(root => root.family === 'four_callers');
  const three = stage3RootDescriptors.find(root => root.family === 'three_callers' && root.entrant === 'SB');
  const nodeFor = root => { const tree = stage3TreeForRoot(root.id); return tree.nodes.get(tree.root.first_decision_id); };
  const asSpot = node => ({ ...node, unreachable:false, hands:hands.map(hand => ({ hand, fold:0, call:100, squeeze:0, four_bet:0, all_in:0, raise_to_size_bb:null })) });
  const dataset = spots => ({ metadata:{ families:stage3Families, schema_version:'1.0', storage:'reachable-nonrare-only', strategy_type:'ai_estimate_not_gto',
    effective_stack_bb:100, ante_bb:0, legal_actions:STAGE3_ACTIONS, rake:{rate:0.05,cap_bb:3,no_flop_no_drop:true} },
    spots, spot_count:spots.length, hand_classes_per_spot:169, entry_count:spots.length*169, catalog_spot_count:16132, omitted_rare_count:0, omitted_unreachable_count:16132-spots.length });
  const first = asSpot(nodeFor(three)), current = asSpot(nodeFor(four));
  const ref = { kind:'stage3', rootId:four.id, id:current.id };
  assert.equal(createStage3UiRuntime({ ...broad, 'stage3-responses':dataset([first,current]) }).select(ref).status, 'saved');
  assert.equal(createStage3UiRuntime({ ...broad, 'stage3-responses':dataset([current]) }).select(ref).status, 'missing');
});


test('zero joint-support hands never describe fold placeholders as a recommended mix', async () => {
  const { englishPreflopReason } = await import('../src/estimated/english-reasons.ts');
  const hand = {hand:'AKs',fold:100,call:0,squeeze:0,four_bet:0,all_in:0};
  const detailed = {reason:'同じカードを同時に配ることはできません。',facts:{reach_pct:0}};
  assert.match(englishPreflopReason(hand,detailed,{},'en'), /card compatibility.*placeholder.*not a recommendation/);
  assert.match(englishPreflopReason(hand,detailed,{},'zh-CN'), /占位值/);
  assert.match(englishPreflopReason(hand,detailed,{},'es'), /marcador de posición/);
  assert.doesNotMatch(englishPreflopReason(hand,detailed,{},'en'), /Saved action mix/);
});
