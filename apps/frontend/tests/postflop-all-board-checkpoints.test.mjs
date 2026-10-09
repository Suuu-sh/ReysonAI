import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openBoardCheckpoints } from '../scripts/postflop-ai/all-board-checkpoints.mjs';

test('all-board checkpoints resume only exact input/policy/code identity', () => {
  const dir=mkdtempSync(join(tmpdir(),'hu-board-checkpoints-'));
  const ids=['As7d2c','Ks7d2c'], identity={source:'a',policy:'b',code:'c'};
  try {
    const first=openBoardCheckpoints(dir,identity,ids);
    first.write({board:ids[0],findings:[{severity:'warn',street:'flop',check:'example',node:'oop_first'}]});
    const resumed=openBoardCheckpoints(dir,identity,ids);
    assert.deepEqual([...resumed.rows.keys()],[ids[0]]);
    assert.equal(openBoardCheckpoints(dir,{...identity,policy:'changed'},ids).rows.size,0);
    assert.equal(openBoardCheckpoints(dir,{...identity,source:'changed'},ids).rows.size,0);
    assert.equal(openBoardCheckpoints(dir,{...identity,code:'changed'},ids).rows.size,0);
    assert.throws(()=>resumed.write({board:ids[0],findings:[]}),/Non-deterministic/);
    assert.throws(()=>resumed.write({board:'../../escape',findings:[]}),/Invalid/);
    assert.throws(()=>resumed.write({board:ids[1],unreachable:true,findings:[{severity:'error',street:'flop',check:'x',node:'y'}]}),/Invalid/);
    const path=join(first.dir,`${ids[0]}.json`), body=JSON.parse(readFileSync(path,'utf8'));
    body.row.findings=[]; writeFileSync(path,JSON.stringify(body));
    assert.throws(()=>openBoardCheckpoints(dir,identity,ids),/Corrupt/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});


const identityKey = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const basicIdentity = { source: 'fixed-source', policy: 'fixed-policy', code: 'fixed-code' };
const basicIds = ['As7d2c', 'Ks7d2c'];
const emptyRow = board => ({ board, findings: [] });

test('existing base/ancestor/identity-directory links and non-directory parents fail before creating children', () => {
  for (const mode of ['base-link', 'ancestor-link', 'identity-directory-link', 'base-file']) {
    const root = mkdtempSync(join(tmpdir(), 'hu-checkpoint-parent-'));
    try {
      const outside = join(root, 'outside'); mkdirSync(outside);
      let base = join(root, 'base');
      if (mode === 'base-link') symlinkSync(outside, base);
      else if (mode === 'ancestor-link') { symlinkSync(outside, base); base = join(base, 'nested'); }
      else if (mode === 'base-file') writeFileSync(base, 'not a directory');
      else { mkdirSync(base); symlinkSync(outside, join(base, identityKey(basicIdentity))); }
      assert.throws(() => openBoardCheckpoints(base, basicIdentity, basicIds), /symlink|nonregular/);
      assert.deepEqual(readdirSync(outside), []);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('identity and checkpoint files reject links, dangling links and directory substitutions', () => {
  for (const name of ['identity.json', `${basicIds[0]}.json`]) for (const mode of ['symlink', 'dangling', 'directory']) {
    const root = mkdtempSync(join(tmpdir(), 'hu-checkpoint-file-'));
    try {
      const first = openBoardCheckpoints(root, basicIdentity, basicIds);
      first.write(emptyRow(basicIds[0]));
      const path = join(first.dir, name), original = readFileSync(path);
      unlinkSync(path);
      if (mode === 'directory') mkdirSync(path);
      else {
        const target = join(root, 'outside.json');
        if (mode === 'symlink') writeFileSync(target, original);
        symlinkSync(target, path);
      }
      assert.throws(() => openBoardCheckpoints(root, basicIdentity, basicIds), /symlink|nonregular/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('independent writers reuse an identical winner and cannot replace different completed checkpoint bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'hu-checkpoint-writers-'));
  try {
    // Both writers opened before either row exists: the second publication
    // necessarily takes the exclusive-link EEXIST branch.
    const first = openBoardCheckpoints(root, basicIdentity, basicIds);
    const second = openBoardCheckpoints(root, basicIdentity, basicIds);
    const third = openBoardCheckpoints(root, basicIdentity, basicIds);
    const row = emptyRow(basicIds[0]); first.write(row);
    const path = join(first.dir, `${row.board}.json`), original = readFileSync(path);
    second.write(structuredClone(row));
    assert.deepEqual(readFileSync(path), original);
    const different = { board: row.board, findings: [{ severity: 'warn', street: 'flop', check: 'different', node: 'oop_first' }] };
    assert.throws(() => third.write(different), /Non-deterministic/);
    assert.deepEqual(readFileSync(path), original);
    assert.deepEqual(readdirSync(first.dir).sort(), [`${row.board}.json`, 'identity.json'].sort());
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('identity-file EEXIST requires identical complete bytes and never rewrites mismatches', () => {
  const root = mkdtempSync(join(tmpdir(), 'hu-checkpoint-identity-'));
  try {
    const first = openBoardCheckpoints(root, basicIdentity, basicIds), path = join(first.dir, 'identity.json');
    const original = readFileSync(path);
    openBoardCheckpoints(root, structuredClone(basicIdentity), basicIds);
    assert.deepEqual(readFileSync(path), original);
    const different = Buffer.from(JSON.stringify({ ...basicIdentity, source: 'different' }) + '\n');
    writeFileSync(path, different);
    assert.throws(() => openBoardCheckpoints(root, basicIdentity, basicIds), /identity differs/);
    assert.deepEqual(readFileSync(path), different);
    assert.equal(readdirSync(first.dir).some(name => name.endsWith('.tmp')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('cached same-row writes recheck current checkpoint and identity files on disk', () => {
  for (const target of ['row', 'identity']) {
    const root = mkdtempSync(join(tmpdir(), 'hu-checkpoint-recheck-'));
    try {
      const cache = openBoardCheckpoints(root, basicIdentity, basicIds), row = emptyRow(basicIds[0]);
      cache.write(row);
      const path = join(cache.dir, target === 'row' ? `${row.board}.json` : 'identity.json');
      const original = readFileSync(path), outside = join(root, 'outside.json'); writeFileSync(outside, original);
      unlinkSync(path); symlinkSync(outside, path);
      assert.throws(() => cache.write(row), /symlink|nonregular/);
      assert.deepEqual(readFileSync(outside), original);
      assert.equal(existsSync(join(cache.dir, `${basicIds[1]}.json`)), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('a corrupt concurrent checkpoint winner is rejected without replacement or temporary-file residue', () => {
  const root = mkdtempSync(join(tmpdir(), 'hu-checkpoint-corrupt-winner-'));
  try {
    const cache = openBoardCheckpoints(root, basicIdentity, basicIds), row = emptyRow(basicIds[0]);
    const path = join(cache.dir, `${row.board}.json`), corrupt = Buffer.from('{"incomplete":true}\n');
    writeFileSync(path, corrupt);
    assert.throws(() => cache.write(row), /Corrupt/);
    assert.deepEqual(readFileSync(path), corrupt);
    assert.equal(readdirSync(cache.dir).some(name => name.endsWith('.tmp')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
