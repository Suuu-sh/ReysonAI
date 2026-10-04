// Bind provenance to an actual Git tree, independent of local/remote commit IDs.
import { execFileSync } from 'node:child_process';
import { sha256 } from './reviewed-postflop-archive.mjs';
const TREE = /^[a-f0-9]{40}$/;
const options = root => ({ cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
export function currentMw3SourceTree(root) {
  const tree = execFileSync('git', ['--no-replace-objects', 'rev-parse', '--verify', 'HEAD^{tree}'], options(root)).trim();
  if (!TREE.test(tree)) throw new Error('Missing committed Mw3 source tree');
  return tree;
}
export function verifyMw3SourceTree(root, tree, records) {
  if (!TREE.test(tree) || execFileSync('git', ['--no-replace-objects', 'cat-file', '-t', tree], options(root)).trim() !== 'tree') throw new Error('Mw3 source_tree must name an existing tree object');
  const rows = execFileSync('git', ['--no-replace-objects', 'ls-tree', '-r', '-z', '--full-tree', tree], options(root)).split('\0').filter(Boolean).map(line => {
    const tab = line.indexOf('\t'), [mode, type, oid] = line.slice(0, tab).split(' ');
    if (tab < 0 || !TREE.test(oid)) throw new Error('Malformed Git tree entry');
    return [line.slice(tab + 1), { mode, type, oid }];
  });
  const entries = new Map();
  for (const [path, entry] of rows) {
    if (entries.has(path)) throw new Error('Duplicate Git tree path');
    entries.set(path, entry);
  }
  for (const record of records) {
    const entry = entries.get(record.path);
    if (!entry || !['100644', '100755'].includes(entry.mode) || entry.type !== 'blob') throw new Error(`Mw3 provenance path is not a regular Git blob: ${record.path}`);
    // The blob object ID is validated from ls-tree; no ambiguous rev:path lookup.
    const size = Number(execFileSync('git', ['--no-replace-objects', 'cat-file', '-s', entry.oid], options(root)).trim());
    if (!Number.isSafeInteger(size) || size !== record.bytes) throw new Error(`Mw3 source tree byte size differs: ${record.path}`);
    const body = execFileSync('git', ['--no-replace-objects', 'cat-file', 'blob', entry.oid], { ...options(root), encoding: 'buffer', maxBuffer: size + 1024 });
    if (body.length !== record.bytes || sha256(body) !== record.sha256) throw new Error(`Mw3 source tree bytes differ: ${record.path}`);
  }
  return tree;
}
