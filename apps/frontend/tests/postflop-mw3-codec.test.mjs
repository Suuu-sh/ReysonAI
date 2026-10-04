import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeMw3Policy, decodeMw3Policy } from '../scripts/postflop-ai/mw3-policy-codec.mjs';
import { mw3AnySelector } from '../scripts/postflop-ai/mw3-policy.mjs';
import { MW3_TIERS as TIERS } from '../scripts/postflop-ai/mw3-hand-features.mjs';
const policy = () => ({ rules: TIERS.map(tier => ({ tier, node: 'mw3_flop_first_first', mix: { bet75: 7, check: 81, bet125: 2, bet33: 10 },
  priority: 0, when: mw3AnySelector() })), version: 2, kind: 'ai_estimate_not_gto', spot_id: 'test-never-published', streets: ['flop'] });
test('compact transport preserves exact rules, integers and JSON key order', () => {
  const source = policy(), compact = encodeMw3Policy(source), restored = decodeMw3Policy(JSON.parse(JSON.stringify(compact)));
  assert.deepEqual(restored, source); assert.equal(JSON.stringify(restored), JSON.stringify(source));
  assert.equal(compact.mixes.length, 1); assert.equal(compact.selectors.length, 1);
});
test('malformed dictionaries cannot silently truncate, extend or alter saved policy coverage', () => {
  const compact = encodeMw3Policy(policy()); compact.rows[0][0] = 100;
  assert.throws(() => decodeMw3Policy(compact), /dictionary index/);
  const missing = encodeMw3Policy(policy()); missing.rows.pop(); assert.throws(() => decodeMw3Policy(missing), /fallback/);
  const unknown = encodeMw3Policy(policy()); unknown.rootOrder.push('unknown'); assert.throws(() => decodeMw3Policy(unknown), /envelope/);
});

test('delivery parts verify missing, repeated, reordered and corrupted payloads before policy use', async () => {
  const { prepareMw3PolicyParts, restoreMw3PolicyParts } = await import('../scripts/postflop-ai/mw3-delivery.mjs');
  const source = policy(), prepared = await prepareMw3PolicyParts(source);
  assert.equal(JSON.stringify(await restoreMw3PolicyParts(prepared.manifest, [...prepared.parts].reverse())), JSON.stringify(source));
  await assert.rejects(() => restoreMw3PolicyParts(prepared.manifest, []), /parts/);
  const corrupt = structuredClone(prepared); corrupt.parts[0].body = '[' + corrupt.parts[0].body.slice(1);
  await assert.rejects(() => restoreMw3PolicyParts(corrupt.manifest, corrupt.parts), /integrity/);
  const wrong = { ...prepared.manifest, policyHash: '0'.repeat(64) };
  await assert.rejects(() => restoreMw3PolicyParts(wrong, prepared.parts), /identity/);
});

test('multi-part Unicode transport never splits surrogate pairs and rejects duplicate/oversized parts', async () => {
  const { prepareMw3PolicyParts, restoreMw3PolicyParts } = await import('../scripts/postflop-ai/mw3-delivery.mjs');
  const source = policy(); source.spot_id = "'😀境界".repeat(8000);
  const prepared = await prepareMw3PolicyParts(source);
  assert.ok(prepared.parts.length > 2);
  for (const part of prepared.parts) {
    const last = part.body.charCodeAt(part.body.length - 1);
    assert.ok(last < 0xd800 || last > 0xdbff);
    assert.ok(new TextEncoder().encode(part.body).length <= 48000);
  }
  assert.equal(JSON.stringify(await restoreMw3PolicyParts(prepared.manifest, prepared.parts)), JSON.stringify(source));
  const repeated = structuredClone(prepared.parts); repeated[1].part = 0;
  await assert.rejects(() => restoreMw3PolicyParts(prepared.manifest, repeated), /parts/);
  const oversized = structuredClone(prepared.parts); oversized[0].body = 'x'.repeat(16001);
  await assert.rejects(() => restoreMw3PolicyParts(prepared.manifest, oversized), /parts/);
});
