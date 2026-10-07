import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { defaultOpponentSeat, normalizePostflopProfileState, opponentProfiles } from "../src/estimated/postflop-profile-state.ts";
import { completedFlopContext } from "../src/estimated/postflop-trial.ts";
import { buildRangeUrlActionBlocks, decodeRangeUrl, defaultRangeSelection, encodeRangeUrl } from "../src/estimated/range-url.ts";
import { defaultFormat } from "../src/estimated/game-formats.ts";
import { POSTFLOP_SPOTS, spotById } from "../scripts/postflop-ai/spots.ts";

const state = overrides => ({ ...defaultRangeSelection, rangeType: "response", opener: "BTN", hero: "BB",
  callers: ["BB"], foldedHero: true, format: { ...defaultFormat }, tableProfile: { call: "high", three_bet: "low" },
  showFlop: true, flopCards: ["As", "Kh", "7d"], flopActions: ["check"], opponentProfile: "standard", opponentSeat: null, ...overrides });
const read = value => decodeRangeUrl(new URL(encodeRangeUrl(value), "https://example.test").searchParams);

test("non-default table conditions keep the recorded HU pilot and restore its legal streets", () => {
  const value = state();
  const context = completedFlopContext({ ...value, actionBlocks: buildRangeUrlActionBlocks(value), isDefaultTable: false });
  assert.equal(context.pilotAvailable, true);
  assert.equal(context.spotId, "BTN_open_BB_call");
  const decoded = read(value);
  assert.equal(decoded.showFlop, true);
  assert.deepEqual(decoded.tableProfile, value.tableProfile);
  assert.deepEqual(decoded.flopActions, ["check"]);
});

test("default opponent follows the last SRP, 3bet, 4bet and history aggressor", () => {
  for (const [spotId, expected] of [
    ["BTN_open_BB_call", "ip"], ["SB_open_BB_call", "oop"],
    ["BTN_open_BB_3bet_call", "oop"], ["UTG_open_HJ_3bet_call", "ip"],
    ["BTN_open_BB_4bp_call", "ip"], ["SB_open_BB_4bp_call", "oop"],
    ["BTN_open_SB_3bet_BB_call_BTN_fold", "oop"],
  ]) assert.equal(defaultOpponentSeat({ spotId }), expected, spotId);
  for (const spot of POSTFLOP_SPOTS.filter(item => "history" in item)) {
    const limped = spot.history.some(step => step.action === "limp");
    const expectedSeat = limped ? "BB" : spot.aggressor;
    assert.equal(defaultOpponentSeat({ spotId: spot.id }), expectedSeat === spot.oop ? "oop" : "ip", spot.id);
  }
});

test("ALL limped pots default to BB, including SB's limp-reraise", () => {
  for (const spot of POSTFLOP_SPOTS.filter(item => item.kind === "limp")) {
    assert.equal(defaultOpponentSeat({ spotId: spot.id }), spot.ip === "BB" ? "ip" : "oop", spot.id);
  }
  assert.equal(spotById("SB_limp_BB_iso_SB_reraise_call").aggressor, "SB");
  assert.equal(defaultOpponentSeat({ spotId: "SB_limp_BB_iso_SB_reraise_call" }), "ip");
  for (const context of [null, {}, { spotId: null }, { spotId: "not-recorded" }]) assert.equal(defaultOpponentSeat(context), "ip");
});

test("all opponent profiles and explicit/automatic seats survive URL round trips", () => {
  for (const opponentProfile of opponentProfiles) for (const opponentSeat of [null, "ip", "oop"]) {
    const value = state({ opponentProfile, opponentSeat });
    const url = encodeRangeUrl(value);
    const decoded = read(value);
    assert.deepEqual(normalizePostflopProfileState(decoded), { opponentProfile, opponentSeat });
    assert.equal(encodeRangeUrl(decoded), url);
    assert.equal(decoded.showFlop, true);
  }
  const normal = encodeRangeUrl(state());
  assert.doesNotMatch(normal, /opponent_(profile|seat)/);
  assert.equal(defaultOpponentSeat(read(state({ opponentProfile: "nit" }))), "ip");
});

test("invalid restored profile/seat values normalize safely in URLs and per-tab state", () => {
  for (const opponentProfile of ["passive", "STANDARD", "", null, 4, {}]) {
    assert.deepEqual(normalizePostflopProfileState({ opponentProfile, opponentSeat: "BTN" }), { opponentProfile: "standard", opponentSeat: null });
  }
  const decoded = decodeRangeUrl("?opponent_profile=unknown&opponent_seat=BB");
  assert.deepEqual(normalizePostflopProfileState(decoded), { opponentProfile: "standard", opponentSeat: null });
  assert.doesNotMatch(encodeRangeUrl(decoded), /opponent_(profile|seat)/);
  assert.deepEqual(normalizePostflopProfileState(JSON.parse('{"opponentProfile":"station","opponentSeat":"oop"}')),
    { opponentProfile: "station", opponentSeat: "oop" });
  const source = readFileSync(new URL("../src/estimated/RangeWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /initialUrlState \?\? restoredSelection\(initialRangeType\)/, "URL must win over tab session");
  assert.match(source, /normalizePostflopProfileState\(saved\)/, "validate session profile/seat before restoration");
  assert.match(source, /window\.sessionStorage\.setItem\(selectionStorageKey,[^\n]*opponentProfile, opponentSeat/);
});

test("unsupported game formats and guest sign-in cannot be bypassed by an opponent URL", () => {
  for (const format of [{ ...defaultFormat, stack: 40 }, { ...defaultFormat, ante: true }]) {
    assert.equal(read(state({ format, opponentProfile: "maniac", opponentSeat: "oop" })).showFlop, false);
  }
  const source = readFileSync(new URL("../src/estimated/RangeWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /const flopContext = !currentError && isBuilt\(format\)/);
  assert.match(source, /if \(flopActive && !postflopAllowed\) return/);
  assert.ok(source.indexOf("if (flopActive && !postflopAllowed) return") < source.indexOf("{flopActive ? <PostflopTrial"));
});
