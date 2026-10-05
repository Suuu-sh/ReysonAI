#!/usr/bin/env node
// Local-only bootstrap. Uses an existing Wrangler; never installs, deploys, fetches
// production inputs, reads/prints credentials, or creates an authentication bypass.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildPreflopSql } from '../../frontend/scripts/publish-d1.mjs';
import { buildSql as buildPostflopSql, publishableSpots } from '../../frontend/scripts/postflop-ai/publish-d1.mjs';
const backend=fileURLToPath(new URL('..',import.meta.url));
const wrangler=process.env.WRANGLER_BIN;
if(!wrangler||!existsSync(wrangler))throw new Error('Set WRANGLER_BIN to an already installed wrangler/bin/wrangler.js. No dependencies will be installed.');
const config=path.join(backend,'wrangler.local.jsonc');
const persist=path.join(backend,'.wrangler/local-state');
const generated=path.join(backend,'.wrangler/fastfold-bootstrap');
mkdirSync(generated,{recursive:true});
const env={...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.join(generated,'wrangler.log')};
const cli=['d1','execute','reysonai-local','--local','--config',config,'--persist-to',persist];
function run(args){
 try{return execFileSync(process.execPath,[wrangler,...cli,...args],{cwd:backend,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:10*1024*1024});}
 catch{throw new Error('Local D1 initialization failed; inspect the local bootstrap Wrangler log. No remote command was used.');}
}
const catalog=JSON.parse(run(['--command',"SELECT name FROM sqlite_master WHERE type='table'",'--json']));
const tables=new Set(catalog.flatMap(r=>r.results??[]).map(r=>r.name));
for(const [table,file] of [['postflop_policies','0001_postflop.sql'],['postflop_reports','0002_postflop_reports.sql'],['preflop_datasets','0003_preflop.sql'],['account_users','0007_accounts.sql'],['ranked_players','0009_ranked.sql']]){
 if(!tables.has(table))run(['--file',path.join(backend,'migrations',file)]);
}
run(['--file',path.join(backend,'migrations/0010_fastfold.sql')]);
const names=['opening-ranges','preflop-ranges','three-bet-responses','four-bet-responses','five-bet-responses','limp-responses','limp-deep-responses','multiway-responses','squeeze-responses','cold-three-bet-responses'];
const required=[...names,...['nit','station','lag','maniac'].flatMap(type=>names.slice(0,7).map(name=>`profiles/${type}/villain/${name}`))];
const datasets=Object.fromEntries(required.map(name=>[name,JSON.stringify(JSON.parse(readFileSync(path.join(backend,'../frontend/src/estimated',name+'.json'),'utf8')))]));
const preflop=path.join(generated,'preflop.sql');writeFileSync(preflop,buildPreflopSql(datasets));run(['--file',preflop]);
// Existing validated saved policies only. No generation, substitute strategy or remote read.
const saved=publishableSpots(()=>{});
if(saved.length){const postflop=path.join(generated,'postflop.sql');writeFileSync(postflop,buildPostflopSql(saved));run(['--file',postflop]);}
console.log(`Local FastFold initialized: ${required.length} authored preflop datasets, ${saved.length} saved postflop spots. Auth/account records were not changed.`);
console.log('Start the existing dev-account launcher with the same WRANGLER_BIN. Real Google OAuth still needs privately configured local credentials and its registered localhost redirect; no authentication shortcut is provided.');
