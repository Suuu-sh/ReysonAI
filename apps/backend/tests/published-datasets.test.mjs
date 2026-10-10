import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { listPublishedDatasets, readPublishedDataset } from '../src/application/published-datasets.ts';
import { isPublishedDatasetName } from '../src/domain/published-dataset.ts';
import { D1PublishedDatasetReader } from '../src/infrastructure/d1-published-dataset-repository.ts';

test('published dataset domain names keep ordinary and approved profile namespaces bounded', () => {
  for (const name of [
    'opening-ranges',
    'reasons/BB_vs_BTN',
    'profiles/nit/villain/opening-ranges',
    'profiles/station/villain/meta',
  ]) assert.equal(isPublishedDatasetName(name), true, name);
  for (const name of ['', '../secret', 'profiles/evil/villain/opening-ranges', 'profiles/nit/exploit/meta', 'spaces are not names']) {
    assert.equal(isPublishedDatasetName(name), false, name);
  }
});

test('published dataset application service preserves list shape, raw text, and quoted ETags', async () => {
  const raw = '{ \n "label": "日本語 🌱", "decimal": 1.00 }\t\n';
  const repository = {
    async list() { return [
      { name: 'opening-ranges', content_hash: 'a', bytes: 32 },
      { name: 'reasons/BB_vs_BTN', content_hash: 'b', bytes: 64 },
    ]; },
    async read(name) {
      assert.equal(name, 'reasons/BB_vs_BTN');
      return { metadata: { content_hash: 'raw-hash', parts: 2 }, parts: [
        { part: 0, body: raw.slice(0, raw.indexOf('🌱')) },
        { part: 1, body: raw.slice(raw.indexOf('🌱')) },
      ] };
    },
  };
  assert.deepEqual(await listPublishedDatasets(repository), {
    kind: 'ai_estimate_not_gto',
    datasets: {
      'opening-ranges': { hash: 'a', bytes: 32 },
      'reasons/BB_vs_BTN': { hash: 'b', bytes: 64 },
    },
  });
  assert.deepEqual(await readPublishedDataset(repository, 'reasons/BB_vs_BTN'), {
    kind: 'published', name: 'reasons/BB_vs_BTN', text: raw, etag: '"raw-hash"',
  });
});

test('published dataset use case rejects gaps, duplicates and nonzero-first chunks and distinguishes missing metadata', async () => {
  const cases = [
    [],
    [{ part: 0, body: 'a' }],
    [{ part: 0, body: 'a' }, { part: 0, body: 'b' }],
    [{ part: 1, body: 'a' }, { part: 2, body: 'b' }],
  ];
  for (const parts of cases) {
    const repository = { async list() { return []; }, async read() { return { metadata: { content_hash: 'h', parts: 2 }, parts }; } };
    assert.deepEqual(await readPublishedDataset(repository, 'opening-ranges'), { kind: 'incomplete', name: 'opening-ranges' });
  }
  const missing = { async list() { return []; }, async read() { return { metadata: undefined, parts: [{ part: 1, body: 'stray' }] }; } };
  assert.deepEqual(await readPublishedDataset(missing, 'opening-ranges'), { kind: 'not_found', name: 'opening-ranges' });
  let reads = 0;
  const unused = { async list() { return []; }, async read() { reads++; return { parts: [] }; } };
  assert.deepEqual(await readPublishedDataset(unused, '../secret'), { kind: 'invalid_name' });
  assert.equal(reads, 0);
});

test('D1 adapter keeps ordered raw parts and the existing query set against local SQLite', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0003_preflop.sql', import.meta.url), 'utf8'));
  const statements = [];
  const db = {
    prepare(sql) {
      statements.push(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      };
    },
  };
  const reader = new D1PublishedDatasetReader(db);
  const raw = '{\n  "greeting": "こんにちは 🌱", "n": 1.00\n}\n';
  try {
    sqlite.prepare('INSERT INTO preflop_datasets(name,content_hash,bytes,parts) VALUES (?,?,?,?)')
      .run('reasons/BB_vs_BTN', 'sha', Buffer.byteLength(raw), 3);
    for (const [part, body] of [[2, '🌱", "n": 1.00\n}\n'], [0, '{\n  "greeting": "こんにちは '], [1, '']]) {
      sqlite.prepare('INSERT INTO preflop_dataset_parts(name,part,body) VALUES (?,?,?)').run('reasons/BB_vs_BTN', part, body);
    }
    sqlite.prepare('INSERT INTO preflop_datasets(name,content_hash,bytes,parts) VALUES (?,?,?,?)')
      .run('opening-ranges', 'open-sha', 0, 0);

    assert.deepEqual(await listPublishedDatasets(reader), {
      kind: 'ai_estimate_not_gto',
      datasets: {
        'opening-ranges': { hash: 'open-sha', bytes: 0 },
        'reasons/BB_vs_BTN': { hash: 'sha', bytes: Buffer.byteLength(raw) },
      },
    });
    statements.length = 0;
    const result = await readPublishedDataset(reader, 'reasons/BB_vs_BTN');
    assert.deepEqual(result, { kind: 'published', name: 'reasons/BB_vs_BTN', text: raw, etag: '"sha"' });
    assert.deepEqual(statements, [
      'SELECT content_hash, parts FROM preflop_datasets WHERE name = ?',
      'SELECT part, body FROM preflop_dataset_parts WHERE name = ? ORDER BY part',
    ]);
  } finally { sqlite.close(); }
});
