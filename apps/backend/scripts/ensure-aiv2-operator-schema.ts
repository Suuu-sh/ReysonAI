// Apply only reviewed 0015; SQLite ADD COLUMN needs an explicit replay/readback guard.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const backend=fileURLToPath(new URL('..',import.meta.url));
const migration=readFileSync(new URL('../migrations/0015_aiv2_operator_batches.sql',import.meta.url),'utf8');
const alter='ALTER TABLE aiv2_ondemand_jobs ADD COLUMN operator_batch_id TEXT REFERENCES aiv2_ondemand_operator_batches(id);';
const names=['aiv2_ondemand_operator_batches','aiv2_ondemand_jobs_operator_batch','aiv2_ondemand_operator_batch_immutable'];
const expected=[migration.match(/CREATE TABLE IF NOT EXISTS aiv2_ondemand_operator_batches\s*\([\s\S]*?\);/)?.[0],migration.match(/CREATE INDEX IF NOT EXISTS aiv2_ondemand_jobs_operator_batch[^;]*;/)?.[0],migration.match(/CREATE TRIGGER IF NOT EXISTS aiv2_ondemand_operator_batch_immutable[\s\S]*?END;/)?.[0]];
const normalize=(sql:string)=>sql.replace(/IF NOT EXISTS\s+/gi,'').replace(/\s+/g,' ').trim().replace(/;$/,'').toLowerCase();
export type SchemaState={objects:Array<{name:string;sql:string}>;columns:Array<{name:string;type:string;notnull:number;dflt_value:unknown}>;foreignKeys:Array<{table:string;from:string;to:string}>};
function inspect(state:SchemaState,complete=false){
 if(!Array.isArray(state.objects)||!Array.isArray(state.columns)||!Array.isArray(state.foreignKeys)||!['id','revision','status','reserved_calls'].every(name=>state.columns.some(c=>c.name===name)))throw Error('Operator base schema missing; deployment stopped');
 for(let n=0;n<names.length;n++){
  const rows=state.objects.filter(o=>o.name===names[n]);
  if(rows.length>1||rows.length===0&&complete||rows.length===1&&normalize(rows[0].sql)!==normalize(expected[n]!))throw Error('Operator schema definition mismatch; deployment stopped');
 }
 const column=state.columns.find(c=>c.name==='operator_batch_id');
 if(column&&(column.type.toUpperCase()!=='TEXT'||column.notnull!==0||column.dflt_value!==null||state.foreignKeys.filter(f=>f.from==='operator_batch_id'&&f.table==='aiv2_ondemand_operator_batches'&&f.to==='id').length!==1))throw Error('Operator provenance column differs; deployment stopped');
 if(complete&&!column)throw Error('Operator schema readback failed; deployment stopped');
 return !!column;
}
export async function ensureAiv2OperatorSchema({read,apply}:{read:()=>Promise<SchemaState>|SchemaState;apply:(sql:string)=>Promise<void>|void}){
 if(expected.some(sql=>!sql)||migration.split(alter).length!==2)throw Error('Reviewed operator migration shape changed; deployment stopped');
 const columnExists=inspect(await read());
 await apply(columnExists?migration.replace(alter,''):migration);
 inspect(await read(),true);
 return columnExists?'already-applied':'applied';
}
function wrangler(args:string[]){
 try{return execFileSync('npx',['--yes','wrangler@4.147.0','d1','execute','reysonai','--remote','--config','wrangler.jsonc','--yes',...args],{cwd:backend,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024});}
 catch{throw Error('D1 operator schema command failed; deployment stopped');}
}
function remoteState():SchemaState{
 const sql="SELECT name,sql FROM sqlite_master WHERE name IN ('aiv2_ondemand_operator_batches','aiv2_ondemand_jobs_operator_batch','aiv2_ondemand_operator_batch_immutable'); PRAGMA table_info(aiv2_ondemand_jobs); PRAGMA foreign_key_list(aiv2_ondemand_jobs);";
 const output=JSON.parse(wrangler(['--command',sql,'--json']));
 if(!Array.isArray(output)||output.length!==3||output.some(r=>r.success!==true||!Array.isArray(r.results)))throw Error('Unexpected D1 operator schema response; deployment stopped');
 return {objects:output[0].results,columns:output[1].results,foreignKeys:output[2].results};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log('Operator schema '+await ensureAiv2OperatorSchema({read:remoteState,apply:sql=>{wrangler(['--command',sql]);}})+'; verified by D1 readback.');}
 catch{console.error('Operator schema deployment failed; do not deploy the API.');process.exitCode=1;}
}
