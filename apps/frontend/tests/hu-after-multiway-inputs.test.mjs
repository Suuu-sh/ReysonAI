import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { POSTFLOP_SPOTS, MULTIWAY_POSTFLOP_CATALOG, multiwaySpotFor } from '../scripts/postflop-ai/spots.ts';
import { createPostflopSpots } from '../scripts/postflop-ai/spots-core.ts';
import { loadInputs } from '../scripts/postflop-ai/inputs.mjs';
import { buildInputs } from '../scripts/postflop-ai/browser-inputs.ts';
const json = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const legacy = json('./fixtures/hu-after-multiway-legacy-inputs.json');
// Exact first 40 Stage A objects from pr41-archive (commit ff4e89312aad3a1c99fd2098cd4a50d10c93dd16),
// apps/frontend/scripts/data/hu-after-multiway-spots.json (blob 4afd2cbf35f9cc310ccbfce829d01a48104b58e1).
const archived = json('./fixtures/hu-after-multiway-top40.json');
const names = ['opening-ranges','preflop-ranges','three-bet-responses','four-bet-responses','limp-responses','limp-deep-responses','multiway-responses','multiway2-responses','squeeze-responses','cold-three-bet-responses','cold-four-bet-responses','continuation-responses'];
const datasets = Object.fromEntries(names.map(name=>[name,json(`../src/estimated/${name}.json`)]));
datasets['hu-after-multiway-spots'] = MULTIWAY_POSTFLOP_CATALOG;
test('all 49 legacy spots, fingerprints, seat rows and unreachable errors stay exact',()=>{
 assert.equal(legacy.length,49);
 assert.equal(legacy.filter(row=>row.error).length,4);
 for (const row of legacy) {
  assert.deepEqual(POSTFLOP_SPOTS.find(s=>s.id===row.id),row.spot);
  if(row.error) { assert.throws(()=>loadInputs(row.id),e=>e.message===row.error); assert.throws(()=>buildInputs(row.id,datasets),e=>e.message===row.error); }
  else for(const inputs of [loadInputs(row.id),buildInputs(row.id,datasets)]) { assert.equal(inputs.fingerprint,row.fingerprint); assert.equal(createHash('sha256').update(JSON.stringify(inputs.seatRows)).digest('hex'),row.seatRowsSha256); }
 }
});
test('selected catalog is the exact archived reach-ranked Stage A top 40',()=>{
 assert.deepEqual(MULTIWAY_POSTFLOP_CATALOG.spots,archived);
 assert.equal(MULTIWAY_POSTFLOP_CATALOG.deferred.length,367);
 assert.ok(MULTIWAY_POSTFLOP_CATALOG.deferred.every(s=>s.reason));
 const scoped = createPostflopSpots(datasets);
 for (const spot of archived) { assert.equal(scoped.multiwaySpotFor(spot.history)?.id,spot.id); assert.equal(multiwaySpotFor(spot.history)?.id,spot.id); }
 assert.equal(createPostflopSpots({...datasets,'hu-after-multiway-spots':undefined}).POSTFLOP_SPOTS.length,49);
});
test('top spot weights independently equal saved action products for live seats only',()=>{
 const spot = archived[0], inputs = loadInputs(spot.id);
 assert.deepEqual(Object.keys(inputs.seatRows).sort(),[spot.ip,spot.oop].sort());
 for(const seat of [spot.ip,spot.oop]) for(const hand of ['AA','AKs','77','A5s']) {
  let freq=100;
  for(const [file,id,action] of spot.ranges[seat]) freq *= datasets[file].spots.find(s=>s.id===id).hands.find(r=>r.hand===hand)[action]/100;
  assert.equal(inputs.seatRows[seat].find(row=>row.hand===hand).freq,freq);
 }
 assert.deepEqual(buildInputs(spot.id,datasets),inputs);
});
