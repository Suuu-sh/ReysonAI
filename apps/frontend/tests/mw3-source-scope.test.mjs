import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { currentMw3ArchiveIdentity, sourcePathsFor } from '../scripts/postflop-ai/mw3-reviewed-snapshot.mjs';
import { loadMw3Catalog } from '../scripts/postflop-ai/mw3-inputs.mjs';

const frontend = 'apps/frontend/';
const presentation = [
  'src/estimated/Mw3RangeView.tsx', 'src/estimated/RangeWorkspace.tsx',
  'src/agent/AgentTable.tsx', 'src/agent/gameplay-mobile.css',
  'src/trainer/RankedStats.tsx',
];
const identities = loadMw3Catalog().filter(spot => spot.reachable).map(spot => currentMw3ArchiveIdentity(spot.id));

test('all sixteen numerical source closures exclude display components, styles and general backend dispatch', () => {
  assert.equal(identities.length, 16);
  for (const identity of identities) {
    const paths = sourcePathsFor(identity);
    assert.deepEqual(paths, [...new Set(paths)].sort());
    assert.deepEqual(paths.filter(path => /\.(?:tsx|css)$/.test(path)), []);
    for (const path of [...presentation.map(path => frontend + path), 'apps/backend/src/index.ts']) {
      assert.ok(!paths.includes(path), `Presentation/dispatch source must not bind numerical approval: ${path}`);
    }
  }
});

test('presentation roots are skipped before recording or following their imports', () => {
  const identity = identities.find(identity => identity.inputs.spot.id === 'CO_open_BTN_call_BB_call');
  const baseline = sourcePathsFor(identity);
  // Adding real UI roots must not pull their CSS/components into the closure.
  assert.deepEqual(sourcePathsFor({ ...identity, sourceFiles: [...identity.sourceFiles, ...presentation] }), baseline);
  // Excluded files need not be read: skip is applied before filesystem traversal.
  assert.deepEqual(sourcePathsFor({ ...identity, sourceFiles: [...identity.sourceFiles, 'src/not-a-real-component.tsx', 'src/not-a-real-style.css'] }), baseline);
  assert.throws(() => sourcePathsFor({ ...identity, sourceFiles: [...identity.sourceFiles, '../escaped.tsx'] }), /escaped|Unsafe|unsafe/);
});

test('protected imports into excluded UI fail at the dependency edge, before filtering or reading UI', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), 'mw3-source-scope-edge-'));
  try {
    // A separate source-only tree avoids mutating the checkout or other tests.
    const paths = [...new Set(identities.flatMap(identity => sourcePathsFor(identity)))];
    for (const path of paths) {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      copyFileSync(join(root, path), join(directory, path));
    }
    const sourceFiles = identities.map(({ sourceFiles }) => ({ sourceFiles }));
    const cases = [
      ['src/estimated/mw3-browser.ts', "import { Ui } from './Mw3RangeView.tsx';", 'src/estimated/Mw3RangeView.tsx'],
      ['src/estimated/mw3-browser.ts', "import './mw3-range.css';", 'src/estimated/mw3-range.css'],
      ['src/agent/mw3-hand.ts', "export { Ui } from './AgentTable.tsx';", 'src/agent/AgentTable.tsx'],
      ['src/agent/mw3-hand.ts', "const ui = import('./AgentTable.tsx');", 'src/agent/AgentTable.tsx'],
      // hand.ts is retained transitively via a type import, not an explicit root.
      ['src/agent/hand.ts', "import type { Ui } from './AgentTable.tsx';", 'src/agent/AgentTable.tsx'],
      ['src/agent/hand.ts', "export type { Ui } from './AgentTable.tsx';", 'src/agent/AgentTable.tsx'],
    ];
    const script = String.raw`
      import assert from 'node:assert/strict';
      import { readFileSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      import { pathToFileURL } from 'node:url';
      const [root, serializedIdentities, serializedCases] = process.argv.slice(1);
      const { sourcePathsFor } = await import(pathToFileURL(join(root, 'apps/frontend/scripts/postflop-ai/mw3-reviewed-snapshot.mjs')));
      const identities = JSON.parse(serializedIdentities), cases = JSON.parse(serializedCases);
      const baseline = identities.map(identity => sourcePathsFor(identity));
      for (const [source, statement, target] of cases) {
        const path = join(root, 'apps/frontend', source), before = readFileSync(path);
        try {
          writeFileSync(path, Buffer.concat([before, Buffer.from('\n' + statement + '\n')]));
          for (const identity of identities) assert.throws(() => sourcePathsFor(identity), {
            message: 'Mw3 protected source imports excluded presentation dependency: apps/frontend/' + source + ' -> apps/frontend/' + target,
          });
        } finally { writeFileSync(path, before); }
        assert.deepEqual(identities.map(identity => sourcePathsFor(identity)), baseline);
      }
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', script, directory, JSON.stringify(sourceFiles), JSON.stringify(cases)], { stdio: 'pipe' });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('delivery, authority, shared executable dependencies and strict verification remain protected', () => {
  const required = [
    'apps/backend/src/mw3-transport.ts', 'apps/backend/scripts/sql/mw3-schema.sql', 'apps/shared/mw3-approved.ts',
    `${frontend}src/estimated/mw3-browser.ts`, `${frontend}src/agent/mw3-hand.ts`,
    // hand.ts is no longer an explicit root, but its type import remains bound.
    `${frontend}src/agent/hand.ts`, `${frontend}src/agent/preflop.ts`, `${frontend}src/estimated/datasets.ts`,
    `${frontend}scripts/postflop-ai/mw3-engine.mjs`, `${frontend}scripts/postflop-ai/mw3-runtime.mjs`,
    `${frontend}scripts/postflop-ai/mw3-reviewed-snapshot.mjs`, `${frontend}scripts/postflop-ai/mw3-reviewed-restore.mjs`,
    `${frontend}scripts/postflop-ai/mw3-acceptance-evidence.mjs`, `${frontend}scripts/postflop-ai/mw3-source-identity.mjs`,
    `${frontend}scripts/ci/mw3-local-d1-oracle.mjs`, `${frontend}scripts/ci/mw3-local-command.mjs`,
    `${frontend}scripts/ci/mw3-api-oracle.mjs`, `${frontend}scripts/ci/mw3-registry-mode.mjs`,
    `${frontend}scripts/ci/postflop-command-supervisor.py`, `${frontend}scripts/verify-mw3-local-d1.mjs`, '.gitattributes',
  ];
  for (const identity of identities) {
    const paths = new Set(sourcePathsFor(identity));
    for (const path of required) assert.ok(paths.has(path), `Required numerical/runtime/verification source missing: ${path}`);
    for (const path of identity.sourceFiles) assert.ok(paths.has(frontend + path), `Author recipe/profile missing: ${path}`);
  }
});

test('required JSON exceptions preserve recipes, configuration, compatibility and captured runtime imports', () => {
  const required = [
    `${frontend}package.json`, `${frontend}package-lock.json`, 'configs/cash-6max-100bb.json',
    'configs/multiway-preflop-stage2.json', 'configs/source-identity-mw3.review.json',
    `${frontend}scripts/postflop-ai/mw3-source-identity-pairs.json`, `${frontend}scripts/data/postflop-ai-pilot.json`,
    `${frontend}docs/mw3-source-identity/exact-pair-parity.json`,
    `${frontend}docs/mw3-source-identity/gate-identity-wiring-amendment.json`,
    `${frontend}docs/mw3-source-identity/transitive-mw3-input-review.json`,
    ...['product-dictionary', 'product-direct', 'reasons-primary', 'reasons-secondary'].map(name => `${frontend}src/locales/${name}.json`),
  ];
  for (const identity of identities) {
    const paths = new Set(sourcePathsFor(identity));
    for (const path of required) assert.ok(paths.has(path), `Required JSON dependency missing: ${path}`);
    for (const name of ['opening-ranges', 'preflop-ranges', 'multiway-responses']) {
      assert.ok(!paths.has(`${frontend}src/estimated/${name}.json`), 'Numerical input belongs to the separately verified input inventory');
    }
  }
});

test('general backend wiring is still exercised by the dedicated integration test', () => {
  const testSource = readFileSync(new URL('../../backend/tests/mw3-index.test.mjs', import.meta.url), 'utf8');
  assert.match(testSource, /src\/index\.ts/);
  assert.match(testSource, /unpublished_delivery/);
});


test('the reduced ledger still executes the complete captured verification parent without a live-source fallback', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), 'mw3-source-scope-parent-'));
  try {
    const paths = sourcePathsFor(identities[0]);
    const records = paths.map(path => {
      const bytes = readFileSync(join(root, path));
      return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    });
    const inventory = join(directory, 'records.json');
    writeFileSync(inventory, JSON.stringify(records));
    const script = `
      import { readFileSync } from 'node:fs';
      import { join } from 'node:path';
      import { pathToFileURL } from 'node:url';
      const [origin, directory, inventory] = process.argv.slice(1);
      const { captureBoundaryRecords, installCapturedParentHooks } = await import(pathToFileURL(join(origin, 'apps/frontend/scripts/verify-mw3-local-d1.mjs')));
      const root = join(directory, 'captured'), records = JSON.parse(readFileSync(inventory));
      const buffers = captureBoundaryRecords(origin, root, records);
      const binding = installCapturedParentHooks({ root, records, buffers, executionLedgerPath: join(directory, 'execution.json') });
      try {
        await import(pathToFileURL(join(root, 'apps/frontend/scripts/ci/mw3-local-d1-oracle.mjs')));
        binding.assertLoaded('apps/frontend/scripts/ci/mw3-local-d1-oracle.mjs');
        binding.assertLoaded('apps/frontend/scripts/postflop-ai/mw3-reviewed-snapshot.mjs');
        binding.assertLoaded('apps/frontend/scripts/postflop-ai/mw3-source-identity-pairs.json');
        binding.finish('passed');
      } catch (error) { binding.finish('failed'); throw error; }
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', script, root, directory, inventory], { stdio: 'pipe' });
    const ledger = JSON.parse(readFileSync(join(directory, 'execution.json')));
    assert.equal(ledger.status, 'passed');
    assert.ok(ledger.loaded_sources.length > 30);
    assert.ok(ledger.loaded_sources.every(row => row.evaluated_source === 'loader_returned_exact_buffer'));
    assert.deepEqual(ledger.loaded_sources.filter(row => /\.(?:tsx|css)$/.test(row.path)), []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
