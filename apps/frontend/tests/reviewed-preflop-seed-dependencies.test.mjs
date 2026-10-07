import assert from 'node:assert/strict';
import test from 'node:test';
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assertReviewRecord, fileRecord, reviewedSourcePaths, REPOSITORY, sha256 } from '../scripts/lib/reviewed-preflop.mjs';

const seed = 'apps/backend/src/fastfold.ts';
const required = [
  seed,
  'apps/frontend/src/agent/hand.ts',
  'apps/frontend/src/agent/preflop.ts',
  'apps/frontend/src/agent/policy.ts',
  'apps/backend/src/account.ts',
  'apps/backend/src/postflop.ts',
  'apps/backend/src/fastfold-rating.ts',
  ...['nit', 'station', 'lag', 'maniac'].map(profile => `apps/frontend/src/estimated/profiles/${profile}/villain/meta.json`),
  // Dependencies reached through the Agent, account and policy modules.
  'apps/frontend/src/agent/mw3-hand.ts',
  'apps/frontend/src/account/session.ts',
  'apps/frontend/src/account/config.ts',
  'apps/frontend/scripts/postflop-ai/engine.ts',
  'apps/frontend/scripts/postflop-ai/hu-hand-tier.ts',
  'apps/frontend/src/estimated/datasets.ts',
  'apps/frontend/src/estimated/mw3-browser.ts',
  'apps/frontend/scripts/postflop-ai/mw3-runtime.mjs',
  'apps/frontend/scripts/postflop-ai/mw3-runtime.d.mts',
];

function withSourceFixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'preflop-seed-sources-'));
  try {
    for (const path of reviewedSourcePaths()) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      copyFileSync(join(REPOSITORY, path), join(root, path));
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const sourcesAt = root => reviewedSourcePaths(root).map(path => fileRecord(root, path));
const fixtureActual = sources => ({ artifacts: [], sources, content_sha256: sha256(JSON.stringify(sources)) });
const fixtureReceipt = actual => ({ schema_version: 1, ...actual, review: {
  status: 'independently-reviewed', generator: 'local-only', reviewer: 'test fixture',
  scope: 'synthetic source identity regression only', baseline_commit: 'a'.repeat(40),
} });

test('seed imports bind FastFold, all four profile metadata records and transitive consumers', () => {
  const paths = reviewedSourcePaths();
  for (const path of required) assert.ok(paths.includes(path), path);
  assert.equal(new Set(paths).size, paths.length);
  assert.deepEqual(paths, [...paths].sort());
});

test('every protected seed dependency mutation changes its record and rejects the prior receipt', () => {
  withSourceFixture(root => {
    const before = fixtureActual(sourcesAt(root));
    const receipt = fixtureReceipt(before);
    assert.doesNotThrow(() => assertReviewRecord(receipt, before));
    for (const path of required) {
      const original = readFileSync(join(root, path));
      try {
        // Whitespace alone is enough: provenance binds exact bytes, including JSON.
        appendFileSync(join(root, path), '\n ');
        const after = fixtureActual(sourcesAt(root));
        assert.notDeepEqual(after.sources.find(row => row.path === path), before.sources.find(row => row.path === path), path);
        assert.throws(() => assertReviewRecord(receipt, after), /source\/configuration identity changed/, path);
      } finally {
        writeFileSync(join(root, path), original);
      }
    }
    assert.deepEqual(fixtureActual(sourcesAt(root)), before);
  });
});

test('seed traversal retains static exports, dynamic imports and adjacent declaration dependencies', () => {
  withSourceFixture(root => {
    const directory = 'apps/backend/src';
    const fixtures = {
      'seed-child.mjs': 'export { marker } from "./seed-export.ts";\nimport("./seed-dynamic.json");\n',
      'seed-child.d.mts': 'import type { Marker } from "./seed-declaration.ts";\nexport declare const marker: Marker;\n',
      'seed-export.ts': 'export const marker = 1;\n',
      'seed-declaration.ts': 'export type Marker = number;\n',
      'seed-dynamic.json': '{}\n',
    };
    for (const [name, text] of Object.entries(fixtures)) writeFileSync(join(root, directory, name), text);
    appendFileSync(join(root, seed), '\nimport "./seed-child.mjs";\n');
    const paths = reviewedSourcePaths(root);
    for (const name of Object.keys(fixtures)) assert.ok(paths.includes(`${directory}/${name}`), name);
  });
});

test('seed import escaping the repository remains rejected', () => {
  withSourceFixture(root => {
    appendFileSync(join(root, seed), '\nimport "../../../../outside-review-root.ts";\n');
    assert.throws(() => reviewedSourcePaths(root), /Review source escapes repository/);
  });
});
