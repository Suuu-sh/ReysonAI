// Fixed closed source inventory + all twelve dynamically read input files. No implicit graph fallback.
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { AUDIT_REPOSITORY, auditFileRecord, captureSourceGraph } from './audit-identity.mjs';
import { contentHash } from './effective-law-identity.mjs';
import { gateFail, same } from './model11-gate-contract.mjs';
import rawPins from '../../tests/fixtures/model11-gate-raw-inputs.json' with { type: 'json' };
export const MODEL11_GATE_SOURCE_ROOTS = ['apps/frontend/scripts/postflop-ai/evaluate-model11-audit.mjs'];
const manifestPath = 'apps/frontend/tests/fixtures/model11-gate-source-graph.json';
const inputNames = ['cold-four-bet-responses', 'cold-three-bet-responses', 'continuation-responses', 'four-bet-responses', 'limp-deep-responses', 'limp-responses', 'multiway-responses', 'multiway2-responses', 'opening-ranges', 'preflop-ranges', 'squeeze-responses', 'three-bet-responses'];
export function model11GateFile(path, root = AUDIT_REPOSITORY) {
  return auditFileRecord(root, relative(root, resolve(path)).replaceAll('\\', '/'));
}
export function captureModel11GateSource({ root = AUDIT_REPOSITORY } = {}) {
  const manifestRecord = auditFileRecord(root, manifestPath);
  const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'));
  if (manifest.kind !== 'model11-gate-closed-source-inventory' || manifest.version !== 1 || !same(manifest.roots, MODEL11_GATE_SOURCE_ROOTS) || !Array.isArray(manifest.sources)) gateFail('Missing or invalid closed source inventory');
  const sources = captureSourceGraph({ root, roots: MODEL11_GATE_SOURCE_ROOTS });
  if (!same(sources, manifest.sources)) gateFail('Source graph is missing, changed, or outside the reviewed closed inventory; regenerate and review a new identity');
  if (!same(rawPins.files.map(row => row.path), inputNames.map(name => `apps/frontend/src/estimated/${name}.json`))) gateFail('The complete exact twelve-input contract is required');
  const inputs = rawPins.files.map(record => auditFileRecord(root, record.path));
  if (!same(inputs, rawPins.files)) gateFail('Raw input bytes differ from the exact preserved twelve-input pins');
  const identity = { kind: 'model11-full-gate-source-identity', version: 1, roots: MODEL11_GATE_SOURCE_ROOTS,
    inventory: manifestRecord, sources, inputs };
  return { ...identity, identityHash: contentHash(identity) };
}
