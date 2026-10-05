// Trusted, builtin-only entry boundary. No application/acceptance ESM is imported
// until its exact saved-manifest bytes and Git-tree provenance are captured.
// The replay loader returns hash-bound source Buffers, not later path contents.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, writeFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ORIGIN = fileURLToPath(new URL('../../../', import.meta.url));
const PARENT_ENTRY = 'apps/frontend/scripts/ci/mw3-local-d1-oracle.mjs';
const REQUIRED = ['apps/frontend/scripts/verify-mw3-local-d1.mjs', PARENT_ENTRY, 'apps/frontend/scripts/ci/mw3-local-command.mjs', 'apps/frontend/scripts/ci/mw3-api-oracle.mjs',
  'apps/frontend/scripts/ci/postflop-command-supervisor.py', 'apps/frontend/scripts/postflop-ai/mw3-reviewed-snapshot.mjs',
  'apps/frontend/scripts/postflop-ai/mw3-reviewed-delivery.mjs', 'apps/frontend/scripts/ci/mw3-registry-mode.mjs', 'apps/shared/mw3-approved.ts'];
const OWNER_SHA = '61d0fe490ff4e1e82667a8ec188c1206efd1c26067ff8d6061b4bc8a1a67164d';
const sha = body => createHash('sha256').update(body).digest('hex');
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const digest = body => ({ bytes: body.length, sha256: sha(body) });
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function safePath(path) {
  assert.ok(typeof path === 'string' && path.length > 0 && !path.includes('\\') && !path.startsWith('/') &&
    path.split('/').every(part => part && part !== '.' && part !== '..'), 'Boundary path must stay inside the repository');
  return path;
}
export function readBoundaryFile(root, path, limit) {
  safePath(path);
  let cursor = root;
  for (const part of path.split('/')) { cursor = join(cursor, part); assert.ok(!lstatSync(cursor).isSymbolicLink(), 'Boundary input cannot traverse symlinks'); }
  const fd = openSync(join(root, path), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd, { bigint: true });
    assert.ok(before.isFile() && Number.isSafeInteger(limit) && limit >= 0 && before.size <= BigInt(limit), 'Boundary input exceeds its byte limit');
    const body = Buffer.alloc(Number(before.size) + 1); let used = 0;
    while (used < body.length) { const n = readSync(fd, body, used, body.length - used, null); if (!n) break; used += n; }
    const after = fstatSync(fd, { bigint: true }), named = lstatSync(join(root, path), { bigint: true });
    assert.ok(used === Number(before.size) && ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => before[key] === after[key] && after[key] === named[key]), 'Boundary input changed while captured');
    return body.subarray(0, used);
  } finally { closeSync(fd); }
}
export function parseArguments(argv) {
  const options = {}, keys = { '--manifest': 'manifest', '--archive': 'archive', '--receipt': 'receipt', '--sql': 'sql', '--wrangler': 'wrangler', '--registry-mode': 'registryMode' };
  for (let i = 0; i < argv.length; i++) {
    const key = keys[argv[i]], value = argv[i + 1];
    assert.ok(key && !Object.hasOwn(options, key) && value && !value.startsWith('--'), 'Unknown, duplicate or missing verification argument');
    options[key] = argv[++i];
  }
  for (const key of ['manifest', 'archive', 'receipt', 'sql', 'wrangler']) assert.ok(options[key], `Required: --${key}`);
  assert.ok(['empty', 'activated'].includes(options.registryMode ?? 'empty'), 'Registry mode must be empty or activated');
  return options;
}
const git = (root, args, options = {}) => execFileSync('git', ['--no-replace-objects', ...args], {
  cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
function treeEntries(root, tree) {
  assert.match(tree, /^[a-f0-9]{40}$/); assert.equal(git(root, ['cat-file', '-t', tree]).trim(), 'tree');
  const entries = new Map();
  for (const line of git(root, ['ls-tree', '-r', '-z', '--full-tree', tree]).split('\0').filter(Boolean)) {
    const tab = line.indexOf('\t'), [mode, type, oid] = line.slice(0, tab).split(' '), path = line.slice(tab + 1);
    assert.ok(tab > 0 && /^[a-f0-9]{40}$/.test(oid) && !entries.has(path), 'Invalid boundary Git-tree inventory');
    entries.set(path, { mode, type, oid });
  }
  return entries;
}
function assertGitRecord(root, entries, row) {
  const entry = entries.get(row.path);
  assert.ok(entry && ['100644', '100755'].includes(entry.mode) && entry.type === 'blob', 'Boundary source must be a regular reviewed Git blob');
  assert.equal(Number(git(root, ['cat-file', '-s', entry.oid]).trim()), row.bytes);
  const body = git(root, ['cat-file', 'blob', entry.oid], { encoding: 'buffer', maxBuffer: row.bytes + 1024 });
  assert.deepEqual(digest(body), { bytes: row.bytes, sha256: row.sha256 }, `Boundary source tree bytes differ: ${row.path}`);
}
export function captureBoundaryRecords(origin, replayRoot, records) {
  assert.ok(Array.isArray(records) && records.length > 0 && records.length <= 512);
  const buffers = new Map(); let total = 0;
  for (const row of records) {
    safePath(row.path); assert.ok(!buffers.has(row.path) && Number.isSafeInteger(row.bytes) && row.bytes >= 0 && row.bytes <= 16 * 1024 * 1024 && hash(row.sha256));
    const body = readBoundaryFile(origin, row.path, row.bytes);
    assert.deepEqual(digest(body), { bytes: row.bytes, sha256: row.sha256 }, `Boundary source changed before capture: ${row.path}`);
    total += body.length; assert.ok(total <= 128 * 1024 * 1024, 'Boundary source inventory exceeds its total cap');
    const path = join(replayRoot, row.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, body, { flag: 'wx', mode: 0o444 });
    buffers.set(row.path, body);
  }
  return buffers;
}
// Exported for bounded source-race fixtures. Real CLI inputs still go through
// captureReviewedParent below; this loader grants no receipt or D1 acceptance.
export function installCapturedParentHooks({ root, records, buffers, executionLedgerPath, metadata = {} }) {
  const pinned = new Map(records.map(row => [row.path, { ...row }])), sources = new Map();
  assert.equal(pinned.size, records.length, 'Duplicate parent evaluation records');
  for (const [path, bytes] of buffers) {
    assert.ok(pinned.has(path)); assert.deepEqual(digest(bytes), { bytes: pinned.get(path).bytes, sha256: pinned.get(path).sha256 });
    sources.set(path, Buffer.from(bytes)); // Private immutable-by-convention copies returned to Node.
  }
  const loaded = new Map();
  const ledger = { schema_version: 1, status: 'running', boundary: 'exact-buffer-module-loader', root, ...metadata, loaded_sources: [] };
  const save = () => { ledger.loaded_sources = [...loaded.values()].sort((a, b) => a.path.localeCompare(b.path)); writeFileSync(executionLedgerPath, jsonBytes(ledger)); };
  const localPath = url => {
    assert.ok(url.startsWith('file:'), `Unbound parent module URL: ${url}`);
    const value = new URL(url); assert.ok(!value.search && !value.hash, 'Parent module query/fragment is unbound');
    const path = relative(root, fileURLToPath(value)).split(sep).join('/'); safePath(path);
    assert.ok(pinned.has(path) && sources.has(path), `Parent import escaped captured ledger: ${path}`);
    return path;
  };
  save();
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      if (!result.url.startsWith('node:')) localPath(result.url); // Also rejects already-cached live URLs.
      return result;
    },
    load(url, context, nextLoad) {
      if (url.startsWith('node:')) return nextLoad(url, context);
      const path = localPath(url), source = sources.get(path);
      assert.ok(!/\.d\.(?:ts|mts)$/.test(path), 'Declaration sources must never execute');
      assert.ok(/\.(?:mjs|js|json|ts)$/.test(path), 'Unsupported parent evaluation format');
      const row = pinned.get(path); assert.deepEqual(digest(source), { bytes: row.bytes, sha256: row.sha256 });
      let executed = source, transformation = null;
      if (path.endsWith('.ts')) {
        // Strip only the verified raw Buffer. Node's builtin parser is the
        // declared runtime dependency; never delegate TS loads to filesystem.
        const text = source.toString('utf8'); assert.deepEqual(Buffer.from(text), source, 'Parent TS source must be valid UTF-8');
        executed = Buffer.from(stripTypeScriptTypes(text, { mode: 'strip', sourceUrl: url }), 'utf8');
        const output = digest(executed), outputPath = `transformed/${output.sha256}.mjs`;
        mkdirSync(join(dirname(executionLedgerPath), 'transformed'), { recursive: true });
        writeFileSync(join(dirname(executionLedgerPath), outputPath), executed, { flag: 'wx', mode: 0o444 });
        transformation = { api: 'node:module.stripTypeScriptTypes', mode: 'strip', node_version: process.versions.node,
          source_url: url, output_path: outputPath };
      }
      loaded.set(path, { ...row, evaluated_source: 'loader_returned_exact_buffer', executed_source: digest(executed), transformation }); save();
      return { format: path.endsWith('.json') ? 'json' : 'module', source: Buffer.from(executed), shortCircuit: true };
    },
  });
  return { loaded, ledger, finish(status) { ledger.status = status; try { save(); } finally { hooks.deregister(); sources.clear(); } },
    assertLoaded(path) { assert.ok(loaded.has(path), `Required parent module was not loaded through the captured boundary: ${path}`); } };
}
export function writeBoundaryGitPointer(origin, root) {
  const gitDirectory = git(origin, ['rev-parse', '--absolute-git-dir']).trim(); assert.ok(gitDirectory.startsWith('/'));
  writeFileSync(join(root, '.git'), `gitdir: ${gitDirectory}\n`, { flag: 'wx', mode: 0o444 });
  return gitDirectory;
}
export function captureReviewedParent(options, origin = ORIGIN) {
  const local = join(origin, 'apps/frontend/.local'); mkdirSync(local, { recursive: true });
  const directory = mkdtempSync(join(local, 'mw3-parent-boundary-')), root = join(directory, 'repository'); mkdirSync(root);
  try {
  const inputBytes = {}, inputRecords = {}, limits = { manifest: 2 * 1024 * 1024, archive: 8 * 1024 * 1024, receipt: 2 * 1024 * 1024, sql: 128 * 1024 * 1024 };
  const registryMode = options.registryMode ?? 'empty'; assert.ok(['empty', 'activated'].includes(registryMode));
  const capturedOptions = { wrangler: resolve(options.wrangler), registryMode };
  for (const [kind, limit] of Object.entries(limits)) {
    const path = relative(origin, resolve(options[kind])).split(sep).join('/'); safePath(path);
    inputBytes[kind] = readBoundaryFile(origin, path, limit); inputRecords[kind] = { original_path: path, ...digest(inputBytes[kind]) };
    const captured = join(root, '.local/bootstrap-input', `${kind}.saved`); mkdirSync(dirname(captured), { recursive: true });
    writeFileSync(captured, inputBytes[kind], { flag: 'wx', mode: 0o444 }); capturedOptions[kind] = captured;
  }
  const manifest = JSON.parse(inputBytes.manifest), receipt = JSON.parse(inputBytes.receipt);
  assert.ok(manifest.schema_version === 1 && manifest.kind === 'mw3-artifact-snapshot' && manifest.approval === 'unapproved');
  assert.ok(receipt.kind === 'mw3-independent-acceptance' && receipt.status === 'independently-reviewed' && receipt.reviewer_model === 'gpt-6-astra' &&
    receipt.manifest_sha256 === inputRecords.manifest.sha256 && receipt.archive_sha256 === inputRecords.archive.sha256 &&
    receipt.source_tree === manifest.source_tree && receipt.sources_sha256 === manifest.sources_sha256 && receipt.inputs_sha256 === manifest.inputs_sha256,
    'Bootstrap requires a separate source/input-bound independent receipt before application ESM evaluation');
  assert.deepEqual(digest(inputBytes.archive), { bytes: manifest.archive?.bytes, sha256: manifest.archive?.sha256 });
  for (const key of ['sources', 'inputs']) assert.ok(Array.isArray(manifest[key]) && manifest[key].length > 0 && manifest[key].length <= 256 && sha(jsonBytes(manifest[key])) === manifest[`${key}_sha256`]);
  const records = [...manifest.sources, ...manifest.inputs];
  for (const required of REQUIRED) assert.ok(manifest.sources.some(row => row.path === required), `Required parent source absent from manifest: ${required}`);
  const entries = treeEntries(origin, manifest.source_tree);
  for (const row of records) { safePath(row.path); assert.ok(Number.isSafeInteger(row.bytes) && row.bytes >= 0 && row.bytes <= 16 * 1024 * 1024 && hash(row.sha256)); assertGitRecord(origin, entries, row); }
  const migrations = [...entries].filter(([path]) => /^apps\/backend\/migrations\/\d+[^/]*\.sql$/.test(path)).map(([path, entry]) => {
    assert.ok(['100644', '100755'].includes(entry.mode) && entry.type === 'blob');
    const size = Number(git(origin, ['cat-file', '-s', entry.oid]).trim()); assert.ok(Number.isSafeInteger(size) && size > 0 && size <= 16 * 1024 * 1024);
    const body = git(origin, ['cat-file', 'blob', entry.oid], { encoding: 'buffer', maxBuffer: size + 1024 });
    return { path, ...digest(body), provenance: 'reviewed_git_tree_fixture_migration' };
  });
  assert.ok(migrations.length > 0);
  const allRecords = [...records, ...migrations], buffers = captureBoundaryRecords(origin, root, allRecords);
  assert.equal(sha(buffers.get('apps/frontend/scripts/ci/postflop-command-supervisor.py')), OWNER_SHA);
  // Read-only Git object provenance is retained. This is a metadata pointer,
  // never a source import, and does not change the origin's Git configuration.
  const gitDirectory = writeBoundaryGitPointer(origin, root);
  writeFileSync(join(directory, 'capture.json'), jsonBytes({ schema_version: 1, origin, root, source_tree: manifest.source_tree,
    registry_mode: registryMode, original_inputs: inputRecords, sources: allRecords, trusted_entry: 'builtin-only bootstrap and installed Node; bootstrap evaluated bytes are not loader-attested', git_metadata_directory: gitDirectory }), { flag: 'wx' });
  return { directory, root, records: allRecords, buffers, capturedOptions, inputRecords, manifest };
  } catch (error) {
    try { writeFileSync(join(directory, 'capture-failure.json'), jsonBytes({ status: 'fail', message: error.message, root }), { flag: 'wx' }); }
    catch (secondary) { error.message += `; capture-evidence error: ${secondary.message}`; }
    error.message += ` (retained parent capture: ${directory})`; throw error;
  }
}
export async function verifyFromCapturedParent(options) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  assert.ok(major > 22 || major === 22 && minor >= 20, 'Node >=22.20 required for exact-buffer parent hooks');
  assert.equal(process.platform, 'linux');
  const preloads = /(?:^|\s)(?:--(?:import|require|loader|experimental-loader)(?:=|\s)|-r\S*(?:\s|$))/;
  assert.ok(!preloads.test(process.env.NODE_OPTIONS ?? '') && !process.execArgv.some(arg => /^(?:--(?:import|require|loader|experimental-loader)(?:=|$)|-r)/.test(arg)), 'Custom preload/loader options are outside the trusted strict entry boundary');
  const captured = captureReviewedParent(options), executionLedgerPath = join(captured.directory, 'parent.execution.json');
  const binding = installCapturedParentHooks({ ...captured, executionLedgerPath, metadata: { registry_mode: captured.capturedOptions.registryMode, original_inputs: captured.inputRecords,
    source_tree: captured.manifest.source_tree, trusted_entry: 'builtin-only bootstrap and installed Node' } });
  const parentBoundary = { root: captured.root + sep, executionLedgerPath,
    assertReady(url) { assert.equal(fileURLToPath(url), join(captured.root, PARENT_ENTRY)); binding.assertLoaded(PARENT_ENTRY); binding.assertLoaded('apps/frontend/scripts/ci/mw3-local-command.mjs'); binding.assertLoaded('apps/shared/mw3-approved.ts'); binding.assertLoaded('apps/frontend/scripts/ci/mw3-registry-mode.mjs'); },
    assertSnapshot(bytes, manifest) { assert.equal(sha(bytes), captured.inputRecords.manifest.sha256); assert.equal(manifest.source_tree, captured.manifest.source_tree);
      assert.equal(manifest.sources_sha256, captured.manifest.sources_sha256); assert.equal(manifest.inputs_sha256, captured.manifest.inputs_sha256); },
  };
  try {
    const parent = await import(pathToFileURL(join(captured.root, PARENT_ENTRY)).href);
    const result = await parent.verifyMw3LocalD1({ ...captured.capturedOptions, parentBoundary, log: text => console.error(text) });
    binding.finish('pass'); return result;
  } catch (error) {
    try { binding.finish('fail'); } catch (secondary) { error.message += `; execution-ledger failure: ${secondary.message}`; }
    error.message += ` (retained parent boundary: ${captured.directory})`; throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyFromCapturedParent(parseArguments(process.argv.slice(2))).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(`Strict LOCAL MW3 verification failed: ${error.message}`); process.exitCode = 1;
  });
}
