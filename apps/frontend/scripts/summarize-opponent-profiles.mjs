// Read-only, repeatable review report. No EV calculation, frequency edits or publication.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadOpponentProfileBundles, profileSourceFindings } from "./lib/opponent-profile-build.mjs";
import { OPPONENT_PROFILES as profiles, OPPONENT_PROFILE_DATASETS as names, opponentProfileReach, auditOpponentProfiles } from "../src/estimated/opponent-profiles.ts";
const dir = fileURLToPath(new URL("../src/estimated/",import.meta.url));
const read=n=>JSON.parse(readFileSync(`${dir}/${n}.json`,"utf8"));
const standard=Object.fromEntries(names.map(n=>[n,read(n)]));
const bundles=loadOpponentProfileBundles(dir), strength=read("hand-strength").equity;
const actions=["open","limp","raise","three_bet","four_bet","all_in","call","check","fold"];
const combos=h=>h.length===2?6:h.endsWith("s")?4:12;
const fmt=n=>n.toFixed(2);
function mix(bundle,name,s) {
  const rows=s.hands.map(r=>({r,w:combos(r.hand)*opponentProfileReach(bundle,name,s,r.hand)}));
  const total=rows.reduce((a,x)=>a+x.w,0);
  return {total,actions:Object.fromEntries(actions.filter(a=>Object.hasOwn(s.hands[0],a)).map(a=>[a,total?rows.reduce((v,{r,w})=>v+w*r[a],0)/total:0]))};
}
const findings=[...auditOpponentProfiles(bundles,standard).findings,...profileSourceFindings(bundles,dir)];
console.log('# Stage A opponent-profile review data\n');
console.log('Authored behavioral estimates, not GTO, not measured player statistics, and not EV-maximizing recommendations. Frequencies are conditional on own prior-action reach. Percentages below are combo-weighted; deeper nodes multiply every previous action of that actor. An empty incoming range has no recommended action. Standard uses its own prior-action reach.\n');
console.log(`Structural/source errors: ${findings.filter(f=>f.severity==='error').length}; strength-order warnings: ${findings.filter(f=>f.severity==='warn').length}.\n`);
console.log('## RFI width comparison\n\n| Profile | Spot | Open % | Standard % | Ratio | Limp % |\n|---|---|---:|---:|---:|---:|');
for(const p of profiles) for(const s of bundles[p]['opening-ranges'].spots) {
 const m=mix(bundles[p],'opening-ranges',s), b=mix(standard,'opening-ranges',standard['opening-ranges'].spots.find(x=>x.id===s.id));
 console.log(`| ${p} | ${s.id} | ${fmt(m.actions.open)} | ${fmt(b.actions.open)} | ${fmt(m.actions.open/b.actions.open)} | ${fmt(m.actions.limp??0)} |`);
}
console.log('\n## BTN open → BB call: villain entry range\n');
console.log('The selected villain alone uses its profile. BTN villain reaches the flop with its open mix; BB villain uses its call mix. The other seat keeps its standard/table-profile range in Stage C. Strength bins and mean use the checked-in preflop equity versus a random hand as a descriptive proxy only, not equity versus the actual opponent, board strength or EV.\n');
console.log('| Profile | Villain | Combos | Pairs % | Suited % | Offsuit % | ≥65% proxy | 50–65% proxy | <50% proxy | Mean proxy % |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for(const p of ['standard',...profiles]) for(const seat of ['BTN','BB']) {
 const bundle=p==='standard'?standard:bundles[p], name=seat==='BTN'?'opening-ranges':'preflop-ranges',id=seat==='BTN'?'BTN_open':'BB_vs_BTN',action=seat==='BTN'?'open':'call';
 const s=bundle[name].spots.find(x=>x.id===id), rows=s.hands.map(r=>({h:r.hand,w:combos(r.hand)*r[action]/100})),sum=rows.reduce((v,r)=>v+r.w,0);
 const share=fn=>100*rows.filter(r=>fn(r.h)).reduce((v,r)=>v+r.w,0)/sum;
 const mean=100*rows.reduce((v,r)=>v+r.w*strength[r.h],0)/sum;
 console.log(`| ${p} | ${seat} | ${fmt(sum)} | ${fmt(share(h=>h.length===2))} | ${fmt(share(h=>h.endsWith('s')))} | ${fmt(share(h=>h.endsWith('o')))} | ${fmt(share(h=>strength[h]>=.65))} | ${fmt(share(h=>strength[h]>=.5&&strength[h]<.65))} | ${fmt(share(h=>strength[h]<.5))} | ${fmt(mean)} |`);
}
console.log('\n## All 280 profile decisions against standard\n');
console.log('| Profile | Dataset | Spot | Incoming combos | Profile action % | Standard action % |\n|---|---|---|---:|---|---|');
const show=a=>Object.entries(a).map(([k,v])=>`${k} ${fmt(v)}`).join(' / ');
for(const p of profiles) for(const name of names) for(const s of bundles[p][name].spots) {
 const m=mix(bundles[p],name,s),b=mix(standard,name,standard[name].spots.find(x=>x.id===s.id));
 console.log(`| ${p} | ${name} | ${s.id} | ${fmt(m.total)} | ${m.total?show(m.actions):'unreachable'} | ${b.total?show(b.actions):'unreachable'} |`);
}
if(findings.length)console.log('\n## Findings\n'+findings.map(f=>`- [${f.severity}] ${f.check}: ${f.spot}: ${f.detail}`).join('\n'));
