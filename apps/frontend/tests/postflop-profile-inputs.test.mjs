import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildInputs, sha } from "../scripts/postflop-ai/browser-inputs.ts";
import { finalizeInputs, inputStructureHash } from "../scripts/postflop-ai/input-options.ts";
import { loadInputs, useArtifactSource } from "../scripts/postflop-ai/inputs.mjs";
import { loadMw3Catalog, loadMw3Inputs } from "../scripts/postflop-ai/mw3-inputs.mjs";
import { POSTFLOP_SPOTS } from "../scripts/postflop-ai/spots.ts";
import { adjustOpeningSpot, applyTableProfile } from "../src/estimated/table-profile.ts";
import { gameConfig } from "../src/estimated/sizing.ts";
import catalog from "../scripts/data/hu-after-multiway-spots.json" with { type: "json" };
import adjustments from "../src/estimated/table-profile-adjustments.json" with { type: "json" };

const cache = new Map();
const read = name => {
  if (!cache.has(name)) cache.set(name, JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url), "utf8")));
  return cache.get(name);
};
const names = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "limp-responses", "limp-deep-responses"];
const datasets = Object.fromEntries(names.map(name => [name, read(name)]));
datasets["hu-after-multiway-spots"] = catalog;
const profileDatasets = profile => ({ ...datasets, ...Object.fromEntries(names.map(name => {
  const path = `profiles/${profile}/villain/${name}`;
  return [path, read(path)];
})) });
const spot = (file, id) => datasets[file].spots.find(row => row.id === id);
const rows = (source, action) => source.hands.map(row => ({ hand: row.hand, freq: row[action] }));
const table = { call: "high", three_bet: "low" };
const representativeIds = ["BTN_open_BB_call", "BTN_open_BB_3bet_call", "BTN_open_BB_4bp_call", "SB_limp_BB_check", "SB_limp_BB_iso_SB_reraise_BB_4bet_call"];

test("default and explicitly default input options retain legacy saved identity and ranges", () => {
  for (const id of representativeIds) {
    const ordinary = loadInputs(id);
    assert.deepEqual(buildInputs(id, datasets), ordinary);
    assert.deepEqual(loadInputs(id, { tableProfile: { call: "normal", three_bet: "normal" }, opponentProfile: "standard", opponentSeat: "ip" }), ordinary);
    assert.equal(ordinary.adjusted, undefined);
    assert.equal(ordinary.baselineFingerprint, undefined);
  }
  const baseline = loadInputs("BTN_open_BB_call");
  assert.equal(baseline.fingerprint, "6f7770d0f4a86b73547353bff838d4dc8e83d91920671d96634224a00ee51d66");
  assert.deepEqual(baseline.seatRows.BTN, rows(spot("opening-ranges", "BTN_open"), "open"));
  assert.deepEqual(baseline.seatRows.BB, rows(spot("preflop-ranges", "BB_vs_BTN"), "call"));
});

test("table profile adjusts each saved source factor before assembling SRP reach", () => {
  const ordinary = loadInputs("BTN_open_BB_call");
  const adjusted = loadInputs(ordinary.spot.id, { tableProfile: table });
  const opening = adjustOpeningSpot(ordinary.opening, adjustments, table);
  const response = applyTableProfile({ spots: [ordinary.response] }, table).spots[0];
  assert.deepEqual(adjusted.seatRows.BTN, rows(opening, "open"));
  assert.deepEqual(adjusted.seatRows.BB, rows(response, "call"));
  assert.notDeepEqual(adjusted.seatRows.BB, ordinary.seatRows.BB);
  assert.notEqual(adjusted.fingerprint, ordinary.fingerprint);
  assert.equal(adjusted.structure_hash, ordinary.structure_hash);
  assert.equal(adjusted.baselineFingerprint, ordinary.fingerprint);
  assert.deepEqual(adjusted.adjusted, { tableProfile: table, opponentProfile: "standard" });
  assert.deepEqual(buildInputs(ordinary.spot.id, datasets, { tableProfile: table }), adjusted);
});

test("profile substitution changes only the selected opponent seat and is not multiplied by the table profile", () => {
  for (const profile of ["nit", "station", "lag", "maniac"]) for (const opponentSeat of ["ip", "oop"]) {
    const id = "BTN_open_BB_call", options = { opponentProfile: profile, opponentSeat };
    const ordinary = loadInputs(id), selected = loadInputs(id, options), ds = profileDatasets(profile);
    const villain = ordinary.spot[opponentSeat], hero = villain === ordinary.spot.ip ? ordinary.spot.oop : ordinary.spot.ip;
    assert.deepEqual(selected.seatRows[hero], ordinary.seatRows[hero]);
    assert.notDeepEqual(selected.seatRows[villain], ordinary.seatRows[villain]);
    assert.deepEqual(buildInputs(id, ds, options), selected);
    const combined = loadInputs(id, { ...options, tableProfile: table });
    assert.deepEqual(combined.seatRows[villain], selected.seatRows[villain]);
    assert.deepEqual(combined.seatRows[hero], loadInputs(id, { tableProfile: table }).seatRows[hero]);
    assert.equal(combined.structure_hash, ordinary.structure_hash);
  }
});

test("3bet, 4bet and limp-deep profiles assemble all of the selected seat's action products", () => {
  for (const id of representativeIds.slice(1)) for (const opponentSeat of ["ip", "oop"]) {
    const options = { opponentProfile: "station", opponentSeat };
    const baseline = loadInputs(id), adjusted = loadInputs(id, options);
    const other = opponentSeat === "ip" ? "oop" : "ip";
    assert.deepEqual(adjusted.seatRows[baseline.spot[other]], baseline.seatRows[baseline.spot[other]]);
    assert.equal(adjusted.structure_hash, baseline.structure_hash);
    assert.deepEqual(buildInputs(id, profileDatasets("station"), options), adjusted);
  }
  const id = "BTN_open_BB_3bet_call", options = { tableProfile: table };
  const adjusted = loadInputs(id, options), base = loadInputs(id);
  const opening = adjustOpeningSpot(base.opening, adjustments, table);
  const response = applyTableProfile({ spots: [base.response] }, table).spots[0];
  const calls = new Map(response.hands.map(row => [row.hand, row.call]));
  assert.deepEqual(adjusted.seatRows.BTN, opening.hands.map(row => ({ hand: row.hand, freq: row.open * calls.get(row.hand) / 100 })));
});

test("profile SB flats can reach otherwise-unreachable SRP without changing standard availability", () => {
  const id = "BTN_open_SB_call";
  assert.throws(() => loadInputs(id), /unreachable/);
  const options = { opponentProfile: "station", opponentSeat: "oop" };
  const adjusted = loadInputs(id, options);
  assert.ok(adjusted.seatRows.SB.some(row => row.freq > 0));
  assert.equal(adjusted.baselineFingerprint, undefined);
  assert.deepEqual(buildInputs(id, profileDatasets("station"), options), adjusted);
});

test("history HU supports table profiles and exact available opponent factors, missing profiles fail closed", () => {
  const recorded = POSTFLOP_SPOTS.find(item => "history" in item), id = recorded.id;
  for (const factors of Object.values(recorded.ranges)) for (const [name] of factors) datasets[name] = read(name);
  const adjusted = loadInputs(id, { tableProfile: table });
  assert.deepEqual(buildInputs(id, datasets, { tableProfile: table }), adjusted);
  const ds = { ...datasets };
  // Synthetic profile fixture deliberately supplies only this seat's exact source
  // factors; other seats must not require unrelated profile files.
  for (const [name] of recorded.ranges[recorded.oop]) ds[`profiles/nit/villain/${name}`] = structuredClone(datasets[name]);
  const options = { opponentProfile: "nit", opponentSeat: "oop" };
  const previous = useArtifactSource({ ranges: ds, artifact: () => null });
  try {
    assert.deepEqual(buildInputs(id, ds, options), loadInputs(id, options));
    const missing = { ...ds };
    delete missing[`profiles/nit/villain/${recorded.ranges[recorded.oop][0][0]}`];
    assert.throws(() => buildInputs(id, missing, options), /missing.*profile source/);
  } finally { useArtifactSource(previous); }
});

test("profile sources never fall back on missing, mismatched, malformed or zero-reach data", () => {
  const id = "BTN_open_BB_call", options = { opponentProfile: "nit", opponentSeat: "oop" };
  assert.throws(() => buildInputs(id, datasets, options), /missing.*profile source/);
  const ds = structuredClone(profileDatasets("nit")), key = "profiles/nit/villain/preflop-ranges";
  const response = ds[key].spots.find(row => row.id === "BB_vs_BTN");
  response.open_size_bb += 1;
  assert.throws(() => buildInputs(id, ds, options), /geometry changed/);
  response.open_size_bb -= 1;
  response.hands[0].call = NaN;
  assert.throws(() => buildInputs(id, ds, options), /invalid saved action/);
  for (const row of response.hands) row.call = 0;
  assert.throws(() => buildInputs(id, ds, options), /unreachable after range adjustment/);
  assert.throws(() => loadInputs(id, { opponentProfile: "nit" }), /requires opponentSeat/);
  assert.throws(() => loadInputs(id, { opponentProfile: "unknown", opponentSeat: "oop" }), /Unknown opponent profile/);
});

test("structure identity excludes ranges/reach, but includes actual geometry and game/flop settings", () => {
  const base = loadInputs("BTN_open_BB_call"), config = { bet: [0.33, 0.75, 1.25] };
  const hash = inputStructureHash(base, gameConfig, config, sha);
  assert.equal(inputStructureHash({ spot: { ...base.spot, reachable: false, reach: { probability: 0 }, ranges: {} } }, gameConfig, config, sha), hash);
  for (const field of ["potBb", "stackBb", "openBb"]) assert.notEqual(inputStructureHash({ spot: { ...base.spot, [field]: base.spot[field] + 1 } }, gameConfig, config, sha), hash);
  assert.notEqual(inputStructureHash({ spot: { ...base.spot, tree: "oop_leads" } }, gameConfig, config, sha), hash);
  assert.notEqual(inputStructureHash(base, { ...gameConfig, ante_bb: 1 }, config, sha), hash);
  assert.notEqual(inputStructureHash(base, gameConfig, { bet: [0.5] }, sha), hash);
});


test("three-player standard inputs retain every seat; HU adjustments reject MW3 explicitly", () => {
  const spot = loadMw3Catalog().find(item => item.reachable);
  assert.ok(spot);
  const base = loadMw3Inputs(spot.id);
  const structure = sha({ spot: base.spot });
  const standard = finalizeInputs(base, {}, () => assert.fail("unadjusted inputs must not reload sources"), sha, structure);
  assert.deepEqual(standard.seatRows, base.seatRows);
  assert.equal(Object.keys(standard.seatRows).length, 3);
  assert.equal(standard.fingerprint, base.fingerprint);
  assert.equal(standard.structure_hash, structure);
  for (const options of [{ tableProfile: table }, { opponentProfile: "nit", opponentSeat: "ip" }]) {
    assert.throws(() => finalizeInputs(base, options, () => assert.fail("MW3 must reject before HU source selection"), sha, structure),
      /MW3 table\/opponent range adjustments are not supported/);
  }
});
