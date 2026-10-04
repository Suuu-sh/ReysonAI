import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hands } from "../src/data.ts";
import { continuationSpots } from "../src/estimated/continuation-tree.ts";
import {
  CONTINUATION_SEED, CONTINUATION_VERSION, continuationBreakEven, continuationComboCount,
  continuationFacts, continuationSamples, createContinuationModel,
} from "../src/estimated/continuation-model.ts";
import { continuationAllInTarget, continuationCapacity } from "../src/estimated/continuation-audit.ts";
import { raked } from "../src/estimated/rake.ts";
import { composeContinuationReasons, continuationReasonFingerprint, generateContinuationFacts } from "../scripts/lib/continuation-reasons.mjs";

// All fixtures use the real catalog and synthetic full-169 source ranges. Never
// load the several-hundred-thousand-row saved continuation JSON in unit tests.
function fixture(level = 3) {
  const node = continuationSpots.find(node => node.bet_level === level &&
    Object.values(node.source_factors).flat().every(factor => factor.dataset !== "continuation-responses"));
  const datasets = {};
  for (const factor of Object.values(node.source_factors).flat()) {
    const dataset = datasets[factor.dataset] ??= { spots: [] };
    let spot = dataset.spots.find(spot => spot.id === factor.spot_id);
    if (!spot) dataset.spots.push(spot = { id: factor.spot_id, hands: hands.map(hand => ({ hand })) });
    for (const row of spot.hands) row[factor.action] = 100;
  }
  const data = { metadata: { families: [node.family], strategy_type: "ai_estimate_not_gto" }, spots: [{ ...structuredClone(node), unreachable: false,
    hands: hands.map(hand => ({ hand, fold: 100, call: 0, four_bet: 0, all_in: 0, raise_to_size_bb: null })) }] };
  const result = { node, datasets, data, equities: { spots: {} } };
  const aggressive = level === 3 ? "four_bet" : "all_in";
  const mix = (hand, call, raise) => Object.assign(row(result, hand), {
    fold: 100 - call - raise, call, ...(level < 5 ? { [aggressive]: raise } : {}),
    raise_to_size_bb: raise ? node.action_sizes_bb[aggressive] : null,
  });
  mix("AA", level < 5 ? 25 : 100, level < 5 ? 75 : 0);
  mix("KK", level < 5 ? 40 : 50, level < 5 ? 60 : 0);
  mix("AKs", level < 5 ? 100 : 20, 0);
  if (level < 5) mix("A5s", 0, 10);
  refresh(result);
  return result;
}
const row = (fixture, hand) => fixture.data.spots[0].hands.find(row => row.hand === hand);
const source = (fixture, factor) => fixture.datasets[factor.dataset].spots.find(spot => spot.id === factor.spot_id);
function refresh(fixture) {
  const spot = fixture.data.spots[0], model = createContinuationModel({ ...fixture.datasets, "continuation-responses": fixture.data });
  const context = model.context(fixture.node, spot);
  spot.unreachable = context.unreachable;
  for (const row of spot.hands) if (context.reach(row.hand) === 0) Object.assign(row, { fold: 100, call: 0, four_bet: 0, all_in: 0, raise_to_size_bb: null });
  fixture.equities.spots[spot.id] = { version: CONTINUATION_VERSION, seed: CONTINUATION_SEED,
    samples: continuationSamples(fixture.node), input: context.input,
    equities: Object.fromEntries(hands.map(hand => [hand, context.reach(hand) ? hand === "72o" ? 0.01 : 0.5 : null])) };
  if (fixture.node.bet_level === 5) applyAllIn(fixture, context);
  return context;
}
function applyAllIn(fixture, context) {
  const { maxCalls } = continuationCapacity(fixture.data.spots[0], context, fixture.equities.spots[fixture.node.id]);
  for (const row of fixture.data.spots[0].hands) { row.call = maxCalls.get(row.hand); row.fold = 100 - row.call; }
}
function output(t, fixture) {
  const directory = mkdtempSync(join(tmpdir(), "continuation-reasons-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const options = { ...fixture, outDir: join(directory, "facts"), factDir: join(directory, "facts"), reasonDir: join(directory, "reasons") };
  return { options, facts: () => JSON.parse(readFileSync(join(options.factDir, `${fixture.node.id}.json`), "utf8")),
    reasons: () => JSON.parse(readFileSync(join(options.reasonDir, `${fixture.node.id}.json`), "utf8")),
    run: () => { assert.equal(generateContinuationFacts(options), 1); assert.equal(composeContinuationReasons(options), 1); } };
}

test("full-169 reasons use final mixes, exact reach-weighted totals and actual chip geometry", t => {
  const f = fixture(), heroFactor = f.node.source_factors[f.node.hero][0];
  source(f, heroFactor).hands.find(row => row.hand === "AA")[heroFactor.action] = 50;
  const context = refresh(f), out = output(t, f);
  out.run();
  const reasons = out.reasons();
  assert.equal(reasons.type, "continuation");
  assert.deepEqual(Object.keys(reasons.hands).sort(), [...hands].sort());
  assert.equal(reasons.source_fingerprint.length, 64);
  assert.match(reasons.method, /独立AI推定/);
  assert.match(reasons.equity_note, /最終コールレンジ/);
  assert.match(reasons.equity_note, /レイズEV.*未計算/);
  assert.equal(reasons.spot_facts.cost_to_call_bb, f.node.facing_size_bb - f.node.contributions_bb[f.node.hero]);
  assert.equal(reasons.spot_facts.total_pot_after_call_bb, f.node.pot_bb + context.input.cost_to_call);
  assert.equal(reasons.spot_facts.raked_pot_after_call_bb, raked(context.input.total_pot_after_call));
  assert.equal(reasons.spot_facts.dead_money_bb, 1.5);
  const total = hands.reduce((sum, hand) => sum + continuationComboCount(hand) * context.reach(hand), 0);
  const raise = f.data.spots[0].hands.reduce((sum, row) => sum + continuationComboCount(row.hand) * context.reach(row.hand) * row.four_bet, 0) / total;
  assert.equal(reasons.spot_facts.reachable_combos, total);
  assert.ok(Math.abs(reasons.spot_facts.weighted_four_bet_pct - raise) < 1e-6);
  assert.equal(reasons.hands.AA.facts.reach_pct, 50);
  assert.equal(reasons.hands.AA.facts.four_bet_pct, 75);
  assert.equal(reasons.hands.AA.facts.call_pct, 25);
  assert.match(reasons.hands.AA.reason, /コール 25%・4bet 75%/);
  assert.match(reasons.hands.AA.reason, /総額30BBの4bet/);
  assert.match(reasons.hands.AA.reason, /コールレンジの保護/);
  assert.match(reasons.hands.A5s.reason, /少量ブラフ候補/);
  assert.match(reasons.hands["72o"].reason, /−0.05BB未満.*フォールド 100%/);
  assert.ok(reasons.fact_labels.some(label => label.key === "weighted_four_bet_pct"));
});

test("pending live opponents are current ranges, never completed calls or future pot chips", t => {
  const f = fixture(), out = output(t, f);
  out.run();
  const reason = out.reasons().hands.AA.reason, facts = out.reasons().spot_facts;
  assert.deepEqual(facts.pending_actors, ["HJ", "CO"]);
  assert.deepEqual(facts.opponents, ["HJ", "CO", "BTN"]);
  assert.equal(facts.total_pot_after_call_bb, 35.5);
  assert.match(reason, /HJ・CO・BTN全員のここまでの保存行動の積/);
  assert.match(reason, /未応答はHJ・COで、その将来の追加コール額は足していません/);
  assert.match(reason, /追加12BB.*総額14.5BB/);
  assert.doesNotMatch(reason, /全員.*コール済|コールされると.*得|コールより.*得/);
});

test("an own zero-frequency source action has null equity facts and identifies that action", t => {
  const f = fixture(5), factor = f.node.source_factors[f.node.hero][0];
  source(f, factor).hands.find(row => row.hand === "AA")[factor.action] = 0;
  refresh(f);
  const out = output(t, f); out.run();
  const item = out.reasons().hands.AA;
  assert.match(item.reason, /COの保存済み4bet（総額26BB）頻度がこのハンドで0%/);
  assert.match(item.reason, /形式上フォールド100%.*実際の推奨ではありません/);
  assert.equal(item.facts.reach_pct, 0);
  for (const key of ["equity_pct", "eqr", "realized_equity_pct", "call_ev_bb", "equity_margin_pct", "all_in_target_call_pct"]) assert.equal(item.facts[key], null, key);
  assert.equal(item.facts.fold_pct, 100);
  assert.equal(item.facts.raise_to_size_bb, null);
});

test("an entirely empty predecessor history identifies the seat and previous action", t => {
  const f = fixture(), emptySeat = f.node.live_participants.find(seat => seat !== f.node.hero);
  const factor = f.node.source_factors[emptySeat][0];
  for (const row of source(f, factor).hands) row[factor.action] = 0;
  refresh(f);
  const out = output(t, f); out.run();
  assert.equal(out.reasons().spot_facts.unreachable, true);
  assert.equal(out.reasons().spot_facts.weighted_fold_pct, null);
  assert.match(out.reasons().hands.KK.reason, /HJの保存済みコール（総額2.5BB）の積.*全ハンドで0%.*履歴自体が空/);
  assert.ok(Object.values(out.reasons().hands).every(item => item.facts.equity_pct === null && /対象外/.test(item.reason)));
});

test("incompatible live hole-card deals are distinct from zero own action or empty ranges", t => {
  const f = fixture();
  const opponents = f.node.live_participants.filter(seat => seat !== f.node.hero);
  opponents.forEach((seat, index) => {
    const factor = f.node.source_factors[seat][0];
    for (const row of source(f, factor).hands) row[factor.action] = row.hand === (index < 2 ? "AA" : "KK") ? 100 : 0;
  });
  const context = refresh(f);
  assert.equal(context.historyPossible, true);
  assert.equal(context.reach("AA"), 0);
  assert.equal(context.reach("QQ"), 1);
  const out = output(t, f); out.run();
  assert.match(out.reasons().hands.AA.reason, /カード重複のないホールカードの組合せがない/);
  assert.equal(out.reasons().hands.AA.facts.equity_pct, null);
  assert.equal(out.reasons().hands.QQ.facts.equity_pct, 50);
});

test("all-in reasons use EQR 1, shared boundary target and final strength-ceiling mix", t => {
  const f = fixture(5), context = refresh(f), entry = f.equities.spots[f.node.id];
  entry.equities.AA = continuationBreakEven(context) / 100 - 0.03;
  entry.equities.KK = continuationBreakEven(context) / 100;
  applyAllIn(f, context);
  const out = output(t, f); out.run();
  const item = out.reasons().hands.KK;
  assert.equal(entry.samples, 20000);
  assert.equal(item.facts.eqr, 1);
  assert.equal(item.facts.all_in_target_call_pct, continuationAllInTarget(0));
  assert.match(item.reason, /共通±2pt帯・5%刻みではコール50%.*強さ順上限で10%/);
  assert.match(item.reason, /最終配分はフォールド 90%・コール 10%/);
  assert.equal(item.facts.four_bet_pct, 0);
  assert.equal(item.facts.all_in_pct, 0);
});

test("facing a 4bet uses final 100BB shove rows and preserves folded-player dead money", t => {
  const f = fixture(4), context = refresh(f), out = output(t, f); out.run();
  const reasons = out.reasons(), computed = continuationFacts(context, "AA", f.equities.spots[f.node.id]);
  assert.equal(reasons.hands.AA.facts.all_in_pct, 75);
  assert.equal(reasons.hands.AA.facts.raise_to_size_bb, 100);
  assert.match(reasons.hands.AA.reason, /総額100BBのオールイン/);
  assert.match(reasons.hands.AA.reason, /Hero以外にこの賭け額への未応答者はいません/);
  assert.equal(reasons.spot_facts.dead_money_bb, 3);
  assert.deepEqual(reasons.spot_facts.dead_opponents, ["UTG"]);
  assert.match(reasons.hands.AA.reason, /途中フォールドしたUTGの保存レンジはカードの使用可能性だけに反映/);
  assert.ok(Math.abs(reasons.hands.AA.facts.call_ev_bb - computed.call_ev_bb) < 1e-6);
});

test("fingerprint is canonical and changes with final data, equity and authoritative ancestors", () => {
  const f = fixture(), original = continuationReasonFingerprint(f);
  const reordered = { ...f, datasets: Object.fromEntries(Object.entries(f.datasets).reverse()) };
  assert.equal(continuationReasonFingerprint(reordered), original);
  for (const mutate of [
    copy => { row(copy, "AA").call += 5; row(copy, "AA").four_bet -= 5; },
    copy => { copy.equities.spots[copy.node.id].equities.AA = 0.51; },
    copy => { const factor = copy.node.source_factors[copy.node.hero][0]; source(copy, factor).hands[0][factor.action] = 95; },
    copy => { copy.data.metadata.authoring_revision = 2; },
  ]) {
    const copy = structuredClone(f); mutate(copy);
    assert.notEqual(continuationReasonFingerprint(copy), original);
  }
});

test("composition rejects stale fingerprints and tampered saved facts", t => {
  const f = fixture(), out = output(t, f);
  generateContinuationFacts(out.options);
  row(f, "AA").call += 5; row(f, "AA").four_bet -= 5;
  assert.throws(() => composeContinuationReasons(out.options), /Stale continuation facts/);
  generateContinuationFacts(out.options);
  const facts = out.facts(); facts.hands[0].call_ev_bb = 999;
  writeFileSync(join(out.options.factDir, `${f.node.id}.json`), JSON.stringify(facts));
  assert.throws(() => composeContinuationReasons(out.options), /Mismatched continuation facts/);
});

test("equity contract rejects missing, stale input, wrong sample policy and unreachable non-null values", t => {
  for (const change of [
    f => { delete f.equities.spots[f.node.id]; },
    f => { f.equities.spots[f.node.id].input.total_pot_after_call += 1; },
    f => { f.equities.spots[f.node.id].samples = 20000; },
    f => { f.equities.spots[f.node.id].equities.AA = null; },
    f => { const factor = f.node.source_factors[f.node.hero][0]; source(f, factor).hands[0][factor.action] = 0; refresh(f); f.equities.spots[f.node.id].equities[hands[0]] = 0.5; },
  ]) {
    const f = fixture(); change(f);
    assert.throws(() => generateContinuationFacts(output(t, f).options), /Stale continuation equity/);
  }
});

test("wanted filters output without weakening the full source fingerprint", t => {
  const f = fixture(), out = output(t, f);
  assert.equal(generateContinuationFacts({ ...out.options, wanted: new Set(["some-other-id"]) }), 0);
  assert.equal(generateContinuationFacts({ ...out.options, wanted: new Set([f.node.id]) }), 1);
  assert.equal(composeContinuationReasons({ ...out.options, wanted: [f.node.id] }), 1);
  assert.equal(out.reasons().source_fingerprint, continuationReasonFingerprint(f));
});

test("invalid final call policy is rejected rather than described inconsistently", t => {
  const regular = fixture();
  regular.equities.spots[regular.node.id].equities.AA = 0;
  assert.throws(() => generateContinuationFacts(output(t, regular).options), /Invalid continuation call gate/);
  const allIn = fixture(5);
  row(allIn, "AA").call -= 5; row(allIn, "AA").fold += 5;
  assert.throws(() => generateContinuationFacts(output(t, allIn).options), /Invalid continuation all-in mix/);
});
