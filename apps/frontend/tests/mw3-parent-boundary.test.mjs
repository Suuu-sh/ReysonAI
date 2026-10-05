// Synthetic source-race fixtures for the trusted builtin-only bootstrap.
// No receipt, actual policy, Wrangler, D1 command or generation is executed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { captureBoundaryRecords, installCapturedParentHooks, parseArguments, writeBoundaryGitPointer } from '../scripts/verify-mw3-local-d1.mjs';
const sha = body => createHash('sha256').update(body).digest('hex');
const row = (path, bytes) => ({ path, bytes: bytes.length, sha256: sha(bytes) });
function retain(root, passed) { if (passed) rmSync(root, { recursive: true, force: true }); else process.stderr.write(`Retained synthetic parent-boundary evidence: ${root}\n`); }
test('the actual bootstrap keeps exact mandatory CLI inputs and no fixture or alternate-entry flag', () => {
  const args = ['--manifest', 'a', '--archive', 'b', '--receipt', 'c', '--sql', 'd', '--wrangler', 'e'];
  assert.deepEqual(parseArguments(args), { manifest: 'a', archive: 'b', receipt: 'c', sql: 'd', wrangler: 'e' });
  for (const flag of ['--fixture', '--entry', '--skip-receipt', '--remote', '--bounded-local']) assert.throws(() => parseArguments([...args, flag, 'x']));
});
test('cached live version A cannot supply classifier logic while captured reviewed version B is attested', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-parent-race-')), origin = join(directory, 'live'), root = join(directory, 'replay');
  mkdirSync(origin); mkdirSync(root); let passed = false, binding;
  try {
    const path = 'apps/frontend/scripts/ci/synthetic-parent.mjs', dependency = 'apps/frontend/scripts/ci/synthetic-classifier.mjs';
    mkdirSync(dirname(join(origin, path)), { recursive: true });
    const parent = Buffer.from("import {decision} from './synthetic-classifier.mjs'; export {decision}; export const location=import.meta.url;\n");
    const a = Buffer.from("export const decision='cached-unreviewed-A';\n"), b = Buffer.from("export const decision='captured-reviewed-B';\n");
    writeFileSync(join(origin, path), parent); writeFileSync(join(origin, dependency), a);
    const cached = await import(pathToFileURL(join(origin, path)).href); assert.equal(cached.decision, 'cached-unreviewed-A');
    // This is precisely the previous load/capture race: the same dependency URL
    // remains cached as A while current disk and the new expected record are B.
    writeFileSync(join(origin, dependency), b);
    const records = [row(path, parent), row(dependency, b)], buffers = captureBoundaryRecords(origin, root, records);
    const executionLedgerPath = join(directory, 'parent.execution.json');
    binding = installCapturedParentHooks({ root, records, buffers, executionLedgerPath });
    writeFileSync(join(origin, dependency), "export const decision='later-live-C';\n");
    // Even a changed replay file cannot replace the exact bytes returned by the
    // loader. Later real snapshot checks reject replay-disk mismatches too.
    rmSync(join(root, dependency)); writeFileSync(join(root, dependency), "export const decision='later-replay-D';\n");
    const captured = await import(pathToFileURL(join(root, path)).href);
    assert.equal(captured.decision, 'captured-reviewed-B'); assert.equal(cached.decision, 'cached-unreviewed-A');
    assert.equal(captured.location, pathToFileURL(join(root, path)).href);
    assert.equal(binding.loaded.get(dependency).sha256, sha(b));
    await assert.rejects(() => import(pathToFileURL(join(origin, path)).href), /escaped captured ledger|inside the repository/);
    binding.finish('pass'); binding = null;
    const evidence = JSON.parse(readFileSync(executionLedgerPath)); assert.equal(evidence.status, 'pass');
    assert.equal(evidence.loaded_sources.length, 2); assert.ok(evidence.loaded_sources.every(record => record.evaluated_source === 'loader_returned_exact_buffer'));
    passed = true;
  } finally { if (binding) binding.finish('fail'); retain(directory, passed); }
});
test('load/capture disagreement fails before any module/D1 work and leaves the original bytes intact', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-parent-capture-mismatch-')), origin = join(directory, 'live'), root = join(directory, 'replay');
  mkdirSync(origin); mkdirSync(root); let passed = false;
  try {
    const path = 'synthetic.mjs', old = Buffer.from("export const value='A';\n"), changed = Buffer.from("export const value='B';\n");
    writeFileSync(join(origin, path), changed);
    assert.throws(() => captureBoundaryRecords(origin, root, [row(path, old)]), /changed before capture/);
    assert.deepEqual(readFileSync(join(origin, path)), changed);
    assert.throws(() => readFileSync(join(root, path)), /ENOENT/);
    passed = true;
  } finally { retain(directory, passed); }
});
test('exact-buffer hooks support captured JSON and builtins while rejecting every undeclared local import', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-parent-json-')), origin = join(directory, 'live'), root = join(directory, 'replay');
  mkdirSync(origin); mkdirSync(root); let passed = false, binding;
  try {
    const files = new Map([
      ['entry.mjs', Buffer.from("import assert from 'node:assert/strict';import value from './data.json' with {type:'json'};assert.equal(value.synthetic,true);export default value;\n")],
      ['data.json', Buffer.from('{"synthetic":true,"version":"captured"}\n')],
      ['escape.mjs', Buffer.from("export default await import('./undeclared.mjs');\n")],
    ]);
    for (const [path, bytes] of files) writeFileSync(join(origin, path), bytes);
    const records = [...files].map(([path, bytes]) => row(path, bytes));
    const buffers = captureBoundaryRecords(origin, root, records);
    writeFileSync(join(root, 'undeclared.mjs'), 'export default true;\n');
    binding = installCapturedParentHooks({ root, records, buffers, executionLedgerPath: join(directory, 'parent.execution.json') });
    const result = await import(pathToFileURL(join(root, 'entry.mjs')).href); assert.equal(result.default.version, 'captured');
    assert.ok(binding.loaded.has('data.json'));
    await assert.rejects(() => import(pathToFileURL(join(root, 'escape.mjs')).href), /escaped captured ledger/);
    binding.finish('pass'); binding = null; passed = true;
  } finally { if (binding) binding.finish('fail'); retain(directory, passed); }
});

test('captured import.meta root and read-only origin Git-object metadata preserve tree-relative provenance', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-parent-git-')), origin = join(directory, 'live'), root = join(directory, 'replay');
  mkdirSync(origin); mkdirSync(root); let passed = false, binding;
  try {
    const path = 'apps/frontend/scripts/ci/synthetic.mjs', body = Buffer.from("export const root=new URL('../../../../',import.meta.url).pathname;\n");
    mkdirSync(dirname(join(origin, path)), { recursive: true }); writeFileSync(join(origin, path), body);
    const git = (cwd, args) => execFileSync('git', ['--no-replace-objects', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git(origin, ['init', '-q']); git(origin, ['add', path]);
    git(origin, ['-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'Synthetic boundary provenance only']);
    const tree = git(origin, ['rev-parse', 'HEAD^{tree}']).trim(), records = [row(path, body)], buffers = captureBoundaryRecords(origin, root, records);
    writeBoundaryGitPointer(origin, root);
    assert.equal(git(root, ['rev-parse', 'HEAD^{tree}']).trim(), tree);
    assert.equal(git(root, ['cat-file', 'blob', `${tree}:${path}`]), body.toString());
    binding = installCapturedParentHooks({ root, records, buffers, executionLedgerPath: join(directory, 'parent.execution.json') });
    const result = await import(pathToFileURL(join(root, path)).href); assert.equal(result.root, `${root}/`);
    binding.finish('pass'); binding = null; passed = true;
  } finally { if (binding) binding.finish('fail'); retain(directory, passed); }
});

test('captured typed TS, relative TS and JSON dependencies evaluate from recorded stripped bytes despite live/replay changes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-parent-typed-')), origin = join(directory, 'live'), root = join(directory, 'replay');
  mkdirSync(origin); mkdirSync(root); let passed = false, binding;
  try {
    const files = new Map([
      ['entry.mjs', Buffer.from("import {choose} from './typed/entry.ts';export const result=choose();\n")],
      ['typed/entry.ts', Buffer.from("import {label} from './sibling.ts';import config from '../data.json' with {type:'json'};export function choose(value?: number): string {const fallback: number=config.value;return label(value ?? fallback);}\n")],
      ['typed/sibling.ts', Buffer.from("const prefix: string='captured-typed';export function label(value: number): string {return prefix+':'+String(value);}\n")],
      ['data.json', Buffer.from('{"value":5}\n')],
    ]);
    for (const [path, bytes] of files) { mkdirSync(dirname(join(origin, path)), { recursive: true }); writeFileSync(join(origin, path), bytes); }
    const records = [...files].map(([path, bytes]) => row(path, bytes)), buffers = captureBoundaryRecords(origin, root, records);
    writeFileSync(join(origin, 'typed/sibling.ts'), "throw new Error('must never evaluate changed live TS');\n");
    rmSync(join(root, 'typed/sibling.ts')); writeFileSync(join(root, 'typed/sibling.ts'), "throw new Error('must never evaluate changed replay TS');\n");
    const executionLedgerPath = join(directory, 'parent.execution.json');
    binding = installCapturedParentHooks({ root, records, buffers, executionLedgerPath });
    const parent = await import(pathToFileURL(join(root, 'entry.mjs')).href); assert.equal(parent.result, 'captured-typed:5');
    for (const path of ['typed/entry.ts', 'typed/sibling.ts']) {
      const evidence = binding.loaded.get(path);
      assert.equal(evidence.sha256, sha(files.get(path))); assert.equal(evidence.bytes, files.get(path).length);
      assert.deepEqual(evidence.transformation, { api: 'node:module.stripTypeScriptTypes', mode: 'strip', node_version: process.versions.node,
        source_url: pathToFileURL(join(root, path)).href, output_path: `transformed/${evidence.executed_source.sha256}.mjs` });
      const executed = readFileSync(join(directory, evidence.transformation.output_path));
      assert.equal(executed.length, evidence.executed_source.bytes); assert.equal(sha(executed), evidence.executed_source.sha256);
      assert.notEqual(evidence.sha256, evidence.executed_source.sha256);
      assert.doesNotMatch(executed.toString(), /value\?: number|: string|: number/);
    }
    assert.equal(binding.loaded.get('data.json').transformation, null);
    binding.finish('pass'); binding = null; passed = true;
  } finally { if (binding) binding.finish('fail'); retain(directory, passed); }
});

test('the complete actual parent graph links under exact-buffer hooks, including the captured shared registry, migrated runtime modules and nonexecuting type provenance, without invoking the oracle', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-parent-real-graph-')), root = join(directory, 'replay'); mkdirSync(root);
  const origin = fileURLToPath(new URL('../../../', import.meta.url)), entry = 'apps/frontend/scripts/ci/mw3-local-d1-oracle.mjs';
  const files = new Map(); let binding;
  try {
    function visit(path) {
      if (files.has(path)) return;
      assert.ok(path && !path.startsWith('../') && !path.startsWith('/'));
      const body = readFileSync(join(origin, path)); files.set(path, body);
      if (!/\.(?:mjs|js|ts)$/.test(path)) return;
      for (const match of body.toString().matchAll(/(?:\bimport\s+(?:[^;]*?\s+from\s+)?|\bexport\s+[^;]*?\s+from\s+)["']([^"']+)["']/g)) {
        if (match[1].startsWith('.')) visit(relative(origin, resolve(origin, dirname(path), match[1])).replaceAll('\\', '/'));
      }
    }
    visit(entry);
    const expectedRuntimeTs = ['apps/shared/mw3-approved.ts', 'apps/frontend/src/data.ts', 'apps/frontend/src/components/action-format.ts',
      'apps/frontend/src/estimated/multiway-responses.ts', 'apps/frontend/src/estimated/opening-ranges.ts',
      'apps/frontend/src/estimated/rake.ts', 'apps/frontend/src/estimated/ranges.ts', 'apps/frontend/src/estimated/sizing.ts',
      'apps/frontend/scripts/postflop-ai/model.ts', 'apps/frontend/scripts/lib/equity.ts',
      'apps/frontend/scripts/lib/continuation-evaluator.ts'];
    for (const path of expectedRuntimeTs) assert.ok(files.has(path), `Missing migrated runtime source: ${path}`);
    const executable = new Set();
    function executableVisit(path) {
      if (executable.has(path)) return;
      assert.ok(files.has(path), `Executable dependency must be captured: ${path}`);
      assert.doesNotMatch(path, /\.d\.(?:ts|mts)$/);
      executable.add(path);
      if (!/\.(?:mjs|js|ts)$/.test(path)) return;
      const raw = files.get(path).toString('utf8');
      const text = path.endsWith('.ts') ? stripTypeScriptTypes(raw, { mode: 'strip' }) : raw;
      for (const match of text.matchAll(/(?:\bimport\s+(?:[^;]*?\s+from\s+)?|\bexport\s+[^;]*?\s+from\s+)["']([^"']+)["']/g)) {
        if (match[1].startsWith('.')) executableVisit(relative(origin, resolve(origin, dirname(path), match[1])).replaceAll('\\', '/'));
      }
    }
    executableVisit(entry);
    for (const path of expectedRuntimeTs) assert.ok(executable.has(path), `Expected runtime module was only a type dependency: ${path}`);
    const records = [...files].map(([path, bytes]) => row(path, bytes)), buffers = captureBoundaryRecords(origin, root, records);
    const executionLedgerPath = join(directory, 'parent.execution.json');
    binding = installCapturedParentHooks({ root, records, buffers, executionLedgerPath, metadata: { synthetic_source_only_startup: true } });
    const parent = await import(pathToFileURL(join(root, entry)).href);
    assert.equal(typeof parent.verifyMw3LocalD1, 'function'); assert.equal(typeof parent.assertFinishedSqlFailure, 'function');
    assert.equal(parent.WRANGLER_VERSION, '4.147.0'); // Constant inspection only; no runtime command.
    assert.deepEqual([...binding.loaded.keys()].sort(), [...executable].sort(), 'Every actual executable dependency was supplied by the capture loader; type-only provenance was not executed');
    for (const path of expectedRuntimeTs) {
      const evidence = binding.loaded.get(path); assert.equal(evidence.transformation.api, 'node:module.stripTypeScriptTypes');
      assert.equal(evidence.sha256, sha(files.get(path)));
      assert.equal(sha(readFileSync(join(directory, evidence.transformation.output_path))), evidence.executed_source.sha256);
    }
    assert.equal(existsSync(join(root, 'apps/frontend/.local')), false, 'Import/link did not start oracle, strategy generation, Wrangler or D1 work');
    binding.finish('pass'); binding = null;
    const evidence = JSON.parse(readFileSync(executionLedgerPath)); assert.equal(evidence.status, 'pass');
    assert.equal(evidence.loaded_sources.length, executable.size);
    // Retain this real-graph format/identity proof for independent inspection.
    retain(directory, false);
  } finally { if (binding) binding.finish('fail'); }
});


test('captured declaration provenance is retained but .d.ts and .d.mts can never execute', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mw3-parent-declarations-')), origin = join(directory, 'live'), root = join(directory, 'replay');
  mkdirSync(origin); mkdirSync(root); let passed = false, binding;
  try {
    const files = new Map([
      ['entry.ts', Buffer.from("import type { Shape } from './shape.d.mts'; export const value: Shape = { value: 7 };\n")],
      ['shape.d.mts', Buffer.from("export type Shape = { value: number };\n")],
      ['shape.d.ts', Buffer.from("export type Shape = { value: number };\n")],
    ]);
    for (const [path, bytes] of files) writeFileSync(join(origin, path), bytes);
    const records = [...files].map(([path, bytes]) => row(path, bytes));
    const buffers = captureBoundaryRecords(origin, root, records);
    binding = installCapturedParentHooks({ root, records, buffers, executionLedgerPath: join(directory, 'parent.execution.json') });
    const value = await import(pathToFileURL(join(root, 'entry.ts')).href); assert.equal(value.value.value, 7);
    for (const path of ['shape.d.mts', 'shape.d.ts']) {
      assert.ok(buffers.has(path)); assert.equal(binding.loaded.has(path), false);
      await assert.rejects(() => import(pathToFileURL(join(root, path)).href), /Declaration sources must never execute/);
    }
    binding.finish('pass'); binding = null; passed = true;
  } finally { if (binding) binding.finish('fail'); retain(directory, passed); }
});
