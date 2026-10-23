import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {ensureAiv2OperatorSchema} from '../scripts/ensure-aiv2-operator-schema.ts';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON; CREATE TABLE account_users(id TEXT PRIMARY KEY);');
 db.exec(readFileSync(new URL('../migrations/0014_aiv2_ondemand.sql',import.meta.url),'utf8'));
 const read=()=>({objects:db.prepare("SELECT name,sql FROM sqlite_master WHERE name IN ('aiv2_ondemand_operator_batches','aiv2_ondemand_jobs_operator_batch','aiv2_ondemand_operator_batch_immutable')").all() as any,columns:db.prepare('PRAGMA table_info(aiv2_ondemand_jobs)').all() as any,foreignKeys:db.prepare('PRAGMA foreign_key_list(aiv2_ondemand_jobs)').all() as any});
 return {db,read,apply:(sql:string)=>db.exec(sql)};
}
test('exact operator migration applies and replay skips ADD COLUMN with full readback',async()=>{
 const f=fixture();try{assert.equal(await ensureAiv2OperatorSchema(f),'applied');assert.equal(await ensureAiv2OperatorSchema(f),'already-applied');}finally{f.db.close();}
});
test('partial operator schema recovers reviewed tables without replaying existing column',async()=>{
 const f=fixture();try{f.db.exec('ALTER TABLE aiv2_ondemand_jobs ADD COLUMN operator_batch_id TEXT REFERENCES aiv2_ondemand_operator_batches(id);');assert.equal(await ensureAiv2OperatorSchema(f),'already-applied');}finally{f.db.close();}
});
test('foreign schema or provenance column fails before writes',async()=>{
 for(const sql of ['ALTER TABLE aiv2_ondemand_jobs ADD COLUMN operator_batch_id TEXT;','CREATE TABLE aiv2_ondemand_operator_batches(id TEXT PRIMARY KEY);']){
  const f=fixture();try{f.db.exec(sql);let writes=0;await assert.rejects(ensureAiv2OperatorSchema({...f,apply:()=>{writes++;}}));assert.equal(writes,0);}finally{f.db.close();}
 }
});
test('unapplied migration and missing base fail closed before API activation',async()=>{
 const f=fixture();try{await assert.rejects(ensureAiv2OperatorSchema({...f,apply:()=>{}}));f.db.exec('DROP TABLE aiv2_ondemand_jobs;');let writes=0;await assert.rejects(ensureAiv2OperatorSchema({...f,apply:()=>{writes++;}}));assert.equal(writes,0);}finally{f.db.close();}
});
