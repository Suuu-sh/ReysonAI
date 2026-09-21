import {test} from "node:test";
import assert from "node:assert/strict";
import {OPEN_SIZE_BB,spotRequest,responders,presets,spotTitle,threeBetSize,fourBetSize} from "../src/spot.js";

test("BTN vs BB resolves BB after a fixed 2.5 BB open, without solving",()=>{
 assert.deepEqual(spotRequest("saved",{mode:"open",opener:"BTN",actor:"BB"}),{
  solutionId:"saved",heroPosition:"BB",actions:[{position:"BTN",action:"raise",sizeBb:2.5}]
 });
 assert.equal(OPEN_SIZE_BB,2.5);
});
test("3bet and 4bet pots build the API action sequence",()=>{
 assert.deepEqual(spotRequest("saved",{mode:"three_bet",opener:"BTN",actor:"BB"}),{
  solutionId:"saved",heroPosition:"BTN",actions:[
   {position:"BTN",action:"raise",sizeBb:2.5},
   {position:"BB",action:"raise",sizeBb:10},
  ]
 });
 assert.deepEqual(spotRequest("saved",{mode:"four_bet",opener:"BTN",actor:"BB"}),{
  solutionId:"saved",heroPosition:"BB",actions:[
   {position:"BTN",action:"raise",sizeBb:2.5},
   {position:"BB",action:"raise",sizeBb:10},
   {position:"BTN",action:"raise",sizeBb:22},
  ]
 });
 assert.equal(threeBetSize("CO","BTN"),7.5);
 assert.equal(fourBetSize("CO","BTN"),16.5);
});
test("every preset has a valid response position",()=>{
 for(const p of presets) assert.doesNotThrow(()=>spotRequest("s",{...p,size:"3"},100));
 assert.deepEqual(responders("SB"),["BB"]);
 assert.deepEqual(responders("BTN"),["SB","BB"]);
});
test("configuration is independent of saved data",()=>{
 assert.equal(spotRequest("",{mode:"open",opener:"CO",actor:"BTN"}).solutionId,"");
 assert.equal(spotTitle({mode:"open",opener:"BTN",actor:"BB"}),"BTN vs BB · Open 2.5 BB");
 assert.equal(spotTitle({mode:"three_bet",opener:"BTN",actor:"BB"}),"BTN open → BB 3bet 10 BB");
 assert.equal(spotTitle({mode:"four_bet",opener:"BTN",actor:"BB"}),"BTN open → BB 3bet → BTN 4bet 22 BB");
});
test("same seat, out-of-order response, and unknown mode are rejected",()=>{
 for(const actor of ["BTN","UTG"]) assert.throws(()=>spotRequest("s",{mode:"open",opener:"BTN",actor}));
 assert.throws(()=>spotRequest("s",{mode:"open",opener:"BB",actor:"BTN"}));
 assert.throws(()=>spotRequest("s",{mode:"unknown",opener:"BTN",actor:"BB"}));
});
