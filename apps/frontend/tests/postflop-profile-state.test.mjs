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

test("completed HU context preserves the default projection, permits adjusted HU and keeps MW3 standard-only", () => {
  const value = state(), actionBlocks = buildRangeUrlActionBlocks(value);
  const expectedDefault = { players: ["BTN", "BB"], potBb: 5.5, pilotAvailable: true,
    spotId: "BTN_open_BB_call", ip: "BTN", oop: "BB", stackBb: 97.5, tree: "oop_checks" };
  assert.deepEqual(completedFlopContext({ ...value, actionBlocks, isDefaultTable: true }), expectedDefault);
  assert.deepEqual(completedFlopContext({ ...value, actionBlocks, isDefaultTable: false }), expectedDefault);
  assert.deepEqual(completedFlopContext({ ...value, actionBlocks }), expectedDefault);

  const mw3 = { rangeType: "response", opener: "CO", hero: "BB", callers: ["BTN", "BB"], foldedHero: true };
  const mw3Blocks = buildRangeUrlActionBlocks(mw3);
  const standard = completedFlopContext({ ...mw3, actionBlocks: mw3Blocks, isDefaultTable: true });
  assert.equal(standard.kind, "mw3_srp");
  assert.equal(standard.spotId, "CO_open_BTN_call_BB_call");
  assert.equal(standard.mw3Available, true);
  assert.equal(completedFlopContext({ ...mw3, actionBlocks: mw3Blocks, isDefaultTable: false }).mw3Available, false);
  assert.equal(completedFlopContext({ ...mw3, actionBlocks: mw3Blocks }).mw3Available, false);
});

test("completed contexts reject malformed or pot-mismatched flop endings", () => {
  const value = state(), actionBlocks = buildRangeUrlActionBlocks(value);
  assert.equal(completedFlopContext({ ...value, actionBlocks: [] }), null);
  assert.equal(completedFlopContext({ ...value, actionBlocks: [{ kind: "end", result: "not a flop", pot: "ポット 5.5bb" }] }), null);
  assert.equal(completedFlopContext({ ...value, actionBlocks: [{ ...actionBlocks.at(-1), pot: "ポット unknown" }] }), null);
  const mismatch = completedFlopContext({ ...value, actionBlocks: [{ ...actionBlocks.at(-1), pot: "ポット 6.5bb" }], isDefaultTable: false });
  assert.equal(mismatch.pilotAvailable, false);
  assert.equal(mismatch.spotId, null);

  const mw3 = { rangeType: "response", opener: "CO", hero: "BB", callers: ["BTN", "BB"], foldedHero: true };
  const mw3Blocks = buildRangeUrlActionBlocks(mw3);
  const unavailable = completedFlopContext({ ...mw3, actionBlocks: [{ ...mw3Blocks.at(-1), pot: "ポット 9bb" }], isDefaultTable: true });
  assert.equal(unavailable.kind, "multiway_unavailable");
  assert.equal(unavailable.spotId, null);
  assert.equal(unavailable.mw3Available, false);
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
  const guestGate = source.indexOf("if (flopActive && !postflopAllowed) return");
  const postflopRender = source.indexOf("{flopActive ? (");
  assert.ok(guestGate >= 0 && postflopRender > guestGate, "sign-in gate must precede every postflop rendering branch");
  for (const component of ["<PostflopTrial ", "<Mw3PostflopTrial ", "<ProfilePolicyPreparing "]) {
    assert.ok(source.indexOf(component) > postflopRender, `${component} must remain behind the sign-in gate`);
  }
});
