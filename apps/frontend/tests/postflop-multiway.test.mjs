import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { POSTFLOP_SPOTS, MULTIWAY_POSTFLOP_CATALOG, multiwaySpotFor } from '../scripts/postflop-ai/spots.ts';
import { loadInputs, useArtifactSource, seatRange } from '../scripts/postflop-ai/inputs.mjs';
import { buildInputs } from '../scripts/postflop-ai/browser-inputs.ts';
import { datasetsNeededForSpot } from '../src/estimated/postflop-browser.ts';
import { postflopSpotFor } from '../src/agent/hand.ts';
import { completedFlopContext } from '../src/estimated/postflop-trial.ts';
import { buildActionBlocks } from '../src/estimated/range-url.ts';
import { continuationTerminals } from '../src/estimated/continuation-tree.ts';
import { buildSql } from '../scripts/postflop-ai/publish-d1.mjs';

const read = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
const names = ['opening-ranges', 'preflop-ranges', 'three-bet-responses', 'four-bet-responses', 'limp-responses', 'limp-deep-responses', 'multiway-responses', 'multiway2-responses', 'squeeze-responses', 'cold-three-bet-responses', 'cold-four-bet-responses', 'continuation-responses'];
const datasets = Object.fromEntries(names.map(name => [name, read(name)]));
const planned = POSTFLOP_SPOTS.filter(spot => spot.history);
const example = planned.find(spot => spot.id === 'UTG_open_HJ_call_BB_squeeze_UTG_fold_HJ_call');
const events = history => history.map(item => ({ pos: item.seat, key: item.action, to: item.to_size_bb,
  type: item.action === 'fold' ? 'fold' : item.action === 'call' ? 'call' : 'raise' }));

test('enumerates exact HU endings, excludes impossible/all-in paths, and orders all Stage B by reach', () => {
  const catalog = MULTIWAY_POSTFLOP_CATALOG;
  assert.deepEqual([catalog.structural, catalog.reachable, catalog.stageA, catalog.stageB], [525,407,137,270]);
  assert.equal(catalog.omitted.length,118); assert.equal(catalog.deferred.length,0);
  assert.equal(planned.length,407); assert.equal(new Set(planned.map(s=>s.id)).size,407);
  const b=planned.filter(s=>s.stage==='B');
  assert.equal(b.length,270); assert.ok(b.every((s,i)=>i===0 || b[i-1].reach.probability>=s.reach.probability));
  assert.ok(planned.every(s=>s.stackBb>0 && !s.history.some(h=>h.action==='all_in')));
  assert.equal(example.potBb,29); assert.equal(example.stackBb,87);
  assert.deepEqual([example.oop,example.ip,example.aggressor,example.tree],['BB','HJ','BB','oop_leads']);
});

test('every new input is Node/browser identical and each live hand equals all saved action factors', () => {
  const prior = useArtifactSource({ ranges: datasets, artifact: () => null });
  try {
    for (const spot of planned) {
      const a=loadInputs(spot.id), b=buildInputs(spot.id,datasets);
      assert.deepEqual(b,a,spot.id);
      assert.equal(spot.potBb,Object.values(spot.contributionsBb).reduce((a,b)=>a+b,0));
      assert.deepEqual(Object.keys(a.seatRows),[spot.oop,spot.ip]);
      for (const seat of [spot.oop,spot.ip]) for (const row of a.seatRows[seat]) {
        const expected=spot.ranges[seat].reduce((p,[file,id,action])=>p*datasets[file].spots.find(s=>s.id===id).hands.find(h=>h.hand===row.hand)[action]/100,100);
        assert.equal(row.freq,expected,`${spot.id}/${seat}/${row.hand}`);
      }
      assert.deepEqual(new Set(datasetsNeededForSpot(spot)),new Set(Object.values(spot.ranges).flat().map(f=>f[0])));
    }
  } finally { useArtifactSource(prior); }
});

test('folded participants are never included as postflop dead cards or opponent ranges', () => {
  const input=buildInputs(example.id,datasets);
  assert.equal(input.seatRows.UTG,undefined);
  assert.throws(()=>seatRange(input,'UTG',[]),/not in/);
  const ranges=seatRange(input,'HJ',[48,25,0]);
  assert.ok(ranges.length>0 && ranges.every(r=>r.combo.every(c=>![48,25,0].includes(c))));
});

test('complete observed action sequence matches in Agent and rejects reordered/missing folds and deferred paths', () => {
  for(const spot of planned) assert.equal(postflopSpotFor(events(spot.history))?.id,spot.id);
  assert.equal(multiwaySpotFor(example.history.slice(0,-1)),null);
  assert.equal(multiwaySpotFor(example.history.filter(s=>s.action!=='fold')),null);
  for(const item of MULTIWAY_POSTFLOP_CATALOG.deferred) {
    const t=continuationTerminals.find(t=>t.id===item.terminalId);
    assert.equal(postflopSpotFor(events(t.history)),null);
  }
});

test('range workspace squeeze ending opens the correct HU spot with the correct remaining seats', () => {
  const state={rangeType:'response',opener:'UTG',hero:'BB',callers:['HJ'],foldedHero:false,pendingRaise:'squeeze',squeezeResponse:['fold','call'],isDefaultTable:true};
  const actionBlocks=buildActionBlocks(state);
  const context=completedFlopContext({...state,actionBlocks});
  assert.equal(context.spotId,example.id); assert.equal(context.pilotAvailable,true);
  assert.deepEqual(new Set(context.players),new Set(['BB','HJ']));
  assert.equal(context.potBb,29);
  assert.equal(completedFlopContext({...state,actionBlocks,isDefaultTable:false}).pilotAvailable,false);
});

test('legacy 44 plus limp4bet input fingerprints remain unchanged', () => {
  const before=JSON.parse(readFileSync(new URL('./fixtures/postflop-legacy-fingerprints.json',import.meta.url)));
  assert.equal(Object.keys(before).length,45);
  for(const [id,hash] of Object.entries(before)) assert.equal(loadInputs(id).fingerprint,hash,id);
});

test('missing, incomplete or invalid saved source cannot become a substitute range', () => {
  assert.throws(()=>buildInputs(example.id,{}),/missing or malformed/);
  const source=structuredClone(datasets['squeeze-responses']);
  source.spots.find(s=>s.id==='HJ_vs_BB_squeeze_UTGfold').hands[0].call=NaN;
  assert.throws(()=>buildInputs(example.id,{...datasets,'squeeze-responses':source}),/invalid saved action/);
});

test('local D1-compatible SQL preserves existing policies and supports safe retry', () => {
  const db=new DatabaseSync(':memory:');
  try {
    db.exec(readFileSync(new URL('../../backend/migrations/0001_postflop.sql',import.meta.url),'utf8'));
    db.exec(readFileSync(new URL('../../backend/migrations/0002_postflop_reports.sql',import.meta.url),'utf8'));
    const legacy={id:'legacy',slug:'legacy',kind:'srp',tree:'oop_checks',ip:'BTN',oop:'BB',potBb:5.5,stackBb:97.5};
    const old={spot:legacy,candidate:{metadata:{policy_hash:'old'},policy:{old:true}},laterCandidate:null,report:{old:true}};
    db.exec(buildSql([old],'2026-10-04T00:00:00Z'));
    const snapshot=db.prepare("SELECT * FROM postflop_policies WHERE spot_id='legacy'").all();
    const fresh={spot:example,candidate:{metadata:{policy_hash:'new'},policy:{}},laterCandidate:null,report:{}};
    db.exec(buildSql([fresh])); db.exec(buildSql([fresh])); db.exec(buildSql([]));
    assert.deepEqual(db.prepare("SELECT * FROM postflop_policies WHERE spot_id='legacy'").all(),snapshot);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM postflop_spots').get().n,2);
  } finally { db.close(); }
});

test('AA-only support rejects impossible boards instead of manufacturing combos', async () => {
  const {hasPostflopDeal,assertPostflopDeal}=await import('../scripts/postflop-ai/range-support.mjs');
  const {parseCards}=await import('../scripts/postflop-ai/model.ts');
  const inputs={spot:{ip:'HJ',oop:'BB',history:[]},seatRows:{HJ:[{hand:'AA',freq:100}],BB:[{hand:'AA',freq:100}]}};
  assert.equal(hasPostflopDeal(inputs,parseCards('Kh7d2c',3)),true);
  assert.equal(hasPostflopDeal(inputs,parseCards('As7d2c',3)),false);
  assert.equal(hasPostflopDeal(inputs,parseCards('Kh7d2cAh',4)),false);
  assert.throws(()=>assertPostflopDeal(inputs,parseCards('As7d2c',3)),error=>error.code==='POSTFLOP_BOARD_UNREACHABLE');
});

test('fresh authoring rejects changed source actors and chip sizes', () => {
  const source=structuredClone(datasets['multiway-responses']);
  const row=source.spots.find(s=>s.id==='BB_vs_UTG_HJcall');
  row.squeeze_size_bb=14;
  for(const hand of row.hands) if(hand.squeeze>0) hand.squeeze_size_bb=14;
  assert.throws(()=>buildInputs(example.id,{...datasets,'multiway-responses':source}),/source action size changed/);
  const wrongActor=structuredClone(datasets['squeeze-responses']);
  wrongActor.spots.find(s=>s.id==='HJ_vs_BB_squeeze_UTGfold').hero='CO';
  assert.throws(()=>buildInputs(example.id,{...datasets,'squeeze-responses':wrongActor}),/source geometry changed/);
});
