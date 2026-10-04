import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadInputs, useArtifactSource, config, laterSizingHash } from '../scripts/postflop-ai/inputs.mjs';
import { DEFENCE_VERSION, NEW_HU_DEFENCE_VERSION, defenceVersionFor, defenceFor, comboId, rankTable, replayDecision } from '../scripts/postflop-ai/defence.mjs';
import { parseCards } from '../scripts/postflop-ai/model.mjs';
import { simulationReport, playHand } from '../scripts/postflop-ai/simulation.mjs';
import { referenceLaterMix } from '../scripts/postflop-ai/later-policy.mjs';
import { isFreshSimulationReport, buildSql } from '../scripts/postflop-ai/publish-d1.mjs';
import { flopBaseIdentity, isFreshFlopBase } from '../scripts/postflop-ai/flop-base-core.mjs';
import { HAND_EV_VERSION, loadHandEv } from '../scripts/postflop-ai/hand-ev.mjs';
import { LATER_HAND_EV_VERSION, loadLaterHandEv } from '../scripts/postflop-ai/later-hand-ev.mjs';
import { buildLaterView } from '../scripts/postflop-ai/local-view.mjs';
import { explainLaterCombo } from '../scripts/postflop-ai/explain-later.mjs';
import { computeLaterView, computeLaterExplain } from '../src/estimated/postflop-compute.ts';
import { datasetsNeededForSpot } from '../src/estimated/postflop-browser.ts';
import { actionModelIdentity, NEW_HU_ACTION_MODEL_VERSION } from '../scripts/postflop-ai/observable-actions.mjs';
import { snapshotDependencies } from '../scripts/postflop-ai/serial-validation-proof.mjs';
import { AUDIT_REPOSITORY } from '../scripts/postflop-ai/audit-identity.mjs';
import { REPRESENTATIVE, hash, foundationPair, foundationCandidateFiles, legacyPairs, riverCases, nonriverCases, legacyCase, riverRaiseCases, exactCallEvidence, probe, numericGolden } from './helpers/river-floor-regression.mjs';

const golden = JSON.parse(readFileSync(new URL('./fixtures/new-hu-river-floor-golden.json', import.meta.url)));
const evGolden = JSON.parse(readFileSync(new URL('./fixtures/new-hu-river-call-ev-golden.json', import.meta.url)));
const pair = foundationPair(), legacy = legacyPairs(), inputs = loadInputs(REPRESENTATIVE);
assert.equal(inputs.fingerprint, golden.source_hash);
assert.equal(inputs.fingerprint, evGolden.source_hash);
assert.equal(hash(inputs.seatRows), golden.seat_rows_hash);
assert.equal(hash(pair.candidate.policy), golden.flop_policy_hash);
assert.equal(hash(pair.laterCandidate.policy), golden.later_policy_hash);
const defence = defenceFor(inputs, pair.candidate.policy, pair.laterCandidate.policy);
// Test-only model6 branch; full numerical output must match the untouched historical golden.
const oldModelInputs = { ...inputs, spot: { ...inputs.spot, history: undefined } };
const supportFixture = JSON.parse(readFileSync(new URL('./fixtures/new-hu-river-support-cases.json', import.meta.url)));
assert.equal(supportFixture.source_hash, inputs.fingerprint);
function exactSupport(context, id) {
  const score = rankTable(context.board).score, a = Math.floor(id / 52), b = id % 52;
  let compatible = 0, wins = 0, ties = 0;
  for (let i = 0; i < context.bettorRange.ids.length; i++) {
    const other = context.bettorRange.ids[i], cards = [Math.floor(other / 52), other % 52];
    if (!(context.bettorRange.w[i] > 0) || cards.some(card => card === a || card === b || context.board.includes(card))) continue;
    assert.ok(score[other] >= 0 && score[id] >= 0);
    compatible++; if (score[other] < score[id]) wins++; else if (score[other] === score[id]) ties++;
  }
  return { compatible, wins, ties, zero: compatible > 0 && wins === 0 && ties === 0 };
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const lineOf = item => ({ flop: item.board.slice(0, 6), turn: item.board.slice(6, 8), river: item.board.slice(8, 10),
  flopActions: item.path.flop.join(','), turnActions: item.path.turn.join(','), riverActions: item.path.river.join(',') });

test('the scoped exception removes only strictly negative-EV floor promotion', () => {
  const board = parseCards('9h8d4c2s6h', 5), combo = parseCards('Ac9d', 2), base = { fold: 90, call: 0, raise: 10 };
  const rangeOf = entries => ({ ids: Int16Array.from(entries.map(([text]) => comboId(...parseCards(text, 2)))),
    lo: Uint8Array.from(entries.map(([text]) => Math.min(...parseCards(text, 2)))),
    hi: Uint8Array.from(entries.map(([text]) => Math.max(...parseCards(text, 2)))), w: Float64Array.from(entries.map(([, weight]) => weight)) });
  const losing = rangeOf([['8c8h', 1]]);
  const context = { street: 'river', board, bettorRange: losing, call: 10, finalPot: 40, rake: 0, required: 0.25,
    floor: { threshold: 0, fraction: 1 / 3 }, ceiling: null };
  const raw = defence.applyEquity(context, base, 0, combo, true);
  assert.deepEqual(raw, { fold: 90, call: 0, raise: 10 });
  assert.deepEqual(defence.applyEquity(context, base, 0, combo), raw);
  assert.deepEqual(defence.applyEquity(context, base, -0, combo), raw);
  assert.deepEqual(defence.applyEquity(context, base, Number.MIN_VALUE, combo), raw, 'positive float with only losing support');
  // A genuine tiny win/tie can still lose money at this price. Cached equity does not decide the sign.
  for (const text of ['7c7d', 'Ah9c']) {
    const supported = { ...context, exactRiverCallEv: undefined, bettorRange: rangeOf([['8c8h', 1], [text, Number.MIN_VALUE]]) };
    assert.deepEqual(defence.applyEquity(supported, base, 0, combo), raw, text);
    assert.deepEqual(defence.applyEquity(supported, base, Number.MIN_VALUE, combo), raw, text);
  }
  for (const entries of [[['8c8h', 3], ['7c7d', 1]], [['8c8h', 1], ['Ah9c', 1]], [['7c7d', 1]], [['Ah9c', 1]]]) {
    const nonnegative = { ...context, exactRiverCallEv: undefined, bettorRange: rangeOf(entries) };
    assert.deepEqual(defence.applyEquity(nonnegative, base, 0, combo), { fold: 60, call: 30, raise: 10 },
      'exact EV0/positive support retains floor promotion even with a cached zero');
  }
  const irrelevant = { ...context, exactRiverCallEv: undefined, bettorRange: rangeOf([['8c8h', 1], ['7c7d', 0], ['AcTd', 1], ['9hJh', 1]]) };
  assert.deepEqual(defence.applyEquity(irrelevant, base, 0, combo), raw, 'zero-weight, hero-blocked and board-blocked outcomes do not count');
  for (const entries of [[], [['7c7d', 0]], [['AcTd', 1]], [['9hJh', 1]]]) {
    assert.deepEqual(defence.applyEquity({ ...context, exactRiverCallEv: undefined, bettorRange: rangeOf(entries) }, base, 0, combo),
      { fold: 60, call: 30, raise: 10 }, 'empty compatible support does not prove zero');
  }
  for (const target of [comboId(...combo), comboId(...parseCards('8c8h', 2))]) for (const value of [-1, NaN]) {
    const scores = Float64Array.from(rankTable(board).score); scores[target] = value;
    assert.deepEqual(defence.applyEquity({ ...context, exactRiverCallEv: undefined, tables: [{ score: scores }] }, base, 0, combo),
      { fold: 60, call: 30, raise: 10 }, 'invalid own/opponent rank does not prove zero');
  }
  assert.equal(defence.negativeRiverCallEv(context, parseCards('9hAd', 2)), false, 'hero touches board');
  assert.equal(defence.negativeRiverCallEv(context, [combo[0], combo[0]]), false, 'invalid hero combo');
  assert.deepEqual(defence.applyEquity({ ...context, exactRiverCallEv: undefined, call: 0 }, base, 0, combo), { fold: 60, call: 30, raise: 10 });
  const tinyRequired = { ...context, exactRiverCallEv: undefined, required: 0.001 }, tail = defence.applyEquity(tinyRequired, base, 0, combo, true);
  assert.ok(tail.call > 0);
  assert.deepEqual(defence.applyEquity(tinyRequired, base, 0, combo), tail, 'retain raw logistic tail and legal raise');
  const ceiling = { ...tinyRequired, floor: null, ceiling: { threshold: 0.1, fraction: 0.5 } };
  assert.equal(defence.applyEquity(ceiling, base, 0, combo).call, 0, 'normal ceiling still applies');
  const noPromotion = { ...context, exactRiverCallEv: undefined, floor: { threshold: 0.1, fraction: 1 } };
  Object.defineProperty(noPromotion, 'bettorRange', { get() { throw new Error('support scanned without floor promotion'); } });
  assert.deepEqual(defence.applyEquity(noPromotion, base, 0, combo), raw);
  const roundedAway = { ...context, exactRiverCallEv: undefined, floor: { threshold: 0, fraction: 0.001 } };
  Object.defineProperty(roundedAway, 'bettorRange', { get() { throw new Error('support scanned for zero moved mass'); } });
  assert.deepEqual(defence.applyEquity(roundedAway, base, 0, combo), raw);
  for (const street of ['flop', 'turn']) {
    const nonriver = { ...context, exactRiverCallEv: undefined, street, role: 'ip', board: [], tiers: new Uint8Array(52 * 52), realizationFactors: [1] };
    assert.deepEqual(defence.applyEquity(nonriver, base, 0, combo), { fold: 60, call: 30, raise: 10 });
  }
});

test('historical pre-alias model6 river classifications stay unchanged', () => {
  for (const item of riverCases) {
    const baseline = probe(oldModelInputs, pair, item);
    assert.deepEqual(numericGolden(baseline), golden.river[item.id], `${item.id}: untouched historical model6`);
    baseline.defence.releaseBoardCaches();
  }
  // The independently reviewed version9 numeric fixture remains immutable
  // historical evidence. Version10 changes conditioning, so do not relabel it.
  assert.equal(evGolden.comparison_sha256, '2d5bac7d3d84e5970eb25c7ed9d8e62ec193e8d484c2bf0f620563685796e086');
});

test('pooled v3 contexts lose only exact-negative-EV floor promotion against an alias-aware control', () => {
  let legalNegativeRaise = false, changedPositiveEquity = false, changed = 0;
  for (const item of riverCases) {
    const p = probe(inputs, pair, item), baseline = probe(inputs, pair, item, { disableNegativeRiverFloor: true });
    const before = numericGolden(baseline), after = numericGolden(p);
    assert.ok(p.context && p.rows.length > 0, item.id);
    assert.equal(after.raw_rows_hash, before.raw_rows_hash, `${item.id}: identical raw/capped bases, equities, weights and pre-floor mixes`);
    assert.equal(after.raises_hash, before.raises_hash, `${item.id}: authored/capped raises`);
    assert.deepEqual(after.floor, before.floor, `${item.id}: original allocation must not redistribute`);
    assert.deepEqual(p.context.ceiling, baseline.context.ceiling);
    assert.equal(after.value_weight, before.value_weight); assert.equal(after.bluff_weight, before.bluff_weight);
    let removed = 0, negativeCalled = 0, rawNegativeCalled = 0;
    for (let i = 0; i < p.rows.length; i++) {
      const row = p.rows[i], old = baseline.rows[i], support = exactCallEvidence(p.context, row.id);
      assert.equal(old.id, row.id);
      if (support.status === 'known' && support.sign < 0 && old.mix.call > old.raw.call) {
        assert.deepEqual(row.mix, row.raw, `${item.id}/${row.id}: preserve pre-floor split`);
        removed += row.weight * (old.mix.call - row.mix.call) / 100;
        changed++;
        if (row.equity > 0) changedPositiveEquity = true;
      } else assert.deepEqual(row.mix, old.mix, `${item.id}/${row.id}: nonnegative/unknown/no-promotion behavior`);
      if (support.sign < 0 && row.mix.raise > 0) legalNegativeRaise = true;
      if (support.sign < 0) {
        negativeCalled += row.weight * row.mix.call / 100;
        rawNegativeCalled += row.weight * row.raw.call / 100;
      }
    }
    close(after.defence_frequency, before.defence_frequency - removed / after.defender_total);
    // The floor never adds negative-EV calls; an independent existing ceiling
    // may reduce the raw logistic share, which this change must also preserve.
    assert.ok(negativeCalled <= rawNegativeCalled + 1e-12);
    assert.ok(p.rows.some(row => row.id === comboId(...parseCards(item.selected, 2))), item.id);
    p.defence.releaseBoardCaches(); baseline.defence.releaseBoardCaches();
  }
  assert.ok(legalNegativeRaise, 'retain an actual legal negative-call-EV bluff raise');
  assert.ok(changed > 0 && changedPositiveEquity, 'genuinely positive-equity negative-EV floor promotion is removed');
});

test('fixed v3 actual TT support with diagnosis-derived cached residue injected into the floor guard', () => {
  const item = riverCases.find(item => item.id === 'flush-checked'), p = probe(inputs, pair, item);
  for (const text of supportFixture.residual_combos) {
    const combo = parseCards(text, 2), id = comboId(...combo), support = exactSupport(p.context, id);
    assert.ok(support.compatible > 0); assert.equal(support.wins, 0); assert.equal(support.ties, 0);
    const base = p.defence.baseMix(p.table, p.board, p.entry.node, combo), capped = p.context.cap ? p.context.cap.applyCombo(base, combo) : base;
    // The literal residue was measured on the uninstalled v4 draft. Real v3 support
    // is independently derived here; the full live-v4 reproduction remains local.
    const raw = p.defence.applyEquity(p.context, capped, supportFixture.recorded_v4_cached_equity, combo, true);
    assert.deepEqual(p.defence.applyEquity(p.context, capped, supportFixture.recorded_v4_cached_equity, combo), raw, text);
    assert.equal(raw.call, 0);
  }
  p.defence.releaseBoardCaches();
});

test('flop/turn ignore the river exemption while historical nonriver goldens remain intact', () => {
  for (const item of nonriverCases) {
    const p = probe(inputs, pair, item), control = probe(inputs, pair, item, { disableNegativeRiverFloor: true });
    assert.deepEqual(numericGolden(p), numericGolden(control), item.id);
    const historical = probe(oldModelInputs, pair, item);
    assert.deepEqual(numericGolden(historical), golden.nonriver[item.id], item.id);
    for (const result of [p, control, historical]) result.defence.releaseBoardCaches();
  }
});

test('all45 archived legacy policies retain actual mixes, input fingerprints and base identities', () => {
  assert.equal(Object.keys(legacy).length, 45);
  assert.equal(Object.keys(golden.legacy).length, 45);
  for (const [id, pair] of Object.entries(legacy)) {
    const input = loadInputs(id), before = golden.legacy[id];
    assert.equal(input.spot.history, undefined, id);
    assert.equal(input.fingerprint, before.source_hash, id);
    assert.equal(hash(input.seatRows), before.seat_rows_hash, id);
    assert.equal(hash(pair.candidate.policy), before.flop_policy_hash, id);
    assert.equal(hash(pair.laterCandidate.policy), before.later_policy_hash, id);
    assert.equal(pair.candidate.metadata.source_hash, input.fingerprint);
    assert.equal(pair.laterCandidate.metadata.source_hash, input.fingerprint);
    assert.equal(defenceVersionFor(input), 6);
    assert.deepEqual(flopBaseIdentity(input, pair.candidate, pair.laterCandidate), before.flop_base_identity, id);
    const p = probe(input, pair, legacyCase(input));
    const { source_hash, seat_rows_hash, flop_policy_hash, later_policy_hash, flop_base_identity, ...numeric } = before;
    assert.deepEqual(numericGolden(p), numeric, id);
    const context = { street: 'river', call: 10, required: 0.25, floor: { threshold: 0, fraction: 1 / 3 }, ceiling: null };
    assert.deepEqual(p.defence.applyEquity(context, { fold: 90, call: 0, raise: 10 }, 0, parseCards('AdTd', 2)),
      { fold: 60, call: 30, raise: 10 }, `${id}: legacy zero-equity floor stays active`);
    assert.equal(simulationReport(input, pair.candidate.policy, 1, pair.laterCandidate, []).defence_version, 6);
    p.defence.releaseBoardCaches();
  }
});

test('live local/browser first-bet and raise-response views/facts/explanations agree with corrected mixes', () => {
  const datasets = Object.fromEntries(datasetsNeededForSpot(inputs.spot).map(name => [name,
    JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)))]));
  for (const item of [...riverCases, ...riverRaiseCases]) {
    const p = probe(inputs, pair, item), line = lineOf(item);
    assert.ok(p.context && p.rows.length, item.id);
    const cards = item.selected ?? [Math.floor(p.rows[0].id / 52), p.rows[0].id % 52]
      .map(card => '23456789TJQKA'[card >> 2] + 'cdhs'[card & 3]).join('');
    const local = buildLaterView(line, inputs, pair.candidate, pair.laterCandidate);
    const browser = computeLaterView({ ...line, spotId: REPRESENTATIVE, datasets,
      flopCandidate: pair.candidate, laterCandidate: pair.laterCandidate });
    assert.deepEqual(browser, local, item.id);
    const actual = new Map(p.rows.map(row => {
      const combo = [Math.floor(row.id / 52), row.id % 52];
      return [row.id, p.defence.observableMix(p.table, p.board, p.entry.node, combo,
        p.defence.baseMix(p.table, p.board, p.entry.node, combo))];
    }));
    for (const row of local.rows) for (const combo of row.combos) {
      const mix = actual.get(comboId(...parseCards(combo.cards, 2)));
      assert.ok(mix, `${item.id}/${combo.cards}`);
      for (const action of Object.keys(combo.mix)) close(combo.mix[action], mix[action] / 100);
    }
    const explanation = explainLaterCombo({ ...line, cards, inputs,
      flopPolicy: pair.candidate.policy, laterPolicy: pair.laterCandidate.policy });
    const browserExplanation = computeLaterExplain({ ...line, cards, spotId: REPRESENTATIVE, datasets,
      flopCandidate: pair.candidate, laterCandidate: pair.laterCandidate });
    assert.deepEqual(browserExplanation, { spot: REPRESENTATIVE, ...explanation }, item.id);
    assert.deepEqual(explanation.defence.mix, actual.get(comboId(...parseCards(cards, 2))), item.id);
    const facts = p.defence.facts(p.table, p.board, p.entry.node, parseCards(cards, 2),
      p.defence.baseMix(p.table, p.board, p.entry.node, parseCards(cards, 2)));
    assert.deepEqual(facts.mix, explanation.defence.mix);
    assert.equal(facts.defence_frequency, explanation.defence.defence_frequency);
    p.defence.releaseBoardCaches();
  }
});

test('actual river raise responses preserve raw/capped/raise/floor contracts and exact nonnegative mixes', () => {
  let changed = 0, negative = 0, nonnegative = 0;
  for (const item of riverRaiseCases) {
    const p = probe(inputs, pair, item), baseline = probe(inputs, pair, item, { disableNegativeRiverFloor: true });
    assert.ok(p.entry.node.includes('_vs_raise'), item.id);
    assert.ok(p.context && p.rows.length, item.id);
    assert.equal(hash(p.rows.map(({ mix, ...row }) => row)), hash(baseline.rows.map(({ mix, ...row }) => row)), item.id);
    assert.deepEqual(p.context.floor, baseline.context.floor);
    assert.deepEqual(p.context.ceiling, baseline.context.ceiling);
    for (let i = 0; i < p.rows.length; i++) {
      const row = p.rows[i], before = baseline.rows[i], ev = exactCallEvidence(p.context, row.id);
      assert.equal(row.id, before.id); assert.equal(row.mix.raise, before.mix.raise);
      if (ev.status === 'known' && ev.sign < 0) {
        negative++;
        if (before.mix.call > before.raw.call) { changed++; assert.deepEqual(row.mix, row.raw); }
        else assert.deepEqual(row.mix, before.mix);
      } else { nonnegative++; assert.deepEqual(row.mix, before.mix); }
    }
    if (p.context.exactRiverCallEv) assert.ok(p.context.exactRiverCallEv.signs.size <= 1326);
    p.defence.releaseBoardCaches(); baseline.defence.releaseBoardCaches();
    assert.equal(p.defence.contexts.river.size, 0, 'exact context caches released with board caches');
  }
  assert.ok(negative > 0 && nonnegative > 0, 'real raise support covers both call-EV signs');
  assert.ok(changed > 0, 'an actual raise-response floor promotion is removed');
});

test('the simulation decision boundary consumes the same guarded river mix on one fixed deal', () => {
  const item = riverCases.find(item => item.id === 'paired-oop-value-only');
  const p = probe(inputs, pair, item), hands = { HJ: parseCards('Ad9d', 2), BB: parseCards('AcAh', 2) };
  const opponent = referenceLaterMix('river_oop_first', hands.BB, p.board, 'checked', 'standard');
  const bet75 = (opponent.check + opponent.bet33 + opponent.bet75 / 2) / 100;
  assert.ok(opponent.bet75 > 0);
  const observed = [];
  playHand({ hands, flop: p.board.slice(0, 3), runout: p.board.slice(3), hero: 'HJ', spot: inputs.spot,
    policy: pair.candidate.policy, laterPolicy: pair.laterCandidate.policy, profile: 'standard',
    randoms: [0, 0, 0, 0, bet75, 0.99, ...Array(18).fill(0)],
    defence: { baseMix: (...args) => p.defence.baseMix(...args), mix: (table, board, node, combo, base) => {
      const mix = p.defence.mix(table, board, node, combo, base);
      if (node === 'river_ip_vs_75') observed.push(mix);
      return mix;
    } } });
  assert.deepEqual(observed, [{ fold: 100, call: 0, raise: 0 }]);
  p.defence.releaseBoardCaches();
});

test('a fixed-deal simulation reaches an actual river raise response and consumes its exact mix', () => {
  const item = riverRaiseCases.find(item => item.id === 'raise-oop-7c5d5hTs6h'), p = probe(inputs, pair, item);
  const opponentCards = parseCards('7d7h', 2);
  const selected = p.rows.find(row => ![Math.floor(row.id / 52), row.id % 52].some(card => opponentCards.includes(card)));
  assert.ok(selected);
  const hands = { BB: [Math.floor(selected.id / 52), selected.id % 52], HJ: opponentCards };
  const first = replayDecision(inputs, p.board, { ...item.path, river: [] }), node = first.log.at(-1).node;
  const base = p.defence.baseMix(first, p.board, node, hands.BB), mix = p.defence.mix(first, p.board, node, hands.BB, base);
  assert.ok(mix.bet33 > 0, 'actual reached bettor has positive saved/capped bet33 support');
  const opponent = referenceLaterMix('river_ip_vs_33', hands.HJ, p.board, 'checked', 'standard');
  assert.ok(opponent.raise > 0);
  const observed = [];
  playHand({ hands, flop: p.board.slice(0, 3), runout: p.board.slice(3), hero: 'BB', spot: inputs.spot,
    policy: pair.candidate.policy, laterPolicy: pair.laterCandidate.policy, profile: 'standard',
    randoms: [0, 0, 0, 0, (mix.check + mix.bet33 / 2) / 100,
      (opponent.fold + opponent.call + opponent.raise / 2) / 100, 0.99, ...Array(18).fill(0)],
    defence: { baseMix: (...args) => p.defence.baseMix(...args), mix: (table, board, pending, combo, raw) => {
      const result = p.defence.mix(table, board, pending, combo, raw);
      if (pending === 'river_oop_vs_raise') observed.push(result);
      return result;
    } } });
  assert.deepEqual(observed, [selected.mix]);
  p.defence.releaseBoardCaches();
});

test('new-HU reports and flop bases require version10 and its observable-action identity while historical v3 stays stale', () => {
  assert.equal(DEFENCE_VERSION, 6);
  assert.equal(NEW_HU_DEFENCE_VERSION, 10);
  assert.equal(defenceVersionFor(inputs), 10);
  assert.equal(pair.report.defence_version, 6);
  assert.equal(isFreshSimulationReport(inputs, pair.candidate, pair.laterCandidate, pair.report), false);
  const metric = { mean: 0, ci95: [0, 0] };
  // Structurally complete test-only numbers. Never persisted or claimed as a replay.
  const rows = pair.report.results.map(row => ({ ...row, candidate_ev_bb: metric, baseline_ev_bb: metric, delta_bb: metric }));
  const report = simulationReport(inputs, pair.candidate.policy, config.samples_per_board_profile_seat, pair.laterCandidate, rows);
  assert.equal(report.defence_version, 10);
  assert.equal(report.action_model_version, NEW_HU_ACTION_MODEL_VERSION);
  const raw = simulationReport(inputs, pair.candidate.policy, config.samples_per_board_profile_seat, pair.laterCandidate, rows, { computedDefence: false });
  assert.equal(raw.defence_version, undefined);
  assert.equal(raw.action_model_version, NEW_HU_ACTION_MODEL_VERSION, 'raw reports also carry the scoped action model');
  for (const version of [undefined, 8, 9]) assert.equal(isFreshSimulationReport(inputs, pair.candidate, pair.laterCandidate, { ...report, action_model_version: version }), false);
  assert.equal(isFreshSimulationReport(inputs, pair.candidate, pair.laterCandidate, report), true);
  for (const version of [6, 7, 8, 9]) assert.equal(isFreshSimulationReport(inputs, pair.candidate, pair.laterCandidate, { ...report, defence_version: version }), false);
  const metadata = flopBaseIdentity(inputs, pair.candidate, pair.laterCandidate);
  assert.equal(metadata.defence_version, 10);
  assert.equal(metadata.action_model_version, NEW_HU_ACTION_MODEL_VERSION);
  const base = { kind: 'ai_estimate_not_gto', mode: 'balanced', spot: REPRESENTATIVE, histories: {}, metadata };
  assert.equal(isFreshFlopBase(base, inputs, pair.candidate, pair.laterCandidate), true);
  for (const version of [6, 7, 8, 9]) assert.equal(isFreshFlopBase({ ...base, metadata: { ...metadata, defence_version: version } }, inputs, pair.candidate, pair.laterCandidate), false);
});

test('offline flop/later hand-EV freshness binds the new model without changing legacy identity', () => {
  for (const input of [inputs, loadInputs('BTN_open_BB_call')]) {
    const selected = input.spot.history ? pair : legacy[input.spot.id];
    const common = { kind: 'ai_estimate_not_gto', source_hash: input.fingerprint,
      policy_hash: selected.candidate.metadata.policy_hash, later_policy_hash: hash(selected.laterCandidate.policy), method: 'exact_expectation', seed: config.seed, ...actionModelIdentity(input.spot) };
    let handEv = { ...common, version: HAND_EV_VERSION, defence_version: defenceVersionFor(input), later_sizing_hash: laterSizingHash() };
    let laterHandEv = { ...common, version: LATER_HAND_EV_VERSION,
      ...(input.spot.history ? { defence_version: defenceVersionFor(input) } : {}) };
    const previous = useArtifactSource({ artifact: (_spot, kind) => ({ handEv, laterHandEv })[kind] });
    try {
      assert.equal(loadHandEv(input, selected.candidate, selected.laterCandidate), handEv);
      assert.equal(loadLaterHandEv(input, selected.candidate, selected.laterCandidate), laterHandEv);
      if (input.spot.history) {
        for (const version of [6, 7, 8, 9]) {
          handEv = { ...handEv, defence_version: version };
          laterHandEv = { ...laterHandEv, defence_version: version };
          assert.equal(loadHandEv(input, selected.candidate, selected.laterCandidate), null);
          assert.equal(loadLaterHandEv(input, selected.candidate, selected.laterCandidate), null);
        }
        delete laterHandEv.defence_version;
        assert.equal(loadLaterHandEv(input, selected.candidate, selected.laterCandidate), null);
      } else {
        assert.equal(handEv.defence_version, 6);
        assert.equal(laterHandEv.defence_version, undefined, 'legacy later-EV identity stays unchanged');
      }
    } finally { useArtifactSource(previous); }
  }
});

test('serial numerical pins carry version10 using only isolated exact LFS pair bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'hu-serial-pin-')), dependencies = snapshotDependencies();
  const records = new Map([...dependencies.sources, ...dependencies.inputs, ...dependencies.handoff_files]
    .map(record => [record.path, record]));
  const candidates = foundationCandidateFiles();
  assert.equal(candidates.length, 2);
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  try {
    for (const record of records.values()) {
      const bytes = readFileSync(join(AUDIT_REPOSITORY, record.path));
      assert.equal(bytes.length, record.bytes); assert.equal(digest(bytes), record.sha256);
      const target = join(root, record.path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
    }
    for (const candidate of candidates) {
      assert.equal(candidate.body.length, candidate.bytes); assert.equal(digest(candidate.body), candidate.sha256);
      const target = join(root, candidate.path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, candidate.body);
    }
    const script = join(root, 'apps/frontend/scripts/postflop-ai/serial-validation-proof.mjs');
    const result = spawnSync(process.execPath, ['--max-old-space-size=512', script, 'snapshot'], {
      cwd: join(root, 'apps/frontend'), encoding: 'utf8', input: JSON.stringify({ ids: [REPRESENTATIVE] }), maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr);
    const pin = JSON.parse(result.stdout.trim().replace(/^SERIAL_RESULT /, ''));
    assert.equal(pin.defence_version, 10); assert.equal(pin.spots[0].defence_version, 10);
    for (const key of ['sources', 'inputs', 'handoff_files', 'audit_identity']) assert.deepEqual(pin[key], dependencies[key]);
    for (const candidate of candidates) assert.equal(pin.spots[0].artifacts[candidate.kind].sha256, candidate.sha256);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the pure SQL serializer makes no independent-review acceptance claim', () => {
  const sql = buildSql([{ spot: inputs.spot, ...pair }], '2026-10-04T00:00:00Z', 'test-only');
  assert.ok(sql.startsWith('-- spot-scoped postflop upsert;'));
  assert.ok(!sql.includes('Reviewed spot-scoped'));
});
