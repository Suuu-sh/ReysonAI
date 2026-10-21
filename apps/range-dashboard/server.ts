// Read-only dashboard: no provider imports, child processes, writes, or generation calls.
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../frontend/candidates/aiv2-preflop/llm-range-single-response-v6');
const METHOD = 'llm-range-single-response-v6';
const ranks = [...'AKQJT98765432'];
export const hands = ranks.flatMap((a,i) => ranks.map((b,j) => i===j?a+b:i<j?a+b+'s':b+a+'o'));
const cards = ranks.flatMap(r=>[...'shdc'].map(s=>r+s));
const combos = cards.flatMap((a,i)=>cards.slice(i+1).map(b=>({combo:a+b,hand:a[0]===b[0]?a[0]+b[0]:a[0]+b[0]+(a[1]===b[1]?'s':'o')})));
const legal = new Set(['fold','check','call','open','limp','raise','three_bet','four_bet','squeeze','all_in']);
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assert = (ok) => { if (!ok) throw Error('Invalid saved candidate'); };
const same = (a,b) => Math.abs(a-b)<1e-7;
function mix(row, actions) {
  assert(row && Object.keys(row).length===actions.length && actions.every(a=>Number.isInteger(row[a]) && row[a]>=0 && row[a]<=100));
  assert(actions.reduce((s,a)=>s+row[a],0)===100);
  return Object.fromEntries(actions.map(a=>[a,row[a]]));
}
// Mirrors canonical exact-class-defaults-v1 decoding and normalized hash shape.
// Keep isolated from generator imports so this service cannot invoke a provider.
export function verifyArtifact(output, expectedHash) {
  if(expectedHash) assert(hash(output)===expectedHash);
  const {spot:s,metadata:m,reasons:r}=output;
  assert(m?.method===METHOD && m.status==='complete' && m.generation_mode==='single-scene-single-response' && m.reasons_generated_with_frequencies===true);
  assert(typeof s?.id==='string' && m.scenario_id===s.id);
  const actions=s.class_default_actions;
  assert(Array.isArray(actions) && actions.length>0 && new Set(actions).size===actions.length && actions.every(a=>legal.has(a)));
  assert(Array.isArray(s.class_defaults) && s.class_defaults.length===169 && Array.isArray(s.combo_overrides));
  const class_mixes=Object.fromEntries(hands.map((h,i)=>{assert(s.class_defaults[i].length===actions.length);return [h,mix(Object.fromEntries(actions.map((a,j)=>[a,s.class_defaults[i][j]])),actions)];}));
  const combo_overrides={};
  for(const row of s.combo_overrides){assert(combos.some(c=>c.combo===row.combo) && !combo_overrides[row.combo]);combo_overrides[row.combo]=mix(row.mix,actions);}
  const policy={kind:'aiv2_preflop_combo_policy',scenario_id:s.id,actions:[...actions],class_mixes,combo_overrides};
  assert(hash(policy)===m.final_hash);
  assert(r?.scenario_id===s.id && Array.isArray(r.reasons) && r.reasons.length===169 && r.reasons.every((v,i)=>v.hand===hands[i] && typeof v.text==='string' && v.text.trim() && typeof v.text_ja==='string' && v.text_ja.trim()));
  const exceptions=Object.keys(combo_overrides).sort();
  assert(Array.isArray(r.combo_reasons) && r.combo_reasons.length===exceptions.length && r.combo_reasons.every((v,i)=>v.combo===exceptions[i] && typeof v.text==='string' && v.text.trim() && typeof v.text_ja==='string' && v.text_ja.trim()));
  assert(hash({scenario_id:s.id,reasons:r.reasons,combo_reasons:r.combo_reasons})===m.reason_hash);
  const own=output.combo_reach_weights?.players?.[s.hero];
  if(own) assert(['hand-class-exact-suit-symmetry','concrete-combo-exact'].includes(own.encoding));
  const expanded=combos.map(c=>{const reach=own?own.weights[own.encoding==='concrete-combo-exact'?c.combo:c.hand]:1;assert(Number.isFinite(reach)&&reach>=0&&reach<=1);return {...c,reach,mix:combo_overrides[c.combo]??class_mixes[c.hand]};});
  const total=expanded.reduce((n,c)=>n+c.reach,0);
  assert(total>0); // Unreachable placeholder scenes never appear in this explorer.
  const frequency=Object.fromEntries(actions.map(a=>[a,expanded.reduce((n,c)=>n+c.reach*c.mix[a],0)/total]));
  const summary=m.actual_range_summary;
  assert(summary?.concrete_combo_count===1326 && summary.reached_combo_count===expanded.filter(c=>c.reach>0).length && same(summary.total_reach_weight,total) && actions.every(a=>same(summary.action_frequency_pct[a],frequency[a])));
  assert(Array.isArray(s.hands) && s.hands.length===169);
  const cells=hands.map((hand,i)=>{
    const group=expanded.filter(c=>c.hand===hand), weight=group.reduce((n,c)=>n+c.reach,0);
    const values=actions.map(a=>group.reduce((n,c)=>n+(weight?c.reach:1)*c.mix[a],0)/(weight||group.length));
    const norm=values.reduce((a,b)=>a+b,0), stable=values.map(v=>v*100/norm), rounded=stable.map(Math.floor);
    const rem=100-rounded.reduce((a,b)=>a+b,0);
    stable.map((v,j)=>({j,f:v-Math.floor(v)})).sort((a,b)=>b.f-a.f).slice(0,rem).forEach(v=>rounded[v.j]++);
    const saved=s.hands[i];
    assert(saved.hand===hand && saved.combo_count===group.length && same(saved.reach_weight,weight) && saved.unreachable===(weight===0) && actions.every((a,j)=>saved[a]===rounded[j]));
    return {hand,mix:Object.fromEntries(actions.map((a,j)=>[a,rounded[j]])),exact_default:class_mixes[hand],reach_weight:weight,unreachable:weight===0,reason:{en:r.reasons[i].text,ja:r.reasons[i].text_ja},overrides:group.filter(c=>combo_overrides[c.combo]).map(c=>{const reason=r.combo_reasons.find(v=>v.combo===c.combo);return {combo:c.combo,mix:c.mix,reason:{en:reason.text,ja:reason.text_ja}};})};
  });
  const history=(s.history??[]).map(v=>({seat:String(v.seat??''),action:String(v.action??''),...(Number.isFinite(v.to_size_bb)?{to_size_bb:v.to_size_bb}:{})}));
  return {id:s.id,hero:String(s.hero??''),family:String(s.dataset??''),context:String(s.context_kind??''),profile:typeof s.profile==='string'?s.profile:null,history,actions,cells,summary:{action_frequency_pct:frequency,total_reach_weight:total,reached_combo_count:summary.reached_combo_count},provenance:{method:METHOD,model:String(m.model??''),effort:String(m.reasoning_effort??''),final_hash:m.final_hash,reason_hash:m.reason_hash,artifact_hash:expectedHash??null,verified:true}};
}
let cache=null, cachedAt=0;
export async function snapshot(root=ROOT) {
  if(root===ROOT && cache && Date.now()-cachedAt<2500)return cache;
  const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
  assert(manifest.method===METHOD);
  const scenes=[]; let excluded=0, invalid=0;
  const realRoot=await realpath(root);
  for(const [key,node] of Object.entries(manifest.nodes??{})){
    if(node.status!=='complete')continue;
    if(node.origin!=='single-pass-v6' || !/^(base|profiles)\/[A-Za-z0-9_/-]+$/.test(key)){excluded++;continue;}
    try {
      // Derive artifact from safe node key; never honor manifest's absolute path.
      const path=await realpath(resolve(root,'spots',key+'.json'));
      assert(path.startsWith(realRoot+sep+'spots'+sep));
      const output=JSON.parse(await readFile(path,'utf8'));
      if(output.metadata?.generation_mode!=='single-scene-single-response' || output.metadata?.status!=='complete' || output.metadata?.method!==METHOD){excluded++;continue;}
      const scene=verifyArtifact(output,node.artifact_hash);scenes.push({...scene,key});
    } catch {invalid++;}
  }
  const number=v=>Number.isFinite(v)&&v>=0?v:0;
  const value={status:{state:String(manifest.status??'unknown'),total:number(manifest.generated_total),completed:number(manifest.generated_completed),new_single_pass:number(manifest.new_single_pass),running:number(manifest.running),failed:number(manifest.failed),remaining:number(manifest.remaining_actionable),placeholders:number(manifest.placeholders_completed),verified:scenes.length,excluded,invalid,updated_at:typeof manifest.updated_at==='string'?manifest.updated_at:null,polled_at:new Date().toISOString()},scenes};
  if(root===ROOT){cache=value;cachedAt=Date.now();}return value;
}
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"};
const assets={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
export function createDashboardServer(root=ROOT){return createServer(async(req,res)=>{
  const send=(status,type,value)=>{res.writeHead(status,{...headers,'Content-Type':type});res.end(value);};
  try{
    if(req.method!=='GET' && req.method!=='HEAD'){send(405,'application/json','{"error":"Read-only service"}');return;}
    // Exact path allowlist before URL normalization defeats encoded traversal.
    const raw=(req.url??'').split('?')[0];
    if(Object.hasOwn(assets,raw)){const [name,type]=assets[raw];send(200,type,req.method==='HEAD'?'':await readFile(resolve(HERE,name)));return;}
    if(raw==='/api/status'){const data=await snapshot(root);send(200,'application/json',JSON.stringify(data.status));return;}
    if(raw==='/api/scenes'){const data=await snapshot(root);send(200,'application/json',JSON.stringify({status:data.status,scenes:data.scenes.map(({cells,summary,provenance,...scene})=>({...scene,actions:scene.actions}))}));return;}
    if(raw==='/api/scene'){const key=new URL(req.url,'http://localhost').searchParams.get('key');const data=await snapshot(root);const scene=data.scenes.find(s=>s.key===key);send(scene?200:404,'application/json',JSON.stringify(scene??{error:'Scene not available'}));return;}
    send(404,'application/json','{"error":"Not found"}');
  } catch {send(503,'application/json','{"error":"Saved candidate is temporarily unavailable"}');}
});}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT??5188), host=process.env.HOST??'127.0.0.1';
  createDashboardServer().listen(port,host,()=>console.log(`Range dashboard: http://${host}:${port}`));
}
