// Read-only proposal emitter. No receipts/SQL/policies are authored or updated.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { collectSourceContexts } from './mw3-source-context.mjs';
import { verifyMw3SourceTree } from './mw3-source-tree.mjs';

export function contextFromGitTree(root, tree) {
  const run = args => execFileSync('git', ['--no-replace-objects', ...args], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  if (!/^[a-f0-9]{40}$/.test(tree) || run(['cat-file', '-t', tree]).toString().trim() !== 'tree') throw new Error('Exact existing Git tree required');
  const entries = new Map(run(['ls-tree', '-r', '-z', tree]).toString().split('\0').filter(Boolean).map(row => {
    const [info, path] = row.split('\t'), [mode, type, oid] = info.split(' ');
    return [path, { mode, type, oid }];
  }));
  const cache = new Map();
  const files = {
    has(path) { return entries.has(path); },
    get(path) {
      const entry = entries.get(path);
      if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) throw new Error(`Non-regular source ${path}`);
      if (!cache.has(path)) cache.set(path, run(['cat-file', 'blob', entry.oid]));
      return cache.get(path);
    },
  };
  const policy = JSON.parse(files.get('apps/frontend/scripts/postflop-ai/mw3-source-context.policy.json'));
  const proposal = collectSourceContexts(files, policy);
  verifyMw3SourceTree(root, tree, Object.values(proposal.contexts).flatMap(context => context.records));
  return { ...proposal, sourceTree: tree };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const tree = execFileSync('git', ['--no-replace-objects', 'rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
  console.log(JSON.stringify(contextFromGitTree(root, tree), null, 2));
}
