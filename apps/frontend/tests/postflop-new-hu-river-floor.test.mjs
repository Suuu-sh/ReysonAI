import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadInputs, useArtifactSource, config, laterSizingHash } from '../scripts/postflop-ai/inputs.mjs';
import { DEFENCE_VERSION, NEW_HU_DEFENCE_VERSION, defenceVersionFor, defenceFor, comboId, rankTable } from '../scripts/postflop-ai/defence.mjs';
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
import { REPRESENTATIVE, hash, foundationPair, legacyPairs, riverCases, nonriverCases, legacyCase, probe, numericGolden } from './helpers/river-floor-regression.mjs';

const golden = JSON.parse(readFileSync(new URL('./fixtures/new-hu-river-floor-golden.json', import.meta.url)));
const pair = foundationPair(), legacy = legacyPairs(), inputs = loadInputs(REPRESENTATIVE);
assert.equal(inputs.fingerprint, golden.source_hash);
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

test('the scoped exception proves mathematical zero from actual compatible support', () => {
  const board = parseCards('9h8d4c2s6h', 5), combo = parseCards('Ac9d', 2), base = { fold: 90, call: 0, raise: 10 };
  const rangeOf = entries => ({ ids: Int16Array.from(entries.map(([text]) => comboId(...parseCards(text, 2)))),
    lo: Uint8Array.from(entries.map(([text]) => Math.min(...parseCards(text, 2)))),
    hi: Uint8Array.from(entries.map(([text]) => Math.max(...parseCards(text, 2)))), w: Float64Array.from(entries.map(([, weight]) => weight)) });
  const losing = rangeOf([['8c8h', 1]]);
  const context = { street: 'river', board, bettorRange: losing, call: 10, required: 0.25,
    floor: { threshold: 0, fraction: 1 / 3 }, ceiling: null };
  const raw = defence.applyEquity(context, base, 0, combo, true);
  assert.deepEqual(raw, { fold: 90, call: 0, raise: 10 });
  assert.deepEqual(defence.applyEquity(context, base, 0, combo), raw);
  assert.deepEqual(defence.applyEquity(context, base, -0, combo), raw);
  assert.deepEqual(defence.applyEquity(context, base, Number.MIN_VALUE, combo), raw, 'positive float with only losing support');
  // No float==0 OR clause: one win or tie protects promotion, including underflow-sized positive weight.
  for (const text of ['7c7d', 'Ah9c']) {
    const supported = { ...context, bettorRange: rangeOf([['8c8h', 1], [text, Number.MIN_VALUE]]) };
    assert.deepEqual(defence.applyEquity(supported, base, 0, combo), { fold: 60, call: 30, raise: 10 }, text);
    assert.deepEqual(defence.applyEquity(supported, base, Number.MIN_VALUE, combo), { fold: 60, call: 30, raise: 10 }, text);
  }
  const irrelevant = { ...context, bettorRange: rangeOf([['8c8h', 1], ['7c7d', 0], ['AcTd', 1], ['9hJh', 1]]) };
  assert.deepEqual(defence.applyEquity(irrelevant, base, 0, combo), raw, 'zero-weight, hero-blocked and board-blocked outcomes do not count');
  for (const entries of [[], [['7c7d', 0]], [['AcTd', 1]], [['9hJh', 1]]]) {
    assert.deepEqual(defence.applyEquity({ ...context, bettorRange: rangeOf(entries) }, base, 0, combo),
      { fold: 60, call: 30, raise: 10 }, 'empty compatible support does not prove zero');
  }
  for (const target of [comboId(...combo), comboId(...parseCards('8c8h', 2))]) for (const value of [-1, NaN]) {
    const scores = Float64Array.from(rankTable(board).score); scores[target] = value;
    assert.deepEqual(defence.applyEquity({ ...context, tables: [{ score: scores }] }, base, 0, combo),
      { fold: 60, call: 30, raise: 10 }, 'invalid own/opponent rank does not prove zero');
  }
  assert.equal(defence.onlyLosingRiverSupport(context, parseCards('9hAd', 2)), false, 'hero touches board');
  assert.equal(defence.onlyLosingRiverSupport(context, [combo[0], combo[0]]), false, 'invalid hero combo');
  assert.deepEqual(defence.applyEquity({ ...context, call: 0 }, base, 0, combo), { fold: 60, call: 30, raise: 10 });
  const tinyRequired = { ...context, required: 0.001 }, tail = defence.applyEquity(tinyRequired, base, 0, combo, true);
  assert.ok(tail.call > 0);
  assert.deepEqual(defence.applyEquity(tinyRequired, base, 0, combo), tail, 'retain raw logistic tail and legal raise');
  const ceiling = { ...tinyRequired, floor: null, ceiling: { threshold: 0.1, fraction: 0.5 } };
  assert.equal(defence.applyEquity(ceiling, base, 0, combo).call, 0, 'normal ceiling still applies');
  const noPromotion = { ...context, floor: { threshold: 0.1, fraction: 1 } };
  Object.defineProperty(noPromotion, 'bettorRange', { get() { throw new Error('support scanned without floor promotion'); } });
  assert.deepEqual(defence.applyEquity(noPromotion, base, 0, combo), raw);
  const roundedAway = { ...context, floor: { threshold: 0, fraction: 0.001 } };
  Object.defineProperty(roundedAway, 'bettorRange', { get() { throw new Error('support scanned for zero moved mass'); } });
  assert.deepEqual(defence.applyEquity(roundedAway, base, 0, combo), raw);
  for (const street of ['flop', 'turn']) {
    const nonriver = { ...context, street, role: 'ip', board: [], tiers: new Uint8Array(52 * 52), realizationFactors: [1] };
    assert.deepEqual(defence.applyEquity(nonriver, base, 0, combo), { fold: 60, call: 30, raise: 10 });
  }
});

test('the independently diagnosed v3 contexts lose only mathematically-zero floor promotion', () => {
  let legalZeroRaise = false;
  for (const item of riverCases) {
    const p = probe(inputs, pair, item), baseline = probe(oldModelInputs, pair, item), before = golden.river[item.id], after = numericGolden(p);
    assert.deepEqual(numericGolden(baseline), before, `${item.id}: untouched historical float classifications`);
    assert.ok(p.context && p.rows.length > 0, item.id);
    assert.equal(after.raw_rows_hash, before.raw_rows_hash, `${item.id}: raw/capped bases, equities, weights and pre-floor mixes`);
    assert.equal(after.raises_hash, before.raises_hash, `${item.id}: authored/capped raises`);
    assert.deepEqual(after.floor, before.floor, `${item.id}: original allocation must not redistribute`);
    assert.equal(after.value_weight, before.value_weight); assert.equal(after.bluff_weight, before.bluff_weight);
    let removed = 0;
    for (let i = 0; i < p.rows.length; i++) {
      const row = p.rows[i], old = baseline.rows[i], support = exactSupport(p.context, row.id);
      assert.equal(old.id, row.id);
      if (support.zero && old.mix.call > old.raw.call) {
        assert.deepEqual(row.mix, row.raw, `${item.id}/${row.id}: preserve pre-floor split`);
        removed += row.weight * (old.mix.call - row.mix.call) / 100;
      } else assert.deepEqual(row.mix, old.mix, `${item.id}/${row.id}: genuine positive/unchanged behavior`);
      if (support.zero && row.mix.raise > 0) legalZeroRaise = true;
    }
    close(after.defence_frequency, before.defence_frequency - removed / after.defender_total);
    const selected = p.rows.find(row => row.id === comboId(...parseCards(item.selected, 2)));
    assert.ok(selected, `${item.id}: selected independently reviewed hand`);
    if (item.id === 'positive-equity-floor-control') {
      assert.equal(after.rows_hash, before.rows_hash, 'positive-equity Ts6h residual stays unchanged');
      assert.ok(Number(after.floor.threshold) > 0);
    } else {
      assert.ok(before.zero_called_mass > 0, `${item.id}: pre-change failure must be real`);
      assert.ok(exactSupport(p.context, selected.id).zero);
      assert.equal(selected.mix.call, 0);
      assert.ok(after.defence_frequency < after.mdf - 0.1, `${item.id}: honest below-target defence`);
    }
    p.defence.releaseBoardCaches(); baseline.defence.releaseBoardCaches();
  }
  assert.ok(legalZeroRaise, 'retain an actual legal zero-equity bluff raise');
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

test('actual flop and turn mixes remain bit-for-bit equal to their pre-change goldens', () => {
  for (const item of nonriverCases) {
    const p = probe(inputs, pair, item);
    assert.deepEqual(numericGolden(p), golden.nonriver[item.id], item.id);
    p.defence.releaseBoardCaches();
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

test('live local/browser views and explanations agree with corrected exact combo mixes', () => {
  const datasets = Object.fromEntries(datasetsNeededForSpot(inputs.spot).map(name => [name,
    JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)))]));
  for (const item of riverCases) {
    const p = probe(inputs, pair, item), line = lineOf(item);
    const local = buildLaterView(line, inputs, pair.candidate, pair.laterCandidate);
    const browser = computeLaterView({ ...line, spotId: REPRESENTATIVE, datasets,
      flopCandidate: pair.candidate, laterCandidate: pair.laterCandidate });
    assert.deepEqual(browser, local, item.id);
    const actual = new Map(p.rows.map(row => [row.id, row.mix]));
    for (const row of local.rows) for (const combo of row.combos) {
      const mix = actual.get(comboId(...parseCards(combo.cards, 2)));
      assert.ok(mix, `${item.id}/${combo.cards}`);
      for (const action of Object.keys(combo.mix)) close(combo.mix[action], mix[action] / 100);
    }
    const explanation = explainLaterCombo({ ...line, cards: item.selected, inputs,
      flopPolicy: pair.candidate.policy, laterPolicy: pair.laterCandidate.policy });
    const browserExplanation = computeLaterExplain({ ...line, cards: item.selected, spotId: REPRESENTATIVE, datasets,
      flopCandidate: pair.candidate, laterCandidate: pair.laterCandidate });
    assert.deepEqual(browserExplanation, { spot: REPRESENTATIVE, ...explanation }, item.id);
    assert.deepEqual(explanation.defence.mix, actual.get(comboId(...parseCards(item.selected, 2))), item.id);
    const facts = p.defence.facts(p.table, p.board, p.entry.node, parseCards(item.selected, 2),
      p.defence.baseMix(p.table, p.board, p.entry.node, parseCards(item.selected, 2)));
    assert.deepEqual(facts.mix, explanation.defence.mix);
    assert.equal(facts.defence_frequency, explanation.defence.defence_frequency);
    p.defence.releaseBoardCaches();
  }
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

test('new-HU reports and flop bases require version8 while historical v3 stays stale', () => {
  assert.equal(DEFENCE_VERSION, 6);
  assert.equal(NEW_HU_DEFENCE_VERSION, 8);
  assert.equal(defenceVersionFor(inputs), 8);
  assert.equal(pair.report.defence_version, 6);
  assert.equal(isFreshSimulationReport(inputs, pair.candidate, pair.laterCandidate, pair.report), false);
  const metric = { mean: 0, ci95: [0, 0] };
  // Structurally complete test-only numbers. Never persisted or claimed as a replay.
  const rows = pair.report.results.map(row => ({ ...row, candidate_ev_bb: metric, baseline_ev_bb: metric, delta_bb: metric }));
  const report = simulationReport(inputs, pair.candidate.policy, config.samples_per_board_profile_seat, pair.laterCandidate, rows);
  assert.equal(report.defence_version, 8);
  assert.equal(isFreshSimulationReport(inputs, pair.candidate, pair.laterCandidate, report), true);
  for (const version of [6, 7]) assert.equal(isFreshSimulationReport(inputs, pair.candidate, pair.laterCandidate, { ...report, defence_version: version }), false);
  const metadata = flopBaseIdentity(inputs, pair.candidate, pair.laterCandidate);
  assert.equal(metadata.defence_version, 8);
  const base = { kind: 'ai_estimate_not_gto', mode: 'balanced', spot: REPRESENTATIVE, histories: {}, metadata };
  assert.equal(isFreshFlopBase(base, inputs, pair.candidate, pair.laterCandidate), true);
  for (const version of [6, 7]) assert.equal(isFreshFlopBase({ ...base, metadata: { ...metadata, defence_version: version } }, inputs, pair.candidate, pair.laterCandidate), false);
});

test('offline flop/later hand-EV freshness binds the new model without changing legacy identity', () => {
  for (const input of [inputs, loadInputs('BTN_open_BB_call')]) {
    const selected = input.spot.history ? pair : legacy[input.spot.id];
    const common = { kind: 'ai_estimate_not_gto', source_hash: input.fingerprint,
      policy_hash: selected.candidate.metadata.policy_hash, later_policy_hash: hash(selected.laterCandidate.policy), method: 'exact_expectation', seed: config.seed };
    let handEv = { ...common, version: HAND_EV_VERSION, defence_version: defenceVersionFor(input), later_sizing_hash: laterSizingHash() };
    let laterHandEv = { ...common, version: LATER_HAND_EV_VERSION,
      ...(input.spot.history ? { defence_version: defenceVersionFor(input) } : {}) };
    const previous = useArtifactSource({ artifact: (_spot, kind) => ({ handEv, laterHandEv })[kind] });
    try {
      assert.equal(loadHandEv(input, selected.candidate, selected.laterCandidate), handEv);
      assert.equal(loadLaterHandEv(input, selected.candidate, selected.laterCandidate), laterHandEv);
      if (input.spot.history) {
        for (const version of [6, 7]) {
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

test('serial numerical pins explicitly carry the new model version', () => {
  const result = spawnSync(process.execPath, ['scripts/postflop-ai/serial-validation-proof.mjs', 'snapshot'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', input: JSON.stringify({ ids: [REPRESENTATIVE] }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const pin = JSON.parse(result.stdout.trim().replace(/^SERIAL_RESULT /, ''));
  assert.equal(pin.defence_version, 8);
  assert.equal(pin.spots[0].defence_version, 8);
});

test('the pure SQL serializer makes no independent-review acceptance claim', () => {
  const sql = buildSql([{ spot: inputs.spot, ...pair }], '2026-10-04T00:00:00Z', 'test-only');
  assert.ok(sql.startsWith('-- spot-scoped postflop upsert;'));
  assert.ok(!sql.includes('Reviewed spot-scoped'));
});
