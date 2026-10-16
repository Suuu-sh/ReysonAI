// Authoring only: prepare an unapproved source proposal and reproducible parity
// evidence. This tool cannot create an approval or renew any strategy/runtime gate.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import parser from './vendor/babel-parser-7.29.7.ts';

type Pair = { historical_key: string; current_path: string; classification: string;
  current_bytes: number; current_sha256: string; historical_bytes: number; historical_sha256: string; historical_source: string };
type Difference = { path: string; before: unknown; after: unknown };
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const prefix = 'apps/frontend/scripts/postflop-ai/';
const generator = `${prefix}prepare-typescript-source-identity.ts`;
const inventory = `${prefix}mw3-typescript-source-identity-pairs.json`;
const evidence = 'apps/frontend/docs/mw3-source-identity/typescript-executable-parity.json';
const preserved = ['configs/source-identity-mw3.review.json', `${prefix}mw3-source-identity-pairs.json`,
  ...['exact-pair-parity', 'gate-identity-wiring-amendment', 'transitive-mw3-input-review'].map(name => `apps/frontend/docs/mw3-source-identity/${name}.json`)];
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const record = (path: string, bytes: Buffer) => ({ path, bytes: bytes.length, sha256: sha(bytes) });
const git = (args: string[]) => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const baseline = git(['rev-parse', process.argv[2] ?? 'df2370690e9b3172f2c109f80113b320880f940a']).toString().trim();
const before = (path: string) => git(['show', `${baseline}:${path}`]);
const read = (path: string) => readFileSync(resolve(root, path));
for (const path of preserved) if (!read(path).equals(before(path))) throw new Error(`Prior evidence changed: ${path}`);
const old = JSON.parse(read(`${prefix}mw3-source-identity-pairs.json`).toString()) as { pairs: Pair[]; [key: string]: unknown };
const currentPath = (path: string) => path.replace(/\.(?:mjs|js)$/, '.ts');
const proposal = { ...old, pairs: old.pairs.map(pair => ({ ...pair, current_path: currentPath(pair.current_path),
  current_bytes: read(currentPath(pair.current_path)).length, current_sha256: sha(read(currentPath(pair.current_path))) })) };
writeFileSync(resolve(root, inventory), `${JSON.stringify(proposal, null, 2)}\n`);
const tracked = git(['ls-tree', '-r', '--name-only', baseline]).toString().trim().split('\n');
const relocations = new Map(tracked.filter(path => /\.(?:mjs|js)$/.test(path) && existsSync(resolve(root, currentPath(path))))
  .map(path => [path, currentPath(path)]));
const normalizations: { module: string; before: string; after: string; reason: string }[] = [];
function relocated(value: string, module: string): string {
  for (const base of [dirname(module), '', 'apps/frontend']) {
    const path = relative(root, resolve(root, base, value));
    if (relocations.has(path)) return value.replace(/\.(?:mjs|js)$/, '.ts');
  }
  return value;
}
const omit = new Set(['loc', 'start', 'end', 'extra', 'comments', 'tokens', 'leadingComments', 'innerComments', 'trailingComments']);
function normalized(node: any, module: string, original: boolean): any {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(child => normalized(child, module, original));
  // Babel's two vendored `if (...) ;` bodies and `if (...) {}` have identical behavior.
  if (module.includes('/vendor/babel-parser-7.29.7.') && node.type === 'EmptyStatement') return { type: 'BlockStatement', body: [], directives: [] };
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (omit.has(key)) continue;
    if (original && node.type === 'StringLiteral' && key === 'value') {
      const moved = relocated(value as string, module);
      result[key] = moved;
      if (moved !== value) normalizations.push({ module, before: value as string, after: moved, reason: 'exact-existing-source-path-relocation' });
    } else if (original && module === `${prefix}mw3-authored-source.mjs` && node.type === 'RegExpLiteral' && key === 'pattern' && value === '^scripts\\/data\\/mw3-authored\\/(?:[A-Za-z0-9_-]+\\.mjs|profiles\\/[A-Za-z0-9_-]+\\.json)$') {
      result[key] = (value as string).replace('\\.mjs', '\\.ts');
      normalizations.push({ module, before: value as string, after: result[key] as string, reason: 'exact-recipe-source-extension-allowlist-relocation' });
    } else result[key] = normalized(value, module, original);
  }
  return result;
}
function ast(bytes: Buffer, module: string, original: boolean): any {
  const executable = stripTypeScriptTypes(bytes.toString(), { mode: 'strip' });
  return normalized(parser.parse(executable, { sourceType: 'module' }), module, original);
}
function differences(a: any, b: any, path = ''): Difference[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return [{ path, before: a, after: b }];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key => differences(a[key], b[key], `${path}.${key}`));
}
function compare(path: string) {
  const next = currentPath(path), previous = before(path), current = read(next);
  if (path.endsWith('.json')) return { previous: record(path, previous), current: record(next, current), status: previous.equals(current) ? 'identical-json-bytes' : 'changed-json-bytes' };
  const a = ast(previous, path, true), b = ast(current, next, false), diff = differences(a, b);
  return { previous: record(path, previous), current: record(next, current), previous_executable_ast_sha256: sha(JSON.stringify(a)),
    current_executable_ast_sha256: sha(JSON.stringify(b)), status: diff.length ? 'explicit-wiring-amendment-requires-independent-review' : 'exact-executable-ast-parity',
    ...(diff.length ? { differences: diff } : {}) };
}
const pairProofs = old.pairs.map(pair => ({ historical_key: pair.historical_key, ...compare(pair.current_path) }));
if (pairProofs.some(pair => !['identical-json-bytes', 'exact-executable-ast-parity'].includes(pair.status))) throw new Error('Numerical identity pair executable parity failed');
const scriptPaths = tracked.filter(path => path.startsWith('apps/frontend/scripts/') && /\.(?:mjs|js|ts)$/.test(path) && !/\.d\.ts$/.test(path));
const modules = scriptPaths.map(compare);
const body = {
  schema_version: 1, kind: 'mw3-typescript-executable-parity-evidence', status: 'source-evidence-for-independent-approval-not-approval',
  scope: 'TypeScript source migration only. No strategy, saved policy, payout, publication, runtime gate, API, UI or deployment approval is created or renewed.',
  baseline: { commit: baseline, preserved_records: preserved.map(path => record(path, read(path))) },
  generation: { node: process.version, command: `node apps/frontend/scripts/postflop-ai/prepare-typescript-source-identity.ts ${baseline}`, generator: record(generator, read(generator)) },
  normalization: { types: 'node:module stripTypeScriptTypes(mode=strip)', parser: '@babel/parser 7.29.7 vendored', omitted_ast_fields: [...omit],
    allowed_non_type_rewrites: ['exact existing tracked source path .mjs/.js -> .ts; no arbitrary strings, numeric constants, strategies, seeds or versions normalized',
      'one exact recipe-source extension allowlist', 'vendor empty-if statement -> empty block'],
    applied_source_relocations: [...new Map(normalizations.map(row => [JSON.stringify(row), row])).values()] },
  inventory: record(inventory, read(inventory)), adapter: record(`${prefix}mw3-source-identity.ts`, read(`${prefix}mw3-source-identity.ts`)),
  identity_pairs: pairProofs, all_preexisting_script_modules: modules,
  summary: { numerical_pairs: pairProofs.length, numerical_pairs_pass: true, preexisting_script_modules: modules.length,
    exact_executable_ast_parity: modules.filter(row => row.status === 'exact-executable-ast-parity').length,
    explicit_wiring_amendments: modules.filter(row => row.status === 'explicit-wiring-amendment-requires-independent-review').map(row => row.current.path),
    approval: 'NOT_CREATED; independent gpt-6-astra approval required' },
};
writeFileSync(resolve(root, evidence), `${JSON.stringify(body, null, 2)}\n`);
console.log(JSON.stringify(body.summary, null, 2));
