import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {ensureAiv2OperatorSchema,operatorSchemaSqlArgument,parseOperatorSchemaResponse,operatorSchemaDiagnostic} from '../scripts/ensure-aiv2-operator-schema.ts';
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

test('comment-leading migration stays one bound CLI option with every SQL byte intact',()=>{
 const sql=readFileSync(new URL('../migrations/0015_aiv2_operator_batches.sql',import.meta.url),'utf8');
 assert.ok(sql.startsWith('--'));
 const argument=operatorSchemaSqlArgument(sql);
 assert.equal(argument.slice('--command='.length),sql);
 assert.ok(argument.startsWith('--command=-- Private owner batches'));
});
test('actual Wrangler/D1 three-result schema shape is parsed strictly without reflecting response data',()=>{
 const f=fixture();try{
  const state=f.read(),response=[state.objects,state.columns,state.foreignKeys].map(results=>({success:true,results,meta:{changed_db:false,rows_written:0}}));
  assert.deepEqual(parseOperatorSchemaResponse(JSON.stringify(response)),JSON.parse(JSON.stringify(state)));
  for(const value of [[],response.slice(0,2),[...response,{}],[...response.slice(0,2),{success:false,results:[]}],[...response.slice(0,2),{success:true,results:null}],null])assert.throws(()=>parseOperatorSchemaResponse(JSON.stringify(value)),{code:'operator_schema_response_shape_invalid'});
  assert.throws(()=>parseOperatorSchemaResponse('untrusted response'),{code:'operator_schema_response_json_invalid'});
 }finally{f.db.close();}
});
test('read-before, apply and read-after failures expose fixed stage labels only',async()=>{
 const f=fixture();try{
  for(const phase of ['before','apply','after']){
   let writes=0;
   const error=await ensureAiv2OperatorSchema({read:stage=>{if(stage===phase)throw Error('secret untrusted transport contents');return f.read();},apply:sql=>{writes++;if(phase==='apply')throw Error('secret untrusted command stdout');f.apply(sql);}}).then(()=>null,error=>error);
   assert.ok(error);assert.equal(operatorSchemaDiagnostic(error),'operator_schema_'+(phase==='apply'?'apply':('read_'+phase))+'_failed');
   assert.equal(JSON.stringify({error:operatorSchemaDiagnostic(error)}).includes('secret'),false);
   if(phase==='before')assert.equal(writes,0);
  }
  assert.equal(operatorSchemaDiagnostic(Error('token or arbitrary detail')),'operator_schema_unknown_failure');
 }finally{f.db.close();}
});
