import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { currentMw3SourceTree, verifyMw3SourceTree } from '../scripts/postflop-ai/mw3-source-tree.mjs';
import { sha256 } from '../scripts/postflop-ai/reviewed-postflop-archive.mjs';
const record = (path, text) => ({ path, bytes: Buffer.byteLength(text), sha256: sha256(text) });
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'mw3-git-tree-'));
  const git = (args, input) => execFileSync('git', args, { cwd: root, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  try {
    git(['init', '-q']); writeFileSync(join(root, 'source.mjs'), 'export const value = 1;\n');
    git(['add', 'source.mjs']); git(['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Mw3 Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'synthetic fixture only']);
    run({ root, git, tree: currentMw3SourceTree(root), item: record('source.mjs', 'export const value = 1;\n') });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('provenance binds existing regular Git blob bytes rather than arbitrary commit-shaped text', () => fixture(({ root, git, tree, item }) => {
  assert.equal(verifyMw3SourceTree(root, tree, [item]), tree);
  assert.throws(() => verifyMw3SourceTree(root, git(['rev-parse', 'HEAD']), [item]), /tree object/);
  assert.throws(() => verifyMw3SourceTree(root, '0'.repeat(40), [item]));
  assert.throws(() => verifyMw3SourceTree(root, 'HEAD^{tree}', [item]));
  assert.throws(() => verifyMw3SourceTree(root, tree, [{ ...item, sha256: '0'.repeat(64) }]), /bytes differ/);
  assert.throws(() => verifyMw3SourceTree(root, tree, [{ ...item, bytes: item.bytes + 1 }]), /size differs/);
  assert.throws(() => verifyMw3SourceTree(root, tree, [{ ...item, path: 'missing.mjs' }]), /regular Git blob/);
}));
test('a changed local source or tree link cannot be relabeled as the pinned regular source', () => fixture(({ root, git, tree, item }) => {
  writeFileSync(join(root, 'source.mjs'), 'export const value = 2;\n');
  assert.throws(() => verifyMw3SourceTree(root, tree, [record(item.path, 'export const value = 2;\n')]), /bytes differ/);
  symlinkSync('source.mjs', join(root, 'link.mjs')); git(['add', 'source.mjs', 'link.mjs']);
  const changedTree = git(['write-tree']);
  assert.throws(() => verifyMw3SourceTree(root, changedTree, [record('link.mjs', 'source.mjs')]), /regular Git blob/);
}));

test('replace refs cannot rewrite a pinned source tree or blob view', () => fixture(({ root, git, tree, item }) => {
  writeFileSync(join(root, 'source.mjs'), 'export const value = 9;\n'); git(['add', 'source.mjs']);
  const changed = git(['write-tree']); git(['replace', tree, changed]);
  assert.equal(verifyMw3SourceTree(root, tree, [item]), tree);
  assert.throws(() => verifyMw3SourceTree(root, tree, [record(item.path, 'export const value = 9;\n')]), /bytes differ/);
}));
