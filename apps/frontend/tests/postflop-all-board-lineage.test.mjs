import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { allBoardIdentity, allBoardSummaryName, assertAllBoardRunIdentity, writeImmutableAllBoardOutput } from '../scripts/postflop-ai/all-board-checkpoints.mjs';
import { companionPathFor, summaryPathFor } from '../scripts/postflop-ai/all-board-companion.mjs';
import { captureSourceGraph } from '../scripts/postflop-ai/audit-identity.mjs';
import { allowedEvidencePath, sha256 } from '../scripts/postflop-ai/reviewed-postflop-archive.mjs';

const hashJSON = value => sha256(JSON.stringify(value));
test('summary and companion filenames pin the complete run identity', () => {
  const id = 'Synthetic_spot', a = 'a'.repeat(64), b = 'b'.repeat(64);
  assert.equal(allBoardSummaryName(id, a), `${id}--${a}.json`);
  assert.notEqual(summaryPathFor(id, a), summaryPathFor(id, b));
  assert.equal(companionPathFor(id, a), summaryPathFor(id, a).replace(/\.json$/, '.checkpoints.json'));
  for (const args of [[id], [id, 'a'.repeat(63)], [id, 'A'.repeat(64)], ['../escape', a], [id, a + '/x']]) {
    assert.throws(() => allBoardSummaryName(...args), /full all-board identity/);
  }
  for (const path of [summaryPathFor(id, a), companionPathFor(id, a), 'apps/frontend/.local/postflop-ai/all-boards-audit/Synthetic_spot.json']) assert.equal(allowedEvidencePath(path), true);
  for (const path of [summaryPathFor(id, a).replace(a, 'short'), summaryPathFor(id, a).replace(a, 'A'.repeat(64))]) assert.equal(allowedEvidencePath(path), false);
});
test('new revisions preserve historical canonical bytes; identical writes reuse and changed bytes fail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'postflop-lineage-'));
  try {
    const canonical = join(dir, 'Synthetic_spot.json');
    writeFileSync(canonical, 'historical v2 bytes\n');
    const v3 = join(dir, allBoardSummaryName('Synthetic_spot', 'a'.repeat(64)));
    const v4 = join(dir, allBoardSummaryName('Synthetic_spot', 'b'.repeat(64)));
    assert.deepEqual(writeImmutableAllBoardOutput(v3, 'v3 bytes\n'), { reused: false });
    assert.deepEqual(writeImmutableAllBoardOutput(v3, Buffer.from('v3 bytes\n')), { reused: true });
    assert.throws(() => writeImmutableAllBoardOutput(v3, 'different'), /cannot be overwritten/);
    writeImmutableAllBoardOutput(v4, 'v4 bytes\n');
    assert.equal(readFileSync(v3, 'utf8'), 'v3 bytes\n');
    assert.equal(readFileSync(v4, 'utf8'), 'v4 bytes\n');
    assert.equal(readFileSync(canonical, 'utf8'), 'historical v2 bytes\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('immutable evidence writer rejects file and parent symlinks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'postflop-lineage-link-'));
  try {
    const real = join(dir, 'real.json'); writeFileSync(real, 'same');
    const link = join(dir, 'link.json'); symlinkSync(real, link);
    assert.throws(() => writeImmutableAllBoardOutput(link, 'same'), /symlink/);
    mkdirSync(join(dir, 'real-dir')); symlinkSync(join(dir, 'real-dir'), join(dir, 'linked-dir'));
    assert.throws(() => writeImmutableAllBoardOutput(join(dir, 'linked-dir', 'new.json'), 'x'), /symlink/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('generic source capture follows transitive static, re-export, dynamic and config dependencies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'postflop-source-graph-'));
  try {
    writeFileSync(join(dir, 'root.mjs'), `import './middle.mjs'; export { x } from './export.mjs'; const y = import('./dynamic.mjs');\n`);
    writeFileSync(join(dir, 'middle.mjs'), `import settings from './config.json' with {type:'json'};\n`);
    writeFileSync(join(dir, 'export.mjs'), 'export const x=1;\n');
    writeFileSync(join(dir, 'dynamic.mjs'), 'export default 2;\n');
    writeFileSync(join(dir, 'config.json'), '{"seed":1}\n');
    const first = captureSourceGraph({ root: dir, roots: ['root.mjs'] });
    assert.deepEqual(first.map(row => row.path), ['config.json', 'dynamic.mjs', 'export.mjs', 'middle.mjs', 'root.mjs']);
    writeFileSync(join(dir, 'config.json'), '{"seed":2}\n');
    assert.notDeepEqual(captureSourceGraph({ root: dir, roots: ['root.mjs'] }), first);
    assert.throws(() => captureSourceGraph({ root: dir, roots: ['../escape.mjs'] }), /safe source graph/);
    assert.throws(() => captureSourceGraph({ root: dir, roots: ['root.mjs', 'root.mjs'] }), /unique/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('all-board identity covers formerly omitted transitive authoring, sizing and JSON files', () => {
  const identity = allBoardIdentity({ spot: { id: 'Synthetic_spot' }, fingerprint: 'a', config: {} }, { metadata: { policy_hash: 'b' } }, null, 'all');
  for (const path of ['generate.mjs', 'audit-identity.mjs', '../../src/estimated/opponent-profiles.ts', '../data/hu-after-multiway-spots.json',
    '../data/postflop-ai-pilot.json', '../../../../configs/cash-6max-100bb.json', '../../../../configs/multiway-preflop-stage2.json']) {
    assert.ok(identity.code.some(row => row.path === path), path);
  }
  assert.equal(new Set(identity.code.map(row => row.path)).size, identity.code.length);
});
test('worker/start-to-finish identity guard rejects changed policy, sources, config or street', () => {
  const inputs = { spot: { id: 'Synthetic_spot' }, fingerprint: 'a', config: { seed: 'test' } };
  const candidate = { metadata: { policy_hash: 'b' } }, later = { metadata: { policy_hash: 'c' } };
  const expected = hashJSON(allBoardIdentity(inputs, candidate, later, 'all'));
  assert.doesNotThrow(() => assertAllBoardRunIdentity(inputs, candidate, later, 'all', expected));
  for (const args of [[{ ...inputs, fingerprint: 'changed' }, candidate, later, 'all'],
    [{ ...inputs, config: { seed: 'changed' } }, candidate, later, 'all'],
    [inputs, { metadata: { policy_hash: 'changed' } }, later, 'all'],
    [inputs, candidate, { metadata: { policy_hash: 'changed' } }, 'all'], [inputs, candidate, later, 'flop']]) {
    assert.throws(() => assertAllBoardRunIdentity(...args, expected), /changed during execution/);
  }
  assert.throws(() => assertAllBoardRunIdentity(inputs, candidate, later, 'all', undefined), /changed during execution/);
  const runner = readFileSync(new URL('../scripts/postflop-ai/audit-all-boards.mjs', import.meta.url), 'utf8');
  assert.match(runner, /expectedIdentityHash: cache\.key/);
  assert.ok(runner.indexOf('assertAllBoardRunIdentity(inputs, flop') < runner.indexOf('for (const id of boardIds)'));
  assert.ok(runner.indexOf('assertAllBoardRunIdentity(finalInputs') < runner.indexOf('writeImmutableAllBoardOutput(join(outDir'));
});
