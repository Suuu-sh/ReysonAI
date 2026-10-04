import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hands } from "../src/data.ts";
import { coldFourBetSpots, findColdFourBetSpot, loadColdFourBetDataset, validateColdFourBetDataset } from "../src/estimated/cold-four-bet-responses.ts";
import { allowedCall, callContexts, callFacts, coldFourBetFoldThreshold, validCallEquities } from "../src/estimated/call-ev.ts";
import { equityRealization, THREE_BETTOR_BEHIND_EQR } from "../src/estimated/eqr.ts";
import { auditEstimates, isBlockingAuditFinding } from "../src/estimated/audit.ts";
import { effectiveStackBb, fourBetToSize, openSizeFor, threeBetToSize } from "../src/estimated/sizing.ts";

const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url), "utf8"));
const data = load("cold-four-bet-responses");
const opening = load("opening-ranges");
const responses = load("preflop-ranges");
const coldThreeBets = load("cold-three-bet-responses");
const equities = load("call-equities");
const datasets = () => ({ opening: structuredClone(opening), responses: structuredClone(responses),
  threeBets: load("three-bet-responses"), fourBets: load("four-bet-responses"), fiveBets: load("five-bet-responses"),
  multiway: load("multiway-responses"), squeezes: load("squeeze-responses"), limp: load("limp-responses"),
  limpDeep: load("limp-deep-responses"), coldThreeBets: structuredClone(coldThreeBets),
  coldFourBets: structuredClone(data), callEquities: structuredClone(equities) });
const contexts = () => callContexts({ opening, responses, coldThreeBets, coldFourBets: data }).filter(c => c.type === "cold_four_bet");
const byId = id => data.spots.find(spot => spot.id === id);
const row = (spot, hand) => spot.hands.find(r => r.hand === hand);
const sourceReach = spot => {
  const source = spot.prior_action === null ? opening.spots.find(s => s.id === spot.source_opening_id)
    : responses.spots.find(s => s.id === spot.source_response_id);
  const action = spot.prior_action === null ? "open" : "three_bet";
  return hand => row(source, hand)[action] / 100;
};

test("all 40 cold-4bet response IDs match the two supported paths for each of 20 histories", () => {
  assert.equal(validateColdFourBetDataset(data, coldThreeBets, responses, opening), data);
  const seats = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
  const expected = [];
  for (let o = 0; o < seats.length - 2; o += 1) {
    for (let x = o + 1; x < seats.length - 1; x += 1) {
      for (let y = x + 1; y < seats.length; y += 1) {
        expected.push(`${seats[o]}_vs_${seats[y]}_cold4bet_${seats[x]}3bet`, `${seats[x]}_vs_${seats[y]}_cold4bet_${seats[o]}open`);
      }
    }
  }
  assert.equal(expected.length, 40);
  assert.deepEqual(data.spots.map(s => s.id), expected);
  assert.deepEqual(coldFourBetSpots.map(s => s.id), expected);
  assert.deepEqual(data.spots.slice(0, 2).map(s => s.id), ["UTG_vs_CO_cold4bet_HJ3bet", "HJ_vs_CO_cold4bet_UTGopen"]);
  assert.deepEqual(data.spots.slice(-2).map(s => s.id), ["BTN_vs_BB_cold4bet_SB3bet", "SB_vs_BB_cold4bet_BTNopen"]);
  assert.equal(data.spot_count, 40);
  assert.equal(data.entry_count, 6760);
  assert.equal(data.hand_classes_per_spot, 169);
  assert.deepEqual(data.metadata.legal_actions, ["fold", "call", "all_in"]);
});

test("every source path preserves saved open/3bet/cold-4bet sizes and the sole 100BB 5bet", () => {
  for (const spot of data.spots) {
    const o = opening.spots.find(s => s.id === spot.source_opening_id);
    const x = responses.spots.find(s => s.id === spot.source_response_id);
    const y = coldThreeBets.spots.find(s => s.id === spot.source_cold_three_bet_id);
    assert.equal(o.id, `${spot.opener}_open`);
    assert.equal(x.id, `${spot.three_bettor}_vs_${spot.opener}`);
    assert.equal(y.id, `${spot.four_bettor}_vs_${spot.three_bettor}_3bet_${spot.opener}open`);
    assert.equal(y.source_response_id, x.id);
    assert.equal(spot.hero, spot.prior_action === null ? spot.opener : spot.three_bettor);
    assert.ok(spot.prior_action === null || spot.prior_action === "fold");
    assert.equal(spot.open_size_bb, o.open_size_bb);
    assert.equal(spot.open_size_bb, openSizeFor(spot.opener));
    assert.equal(spot.three_bet_size_bb, x.three_bet_size_bb);
    assert.equal(spot.three_bet_size_bb, y.three_bet_size_bb);
    assert.equal(spot.three_bet_size_bb, threeBetToSize(spot.opener, spot.three_bettor));
    assert.equal(spot.four_bet_size_bb, y.four_bet_size_bb);
    assert.equal(spot.four_bet_size_bb, fourBetToSize(spot.four_bettor, spot.three_bettor));
    assert.ok(spot.four_bet_size_bb >= 2 * spot.three_bet_size_bb - spot.open_size_bb);
    assert.equal(spot.all_in_size_bb, effectiveStackBb);
    assert.equal(spot.effective_stack_bb, 100);
    assert.ok(spot.all_in_size_bb >= 2 * spot.four_bet_size_bb - spot.three_bet_size_bb);
  }
});

test("169 integer-frequency rows are conditional on the correct reach; zero reach stays a placeholder", () => {
  for (const spot of data.spots) {
    const reach = sourceReach(spot);
    assert.deepEqual(spot.hands.map(r => r.hand), hands);
    for (const r of spot.hands) {
      assert.deepEqual(Object.keys(r), ["hand", "fold", "call", "all_in", "all_in_size_bb"]);
      assert.ok([r.fold, r.call, r.all_in].every(n => Number.isInteger(n) && n >= 0 && n <= 100));
      assert.equal(r.fold + r.call + r.all_in, 100);
      assert.equal(r.all_in_size_bb, r.all_in > 0 ? 100 : null);
      if (reach(r.hand) === 0) assert.deepEqual([r.fold, r.call, r.all_in, r.all_in_size_bb], [100, 0, 0, null], `${spot.id}/${r.hand}`);
    }
    assert.ok(spot.hands.some(r => reach(r.hand) === 0), spot.id);
    assert.ok(spot.hands.some(r => reach(r.hand) > 0 && r.call > 0), spot.id);
  }
});

test("validation rejects malformed metadata, reordered/duplicate spots, unsupported paths and broken rows", () => {
  const mutations = [
    d => { d.metadata.rake.rate = 0.04; },
    d => { d.metadata.ante_bb = 1; },
    d => { d.metadata.legal_actions = ["fold", "call", "five_bet"]; },
    d => { d.spots.pop(); },
    d => { d.spots.reverse(); },
    d => { d.spots[1] = structuredClone(d.spots[0]); },
    d => { d.spots[1].prior_action = "call"; },
    d => { d.spots[0].hero = d.spots[0].four_bettor; },
    d => { d.spots[0].source_opening_id = "HJ_open"; },
    d => { d.spots[0].source_response_id = "CO_vs_UTG"; },
    d => { d.spots[0].source_cold_three_bet_id = "BTN_vs_HJ_3bet_UTGopen"; },
    d => { d.spots[0].three_bet_size_bb += 1; },
    d => { d.spots[0].four_bet_size_bb = 13; }, // Below the full-raise minimum 13.5BB.
    d => { d.spots[0].all_in_size_bb = 99; },
    d => { d.spots[0].hands.pop(); },
    d => { d.spots[0].hands[1] = structuredClone(d.spots[0].hands[0]); },
    d => { d.spots[0].hands[0] = null; },
    d => { d.spots[0].hands[0].call += 1; },
    d => { const r = d.spots[0].hands[0]; r.call += 0.5; r.fold -= 0.5; },
    d => { Object.assign(d.spots[0].hands[0], { fold: 101, call: -1, all_in: 0, all_in_size_bb: null }); },
    d => { d.spots[0].hands[0].five_bet_size_bb = 40; },
    d => { d.spots[0].hands[0].all_in_size_bb = 40; },
    d => { const r = d.spots[0].hands.find(r => r.all_in === 0); r.all_in_size_bb = 100; },
    d => { const spot = d.spots[0], reach = sourceReach(spot); Object.assign(spot.hands.find(r => !reach(r.hand)), { fold: 90, call: 10 }); },
    d => { const spot = d.spots[1], reach = sourceReach(spot); Object.assign(spot.hands.find(r => !reach(r.hand)), { fold: 90, all_in: 10, all_in_size_bb: 100 }); },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(data); mutate(copy);
    assert.throws(() => validateColdFourBetDataset(copy, coldThreeBets, responses, opening), /コールド4bet/);
  }
});

test("sources are mandatory, complete, nonnegative and nonempty; missing sources never mean zero reach", () => {
  for (const missing of [undefined, null, {}, { spots: [] }]) {
    assert.throws(() => validateColdFourBetDataset(data, missing, responses, opening));
    assert.throws(() => validateColdFourBetDataset(data, coldThreeBets, missing, opening));
    assert.throws(() => validateColdFourBetDataset(data, coldThreeBets, responses, missing));
  }
  const mutations = [
    d => { d.cold.spots[0].hands = null; },
    d => { d.cold.spots[0].hands.pop(); },
    d => { d.cold.spots[0].source_response_id = "CO_vs_UTG"; },
    d => { Object.assign(d.cold.spots[0].hands[0], { fold: 0, call: 105, four_bet: -5, four_bet_size_bb: null }); },
    d => { for (const r of d.cold.spots[0].hands) Object.assign(r, { fold: 100, call: 0, four_bet: 0, four_bet_size_bb: null }); },
    d => { d.responses.spots[0].hands[0].three_bet = -1; },
    d => { d.responses.spots[0].hands = null; },
    d => { for (const r of d.responses.spots[0].hands) Object.assign(r, { fold: 100, call: 0, three_bet: 0, three_bet_size_bb: null }); },
    d => { d.opening.spots[0].hands[0].open = -1; },
    d => { d.opening.spots[0].hands.pop(); },
    d => { for (const r of d.opening.spots[0].hands) Object.assign(r, { fold: 100, open: 0, open_size_bb: null }); },
  ];
  for (const mutate of mutations) {
    const copy = { cold: structuredClone(coldThreeBets), responses: structuredClone(responses), opening: structuredClone(opening) };
    mutate(copy);
    assert.throws(() => validateColdFourBetDataset(data, copy.cold, copy.responses, copy.opening), /コールド4bet/);
  }
  // Altering both sides of a size link cannot smuggle in a non-full cold raise.
  const cold = structuredClone(coldThreeBets), copy = structuredClone(data);
  const source = cold.spots.find(s => s.three_bettor === "SB");
  source.four_bet_size_bb = 20; // SB's 12BB 3bet requires at least 21.5BB.
  for (const r of source.hands) if (r.four_bet) r.four_bet_size_bb = 20;
  for (const s of copy.spots.filter(s => s.source_cold_three_bet_id === source.id)) s.four_bet_size_bb = 20;
  assert.throws(() => validateColdFourBetDataset(copy, cold, responses, opening), /コールド4bet/);
});

test("missing/malformed files fail closed, and the opener-call branch has no substitute range", () => {
  assert.match(loadColdFourBetDataset(undefined, coldThreeBets, responses, opening).error, /データなし/);
  assert.match(loadColdFourBetDataset("{broken", coldThreeBets, responses, opening).error, /表示できません/);
  assert.match(loadColdFourBetDataset("null", coldThreeBets, responses, opening).error, /表示できません/);
  assert.deepEqual(loadColdFourBetDataset(JSON.stringify(data), coldThreeBets, responses, opening).data, data);
  const query = { opener: "BTN", threeBettor: "SB", fourBettor: "BB" };
  assert.equal(findColdFourBetSpot(data, query), byId("BTN_vs_BB_cold4bet_SB3bet"));
  assert.equal(findColdFourBetSpot(data, { ...query, priorAction: "fold" }), byId("SB_vs_BB_cold4bet_BTNopen"));
  for (const priorAction of ["call", "all_in", "four_bet"]) assert.throws(() => findColdFourBetSpot(data, { ...query, priorAction }));
});

test("call contexts use Y's initial cold-4bet range and role-specific price, dead money, reach and EQR", () => {
  const models = contexts(), blinds = { SB: 0.5, BB: 1 };
  assert.equal(models.length, 40);
  for (const c of models) {
    const s = c.spot, opener = s.prior_action === null;
    const source = coldThreeBets.spots.find(x => x.id === s.source_cold_three_bet_id);
    const dead = 1.5 - [s.opener, s.three_bettor, s.four_bettor].reduce((n, p) => n + (blinds[p] ?? 0), 0);
    assert.deepEqual(c.input.opponents, [s.four_bettor]);
    assert.equal(c.input.cost_to_call, s.four_bet_size_bb - (opener ? s.open_size_bb : s.three_bet_size_bb));
    assert.equal(c.input.total_pot_after_call, 2 * s.four_bet_size_bb + (opener ? s.three_bet_size_bb : s.open_size_bb) + dead);
    assert.equal(c.input.all_in, false);
    assert.equal(c.input.three_bettor_behind === true, opener);
    assert.deepEqual(c.input.ranges, [source.hands.filter(r => r.four_bet > 0).map(r => [r.hand, r.four_bet / 100])]);
    const reach = sourceReach(s);
    for (const hand of hands) {
      assert.equal(c.reach(hand), reach(hand));
      const base = equityRealization(hand, s.hero, [s.four_bettor]);
      assert.ok(Math.abs(callFacts(c, hand, 0.5).eqr - base * (opener ? THREE_BETTOR_BEHIND_EQR : 1)) < 1e-12);
    }
    assert.equal(validCallEquities(equities, c), true, s.id);
    const changed = structuredClone(equities);
    changed.spots[s.id].input.ranges[0][0][1] /= 2;
    assert.equal(validCallEquities(changed, c), false, `${s.id}: stale opposing range`);
  }
});

test("calls pass the shared EV gate without a 3bet-pot fill and keep legal premium flats", () => {
  let positiveMixedCalls = 0;
  for (const c of contexts()) {
    const saved = equities.spots[c.spot.id].equities;
    for (const r of c.spot.hands) {
      const ev = callFacts(c, r.hand, saved[r.hand]).call_ev_bb;
      assert.equal(r.call, allowedCall(r.call, ev), `${c.spot.id}/${r.hand}: ${ev}`);
      if (c.reach(r.hand) > 0 && ev >= 0.5 && r.call > 0 && r.fold > 0) positiveMixedCalls += 1;
    }
    for (const hand of ["AA", "KK", "AKs", "AKo"]) {
      const r = row(c.spot, hand), ev = callFacts(c, hand, saved[hand]).call_ev_bb;
      assert.ok(r.all_in > 0 && r.all_in < 100, `${c.spot.id}/${hand}: mixed premium shove`);
      // Every premium starts with the whole non-shove share as a flat. Keep
      // all of that share the EV gate permits, rather than forcing fold=0:
      // KK itself is a negative-EV OOP flat in four early-opener histories
      // after the 3bettor-behind discount. Boundary calls still cap at 50%.
      assert.equal(r.call, allowedCall(100 - r.all_in, ev), `${c.spot.id}/${hand}: protect every legal premium flat`);
    }
  }
  assert.ok(positiveMixedCalls > 0, "4bet pots preserve authored folds even for some positive-EV calls");
});

test("audit checks 40 response ranges and the product of both defenders' fold rates", () => {
  const report = auditEstimates(datasets());
  const ids = new Set([...data.spots.map(s => s.id), ...coldThreeBets.spots.map(s => s.id)]);
  assert.deepEqual(report.findings.filter(f => ids.has(f.spot) && isBlockingAuditFinding(f)), []);
  assert.equal(report.coldFourBetDefense.length, 20);
  for (const item of report.coldFourBetDefense) {
    const first = data.spots.find(s => s.source_cold_three_bet_id === item.spot && s.prior_action === null);
    assert.ok(Math.abs(item.foldRate - item.openerFold * item.threeBettorFold) < 1e-12);
    assert.equal(item.threshold, coldFourBetFoldThreshold(first));
  }
  const changed = datasets(), first = changed.coldFourBets.spots[0];
  const c = callContexts(changed).find(c => c.spot === first);
  const target = first.hands.find(r => c.reach(r.hand) > 0 && callFacts(c, r.hand, changed.callEquities.spots[first.id].equities[r.hand]).call_ev_bb < -0.2);
  assert.ok(target, "negative-EV reachable hand exists for the rejection test");
  Object.assign(target, { fold: 50, call: 50, all_in: 0, all_in_size_bb: null });
  assert.ok(auditEstimates(changed).findings.some(f => f.spot === first.id && f.check === "negative-ev-call" && isBlockingAuditFinding(f)));
  const overfold = datasets();
  for (const s of overfold.coldFourBets.spots.slice(0, 2)) {
    for (const r of s.hands) Object.assign(r, { fold: 100, call: 0, all_in: 0, all_in_size_bb: null });
  }
  assert.ok(auditEstimates(overfold).findings.some(f => f.spot === first.source_cold_three_bet_id && f.check === "auto-profit" && isBlockingAuditFinding(f)));
});

test("each of the 40 cold-4bet reason files covers 169 hands and quotes the saved mix", () => {
  const fingerprints = new Set();
  for (const spot of data.spots) {
    const file = load(`reasons/${spot.id}`), reach = sourceReach(spot);
    assert.equal(file.spot_id, spot.id);
    assert.equal(file.type, "cold_four_bet");
    assert.match(file.source_fingerprint, /^[a-f0-9]{64}$/);
    fingerprints.add(file.source_fingerprint);
    assert.ok(file.fact_labels.some(f => f.key === "call_ev_bb"));
    assert.deepEqual(Object.keys(file.hands).sort(), [...hands].sort());
    for (const r of spot.hands) {
      const reason = file.hands[r.hand].reason;
      assert.ok(reason.length > 20, `${spot.id}/${r.hand}`);
      if (!reach(r.hand)) assert.match(reason, /対象外/);
      else {
        for (const [key, label] of [["all_in", "オールイン"], ["call", "コール"], ["fold", "フォールド"]]) {
          if (r[key] > 0) assert.ok(reason.includes(`${label} ${r[key]}%`), `${spot.id}/${r.hand}: ${key}`);
        }
        assert.ok(Number.isFinite(file.hands[r.hand].facts.call_ev_bb), `${spot.id}/${r.hand}: saved call EV`);
      }
    }
  }
  assert.equal(fingerprints.size, 1);
});
