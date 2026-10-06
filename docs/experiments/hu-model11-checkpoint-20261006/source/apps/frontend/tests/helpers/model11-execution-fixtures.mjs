import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { loadInputs } from '../../scripts/postflop-ai/inputs.mjs';
import { createModel11Execution } from '../../scripts/postflop-ai/execution-model11.mjs';
export const selection = JSON.parse(readFileSync(new URL('../fixtures/model11-execution-artifacts.json', import.meta.url)));
const repository = new URL('../../../../', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function pinnedArtifact(path) {
  const record = selection.files.find(row => row.path === path); assert.ok(record, 'Artifact must be predeclared');
  const bytes = readFileSync(new URL(path, repository)); assert.equal(bytes.length, record.bytes); assert.equal(digest(bytes), record.sha256);
  return JSON.parse(bytes);
}
export const BTN = 'BTN_open_SB_3bet_BB_call_BTN_fold';
export function fixture(caseNumber = null) {
  const spec = caseNumber === null ? null : selection.cases.find(row => row.caseNumber === caseNumber);
  const spot = spec?.spot ?? BTN, inputs = loadInputs(spot);
  const flop = pinnedArtifact(spec?.policies.flop.path ?? selection.files.find(row => row.path.endsWith('btn-open-sb-3bet-bb-call-btn-fold-hu-v1-policy.json')).path);
  const later = pinnedArtifact(spec?.policies.later.path ?? selection.files.find(row => row.path.endsWith('btn-open-sb-3bet-bb-call-btn-fold-hu-v1-later-policy.json')).path);
  return { inputs, flop, later, spec, execution: createModel11Execution(inputs, flop, later) };
}
export function emitFresh(name, value) {
  const report = { kind: 'fresh-model11-adapter-diagnostic-not-recovered-proof', name, ...value };
  if (!process.env.MODEL11_EVIDENCE_DIR) { console.log(JSON.stringify({ kind: report.kind, name, checks: value.checks ?? null })); return; }
  mkdirSync(process.env.MODEL11_EVIDENCE_DIR, { recursive: true });
  const path = resolve(process.env.MODEL11_EVIDENCE_DIR, `${name}.json`), bytes = JSON.stringify(report, null, 2) + '\n';
  writeFileSync(path, bytes, { flag: 'wx' });
  console.log(JSON.stringify({ path, bytes: Buffer.byteLength(bytes), sha256: digest(bytes), checks: value.checks ?? null }));
}
