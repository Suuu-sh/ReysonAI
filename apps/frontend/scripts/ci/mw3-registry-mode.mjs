// Local verification modes select a proof contract, never publication authority.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const sha = body => createHash('sha256').update(body).digest('hex');
export function assertRegistryMode(mode = 'empty') {
  assert.ok(['empty', 'activated'].includes(mode), 'Registry mode must be empty or activated');
  return mode;
}
export function assertApiPhase(mode, phase) {
  assertRegistryMode(mode);
  assert.ok(Number.isInteger(phase) && phase >= 0 && phase <= (mode === 'empty' ? 1 : 3), 'API phase is outside the bounded registry-mode contract');
}
export function registryHealth(contract) {
  assertRegistryMode(contract.mode);
  if (contract.mode === 'empty') {
    assert.equal(contract.entries, 0);
    return { local_only: true, registry_entries: 0 };
  }
  assert.ok(Number.isInteger(contract.entries) && contract.entries >= 2 && contract.entries <= 32 && contract.entries % 2 === 0);
  for (const key of ['source_sha256', 'pins_sha256', 'subject_pair_sha256']) assert.match(contract[key], /^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(contract.subject_pair) && contract.subject_pair.length === 2);
  assert.equal(sha(JSON.stringify(contract.subject_pair)), contract.subject_pair_sha256);
  return { local_only: true, registry_entries: contract.entries, registry_mode: contract.mode,
    registry_source_sha256: contract.source_sha256, registry_pins_sha256: contract.pins_sha256,
    subject_pair_sha256: contract.subject_pair_sha256, subject_pair: contract.subject_pair };
}
export function apiPhaseRows(prepared, probe = null) {
  return prepared.deliveries.map(delivery => {
    const row = { stage: delivery.stage, delivery_hash: delivery.deliveryHash,
      restored_policy_sha256: sha(JSON.stringify(prepared.snapshot.candidates[delivery.stage === 'flop' ? 'candidate' : 'laterCandidate'].policy)), parts: delivery.parts.length };
    if (probe?.delivery_hash === delivery.deliveryHash) {
      assert.ok(['header', 'part'].includes(probe.kind));
      return { stage: row.stage, delivery_hash: row.delivery_hash, rejected_corruption: probe.kind,
        ...(probe.kind === 'part' ? { part: probe.part } : {}) };
    }
    return row;
  });
}
