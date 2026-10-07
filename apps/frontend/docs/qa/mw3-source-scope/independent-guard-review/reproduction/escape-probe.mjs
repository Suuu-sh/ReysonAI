import assert from 'node:assert/strict';import{mkdtempSync,readFileSync,copyFileSync,mkdirSync,writeFileSync,rmSync,symlinkSync}from'node:fs';import{join,dirname}from'node:path';import{tmpdir}from'node:os';import{pathToFileURL}from'node:url';import{execFileSync}from'node:child_process';
const repo='/workspace/scratch/08c72b2d7549/mw3_scope_revision_review';const{sourcePathsFor,currentMw3ArchiveIdentity}=await import(pathToFileURL(repo+'/apps/frontend/scripts/postflop-ai/mw3-reviewed-snapshot.mjs'));const{loadMw3Catalog}=await import(pathToFileURL(repo+'/apps/frontend/scripts/postflop-ai/mw3-inputs.mjs'));
const identities=loadMw3Catalog().filter(x=>x.reachable).map(x=>currentMw3ArchiveIdentity(x.id)),paths=[...new Set(identities.flatMap(x=>sourcePathsFor(x)))];const root=mkdtempSync(join(tmpdir(),'independent-mw3-escape-'));
try{
for(const path of paths){mkdirSync(dirname(join(root,path)),{recursive:true});copyFileSync(join(repo,path),join(root,path))}
writeFileSync(join(root,'outside.ts'),'export const outside = 1;\n');symlinkSync(join(root,'outside.ts'),join(root,'apps/frontend/src/agent/symlink.ts'));
const code=String.raw`
import assert from 'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';import{pathToFileURL}from'node:url';
const[root,serialized]=process.argv.slice(1),identities=JSON.parse(serialized),{sourcePathsFor}=await import(pathToFileURL(join(root,'apps/frontend/scripts/postflop-ai/mw3-reviewed-snapshot.mjs'))),path=join(root,'apps/frontend/src/agent/hand.ts'),before=readFileSync(path),result=[];
for(const [name,statement,expected]of[
['repository-escape',"import '../../../../../outside.ts';",/escaped|unsafe/i],
['symlink',"import './symlink.ts';",/symlink/i],
['local-generated',"import '../../.local/hidden.ts';",/escaped/i],
['node-modules-relative',"import '../../node_modules/hidden.ts';",/escaped/i],
['rooted-ui',"import '/src/agent/AgentTable.tsx';",/cannot be statically bound/],
['file-url-ui',"import 'file:///tmp/ScopeBridge.tsx';",/cannot be statically bound/],
['typescript-require-import',"import Ui = require('./AgentTable.tsx');",/imports excluded presentation/],
['namespace-reexport',"export * as Ui from './AgentTable.tsx';",/imports excluded presentation/],
]){try{writeFileSync(path,Buffer.concat([before,Buffer.from('\n'+statement+'\n')]));for(const identity of identities)assert.throws(()=>sourcePathsFor(identity),expected);result.push({name,statement,subjects:identities.length,rejected:true})}finally{writeFileSync(path,before)}}console.log(JSON.stringify({status:'PASS',probes:result},null,2));`;
console.log(execFileSync(process.execPath,['--input-type=module','-e',code,root,JSON.stringify(identities.map(x=>({sourceFiles:x.sourceFiles})))],{encoding:'utf8',maxBuffer:1024*1024}));
}finally{rmSync(root,{recursive:true,force:true})}
