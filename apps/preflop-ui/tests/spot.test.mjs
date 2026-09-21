import {test} from "node:test";
import assert from "node:assert/strict";
import {spotRequest,responders,presets,spotTitle} from "../src/spot.js";

test("BTN vs BB resolves BB after BTN raises, without solving",()=>{
 assert.deepEqual(spotRequest("saved",{opener:"BTN",hero:"BB",size:"2.5"},100),{
  solutionId:"saved",heroPosition:"BB",actions:[{position:"BTN",action:"raise",sizeBb:2.5}]
 });
});
test("every preset has a valid response position",()=>{
 for(const p of presets) assert.doesNotThrow(()=>spotRequest("s",{...p,size:"3"},100));
 assert.deepEqual(responders("SB"),["BB"]);
 assert.deepEqual(responders("BTN"),["SB","BB"]);
});
test("configuration is independent of saved data",()=>{
 assert.equal(spotRequest("",{opener:"CO",hero:"BTN",size:"2.25"},100).solutionId,"");
 assert.equal(spotTitle({opener:"BTN",hero:"BB",size:"2.5"}),"BTN vs BB · 2.5 BB open");
});
test("same seat, out-of-order responses, missing/invalid/all-in sizes are rejected",()=>{
 for(const hero of ["BTN","UTG"]) assert.throws(()=>spotRequest("s",{opener:"BTN",hero,size:"2.5"},100));
 for(const size of ["", "NaN", "-1", "1.5", "100", "Infinity"])
  assert.throws(()=>spotRequest("s",{opener:"BTN",hero:"BB",size},100));
});
