// New closed graph paired with, never replacing, the frozen strict gate graph/raw12.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AUDIT_REPOSITORY, auditFileRecord, captureSourceGraph } from './audit-identity.mjs';
import { captureModel11GateSource } from './model11-gate-source.mjs';
import { same, gateFail } from './model11-gate-contract.mjs';
import { contentHash } from './effective-law-identity.mjs';
export const COMPLETION_REPRESENTATIVE_ROOTS = ['apps/frontend/scripts/postflop-ai/evaluate-model11-completion-representative.mjs'];
const manifestPath = 'apps/frontend/tests/fixtures/model11-completion-representative-source-graph.json';
export function captureCompletionRepresentativeSource({ root = AUDIT_REPOSITORY } = {}) {
  const strictBalance = captureModel11GateSource({ root }), manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'));
  const sources = captureSourceGraph({ root, roots: COMPLETION_REPRESENTATIVE_ROOTS });
  if (!same(manifest, { kind: 'model11-completion-representative-closed-source-inventory', version: 1, roots: COMPLETION_REPRESENTATIVE_ROOTS, sources })) gateFail('Completion representative source differs from reviewed closed inventory');
  const body = { kind: 'model11-strict-balance-composite-behavior-source-identity', version: 1, strictBalance,
    compositeBehavior: { roots: COMPLETION_REPRESENTATIVE_ROOTS, inventory: auditFileRecord(root, manifestPath), sources }, inputs: strictBalance.inputs };
  return { ...body, identityHash: contentHash(body) };
}
