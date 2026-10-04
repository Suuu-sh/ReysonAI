import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hands } from "../src/data.ts";
import { continuationSpots } from "../src/estimated/continuation-tree.ts";
import { createContinuationModel, hasCompatibleDeal, validContinuationEquity, CONTINUATION_VERSION, CONTINUATION_SEED, continuationSamples, continuationMix } from "../src/estimated/continuation-model.ts";
import { continuationAllInTarget, continuationCapacity, orderContinuationCalls, continuationDefense } from "../src/estimated/continuation-audit.ts";
import { validateContinuationDataset } from "../src/estimated/continuation-responses.ts";
import { allInCallFrequency } from "../scripts/lib/all-in-call.mjs";
import { rakeMetadata } from "../src/estimated/rake.ts";
import { continuationProfile } from "../scripts/lib/continuation-profiles.mjs";

const names = ["opening-ranges", "preflop-ranges", "multiway-responses", "multiway2-responses", "squeeze-responses", "cold-three-bet-responses", "cold-four-bet-responses"];
const datasets = Object.fromEntries(names.map(name => [name, JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)))]));
const row = hand => ({ hand, fold: 100, call: 0, four_bet: 0, all_in: 0, raise_to_size_bb: null });
const copy = value => structuredClone(value);

function blankFamily(family = "cold_four_bet") {
  const model = createContinuationModel(datasets), spots = [], table = { version: 1, seed: CONTINUATION_SEED, spots: {} };
  for (const node of continuationSpots.filter(node => node.family === family)) {
    const context = model.context(node), spot = { ...node, unreachable: context.unreachable, hands: hands.map(row) };
    spots.push(spot); table.spots[node.id] = { version: CONTINUATION_VERSION, seed: CONTINUATION_SEED, samples: continuationSamples(node), input: context.input,
      equities: Object.fromEntries(hands.map(hand => [hand, context.reach(hand) > 0 ? 0 : null])) };
    model.register(spot);
  }
  return { data: { metadata: { schema_version: "1.0", strategy_type: "ai_estimate_not_gto", game: "6max Cash / No-Limit Texas Holdem", open_size_bb: 2.5,
    legal_actions: ["fold", "call", "four_bet", "all_in"], effective_stack_bb: 100, ante_bb: 0, rake: rakeMetadata, families: [family] },
    spot_count: spots.length, hand_classes_per_spot: 169, entry_count: spots.length * 169, spots }, table };
}

test("joint live-card support rejects impossible AA/AA/AA without inventing equity", () => {
  assert.equal(hasCompatibleDeal("AA", [[["AA", 1]], [["AA", 1]]]), false);
  assert.equal(hasCompatibleDeal("KK", [[["AA", 1]], [["AA", 1]]]), true);
  assert.equal(hasCompatibleDeal("AA", [[["KK", 1]], [["KK", 1]]]), true);
  assert.equal(hasCompatibleDeal("AA", [[]]), false);
});

test("exact AA-only opponents suppress generic non-AA four-bets and stack-offs", () => {
  const node = { bet_level: 4, opener: "UTG", hero: "BB", squeezer: "BB", live_participants: ["UTG", "HJ", "BTN", "BB"] };
  const context = { input: { ranges: [[["AA", 0.75], ["KK", 0.65]], [["AA", 0.03]], [["AA", 0.06]]] } };
  for (const hand of ["KK", "QQ", "JJ"]) assert.equal(continuationProfile(node, hand, context).aggressive, 0);
  assert.equal(continuationProfile(node, "KK").aggressive, 55);
  const onePinned = { input: { ranges: [[["AA", 1]], [["AA", 0.5], ["KK", 0.5]]] } };
  assert.equal(continuationProfile(node, "QQ", onePinned).aggressive, 0);
  assert.equal(continuationProfile(node, "A5s", onePinned).aggressive, 0);
  assert.equal(continuationProfile(node, "AA", onePinned).aggressive, 70);
  assert.equal(continuationProfile(node, "QQ", { input: { ranges: [[["AA", 0.5], ["KK", 0.5]]] } }).aggressive, 20);
  const facingThree = { ...node, bet_level: 3 };
  for (const decision of [node, facingThree]) for (const hand of hands.filter(hand => hand !== "AA")) {
    assert.equal(continuationProfile(decision, hand, onePinned).aggressive, 0, `${decision.bet_level}/${hand}`);
  }
  assert.deepEqual(continuationProfile(facingThree, "AA", onePinned), { call: 25, aggressive: 75 });
  assert.equal(continuationProfile(facingThree, "KK").aggressive, 65);
});

test("source factors multiply exact saved reach, including the observed fold of an earlier participant", () => {
  const node = continuationSpots[0], model = createContinuationModel(datasets), context = model.context(node);
  const source = datasets["multiway-responses"].spots.find(spot => spot.id === "BB_vs_UTG_HJcall");
  assert.equal(context.reach("AA"), source.hands.find(row => row.hand === "AA").squeeze / 100);
  assert.deepEqual(context.input.opponents, ["HJ"]);
  assert.equal(context.input.cost_to_call, 13);
  assert.equal(context.input.total_pot_after_call, 55); // UTG2.5 + SB0.5 are dead.
  const wrong = copy(datasets);
  wrong["squeeze-responses"].spots.find(spot => spot.id === "UTG_vs_BB_squeeze_HJcall").hands.forEach(row => { row.fold = 0; });
  assert.equal(createContinuationModel(wrong).context(node).unreachable, true);
});

test("live pending participants remain explicit and their hypothetical calls are never credited", () => {
  const node = continuationSpots.find(node => node.family === "squeeze" && node.bet_level === 4 && node.live_participants.length === 3 && node.pending_actors.length === 2 && node.source_factors[node.hero].every(f => f.dataset !== "continuation-responses"));
  const context = createContinuationModel(datasets).context(node);
  assert.equal(context.input.opponents.length, 2);
  assert.deepEqual(context.input.pending_actors, node.pending_actors.slice(1));
  assert.equal(context.input.total_pot_after_call, node.pot_bb + node.cost_to_call_bb);
  assert.ok(context.input.total_pot_after_call < node.live_participants.length * node.facing_size_bb + node.dead_money_bb);
});

test("absent or malformed saved actions are errors, not zero-reach shortcuts", () => {
  const node = continuationSpots[0], wrong = copy(datasets);
  delete wrong["multiway-responses"];
  assert.throws(() => createContinuationModel(wrong).context(node), /Missing continuation source/);
  const invalid = copy(datasets);
  invalid["multiway-responses"].spots[0].hands[0].squeeze = 100.5;
  assert.throws(() => createContinuationModel(invalid).context(node), /Invalid source action/);
});

test("equity freshness pins geometry, complete null placeholders, seed and stage-specific sample counts", () => {
  const node = continuationSpots[0], context = createContinuationModel(datasets).context(node);
  const entry = { version: CONTINUATION_VERSION, seed: CONTINUATION_SEED, samples: 12000, input: context.input,
    equities: Object.fromEntries(hands.map(hand => [hand, context.reach(hand) > 0 ? 0.5 : null])) };
  assert.ok(validContinuationEquity(entry, context));
  assert.equal(validContinuationEquity({ ...entry, samples: 100 }, context), false);
  assert.equal(validContinuationEquity({ ...entry, input: { ...entry.input, cost_to_call: 12 } }, context), false);
  const unreachable = hands.find(hand => !context.reach(hand));
  assert.equal(validContinuationEquity({ ...entry, equities: { ...entry.equities, [unreachable]: 0 } }, context), false);
});

test("all-in audit formula matches the shared all-in policy across every 0.01pt margin", () => {
  for (let i = -1000; i <= 1000; i++) assert.equal(continuationAllInTarget(i / 100), allInCallFrequency(i / 100));
});

test("strength ceilings trim calls only and never create a raise or negative-call capacity", () => {
  const spot = { id: "unit", hands: hands.map(row) };
  const context = { node: { bet_level: 4 }, spot, reach: hand => ["AA", "KK"].includes(hand) ? 1 : 0,
    input: { hero: "BB", opponents: ["UTG"], cost_to_call: 13, total_pot_after_call: 53, all_in: false } };
  Object.assign(spot.hands.find(row => row.hand === "AA"), { fold: 50, call: 20, all_in: 30, raise_to_size_bb: 100 });
  Object.assign(spot.hands.find(row => row.hand === "KK"), { fold: 0, call: 70, all_in: 30, raise_to_size_bb: 100 });
  orderContinuationCalls(spot, context);
  assert.equal(spot.hands.find(row => row.hand === "KK").call, 30);
  assert.equal(spot.hands.find(row => row.hand === "KK").all_in, 30);
  const capacity = continuationCapacity(spot, context, { equities: Object.fromEntries(hands.map(hand => [hand, hand === "AA" ? 0.8 : 0.1])) });
  assert.equal(capacity.maxCalls.get("KK"), 0);
});

test("full family validation preserves every source history, integer row and placeholder", () => {
  const { data } = blankFamily();
  assert.equal(validateContinuationDataset(data, datasets, { allowPartial: true }), data);
  assert.throws(() => validateContinuationDataset(data, datasets), /families/);
  const wrong = copy(data); wrong.spots[0].contributions_bb.UTG += 1;
  assert.throws(() => validateContinuationDataset(wrong, datasets, { allowPartial: true }), /history\/source\/geometry/);
  const missing = copy(data); missing.spots.pop();
  assert.throws(() => validateContinuationDataset(missing, datasets, { allowPartial: true }), /counts/);
  const invalid = copy(data); invalid.spots[0].hands[0].call = 0.5;
  assert.throws(() => validateContinuationDataset(invalid, datasets, { allowPartial: true }), /actions/);
});

test("all-fold audits count the whole pre-raise pot and preserve conditional folding paths", () => {
  const { data, table } = blankFamily();
  const events = continuationDefense(data, datasets, table);
  assert.ok(events.length > 0);
  for (const event of events) {
    assert.equal(event.threshold, event.risk_bb / (event.risk_bb + event.pot_before_raise_bb));
    assert.ok(event.group.length >= 1 && event.group.length <= 2);
    assert.ok(event.foldRate >= 0 && event.foldRate <= 1);
  }
});
