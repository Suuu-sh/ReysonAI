import test from 'node:test';
import assert from 'node:assert/strict';
import { MW3_APPROVED_POLICIES } from '../../shared/mw3-approved.ts';
import { createMw3DeliveryClient, isVerifiedMw3Kit, Mw3UnavailableError, mw3DeliveryUrl, readMw3ResponseText } from '../src/estimated/mw3-browser.ts';
import { deferred, deliveryFixture, repinHeader } from './helpers/mw3-consumer-fixture.mjs';
const fixture = await deliveryFixture();
const create = overrides => createMw3DeliveryClient({ ...fixture.readers, ...overrides });

test('empty build approval list rejects without fetching; URL parameters cannot authorize a candidate', async () => {
  assert.equal(MW3_APPROVED_POLICIES.length, 0); assert.ok(Object.isFrozen(MW3_APPROVED_POLICIES));
  let reads = 0;
  const client = createMw3DeliveryClient({ readManifest: async () => { reads++; throw Error('must not fetch'); }, readDataset: async () => { reads++; } });
  assert.equal(client.supportsSpot(fixture.id), false);
  await assert.rejects(client.load(fixture.id), error => error instanceof Mw3UnavailableError && error.reason === 'unapproved');
  assert.equal(reads, 0);
  assert.equal(mw3DeliveryUrl('part', { delivery: 'a'.repeat(64), part: '0' }, 'https://api.example/'), `https://api.example/v1/mw3/part?delivery=${'a'.repeat(64)}&part=0`);
});
test('only both trusted stages with full input/hash/node validation produce a usable kit', async () => {
  const kit = await fixture.client.load(fixture.id);
  assert.equal(kit.kind, 'mw3_srp'); assert.equal(kit.spotId, fixture.id); assert.equal(kit.inputs.fingerprint, fixture.inputs.fingerprint);
  assert.ok(isVerifiedMw3Kit(kit)); assert.equal(isVerifiedMw3Kit({ ...kit }), false);
  assert.ok(Object.isFrozen(kit.policies.flop.rules)); assert.ok(Object.isFrozen(kit.policies.flop.rules[0].mix));
  assert.throws(() => { kit.policies.flop.rules[0].mix.check = 1; }, TypeError);
  assert.equal(create({ registry: fixture.pins.slice(0, 1) }).supportsSpot(fixture.id), false);
  assert.throws(() => create({ registry: [...fixture.pins, fixture.pins[0]] }), /approval pins/);
});
test('raw manifest bytes, each part identity and body hash are mandatory', async () => {
  await assert.rejects(create({ readManifest: async hash => (await fixture.readers.readManifest(hash)) + ' ' }).load(fixture.id));
  await assert.rejects(create({ readPart: async (hash, part) => ({ ...await fixture.readers.readPart(hash, part), part: part + 1 }) }).load(fixture.id));
  await assert.rejects(create({ readPart: async (hash, part) => ({ ...await fixture.readers.readPart(hash, part), body: 'corrupt' }) }).load(fixture.id));
});
test('source, implementation, schema, scope, policy and cross-stage pins cannot come from metadata', async () => {
  for (const change of [header => { header.metadata.source_hash = 'b'.repeat(64); },
    header => { header.metadata.implementation_hash = 'b'.repeat(64); }, header => { header.metadata.schema_version = 2; },
    header => { header.manifest.spotId = 'BTN_open_BB_call'; }, header => { header.manifest.policyHash = 'b'.repeat(64); },
    header => { header.stage = 'later'; }, header => { header.manifest.parts = 0; }]) {
    const readers = await repinHeader(fixture, 'flop', change);
    await assert.rejects(createMw3DeliveryClient(readers).load(fixture.id));
  }
  const mismatchedPair = fixture.pins.map(pin => pin.stage === 'later' ? { ...pin, implementationHash: 'b'.repeat(64) } : pin);
  await assert.rejects(create({ registry: mismatchedPair }).load(fixture.id));
  const stalePins = fixture.pins.map(pin => ({ ...pin, sourceHash: 'b'.repeat(64) }));
  await assert.rejects(create({ registry: stalePins }).load(fixture.id), error => error.reason === 'stale');
});
test('a self-consistent transported policy that omits a whole engine node is still unavailable', async () => {
  const missing = await deliveryFixture({ mutate(policy, stage) { if (stage === 'flop') { const first = policy.rules[0].node; policy.rules = policy.rules.filter(rule => rule.node !== first); } } });
  await assert.rejects(missing.client.load(missing.id));
});
test('cancelled view does not cancel another consumer; failures are retryable and successes shared', async () => {
  const gate = deferred(), entered = deferred(); let calls = 0;
  const client = create({ readManifest: async hash => { calls++; entered.resolve(); await gate.promise; return fixture.readers.readManifest(hash); } });
  const controller = new AbortController();
  const cancelled = client.load(fixture.id, controller.signal), kept = client.load(fixture.id);
  await entered.promise; controller.abort(); await assert.rejects(cancelled, { name: 'AbortError' });
  gate.resolve(); const kit = await kept;
  assert.equal(await client.load(fixture.id), kit); assert.equal(calls, 2);
  let fail = true;
  const retry = create({ readManifest: async hash => { if (fail) throw Error('temporary'); return fixture.readers.readManifest(hash); } });
  await assert.rejects(retry.load(fixture.id)); fail = false;
  assert.ok(isVerifiedMw3Kit(await retry.load(fixture.id)));
});
function streamed(chunks, headers = {}) {
  let cancelled = false;
  const response = new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); }, cancel() { cancelled = true; } }), { headers });
  return { response, cancelled: () => cancelled };
}
test('stream limit is measured in UTF8 bytes across chunks and cancels at boundary+1', async () => {
  const bytes = new TextEncoder().encode('あ😀ok');
  const valid = new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, 4)); controller.enqueue(bytes.slice(4)); controller.close(); } }));
  assert.equal(await readMw3ResponseText(valid, bytes.length), 'あ😀ok');
  for (const headers of [{}, { 'content-length': '1' }]) {
    const tooLarge = streamed([new Uint8Array(100), new Uint8Array(101)], headers);
    await assert.rejects(readMw3ResponseText(tooLarge.response, 200)); assert.equal(tooLarge.cancelled(), true);
  }
  const declared = streamed([new Uint8Array(1)], { 'content-length': '201' });
  await assert.rejects(readMw3ResponseText(declared.response, 200)); assert.equal(declared.cancelled(), true);
  const invalid = new Response(new Uint8Array([0xc3, 0x28]));
  await assert.rejects(readMw3ResponseText(invalid, 20));
});
test('verified success cache is a two-spot LRU; eviction preserves active consumer references', async () => {
  const second = await deliveryFixture({ id: 'HJ_open_CO_call_BTN_call' }), third = await deliveryFixture({ id: 'UTG_open_HJ_call_BB_call' });
  const fixtures = [fixture, second, third], transports = new Map(fixtures.flatMap(item => [...item.transports]));
  let reads = 0;
  const client = createMw3DeliveryClient({ registry: fixtures.flatMap(item => item.pins), readDataset: fixture.readers.readDataset,
    readManifest: async hash => { reads++; return transports.get(hash).headerText; },
    readPart: async (hash, part) => { const row = transports.get(hash).parts[part]; return { part, body: row.body }; } });
  const firstKit = await client.load(fixture.id); await client.load(second.id); client.touchSpot(fixture.id); await client.load(third.id);
  assert.equal(reads, 6); assert.ok(isVerifiedMw3Kit(firstKit));
  assert.equal(await client.load(fixture.id), firstKit); assert.equal(reads, 6);
  await client.load(second.id); assert.equal(reads, 8); await client.load(third.id);
  const reloaded = await client.load(fixture.id); assert.equal(reads, 12); assert.notEqual(reloaded, firstKit);
  assert.equal(reloaded.inputs.fingerprint, firstKit.inputs.fingerprint); assert.ok(isVerifiedMw3Kit(firstKit));
});
test('wire UTF8 BOM is preserved across chunks and cannot bypass exact raw manifest hashing', async () => {
  const original = fixture.readers.readManifest;
  const client = create({ readManifest: async hash => {
    const text = await original(hash), bytes = new TextEncoder().encode(text);
    const response = new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array([0xef])); controller.enqueue(new Uint8Array([0xbb, 0xbf])); controller.enqueue(bytes); controller.close();
    } }));
    const decoded = await readMw3ResponseText(response);
    assert.equal(decoded.charCodeAt(0), 0xfeff);
    return decoded;
  } });
  await assert.rejects(client.load(fixture.id), error => error.reason === 'stale');
});
