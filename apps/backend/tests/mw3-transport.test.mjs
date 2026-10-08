import test from 'node:test';
import assert from 'node:assert/strict';
import { routeMw3Transport } from '../src/mw3-transport.ts';
import { prepareMw3Transport } from '../../frontend/scripts/postflop-ai/mw3-transport.mjs';
import { MW3_TIERS } from '../../frontend/scripts/postflop-ai/mw3-hand-features.mjs';
import { mw3TextSha, restoreMw3PolicyParts } from '../../frontend/scripts/postflop-ai/mw3-delivery.mjs';

async function fixture() {
  const policy = { version: 3, kind: 'ai_estimate_not_gto', spot_id: 'CO_BTN_BB', streets: ['flop'], rules: MW3_TIERS.map(tier => (
    { node: 'mw3_flop_first_first', tier, priority: 0, when: { line: 'any', texture: 'any', players: 'any', position: 'any', response: 'any', price: 'any', spr: 'any' }, mix: { check: 100, bet33: 0, bet75: 0, bet125: 0 } }
  )) };
  const artifact = { metadata: { spot: policy.spot_id, policy_hash: await mw3TextSha(JSON.stringify(policy)), approval_status: 'candidate_pending_independent_review' }, policy };
  const record = await prepareMw3Transport(artifact, 'flop');
  const approved = [{ spotId: policy.spot_id, stage: 'flop', deliveryHash: record.deliveryHash }];
  let queries = 0, broken = '', duplicate = false;
  const db = { prepare(sql) { assert.match(sql, /^SELECT /); assert.match(sql, /mw3_policy_(deliveries|parts)/); queries++;
    return { bind(...values) { assert.equal(values[0], record.deliveryHash);
      return { async all() {
        if (broken === 'throw') throw new Error('private database detail');
        const rows = sql.includes('header_json') ? [{ spot_id: policy.spot_id, stage: 'flop', header_json: record.headerText + (broken === 'header' ? ' ' : '') }]
          : record.parts.filter(part => part.part === values[1]).map(part => ({ body: part.body + (broken === 'part' ? ' ' : '') }));
        return { results: duplicate ? [...rows, ...rows] : rows };
      } };
    } };
  } };
  const request = (path = 'manifest', extra = '', init, registry = approved) => routeMw3Transport(new Request(`https://edge.test/v1/mw3/${path}?delivery=${record.deliveryHash}${extra}`, init), db, registry);
  return { policy, record, approved, db, request, count: () => queries, break: value => { broken = value; }, duplicate: () => { duplicate = true; } };
}

test('mw3 delivery is closed by default and cannot publish through a query or D1 row', async () => {
  const f = await fixture();
  const response = await f.request('manifest', '', undefined, []);
  assert.equal(response.status, 404);
  assert.equal(f.count(), 0);
  for (const extra of ['&approved=true', '&delivery=other', '&stage=flop', '&part=0']) assert.equal((await f.request('manifest', extra)).status, 400);
  assert.equal(f.count(), 0);
  assert.equal((await routeMw3Transport(new Request('https://edge.test/v1/mw3/manifest?delivery=' + f.record.deliveryHash), f.db)).status, 404);
});

test('review-pinned synthetic test registry permits only exact bytes; browser restores the identical policy', async () => {
  const f = await fixture(), response = await f.request();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), f.record.headerText);
  assert.equal(response.headers.get('etag'), `"${f.record.deliveryHash}"`);
  const conditional = await f.request('manifest', '', { headers: { 'if-none-match': `W/"${f.record.deliveryHash}"` } });
  assert.equal(conditional.status, 304);
  const parts = [];
  for (const part of f.record.parts) {
    const result = await f.request('part', '&part=' + part.part);
    assert.equal(result.status, 200); parts.push(await result.json());
  }
  assert.deepEqual(await restoreMw3PolicyParts(f.record.header.manifest, parts), f.policy);
  assert.equal((await f.request('part', '&part=99')).status, 404);
});

test('corrupt, duplicate, missing or exceptional delivery fails closed even for conditional GET', async () => {
  for (const corruption of ['header', 'part', 'throw', 'duplicate']) {
    const f = await fixture();
    if (corruption === 'duplicate') f.duplicate(); else f.break(corruption);
    const response = await f.request('part', '&part=0', { headers: { 'if-none-match': '*' } });
    assert.equal(response.status, 503, corruption);
    assert.deepEqual(await response.json(), { error: 'delivery_unavailable' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('etag'), null);
  }
});

test('invalid part selectors and non-GET methods never touch D1', async () => {
  const f = await fixture();
  for (const part of ['', '-1', '00', '1.0', '1e1', '10000', 'NaN', '0&part=0']) assert.equal((await f.request('part', '&part=' + part)).status, 400, part);
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
    const response = await f.request('manifest', '', { method });
    assert.equal(response.status, 405); assert.equal(response.headers.get('allow'), 'GET');
  }
  assert.equal((await f.request('other')).status, 404);
  assert.equal(f.count(), 0);
});
