import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { MW3_APPROVED_POLICIES } from '../../shared/mw3-approved.ts';

const hash = 'a'.repeat(64);
function forbiddenBindings() {
  return { ALLOWED_ORIGIN: 'https://app.example.com',
    DB: { prepare() { assert.fail('unpublished Mw3 must not read D1 or a HU version'); } },
    SOLUTIONS: { get() { assert.fail('Mw3 must not fall through to R2/HU'); } } };
}

test('worker exposes an explicitly unavailable Mw3 namespace with an immutable empty registry', async () => {
  assert.deepEqual(MW3_APPROVED_POLICIES, []);
  assert.equal(Object.isFrozen(MW3_APPROVED_POLICIES), true);
  for (const path of [`/v1/mw3/manifest?delivery=${hash}`, `/v1/mw3/part?delivery=${hash}&part=0`]) {
    const response = await worker.fetch(new Request('https://api.example.com' + path,
      { headers: { origin: 'https://app.example.com', 'if-none-match': '*' } }), forbiddenBindings());
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'unpublished_delivery' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('etag'), null);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://app.example.com');
  }
});

test('worker Mw3 registration cannot publish with writes, unknown routes or query flags', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
    const response = await worker.fetch(new Request(`https://api.example.com/v1/mw3/manifest?delivery=${hash}`, { method }), forbiddenBindings());
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const path of ['/v1/mw3', '/v1/mw3/publish', '/v1/mw3/unknown']) {
    const response = await worker.fetch(new Request('https://api.example.com' + path), forbiddenBindings());
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  }
  const response = await worker.fetch(new Request(`https://api.example.com/v1/mw3/manifest?delivery=${hash}&approved=true`), forbiddenBindings());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid_query' });
});
