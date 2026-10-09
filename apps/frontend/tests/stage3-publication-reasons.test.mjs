import assert from "node:assert/strict";
import test from "node:test";
import { hands } from "../src/data.ts";
import { stage3Spots } from "../src/estimated/stage3-tree.ts";
import { createStage3Model, STAGE3_VERSION, STAGE3_SEED, stage3Samples } from "../src/estimated/stage3-model.ts";
import { STAGE3_FACT_KEYS, expandStage3Reasons } from "../src/estimated/stage3-reason-format.ts";
import { stage3ExpectedCompactReasons, stage3ReasonFingerprint } from "../scripts/lib/stage3-reasons.mjs";
import { assertStage3ReasonPayload } from "../scripts/lib/stage3-publication.mjs";

function fixture() {
  const node = stage3Spots.find(node => node.bet_level === 3 && Object.values(node.source_factors).flat().every(factor => factor.dataset !== "stage3-responses"));
  const datasets = {};
  for (const factor of Object.values(node.source_factors).flat()) {
    const dataset = datasets[factor.dataset] ??= { spots: [] };
    let spot = dataset.spots.find(spot => spot.id === factor.spot_id);
    if (!spot) dataset.spots.push(spot = { id: factor.spot_id, hands: hands.map(hand => ({ hand })) });
    for (const row of spot.hands) row[factor.action] = 100;
  }
  const spot = { ...structuredClone(node), unreachable: false, hands: hands.map(hand => ({ hand, fold: hand === "AA" ? 75 : 100,
    call: hand === "AA" ? 25 : 0, squeeze: 0, four_bet: 0, all_in: 0, raise_to_size_bb: null })) };
  const data = { metadata: { families: [node.family] }, spots: [spot] };
  const context = createStage3Model({ ...datasets, "stage3-responses": data }).context(node, spot);
  const equities = { spots: { [spot.id]: { version: STAGE3_VERSION, seed: STAGE3_SEED, samples: stage3Samples(node),
    input: context.input, equities: Object.fromEntries(hands.map(hand => [hand, context.reach(hand) > 0 ? 0.9 : null])) } } };
  return { data, datasets, equities };
}
test("read-only canonical Stage 3 reasons bind final rows/equity/EV facts without changing saved inputs", () => {
  const source = fixture(), before = JSON.stringify(source);
  const [[id, expected]] = [...stage3ExpectedCompactReasons(source)];
  assert.equal(id, source.data.spots[0].id);
  assert.equal(expected.source_fingerprint, stage3ReasonFingerprint(source));
  assert.equal(expected.rows.length, 169);
  const row = expected.rows[hands.indexOf("AA")];
  assert.equal(row[STAGE3_FACT_KEYS.indexOf("call_pct")], 25);
  assert.equal(row[STAGE3_FACT_KEYS.indexOf("equity_pct")], 90);
  assert.doesNotThrow(() => assertStage3ReasonPayload(structuredClone(expected), expected));
  assert.doesNotThrow(() => assertStage3ReasonPayload(JSON.parse(JSON.stringify(expected)), expected));
  assert.equal(JSON.stringify(source), before);
});
test("tampered compact mixes, equity/EV/pot facts or templates fail despite an unchanged correct fingerprint", () => {
  const [[, expected]] = [...stage3ExpectedCompactReasons(fixture())];
  const changes = [
    saved => { saved.rows[hands.indexOf("AA")][STAGE3_FACT_KEYS.indexOf("call_pct")] = 50; saved.rows[hands.indexOf("AA")][STAGE3_FACT_KEYS.indexOf("fold_pct")] = 50; },
    saved => { saved.rows[hands.indexOf("AA")][STAGE3_FACT_KEYS.indexOf("equity_pct")] = 80; },
    saved => { saved.rows[hands.indexOf("AA")][STAGE3_FACT_KEYS.indexOf("call_ev_bb")] += 1; },
    saved => { saved.spot_facts.total_pot_after_call_bb += 1; },
    saved => { saved.unreachable.push("Invented explanation"); },
    saved => { saved.extra_unreviewed_fact = "unsupported"; },
  ];
  for (const change of changes) {
    const saved = structuredClone(expected); change(saved);
    assert.equal(saved.source_fingerprint, expected.source_fingerprint);
    assert.doesNotThrow(() => expandStage3Reasons(saved)); // old gate accepted these
    assert.throws(() => assertStage3ReasonPayload(saved, expected), /facts or templates differ/);
  }
});
