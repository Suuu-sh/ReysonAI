import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { assertExistingDelivery, assertProductionContext, assertPublicCors, assertCredentialedCors, assertMw3DeliveryEtag, mw3IfNoneMatchHeaders, ensureMw3Published, verifyMw3Live } from '../scripts/mw3-production-delivery.mjs';

// Synthetic rows only: these never enter the canonical saved-inventory gate.
function fixture() {
  const db = new DatabaseSync(':memory:');
  const schema = readFileSync(new URL('../../backend/scripts/sql/mw3-schema.sql', import.meta.url), 'utf8');
  const mutations = [], events = [];
  db.exec("CREATE TABLE account_history (body TEXT); INSERT INTO account_history VALUES ('preserve-me');");
  const deliveries = Array.from({ length: 4 }, (_, index) => ({ deliveryHash: String(index + 1).repeat(64),
    stage: index % 2 ? 'later' : 'flop', header: { manifest: { spotId: `fixture_${Math.floor(index / 2)}` } },
    headerText: `synthetic-header-${index}`, parts: [0,1].map(part => ({ part, body: `synthetic-${index}-${part}` })) }));
  const plan = { entries: [0,2].map(i => ({ path: `synthetic-${i}`, deliveries: deliveries.slice(i,i+2) })), summary: { deliveries: 4, parts: 8 } };
  const rows = (sql, ...args) => JSON.parse(JSON.stringify(db.prepare(sql).all(...args)));
  const insert = entry => {
    db.exec('BEGIN');
    try {
      for (const d of entry.deliveries) {
        db.prepare('INSERT INTO mw3_policy_deliveries VALUES (?,?,?,?) ON CONFLICT DO NOTHING').run(d.deliveryHash,d.header.manifest.spotId,d.stage,d.headerText);
        for (const p of d.parts) db.prepare('INSERT INTO mw3_policy_parts VALUES (?,?,?) ON CONFLICT DO NOTHING').run(d.deliveryHash,p.part,p.body);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const io = {
    tables: () => rows("SELECT name FROM sqlite_schema WHERE name IN ('mw3_policy_deliveries','mw3_policy_parts')").map(r => r.name),
    checkSchema: names => { events.push(`schema-check:${names.length}`); },
    headers: d => { events.push(`read-header:${d.deliveryHash}`); return rows('SELECT spot_id,stage,header_json FROM mw3_policy_deliveries WHERE delivery_hash=?',d.deliveryHash); },
    parts: d => rows('SELECT part,body FROM mw3_policy_parts WHERE delivery_hash=? ORDER BY part',d.deliveryHash),
    bookmark: () => { mutations.push('bookmark'); },
    schema: () => { mutations.push('schema'); db.exec(schema); },
    import: entry => { mutations.push(entry.path); insert(entry); },
  };
  return { db, schema, plan, deliveries, io, events, mutations, insert };
}
test('first publication is additive, complete, idempotent and retains unrelated history', async () => {
  const f = fixture(); try {
    assert.deepEqual(await ensureMw3Published(f.plan, f.io), { imported_spots:2,verified_deliveries:4,verified_parts:8 });
    assert.deepEqual(f.mutations,['bookmark','schema','synthetic-0','synthetic-2']);
    assert.equal(f.db.prepare('SELECT body FROM account_history').get().body,'preserve-me');
    f.mutations.length=0;
    assert.equal((await ensureMw3Published(f.plan,f.io)).imported_spots,0); assert.deepEqual(f.mutations,[]);
  } finally { f.db.close(); }
});
test('a conflict in the final spot prevents ALL schema/import writes', async () => {
  for (const kind of ['header','part','extra']) {
    const f=fixture(); try {
      f.db.exec(f.schema); f.insert(f.plan.entries[1]);
      const d=f.deliveries[3];
      if(kind==='header')f.db.prepare('UPDATE mw3_policy_deliveries SET header_json=? WHERE delivery_hash=?').run('conflict',d.deliveryHash);
      if(kind==='part')f.db.prepare('UPDATE mw3_policy_parts SET body=? WHERE delivery_hash=? AND part=1').run('conflict',d.deliveryHash);
      if(kind==='extra')f.db.prepare('INSERT INTO mw3_policy_parts VALUES (?,99,?)').run(d.deliveryHash,'extra');
      const before=f.db.prepare('SELECT total_changes() n').get().n;
      await assert.rejects(ensureMw3Published(f.plan,f.io)); assert.deepEqual(f.mutations,[]);
      assert.equal(f.db.prepare('SELECT total_changes() n').get().n,before);
    } finally { f.db.close(); }
  }
});
test('partial same-byte rows resume and an interrupted import is verified before retry', async () => {
  const f=fixture(); try {
    f.db.exec(f.schema); f.insert(f.plan.entries[0]);
    f.db.prepare('DELETE FROM mw3_policy_parts WHERE delivery_hash=? AND part=1').run(f.deliveries[0].deliveryHash);
    let calls=0;const original=f.io.import;
    f.io.import=entry=>{original(entry);if(++calls===1)throw new Error('synthetic uncertain result');};
    await assert.rejects(ensureMw3Published(f.plan,f.io),/uncertain result/);
    f.io.import=original;f.mutations.length=0;
    assert.equal((await ensureMw3Published(f.plan,f.io)).imported_spots,1);
    assert.deepEqual(f.mutations,['bookmark','synthetic-2']);
  } finally { f.db.close(); }
});
test('postflight rejects a silent incomplete import', async () => {
  const f=fixture();try{f.io.import=()=>{};await assert.rejects(ensureMw3Published(f.plan,f.io),/Incomplete published/);}finally{f.db.close();}
});
test('remote mutation context rejects PRs, wrong HEAD, alternate refs and local runs', () => {
  const head='a'.repeat(40), env={GITHUB_ACTIONS:'true',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:head};
  assertProductionContext(env,head);
  for(const patch of [{GITHUB_ACTIONS:'false'},{GITHUB_REF:'refs/heads/development'},{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_SHA:'b'.repeat(40)}])assert.throws(()=>assertProductionContext({...env,...patch},head));
});
test('row boundary rejects missing complete rows, wrong stage, duplicate parts and changed bytes', () => {
  const f=fixture();try{
    const d=f.deliveries[0],h=[{spot_id:d.header.manifest.spotId,stage:d.stage,header_json:d.headerText}];
    assert.equal(assertExistingDelivery(d,h,d.parts,true),true);
    assert.throws(()=>assertExistingDelivery(d,[],d.parts,true));
    assert.throws(()=>assertExistingDelivery(d,[{...h[0],stage:'later'}],d.parts));
    assert.throws(()=>assertExistingDelivery(d,h,[d.parts[0],d.parts[0]]));
    assert.throws(()=>assertExistingDelivery(d,h,[{part:0,body:'changed'}]));
  }finally{f.db.close();}
});
test('live CORS contract distinguishes public reads from cookie-authenticated rejection responses', () => {
  const allowedOrigin = 'https://app.reysonai.com';
  const publicResponse = new Response('{}', { headers: { 'access-control-allow-origin': allowedOrigin } });
  assert.doesNotThrow(() => assertPublicCors(publicResponse));
  assert.throws(() => assertPublicCors(new Response('{}', { headers: { 'access-control-allow-origin': 'https://evil.invalid' } })));
  assert.throws(() => assertPublicCors(new Response('{}', { headers: {
    'access-control-allow-origin': allowedOrigin, 'access-control-allow-credentials': 'true',
  } })));

  const credentialedResponse = new Response('{}', { headers: {
    'access-control-allow-origin': allowedOrigin, 'access-control-allow-credentials': 'true',
  } });
  assert.doesNotThrow(() => assertCredentialedCors(credentialedResponse));
  assert.throws(() => assertCredentialedCors(new Response('{}', { headers: { 'access-control-allow-origin': allowedOrigin } })));
  assert.throws(() => assertCredentialedCors(new Response('{}', { headers: {
    'access-control-allow-origin': 'https://evil.invalid', 'access-control-allow-credentials': 'true',
  } })));
});
test('live MW3 ETags preserve strict strong/weak validators across 200 and 304', async () => {
  const hash = 'a'.repeat(64), strong = `"${hash}"`, weak = `W/${strong}`;
  for (const responseEtag of [strong, weak]) {
    const initial = new Response('{}', { status: 200, headers: { etag: responseEtag } });
    assert.equal(assertMw3DeliveryEtag(initial, hash), responseEtag);
    assert.deepEqual(mw3IfNoneMatchHeaders(initial, hash), { 'If-None-Match': responseEtag });
    for (const cachedEtag of [strong, weak]) {
      const cached = new Response(null, { status: 304, headers: { etag: cachedEtag, 'access-control-allow-origin': 'https://app.reysonai.com' } });
      assertPublicCors(cached); assert.equal(cached.status, 304);
      assert.equal(assertMw3DeliveryEtag(cached, hash), cachedEtag);
      assert.equal(await cached.text(), '');
    }
  }
  const wrong = [null, `"${'b'.repeat(64)}"`, `W/"${'b'.repeat(64)}"`, `w/${strong}`, `W/${hash}`, `${strong}x`, `W/${strong}x`, '*'];
  for (const status of [200, 304]) for (const etag of wrong) {
    const response = new Response(status === 304 ? null : '{}', { status, headers: etag === null ? {} : { etag } });
    assert.throws(() => assertMw3DeliveryEtag(response, hash), `status ${status}, etag ${etag}`);
    assert.throws(() => mw3IfNoneMatchHeaders(response, hash), `request status ${status}, etag ${etag}`);
  }
});
test('live acceptance rejects incompatible actual source data before policy requests',async()=>{
  const calls=[];
  await assert.rejects(verifyMw3Live({entries:[]},async(url)=>{calls.push(url);return Response.json({wrong:true},{headers:{'access-control-allow-origin':'https://app.reysonai.com'}});}),/Live preflop source differs/);
  assert.equal(calls.length,1);assert.match(calls[0],/datasets\/opening-ranges$/);
});
test('workflow verifies before writes, imports before activation, and accepts after source publication',()=>{
  const workflow=readFileSync(new URL('../../../.github/workflows/deploy-worker.yml',import.meta.url),'utf8');
  const importer=workflow.indexOf('run: node scripts/mw3-production-delivery.mjs import');
  assert.ok(importer>0&&importer<workflow.indexOf('name: Deploy ranked API'));
  assert.ok(workflow.indexOf('run: node scripts/mw3-production-delivery.mjs live')>workflow.indexOf('name: Publish postflop policies into D1'));
  assert.equal((workflow.match(/fetch-depth: 0/g)||[]).length,2);
  const source=readFileSync(new URL('../scripts/mw3-production-delivery.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/DELETE FROM|INSERT OR REPLACE|migrations.*apply|time-travel.*restore/);
  assert.match(source,/buildMw3DeliverySql\(snapshot, review, deliveries\)/);
  assert.match(source,/assertMw3CommittedFile\(ROOT, entry.sql, sql\)/);
});
