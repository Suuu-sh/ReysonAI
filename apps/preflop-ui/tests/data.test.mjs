import {test} from "node:test";
import assert from "node:assert/strict";
import {hands,sortActions,totals,expectedValue,pct,handAggregates} from "../src/data.js";
test("169 distinct canonical hands",()=>{assert.equal(new Set(hands).size,169);for(const h of ["AA","AKs","AKo","72o"])assert.ok(hands.includes(h));});
test("frequencies weighted by actual combos, not hand classes",()=>{
 const combos=[{actions:[{action:"raise_2",frequency:1,evBb:2}]},{actions:[{action:"raise_2",frequency:0,evBb:3},{action:"fold",frequency:1,evBb:0}]}];
 assert.equal(totals(combos)[0].frequency,.5);
 assert.equal(expectedValue(combos),1);
});
test("action order puts all-in and larger raises on the left and fold on the right",()=>{
 const actions=sortActions(["fold","call","raise_10","all_in","raise_28.5"]);
 assert.deepEqual(actions,["all_in","raise_28.5","raise_10","call","fold"]);
 assert.deepEqual(totals([{actions:actions.map(action=>({action,frequency:1}))}]).map(item=>item.action),actions);
});
test("missing results never synthesize a strategy",()=>{assert.deepEqual(totals([]),[]);assert.equal(expectedValue([]),null);assert.equal(pct(null),"未計算")});
test("hand aggregates keep combo-weighted action frequencies",()=>{
 const aggregates=handAggregates([
  {hand:"AA",actions:[{action:"raise_2",frequency:1}]},
  {hand:"AA",actions:[{action:"raise_2",frequency:0},{action:"fold",frequency:1}]},
 ]);
 assert.equal(aggregates.get("AA").comboCount,2);
 assert.equal(aggregates.get("AA").actions.raise_2,.5);
 assert.equal(aggregates.get("AA").actions.fold,.5);
});
test("missing strategies and invalid frequencies are not displayed", async()=>{
 const {strategyCombos}=await import("../src/data.js");
 assert.deepEqual(strategyCombos(null),[]);
 assert.deepEqual(strategyCombos({combos:[{combo:"AsAh",hand:"AA",actions:[]}]}),[]);
 assert.deepEqual(strategyCombos({combos:[{combo:"AsAh",hand:"AA",actions:[{action:"fold",frequency:null}]}]}),[]);
 const combo={combo:"AsAh",hand:"AA",actions:[{action:"fold",frequency:1}]};
 assert.equal(strategyCombos({combos:[combo]}).length,1);
 assert.equal(expectedValue([combo]),null);
});
