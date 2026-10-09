import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { auditFileRecord, AUDIT_REPOSITORY, captureAuditIdentity, captureSourceGraph, identityHash } from '../scripts/postflop-ai/audit-identity.mjs';
import { assertCurrentSources, reviewedInputPaths, reviewedSourcePaths } from '../scripts/postflop-ai/reviewed-postflop.mjs';

const UI = 'apps/frontend/src/estimated/postflop-trial.ts';
const CORE = 'apps/frontend/scripts/postflop-ai/street-state.mjs';
const BOARD = 'apps/frontend/scripts/postflop-ai/audit-all-boards.mjs';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'hu-numeric-ui-boundary-'));
  const write = (path, body) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), body); };
  const paths = new Set([...reviewedSourcePaths(), ...captureAuditIdentity().sources.map(row => row.path), ...captureSourceGraph({ roots: [BOARD] }).map(row => row.path)]);
  for (const path of paths) write(path, readFileSync(join(AUDIT_REPOSITORY, path)));
  // Source/receipt tests hash raw bytes only. Synthetic isolated inputs avoid
  // loading strategies or copying large datasets; they never enter acceptance.
  for (const path of reviewedInputPaths()) write(path, '{}\n');
  const manifest = { sources: reviewedSourcePaths(root).map(path => auditFileRecord(root, path)),
    inputs: reviewedInputPaths().map(path => auditFileRecord(root, path)) };
  return { root, write, manifest };
}

test('numeric graph reaches the shared core and retains all numerical inputs/configs, while review binds UI separately', () => {
  const identity = captureAuditIdentity();
  assert.ok(identity.sources.some(row => row.path === CORE));
  assert.ok(!identity.sources.some(row => row.path === UI));
  assert.equal(identity.inputs.length, 12);
  for (const path of ['apps/frontend/src/estimated/sizing.ts', 'apps/frontend/src/estimated/datasets.ts', 'apps/frontend/src/estimated/opponent-profiles.ts',
    'configs/cash-6max-100bb.json', 'configs/multiway-preflop-stage2.json']) assert.ok(identity.sources.some(row => row.path === path), path);
  assert.ok(reviewedSourcePaths().includes(UI));
  assert.ok(reviewedSourcePaths().includes(CORE));
});

test('a UI-only terminal field edit leaves numerical/all-board identity unchanged but invalidates the publication source receipt', () => {
  const { root, write, manifest } = fixture();
  try {
    const before = captureAuditIdentity({ root }), boardBefore = captureSourceGraph({ root, roots: [BOARD] });
    assert.doesNotThrow(() => assertCurrentSources(root, manifest));
    const body = readFileSync(join(root, UI), 'utf8');
    assert.ok(body.includes('end.continuationTerminal?.live_participants ??'));
    write(UI, body.replace('end.continuationTerminal?.live_participants ??', 'end.stage3Terminal?.live_participants ?? end.continuationTerminal?.live_participants ??'));
    assert.deepEqual(captureAuditIdentity({ root }), before);
    assert.deepEqual(captureSourceGraph({ root, roots: [BOARD] }), boardBefore);
    assert.throws(() => assertCurrentSources(root, manifest), /source\/config\/input identity changed/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('core/config/raw input mutations still invalidate numerical source and publication receipts', () => {
  const { root, write, manifest } = fixture();
  try {
    for (const path of [CORE, 'configs/cash-6max-100bb.json', 'configs/multiway-preflop-stage2.json', ...reviewedInputPaths()]) {
      const original = readFileSync(join(root, path));
      const before = identityHash(captureAuditIdentity({ root }));
      write(path, Buffer.concat([original, Buffer.from('\n')]));
      assert.notEqual(identityHash(captureAuditIdentity({ root })), before, path);
      assert.throws(() => assertCurrentSources(root, manifest), /source\/config\/input identity changed/, path);
      write(path, original);
    }
    assert.doesNotThrow(() => assertCurrentSources(root, manifest));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing or symlink core and explicitly reviewed UI cannot be excluded from provenance', () => {
  const { root, write, manifest } = fixture();
  try {
    for (const path of [CORE, UI]) {
      const body = readFileSync(join(root, path)); rmSync(join(root, path));
      assert.throws(() => assertCurrentSources(root, manifest), /ENOENT|Missing/);
      if (path === CORE) assert.throws(() => captureAuditIdentity({ root }), /ENOENT/);
      symlinkSync(join(root, 'configs/cash-6max-100bb.json'), join(root, path));
      assert.throws(() => assertCurrentSources(root, manifest), /symlink|Symbolic/i);
      if (path === CORE) assert.throws(() => captureAuditIdentity({ root }), /symlink/i);
      rmSync(join(root, path)); write(path, body);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
