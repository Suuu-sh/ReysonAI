// Disposable Miniflare/workerd D1 verification only. Never reads production
// configuration, loads credentials, regenerates policies or deploys anything.
// node scripts/postflop-ai/verify-local-d1.mjs --miniflare /installed/miniflare/dist/src/index.js --spot <id>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { sqlStatements } from '../verify-preflop-local-d1.mjs';
import { backendMigrationStatements } from '../lib/backend-migration-sql.mjs';
import { buildSql, spotArtifacts, quote } from './publish-d1.mjs';
import { spotById } from './spots.mjs';
import { artifactPaths } from './inputs.mjs';

const FRONTEND=fileURLToPath(new URL('../..',import.meta.url)), BACKEND=resolve(FRONTEND,'../backend');
const sha=value=>createHash('sha256').update(value).digest('hex');
const JSONText=value=>JSON.stringify(value);
const filesFor=spot=>Object.fromEntries(['candidate','laterCandidate','report'].map(kind=>[kind,JSON.parse(readFileSync(artifactPaths(spot)[kind],'utf8'))]));

export async function verifyPostflopLocalD1({miniflare,spotId}) {
  const modulePath=resolve(miniflare), packagePath=resolve(dirname(modulePath),'../../package.json');
  const packageInfo=JSON.parse(readFileSync(packagePath,'utf8'));
  assert.equal(packageInfo.name,'miniflare');
  assert.match(packageInfo.version,/^4\./);
  const {Miniflare}=await import(pathToFileURL(modulePath).href);
  const selected=spotArtifacts(spotById(spotId));
  assert.ok(!selected.skip,selected.skip);
  assert.ok(selected.spot.history,'This verification is scoped to a new HU history');
  const root=mkdtempSync(join(FRONTEND,'.local/hu-postflop-d1-'));
  const persist=join(root,'d1');
  const entry=join(root,'worker.mjs');
  writeFileSync(entry,`import {routePostflop} from ${JSON.stringify(join(BACKEND,'src/postflop.ts'))};\nexport default {async fetch(request,env){const u=new URL(request.url), r=await routePostflop(env.DB,u.pathname,u.searchParams);return new Response(r.text??JSON.stringify(r.body),{status:r.status,headers:{'content-type':'application/json'}})}};\n`);
  const bundled=await build({entryPoints:[entry],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
  const worker=bundled.outputFiles[0].text;
  const start=()=>new Miniflare({modules:true,script:worker,compatibilityDate:'2026-05-15',
    d1Databases:{DB:'00000000-0000-0000-0000-000000000000'},d1Persist:persist});
  let mf=start();
  const statements=async text=>{
    const path=join(root,'batch.sql');writeFileSync(path,text);
    const result=[];for await(const item of sqlStatements(path))if(item.trim())result.push(item);
    return result;
  };
  try {
    let db=await mf.getD1Database('DB');
    const execute=async text=>db.batch((await statements(text)).map(sql=>db.prepare(sql)));
    for(const name of readdirSync(join(BACKEND,'migrations')).filter(name=>/^\d+.*\.sql$/.test(name)).sort()) {
      const migration=[];
      for await(const sql of backendMigrationStatements(join(BACKEND,'migrations',name)))if(sql.trim())migration.push(db.prepare(sql));
      await db.batch(migration);
    }
    const legacyManifest=JSON.parse(readFileSync(join(FRONTEND,'.local/postflop-ai/legacy-source/manifest.json'),'utf8'));
    assert.equal(legacyManifest.records.length,45);
    const legacy=legacyManifest.records.map(record=>{
      const spot=spotById(record.spot_id), artifacts=filesFor(spot);
      assert.equal(artifacts.report.defence_version,5,'Keep historical reports unchanged');
      return {spot,...artifacts};
    });
    // Test setup mirrors pre-existing historical data, not a new approval.
    await execute(buildSql(legacy,'2000-01-01T00:00:00Z','local-historical-setup'));
    await execute(`INSERT INTO preflop_datasets VALUES ('local-preserve','hash',2,1);
INSERT INTO preflop_dataset_parts VALUES ('local-preserve',0,'{}');
INSERT INTO dataset_versions VALUES ('local-preserve','hash','2000-01-01','{}');
INSERT INTO postflop_reasons VALUES ('BTN_open_BB_call','flop','{"preserve":true}');
INSERT INTO postflop_flop_base_br VALUES ('BTN_open_BB_call','AsKh2d',0,1,'hash',X'0001FF');
INSERT INTO account_users VALUES ('local-user','local-subject','local@example.invalid',0);
INSERT INTO account_sessions VALUES ('local-session','local-user',1);
INSERT INTO account_oauth_states VALUES ('local-state','local-verifier','local-nonce',1);
INSERT INTO account_rate_limits VALUES ('local-bucket',1,1);
INSERT INTO account_data VALUES ('local-user','{"preserve":true}',1);
INSERT INTO account_native_attempts (attempt_hash, code_challenge, app_state, redirect_id, status, oauth_state_hash, user_id, expires_at) VALUES ('local-native-attempt','local-native-challenge','local-native-app-state','reysonai-mobile','authorizing','local-native-state','local-user',1);
INSERT INTO account_native_oauth_states VALUES ('local-native-state','local-native-attempt','local-native-verifier','local-native-nonce',1);
INSERT INTO account_native_sessions VALUES ('local-native-session','local-user','native','local-native-session-attempt',1);
INSERT INTO ranked_players (user_id, public_name, rating, peak, matches) VALUES ('local-user','Local ranked sentinel',1200,1250,1);
INSERT INTO ranked_matches (id, user_id, day, slot, started_at, expires_at, status, questions_json, actions_json, completed_at, before_rating, after_rating, score) VALUES ('local-ranked-match','local-user','2000-01-01',1,1,2,'complete','[{"preserve":true}]','["fold"]',2,1180,1200,1);`);
    const tables=(await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()).results.map(row=>row.name);
    const snapshot=async preserveOnly=>Object.fromEntries(await Promise.all(tables.map(async table=>{
      assert.match(table,/^[a-z_]+$/);
      let where='';
      if(preserveOnly&&['postflop_spots','postflop_policies','postflop_reports','postflop_reasons'].includes(table))where=` WHERE spot_id <> ${quote(spotId)}`;
      if(preserveOnly&&table==='dataset_versions')where=" WHERE name <> 'postflop'";
      const rows=(await db.prepare(`SELECT * FROM ${table}${where}`).all()).results;
      return [table,rows.map(JSONText).sort()];
    })));
    const preserved=await snapshot(true);
    // Every current table must contain a real preservation sentinel. New
    // migrations fail closed until the isolated fixture covers their rows too.
    for(const table of tables)assert.ok(preserved[table]?.length,`${table}: missing sentinel`);
    const sql=buildSql([selected],'2026-10-04T00:00:00Z','local-new-hu-verification');
    const sqlPath=join(root,'delivery.sql');writeFileSync(sqlPath,sql);
    await execute(sql);
    assert.deepEqual(await snapshot(true),preserved,'New HU update changed legacy or unrelated data');
    const committed=await snapshot(false);
    const readSpot=async()=>{
      const response=await mf.dispatchFetch(`http://local.test/v1/postflop/spot?spot=${encodeURIComponent(spotId)}`);
      assert.equal(response.status,200);
      const payload=await response.json();
      assert.deepEqual(payload.spot,selected.spot);assert.deepEqual(payload.candidate,selected.candidate);
      assert.deepEqual(payload.laterCandidate,selected.laterCandidate);assert.deepEqual(payload.report,selected.report);
    };
    await readSpot();
    await execute(sql);assert.deepEqual(await snapshot(false),committed,'Exact delivery retry is not idempotent');
    const failed=buildSql([selected],'2026-10-04T01:00:00Z','must-roll-back')+'\nINSERT INTO postflop_spots (spot_id) VALUES (\'invalid-missing-fields\');\n';
    await assert.rejects(()=>execute(failed),error=>{
      assert.match(String(error?.message??error),/NOT NULL constraint failed: postflop_spots\.slug/i,
        'Rollback proof requires the deliberate last-statement constraint failure, not an unrelated runtime error');
      return true;
    });
    assert.deepEqual(await snapshot(false),committed,'Failed full batch did not roll back');
    await mf.dispose();mf=start();db=await mf.getD1Database('DB');
    assert.deepEqual(await snapshot(false),committed,'Persisted D1 changed after runtime restart');await readSpot();
    const result={schema_version:1,status:'pass',scope:'Isolated local Miniflare/workerd D1 only; not publication approval',
      miniflare_version:packageInfo.version,spot:spotId,legacy_spots_preserved:45,tables_verified:tables,
      sql:{path:sqlPath,bytes:Buffer.byteLength(sql),sha256:sha(sql)},worker_sha256:sha(worker),
      api_roundtrip:true,exact_retry_idempotent:true,full_batch_rollback:true,persistent_restart:true};
    writeFileSync(join(root,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    return result;
  } finally {await mf.dispose();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);assert.equal(args.length,4,'Usage: --miniflare PATH --spot ID');
  assert.equal(args[0],'--miniflare');assert.equal(args[2],'--spot');
  console.log(JSON.stringify(await verifyPostflopLocalD1({miniflare:args[1],spotId:args[3]}),null,2));
}
