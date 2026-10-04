import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, cpSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createExperimentalFlopVetoRuntime } from '../scripts/postflop-ai/experimental-flop-veto-runtime.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const researchRoot = process.env.LOW_FLOP_RESEARCH_ROOT ?? join(repository, '.local/low-flop-research');
const snapshot = join(researchRoot, 'main-baseline');
const available = existsSync(snapshot) && existsSync(join(researchRoot, 'validation-main-case7-n8192.json'));
if (process.env.REQUIRE_LOW_FLOP_RESEARCH === '1' && !available) throw new Error('Pinned low-flop fixture required');
const options = { skip: available ? false : 'Requires restored pinned low-flop research fixture' };
const reports = () => Array.from({ length: 7 }, (_, i) => JSON.parse(readFileSync(join(researchRoot, `validation-main-case${i+1}-n8192.json`), 'utf8')));
const create = (spot, enabled = true, root = researchRoot) => createExperimentalFlopVetoRuntime({ researchRoot: root, spot, enableUnapprovedPreview: enabled });
const decision = report => ({ board: report.board, hero: report.hero, history: report.history });
const freshFixture = () => { const directory = mkdtempSync(join(tmpdir(), 'low-flop-runtime-fixture-')); cpSync(researchRoot, directory, { recursive: true }); return directory; };

test('experimental runtime refuses missing/unknown contexts rather than fabricating a strategy', async t => {
  t.diagnostic(`runtime-environment ${JSON.stringify({ node: process.version, versions: process.versions })}`);
  assert.equal((await createExperimentalFlopVetoRuntime()).ready, false);
  assert.equal((await create('unknown-spot')).ready, false);
  assert.equal((await create('BTN_open_BB_call', true, join(tmpdir(), 'missing-low-flop-fixture'))).ready, false);
});

test('default runtime is unchanged and no receipt or production approval is created', options, async () => {
  const instances = new Map();
  for (const report of reports()) {
    if (!instances.has(report.spot)) instances.set(report.spot, await create(report.spot, false));
    const instance = instances.get(report.spot); assert.equal(instance.ready, true);
    const result = instance.evaluate(decision(report));
    assert.equal(result.applied, false); assert.deepEqual(result.mix, report.initial.actual);
    assert.equal(instance.production_eligible, false); assert.equal(instance.model.approval, 'none');
    assert.equal(instance.model.mode, 'legacy-control'); assert.equal(instance.runtime, undefined); assert.equal(instance.defence, undefined);
  }
});

test('explicit preview executes the existing gate for the original four contexts only', options, async () => {
  const instances = new Map(); let changed = 0;
  for (const [index, report] of reports().entries()) {
    if (!instances.has(report.spot)) instances.set(report.spot, await create(report.spot));
    const instance = instances.get(report.spot); assert.equal(instance.ready, true);
    const result = instance.evaluate(decision(report));
    assert.deepEqual(result.legacyMix, report.initial.actual);
    assert.deepEqual(result.mix, index < 4 ? report.initial.raw : report.initial.actual);
    assert.equal(result.applied, index < 4); changed += Number(result.applied);
    assert.equal(result.mix.raise, result.legacyMix.raise);
    assert.equal(Object.values(result.mix).reduce((a,b) => a+b, 0), 100);
    assert.equal(result.model.production_eligible, false);
    assert.equal(result.model.family_error_budget_nominal, .01);
  }
  assert.equal(changed, 4);
});

test('runtime rejects changed base code, saved-input bytes, evidence and fixed protocols', options, async () => {
  for (const relative of ['main-baseline/apps/frontend/scripts/postflop-ai/defence.mjs',
    'main-baseline/apps/frontend/src/estimated/opening-ranges.json', 'validation-main-case1-n8192.json', 'validation-plan.json']) {
    const root = freshFixture(); appendFileSync(join(root, relative), '\n');
    assert.equal((await create('BTN_open_BB_call', true, root)).ready, false, relative);
  }
});

test('live evidence/input drift disables an already constructed preview without mutating its legacy mix', options, async () => {
  const root = freshFixture(), preview = await create('BTN_open_BB_call', true, root);
  assert.equal(preview.ready, true); const sample = decision(reports()[0]);
  assert.equal(preview.evaluate(sample).applied, true);
  const file = join(root, 'main-baseline/apps/frontend/src/estimated/opening-ranges.json');
  const before = readFileSync(file); appendFileSync(file, '\n');
  const result = preview.evaluate(sample); assert.equal(result.applied, false); assert.deepEqual(result.mix, result.legacyMix);
  writeFileSync(file, before);
  assert.equal(preview.evaluate(sample).applied, true);
});

test('the closed pinned driver folds in preview and calls in control, then owns continuation', options, async () => {
  for (const enabled of [false, true]) {
    const instance = await create('BTN_open_BB_call', enabled); assert.equal(instance.ready, true);
    const result = instance.playFixedDeal({ board: '8c8d2h', hero: 'KcQh', villain: 'AsKd', runout: '3d4s', history: ['bet75'], seed: 'closed-driver-contract', rootQuantile: .5 });
    assert.equal(result.root_action, enabled ? 'fold' : 'call');
    assert.equal(result.continuation_complete, true); assert.ok(Number.isFinite(result.terminal_net_bb));
    if (enabled) assert.equal(result.terminal_net_bb, 0);
    assert.equal(instance.runtime, undefined); assert.equal(instance.engine, undefined); assert.equal(instance.defence, undefined);
    assert.equal(result.model.experimental_runtime_version, 3);
  }
});

test('foreign engines, callbacks, chip tables and strategies cannot be injected into the closed driver', options, async () => {
  const instance = await create('BTN_open_BB_call'); assert.equal(instance.ready, true);
  const sample = decision(reports()[0]); assert.equal(instance.evaluate(sample).applied, true);
  for (const key of ['engine', 'driver', 'table', 'defence', 'policy', 'random', 'callback', 'runtimeHash']) {
    assert.throws(() => instance.evaluate({ ...sample, [key]: {} }), /Only declared data options/);
    assert.throws(() => instance.playFixedDeal({ ...sample, villain: 'AsKd', runout: '3d4s', seed: 'contract', [key]: {} }), /Only declared data options/);
    assert.equal((await createExperimentalFlopVetoRuntime({ researchRoot, spot: 'BTN_open_BB_call', [key]: {} })).ready, false);
  }
  assert.equal(instance.evaluate(sample).applied, true);
});

test('history iterators, getters, sparse arrays, proxies and extra methods cannot change root versus continuation', options, async () => {
  const instance = await create('BTN_open_BB_call'); assert.equal(instance.ready, true);
  let invoked = 0;
  const iterator = ['bet75']; iterator[Symbol.iterator] = function* () { invoked++; yield invoked === 1 ? 'bet75' : 'bet125'; };
  const getter = []; Object.defineProperty(getter, '0', { get() { invoked++; return 'bet75'; }, configurable: true });
  const method = ['bet75']; method.some = () => { invoked++; return false; };
  const proxy = new Proxy(['bet75'], { get() { invoked++; return 'bet125'; }, getOwnPropertyDescriptor() { invoked++; return undefined; } });
  const extraSymbol = ['bet75']; extraSymbol[Symbol('callback')] = () => invoked++;
  for (const history of [iterator, getter, method, proxy, extraSymbol, new Array(1)]) {
    const sample = { board: '8c8d2h', hero: 'KcQh', history };
    assert.throws(() => instance.evaluate(sample), /dense plain data array/);
    assert.throws(() => instance.playFixedDeal({ ...sample, villain: 'AsKd', runout: '3d4s', seed: 'seam-regression' }), /dense plain data array/);
  }
  const optionProxy = new Proxy({}, { getOwnPropertyDescriptor() { invoked++; return undefined; } });
  assert.throws(() => instance.evaluate(optionProxy), /Only declared data options/);
  assert.equal(invoked, 0, 'No caller callback or iterator may run');
  const history = Object.freeze(['bet75']);
  const result = instance.playFixedDeal({ board: '8c8d2h', hero: 'KcQh', villain: 'AsKd', runout: '3d4s', history, seed: 'seam-regression' });
  assert.equal(result.root_action, 'fold'); assert.equal(result.terminal_net_bb, 0); assert.deepEqual(history, ['bet75']);
});

test('full 48-node runtime audit preserves 21542 rows and changes only four exact rows', options, async () => {
  const boards = ['8s5d2c','7s4d2c','6h5h2d','8s7d6c','8c8d2h','5s5d4c','4s4d4c','As7d2c'];
  let rows = 0, changed = 0;
  for (const spot of ['BTN_open_BB_call','UTG_open_BTN_call']) {
    const instance = await create(spot); assert.equal(instance.ready, true);
    for (const board of boards) {
      const stored = JSON.parse(readFileSync(join(researchRoot, `main--${spot}--${board}.json`), 'utf8'));
      for (const node of stored.nodes) for (const combo of node.combos) {
        const result = instance.evaluate({ board: stored.board, hero: combo.cards, history: node.path.flop }); rows++;
        assert.deepEqual(result.legacyMix, combo.actual);
        if (result.applied) {
          changed++; assert.deepEqual(result.mix, combo.raw);
          assert.equal(result.mix.raise, combo.actual.raise);
        } else assert.deepEqual(result.mix, combo.actual);
      }
      instance.releaseBoardCaches();
    }
  }
  assert.equal(rows, 21546); assert.equal(changed, 4);
});
