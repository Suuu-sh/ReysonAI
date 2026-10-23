import test from "node:test";
import assert from "node:assert/strict";
import { hands } from "../src/data.ts";
import { CONCRETE_COMBOS } from "../scripts/aiv2-preflop.ts";
import { decodeCompactPolicy } from "../scripts/aiv2-preflop-codec.ts";
import { initialBtnBbInput, postflopLegalActions, decisionIdentity, postflopResponseSchema, postflopPrompt, validatePostflopResponse, buildPostflopArtifact, validatePostflopArtifact, advancePostflopDecision, postflopHash } from "../scripts/aiv2-postflop.ts";
import type { DecisionInput } from "../scripts/aiv2-postflop.ts";
const implementation = "a".repeat(64);
function sources() {
  const make = (id: string, hero: string, actions: string[], choose: (hand: string) => number[], overrides: unknown[] = []) => {
    const spot = { id, hero, effective_stack_bb: 100, open_size_bb: 2.5, context_kind: "base", history: [], class_default_actions: actions, class_defaults: hands.map(choose), combo_overrides: overrides };
    return { spot, metadata: { method: "llm-range-single-response-v6", model: "gpt-6.1-sol", reasoning_effort: "medium", status: "complete", final_hash: postflopHash(decodeCompactPolicy(spot, actions)) } };
  };
  return [make("BTN_open", "BTN", ["open", "fold"], h => h === "AA" ? [100, 0] : [0, 100], [{combo:"AhAd",mix:{open:25,fold:75}}]), make("BB_vs_BTN", "BB", ["fold", "call", "three_bet"], h => h === "KK" ? [0,100,0] : [100,0,0])];
}
const input = () => initialBtnBbInput(...sources() as [any, any]);
function response(i: DecisionInput, action = "check") {
  const actions = postflopLegalActions(i).map(o => o.action);
  return { decision_id: decisionIdentity(i, implementation), range_summary: { text:"Estimate for the complete live ranges.", text_ja:"両者の到達レンジ全体を考慮した推定。" }, groups: [{ combos: CONCRETE_COMBOS.filter(row => i.ranges[i.actor][row.combo] > 0).map(row => row.combo), mix: Object.fromEntries(actions.map(a => [a, a === action ? 100 : 0])), text:"Check this range to retain showdown value.",text_ja:"ショーダウン価値を残すためチェックします。" }] };
}
function artifact(i: DecisionInput, action = "check") { return buildPostflopArtifact(i, response(i, action), implementation); }
test("first exact decision uses v6 physical overrides, board removal, explicit BB check and exact five sizes", () => {
  const i = input(); assert.equal(i.pot_bb,5.5); assert.deepEqual(i.stacks_bb,{BTN:97.5,BB:97.5});
  assert.deepEqual(postflopLegalActions(i).map(o => [o.action,o.paid_bb]),[["check",0],["bet33",1.82],["bet66",3.63],["bet100",5.5],["bet125",6.88]]);
  assert.equal(i.ranges.BTN.AhAd,.25); assert.equal(i.ranges.BTN.AsAh,0); assert.equal(i.ranges.BB.KsKh,1);
  assert.equal(i.history[0].seat,"BB"); assert.ok(i.history[0].assumption?.includes("probability 1"));
  assert.deepEqual(i.upstream.map(u => u.key),["base/opening-ranges/BTN_open","base/preflop-ranges/BB_vs_BTN"]);
  assert.ok(!postflopLegalActions(i).some(a => a.action === "bet75"));
  const bad = sources(); bad[0].spot.context_kind="villain-profile"; assert.throws(() => initialBtnBbInput(...bad as [any,any]),/source mismatch/);
});
test("lossless explicit combo groups expand complete positive coverage and weighted 169 aggregate", () => {
  const i = input(), raw = response(i), combos = raw.groups[0].combos;
  raw.groups = combos.map(combo => ({...raw.groups[0],combos:[combo],mix:Object.fromEntries(postflopLegalActions(i).map(a => [a.action,a.action === (combo === "AhAd" ? "check" : "bet66") ? 100 : 0]))}));
  const saved = buildPostflopArtifact(i,raw,implementation), aa = saved.hands.find(row => row.hand === "AA")!;
  assert.equal(saved.combos.length,3); assert.equal(saved.hands.length,169); assert.equal(aa.reach_weight,2.25);
  assert.ok(Math.abs(aa.frequencies.check - 100/9) < 1e-8); assert.ok(Math.abs(aa.frequencies.bet66 - 800/9) < 1e-8);
  const kk = saved.hands.find(row => row.hand === "KK")!; assert.ok(kk.unreachable); assert.deepEqual(kk.frequencies,{});
  assert.equal(saved.source_response,raw); assert.equal(validatePostflopArtifact(saved),saved);
  const changed = structuredClone(saved); changed.combos[0].text="altered"; assert.throws(() => validatePostflopArtifact(changed));
});
test("reject omissions/duplicates/blocked combos/bad actions/sums/identity and missing bilingual reasons", () => {
  const i = input(), id = decisionIdentity(i, implementation);
  const cases: Array<(raw:any)=>void> = [r=>r.groups[0].combos.pop(),r=>r.groups[0].combos.push(r.groups[0].combos[0]),r=>r.groups[0].combos.push("AsAh"),r=>r.groups[0].mix.bet75=0,r=>r.groups[0].mix.check=99,r=>r.groups[0].text_ja="",r=>r.decision_id="x",r=>r.extra=1];
  for (const mutate of cases) { const raw=response(i); mutate(raw); assert.throws(()=>validatePostflopResponse(raw,i,id)); }
  const schema=postflopResponseSchema(i,id); assert.equal(schema.additionalProperties,false);
  assert.ok(postflopPrompt(i,id).includes("ONE JSON response")); assert.ok(postflopPrompt(i,id).includes("SAME full mix"));
});
test("decision/cache identity binds board/actor/chips/history/ranges/upstream/model-version implementation", () => {
  const i=input(), id=decisionIdentity(i,implementation);
  for (const mutate of [(n:DecisionInput)=>n.pot_bb=6,(n:DecisionInput)=>n.actor="BB",(n:DecisionInput)=>n.assumptions.push("new assumption"),(n:DecisionInput)=>n.ranges.BTN.AhAd=.5,(n:DecisionInput)=>n.upstream[0].sha256="b".repeat(64)]) {const n=structuredClone(i);mutate(n);assert.notEqual(decisionIdentity(n,implementation),id);}
  assert.notEqual(decisionIdentity(i,"b".repeat(64)),id);
});
test("saved action conditions ONLY acting player's exact reach and derives 3x raise with minraise/stack caps", () => {
  const i=input(), a=artifact(i,"bet66");const next=advancePostflopDecision(a,"bet66"); assert.equal(next.status,"decision"); if(next.status!=="decision")return;
  assert.equal(next.input.actor,"BB");assert.equal(next.input.pot_bb,9.13);assert.equal(next.input.stacks_bb.BTN,93.87);
  assert.deepEqual(next.input.ranges.BB,i.ranges.BB);assert.deepEqual(next.input.ranges.BTN,i.ranges.BTN);
  const legal=postflopLegalActions(next.input);assert.deepEqual(legal.map(o=>o.action),["fold","call","raise"]);assert.equal(legal[2].to_bb,10.89);
  const noRaise={...next.input,raise_reopened:false}; assert.deepEqual(postflopLegalActions(noRaise).map(a=>a.action),["fold","call"]);
  const fourth={...next.input,raises_this_street:4};assert.deepEqual(postflopLegalActions(fourth).map(a=>a.action),["fold","call"]);
  const low={...i,stacks_bb:{BTN:2,BB:2}};assert.deepEqual(postflopLegalActions(low).map(a=>a.action),["check","allin"]);
  assert.throws(()=>advancePostflopDecision(a,"bet75"),/Illegal/);
});
test("explicit selected runout only: no automatic dealing/checking, separate turn/river actors and exact card blockers", () => {
  const flop=artifact(input());assert.equal(advancePostflopDecision(flop,"check").status,"next-street-card-required");
  const turn=advancePostflopDecision(flop,"check","9h");assert.equal(turn.status,"decision");if(turn.status!=="decision")return;
  assert.equal(turn.input.street,"turn");assert.equal(turn.input.actor,"BB");assert.equal(turn.input.board,"As7d2c9h");
  const turnIp=advancePostflopDecision(artifact(turn.input),"check");if(turnIp.status!=="decision")throw Error("missing IP turn"); assert.equal(turnIp.input.actor,"BTN");
  const river=advancePostflopDecision(artifact(turnIp.input),"check","3s");if(river.status!=="decision")throw Error("missing river");assert.equal(river.input.street,"river");assert.equal(river.input.actor,"BB");
  const riverIp=advancePostflopDecision(artifact(river.input),"check");if(riverIp.status!=="decision")throw Error("missing IP river");
  assert.equal(advancePostflopDecision(artifact(riverIp.input),"check").status,"terminal");
  assert.throws(()=>advancePostflopDecision(flop,"check","As"),/duplicate/i);
});
