import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ownerRequest, onDemandSnapshot } from './ondemand.ts';
import { createDashboardServer } from './server.ts';
import { initialBtnBbInput, postflopLegalActions, advancePostflopDecision, decisionIdentity, buildPostflopArtifact } from '../frontend/scripts/aiv2-postflop-ondemand.ts';
import { DEFAULT_SOURCE, readJSON, loadRoot, implementationHash, saveDecision, loadDecision, resolveFrontier, enqueue, listJobs, callProvenance } from '../frontend/scripts/aiv2-postflop-ondemand-store.ts';
import { generateOne } from '../frontend/scripts/aiv2-postflop-ondemand-cli.ts';
const temp=()=>mkdtempSync(resolve(tmpdir(),'ondemand-test-'));
const response=(input:any,id:string,action='check')=>({decision_id:id,range_summary:{text:'AI estimate, not GTO.',text_ja:'AI推定でありGTOではありません。'},groups:[{combos:Object.entries<number>(input.ranges[input.actor]).filter(([,w])=>w>0).map(([c])=>c),mix:Object.fromEntries(postflopLegalActions(input).map(a=>[a.action,a.action===action?100:0])),text:'Check the saved range.',text_ja:'保存レンジをチェックします。'}]});
const att=()=>[{transport:'pooled-app-server',model:'gpt-6.1-sol',effort:'medium',confirmedModel:'gpt-6.1-sol',confirmedEffort:'medium',threadId:'test-thread',turnId:'test-turn',sessionTurn:1,status:'completed'}];
test('new identity, arbitrary board BB root, full two ranges; SRP and 3BP sizes and 2.5x legal minimum',async()=>{
 const input=await loadRoot('Kh8s3d');assert.equal(input.actor,'BB');assert.deepEqual(input.history,[]);assert.deepEqual(input.assumptions,[]);assert.equal(Object.keys(input.ranges.BTN).length,1326);assert.equal(Object.keys(input.ranges.BB).length,1326);
 assert.deepEqual(postflopLegalActions(input).map(a=>a.action),['check','bet33','bet66','bet125']);
 assert.deepEqual(postflopLegalActions({...input,pot_type:'3BP+'}).map(a=>a.action),['check','bet25','bet50','bet100']);
 const options=postflopLegalActions({...input,actor:'BTN',pot_bb:10,committed_bb:{BB:4,BTN:0},stacks_bb:{BB:90,BTN:94},last_full_raise_bb:4});assert.equal(options.find(a=>a.action==='raise')?.to_bb,10);
 assert.notEqual(decisionIdentity(input,'a'.repeat(64)),decisionIdentity(input,'b'.repeat(64)));
});
test('missing ancestors first, zero-reach terminal, actual check advance and chosen turn, exclusive attested cache',async()=>{
 const root=temp();try{
 const impl=implementationHash(),input=await loadRoot('As7d2c'),id=decisionIdentity(input,impl),artifact=buildPostflopArtifact(input,response(input,id),impl);
 let f=await resolveFrontier('As7d2c',['check','check','Kd'],root);assert.equal(f.status,'missing');assert.equal(f.index,0);
 assert.throws(()=>saveDecision(artifact,[],root,[]));assert.equal(existsSync(resolve(root,'decisions',id+'.json')),false);
 saveDecision(artifact,att(),root,[callProvenance(input,id,1,null)]);assert.equal(loadDecision(input,impl,root)?.decision_id,id);assert.throws(()=>saveDecision(artifact,att(),root,[callProvenance(input,id,1,null)]));
 assert.equal((await resolveFrontier('As7d2c',['bet33'],root)).status,'zero-reach');
 f=await resolveFrontier('As7d2c',['check','check','Kd'],root);assert.equal(f.status,'missing');assert.equal(f.index,1);
 const next=advancePostflopDecision(artifact,'check');assert.equal(next.status,'decision');if(next.status!=='decision')return;
 const second=buildPostflopArtifact(next.input,response(next.input,decisionIdentity(next.input,impl)),impl);saveDecision(second,att(),root,[callProvenance(second.input,second.decision_id,1,null)]);
 f=await resolveFrontier('As7d2c',['check','check','Kd'],root);assert.equal(f.status,'missing');if(f.status==='missing'){assert.equal(f.input.street,'turn');assert.equal(f.input.board,'As7d2cKd');assert.equal(f.input.actor,'BB');}
 const s=await onDemandSnapshot('As7d2c',[],root);assert.equal(s.status,'generated');assert.equal(s.scene?.cells.length,169);assert.equal(s.children.find(c=>c.token==='bet33')?.status,'zero-reach');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('mock provider: one response normally, max one same-session correction, no retry auth',async()=>{
 const input=await loadRoot('As7d2c'),impl=implementationHash();let calls=0,sessions=0,reservations=0;
 const provider={withSession:async(fn:any)=>{sessions++;return fn({run:async()=>{calls++;return calls===1?{}:response(input,decisionIdentity(input,impl));}});}};
 await generateOne(input,impl,provider,()=>reservations++);assert.equal(calls,2);assert.equal(sessions,1);assert.equal(reservations,2);
 calls=0;provider.withSession=async(fn:any)=>fn({run:async()=>{calls++;return response(input,decisionIdentity(input,impl));}});await generateOne(input,impl,provider,()=>{});assert.equal(calls,1);
 provider.withSession=async(fn:any)=>fn({run:async()=>{throw Object.assign(Error('safe'),{code:'authentication_required'});}});await assert.rejects(()=>generateOne(input,impl,provider,()=>{}),{code:'authentication_required'});
});
test('queue persistence and duplicate coalescing, cap one active job',async()=>{
 const root=temp();try{const a=await enqueue('As7d2c',[],2,root),b=await enqueue('As7d2c',[],2,root);assert.equal(a.id,b.id);assert.equal(listJobs(root).length,1);await assert.rejects(()=>enqueue('Kh8s3d',[],2,root));await assert.rejects(()=>enqueue('As7d2c',[],65,temp()));}finally{rmSync(root,{recursive:true,force:true});}
});
test('literal localhost host/origin/socket only; no forwarded/DNS-rebinding/tunnel POST; public GET no queue',async()=>{
 const req=(host='localhost:5188',origin='http://localhost:5188',remoteAddress='127.0.0.1')=>({headers:{host,origin},socket:{remoteAddress}});
 assert.equal(ownerRequest(req()),true);assert.equal(ownerRequest(req('example.com:5188','http://example.com:5188')),false);assert.equal(ownerRequest(req('localhost:5188','http://evil.test')),false);assert.equal(ownerRequest(req('localhost:5188','http://localhost:5188','10.0.0.1')),false);assert.equal(ownerRequest({...req(),headers:{...req().headers,'x-forwarded-host':'localhost:5188'}}),false);assert.equal(ownerRequest({...req(),headers:{host:'localhost:5188'}}),false);
 const server=createDashboardServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as any,base=`http://127.0.0.1:${address.port}`,before=listJobs().length;
 try{const snap=await (await fetch(base+'/api/postflop/ondemand?board=As7d2c&path=[]')).json();assert.equal(snap.state.actor,'BB');assert.equal(listJobs().length,before);
 const res=await fetch(base+'/api/postflop/jobs',{method:'POST',headers:{Host:'public-tunnel.example','Content-Type':'application/json',Origin:'https://public-tunnel.example'},body:JSON.stringify({board:'As7d2c',path:[]})});assert.equal(res.status,403);assert.equal(listJobs().length,before);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('repair provenance binds actual two prompts/schema and metric session turns; tampering rejected',async()=>{
 const root=temp();try{
  const input=await loadRoot('As7d2c'),impl=implementationHash(),id=decisionIdentity(input,impl),calls:any[]=[],actualPrompts:string[]=[];
  let turns=0;
  const provider={withSession:async(fn:any)=>fn({run:async(prompt:string)=>{actualPrompts.push(prompt);return ++turns===1?{}:response(input,id);}})};
  const artifact=await generateOne(input,impl,provider,()=>{},call=>calls.push(call));
  assert.equal(calls.length,2);assert.equal(calls[0].validation_issue,null);assert.equal(calls[1].validation_issue,'response: exact keys required');
  const {postflopHash,effectivePostflopPrompt}=await import('../frontend/scripts/aiv2-postflop-ondemand.ts');
  assert.equal(calls[0].effective_prompt_hash,postflopHash(actualPrompts[0]));assert.equal(calls[1].effective_prompt_hash,postflopHash(actualPrompts[1]));
  assert.equal(actualPrompts[1],effectivePostflopPrompt(input,id,calls[1].validation_issue));
  const metrics=[att()[0],{...att()[0],sessionTurn:2,turnId:'test-turn-2'}];
  assert.throws(()=>saveDecision(artifact,metrics,root,[]));
  saveDecision(artifact,metrics,root,calls);assert.equal(loadDecision(input,impl,root)?.decision_id,id);
  const file=resolve(root,'decisions',id+'.json'),envelope=readJSON(file);
  envelope.provider_calls[1].effective_prompt_hash='0'.repeat(64);writeFileSync(file,JSON.stringify(envelope));assert.throws(()=>loadDecision(input,impl,root),/provenance/);
  envelope.provider_calls=calls;envelope.attestation[1].threadId='different-thread';writeFileSync(file,JSON.stringify(envelope));assert.throws(()=>loadDecision(input,impl,root),/attestation/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('chance children reflect exact saved turn and river caches without a chance policy',async()=>{
 const root=temp();try{
  const impl=implementationHash();let input=await loadRoot('As7d2c');
  const save=(state:any)=>{const id=decisionIdentity(state,impl),artifact=buildPostflopArtifact(state,response(state,id),impl);saveDecision(artifact,att(),root,[callProvenance(state,id,1,null)]);return artifact;};
  let artifact=save(input),next=advancePostflopDecision(artifact,'check');assert.equal(next.status,'decision');if(next.status!=='decision')return;
  artifact=save(next.input);next=advancePostflopDecision(artifact,'check','Kd');assert.equal(next.status,'decision');if(next.status!=='decision')return;
  artifact=save(next.input);
  const turnChance=await onDemandSnapshot('As7d2c',['check','check'],root);assert.equal(turnChance.status,'chance');assert.equal(turnChance.scene,null);assert.equal(turnChance.children.find(c=>c.token==='Kd')?.status,'generated');assert.equal(turnChance.children.find(c=>c.token==='Qh')?.status,'not_generated');
  next=advancePostflopDecision(artifact,'check');assert.equal(next.status,'decision');if(next.status!=='decision')return;
  artifact=save(next.input);next=advancePostflopDecision(artifact,'check','Qh');assert.equal(next.status,'decision');if(next.status!=='decision')return;
  save(next.input);
  const riverChance=await onDemandSnapshot('As7d2c',['check','check','Kd','check','check'],root);assert.equal(riverChance.status,'chance');assert.equal(riverChance.children.find(c=>c.token==='Qh')?.status,'generated');assert.equal(riverChance.children.find(c=>c.token==='Jh')?.status,'not_generated');
 }finally{rmSync(root,{recursive:true,force:true});}
});
