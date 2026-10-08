import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { getOwnLearningHistory, getSavedRange, listSavedRangeCoverage, McpDataError, SUPPORTED_RANGE_DATASETS } from "../src/data.ts";

const source = name => JSON.parse(readFileSync(new URL(`../../frontend/src/estimated/${name}.json`, import.meta.url), "utf8"));
const published = Object.fromEntries(SUPPORTED_RANGE_DATASETS.map(name => [name, source(name)]));
const hash = text => createHash("sha256").update(text).digest("hex");
function fakeDb({ datasets = {}, accounts = {}, mutateMeta, mutateParts } = {}) {
  const calls = [];
  const texts = Object.fromEntries(Object.entries(datasets).map(([name, data]) => [name, typeof data === "string" ? data : JSON.stringify(data)]));
  const metadata = Object.entries(texts).map(([name, text]) => ({ name, content_hash: hash(text), bytes: Buffer.byteLength(text), parts: Math.ceil(text.length / 30_000) }));
  mutateMeta?.(metadata);
  return { calls, prepare(sql) {
    assert.match(sql, /^SELECT /, "data adapters must only issue SELECTs");
    return { bind(...args) { return { async all() {
      calls.push({ sql, args });
      if (sql.includes("FROM account_data")) {
        assert.match(sql, /WHERE user_id = \? LIMIT 2$/);
        const account = accounts[args[0]];
        return { results: account === undefined ? [] : [{ data_json: typeof account === "string" ? account : JSON.stringify(account), version: 3 }] };
      }
      if (sql.includes("FROM preflop_dataset_parts")) {
        const text = texts[args[0]] ?? "", rows = [];
        for (let offset = 0; offset < text.length; offset += 30_000) rows.push({ part: rows.length, body: text.slice(offset, offset + 30_000) });
        mutateParts?.(rows, args[0]);
        return { results: rows };
      }
      if (sql.includes("FROM preflop_datasets")) return { results: metadata.filter(row => args.includes(row.name)).sort((a, b) => a.name.localeCompare(b.name)) };
      throw new Error(`Unexpected SQL: ${sql}`);
    } }; } };
  } };
}
const errorCode = code => error => error instanceof McpDataError && error.code === code;
const clone = value => structuredClone(value);
const answer = (changes = {}) => ({ spotId: "BTN_open", hand: "AKs", cards: ["As", "Ks"], action: "open", result: "best", score: 1, at: 1_790_000_000_000, ...changes });

test("coverage is discovered from published metadata and paginates exact current spot IDs", async () => {
  const db = fakeDb({ datasets: { "opening-ranges": published["opening-ranges"], "preflop-ranges": published["preflop-ranges"], "multiway-responses": source("multiway-responses") } });
  const catalog = await listSavedRangeCoverage(db);
  assert.equal(catalog.kind, "ai_estimate_not_gto");
  assert.equal(catalog.total, 3);
  assert.deepEqual(catalog.datasets.map(item => [item.dataset, item.lookupSupported]), [["multiway-responses", false], ["opening-ranges", true], ["preflop-ranges", true]]);
  const first = await listSavedRangeCoverage(db, { dataset: "opening-ranges", limit: 2 });
  assert.equal(first.total, 5);
  assert.deepEqual(first.spots.map(spot => spot.id), ["UTG_open", "HJ_open"]);
  assert.equal(first.nextOffset, 2);
  const next = await listSavedRangeCoverage(db, { dataset: "opening-ranges", limit: 5, offset: first.nextOffset });
  assert.deepEqual(next.spots.map(spot => spot.id), ["CO_open", "BTN_open", "SB_open"]);
  assert.equal(next.nextOffset, null);
  assert.equal((await listSavedRangeCoverage(fakeDb())).total, 0);
});

test("every supported published spot uses its actual 169 rows and saved sizes", async () => {
  const db = fakeDb({ datasets: published });
  let spotCount = 0;
  for (const dataset of SUPPORTED_RANGE_DATASETS) for (const spot of published[dataset].spots) {
    const result = await getSavedRange(db, { dataset, spotId: spot.id });
    assert.equal(result.spot.id, spot.id);
    assert.equal(result.hands.length, 169);
    assert.equal(result.conditions.rake.rate, 0.05);
    assert.equal(result.reasonStatus, "select_hand");
    for (const row of result.hands) {
      const original = spot.hands.find(hand => hand.hand === row.hand);
      if (!row.reachable) {
        assert.equal(original.fold, 100);
        assert.equal(row.frequencies, null);
        assert.equal(row.sizesBb, null);
      } else {
        assert.equal(Object.values(row.frequencies).reduce((sum, value) => sum + value), 100);
        for (const [action, value] of Object.entries(row.frequencies)) assert.equal(value, original[action]);
        for (const [key, value] of Object.entries(row.sizesBb)) assert.equal(value, original[key]);
      }
    }
    spotCount++;
  }
  assert.equal(spotCount, 70);
});

test("hand lookup preserves full saved frequencies and detailed or inline reasons without synthesizing", async () => {
  const reasons = source("reasons/BB_vs_BTN");
  const db = fakeDb({ datasets: { ...published, "reasons/BB_vs_BTN": reasons } });
  const result = await getSavedRange(db, { dataset: "preflop-ranges", spotId: "BB_vs_BTN", hand: "A5s" });
  const raw = published["preflop-ranges"].spots.find(spot => spot.id === "BB_vs_BTN").hands.find(hand => hand.hand === "A5s");
  assert.deepEqual(result.hands[0].frequencies, { fold: raw.fold, call: raw.call, three_bet: raw.three_bet });
  assert.equal(result.reason.text, reasons.hands.A5s.reason);
  assert.equal(result.reason.sourceFingerprint, reasons.source_fingerprint);
  assert.equal(result.reasonStatus, "saved");
  const five = published["five-bet-responses"].spots[0];
  const fiveResult = await getSavedRange(db, { dataset: "five-bet-responses", spotId: five.id, hand: "AA" });
  assert.equal(fiveResult.reason.text, five.hands.find(row => row.hand === "AA").reason);
  const absent = await getSavedRange(db, { dataset: "opening-ranges", spotId: "BTN_open", hand: "AA" });
  assert.equal(absent.reason, null);
  assert.equal(absent.reasonStatus, "not_published");
});

test("unreachable saved fold placeholders are explicitly not recommendations", async () => {
  const opening = published["opening-ranges"].spots.find(spot => spot.id === "UTG_open");
  const hand = opening.hands.find(row => row.open === 0).hand;
  const result = await getSavedRange(fakeDb({ datasets: published }), { dataset: "three-bet-responses", spotId: "UTG_vs_HJ_three_bet", hand });
  assert.deepEqual(result.hands[0], { hand, reachable: false, frequencies: null, sizesBb: null });
});

test("unknown datasets, non-canonical hands and missing exact spots never choose a nearby strategy", async () => {
  const db = fakeDb({ datasets: published });
  for (const dataset of ["../secret", "profiles/nit/villain/preflop-ranges", "multiway-responses", "continuation-responses", "legacy_sdk"]) {
    await assert.rejects(getSavedRange(db, { dataset, spotId: "BB_vs_BTN" }), errorCode("unsupported_dataset"));
  }
  for (const hand of ["KAo", "AAo", "AK", "2As", "AhKs", "' OR 1=1", "__proto__"]) await assert.rejects(getSavedRange(db, { dataset: "preflop-ranges", spotId: "BB_vs_BTN", hand }), errorCode("invalid_argument"));
  await assert.rejects(getSavedRange(db, { dataset: "opening-ranges", spotId: "BB_open" }), errorCode("not_found"));
  await assert.rejects(getSavedRange(db, { dataset: "preflop-ranges", spotId: "../BB_vs_BTN" }), errorCode("invalid_argument"));
  await assert.rejects(getSavedRange(fakeDb(), { dataset: "opening-ranges", spotId: "BTN_open" }), errorCode("not_found"));
  for (const input of [{ limit: 0 }, { limit: 51 }, { limit: 1.5 }, { offset: -1 }]) await assert.rejects(listSavedRangeCoverage(db, input), errorCode("invalid_argument"));
});

test("malformed, incomplete, oversized and publication-race data fail closed", async () => {
  const lookup = db => getSavedRange(db, { dataset: "opening-ranges", spotId: "BTN_open" });
  await assert.rejects(lookup(fakeDb({ datasets: { "opening-ranges": "{" } })), errorCode("invalid_saved_data"));
  await assert.rejects(lookup(fakeDb({ datasets: { "opening-ranges": published["opening-ranges"] }, mutateParts(rows) { rows.pop(); } })), errorCode("invalid_saved_data"));
  await assert.rejects(lookup(fakeDb({ datasets: { "opening-ranges": published["opening-ranges"] }, mutateMeta(rows) { rows[0].bytes = 4_000_001; } })), errorCode("invalid_saved_data"));
  await assert.rejects(lookup(fakeDb({ datasets: { "opening-ranges": published["opening-ranges"] }, mutateMeta(rows) { rows[0].content_hash = "0".repeat(64); } })), errorCode("invalid_saved_data"));
  for (const change of [data => data.spots[0].hands[0].open = -1, data => data.spots[0].hands[0].open = 99, data => data.spots[0].hands[1].hand = "AA", data => data.spots[0].hands.pop(), data => data.metadata.strategy_type = "solver_gto", data => data.spots[0].hands[0].open_size_bb = 12, data => data.spots[0].id = "BB_open"]) {
    const data = clone(published["opening-ranges"]); change(data);
    await assert.rejects(lookup(fakeDb({ datasets: { "opening-ranges": data } })), errorCode("invalid_saved_data"));
  }
  const only = { "three-bet-responses": published["three-bet-responses"] };
  await assert.rejects(getSavedRange(fakeDb({ datasets: only }), { dataset: "three-bet-responses", spotId: "UTG_vs_HJ_three_bet" }), errorCode("not_found"));
  const reasons = source("reasons/BB_vs_BTN"); reasons.spot_id = "BB_vs_CO";
  await assert.rejects(getSavedRange(fakeDb({ datasets: { ...published, "reasons/BB_vs_BTN": reasons } }), { dataset: "preflop-ranges", spotId: "BB_vs_BTN", hand: "AA" }), errorCode("invalid_saved_data"));
});

test("missing exact predecessor and inconsistent or illegal raise sizes are rejected", async () => {
  const fourBet = { ...published };
  delete fourBet["three-bet-responses"];
  await assert.rejects(getSavedRange(fakeDb({ datasets: fourBet }), { dataset: "four-bet-responses", spotId: "HJ_vs_UTG_four_bet", hand: "AA" }), errorCode("not_found"));
  const mismatched = clone(published["three-bet-responses"]);
  mismatched.spots[0].three_bet_size_bb = 9;
  await assert.rejects(getSavedRange(fakeDb({ datasets: { ...published, "three-bet-responses": mismatched } }), { dataset: "three-bet-responses", spotId: "UTG_vs_HJ_three_bet", hand: "AA" }), errorCode("invalid_saved_data"));
  const illegal = clone(published["three-bet-responses"]);
  illegal.spots[0].four_bet_size_bb = 3;
  for (const row of illegal.spots[0].hands) if (row.four_bet > 0) row.four_bet_size_bb = 3;
  await assert.rejects(getSavedRange(fakeDb({ datasets: { ...published, "three-bet-responses": illegal } }), { dataset: "three-bet-responses", spotId: "UTG_vs_HJ_three_bet", hand: "AA" }), errorCode("invalid_saved_data"));
});

test("own history reads only the trusted user with bound SQL and returns allowlisted learning facts", async () => {
  const privateText = "PRIVATE PROFILE OR DRILL TITLE";
  const account = {
    "reysonai:profile:v1": { name: privateText, email: "secret@example.test" },
    "reysonai.trainer.history.v1": [answer({ privateNote: privateText }), answer({ hand: "A5o", action: "fold", result: "mixed", score: 0.5, at: 1_790_000_000_001 }), answer({ action: "fold", result: "miss", score: 0, at: 1_790_000_000_002 })],
    "reysonai.trainer.drills.v1": [{ id: privateText, name: privateText, settings: { note: privateText }, sessions: [{ at: 1_790_000_000_003, answered: 2, score: 1.5, durationMs: 5000, hands: null, secret: privateText }] }],
    "reysonai.trainer.review-sessions.v1": [{ at: 1_790_000_000_004, answered: 1, score: 1, durationMs: 1000, hands: [answer()], secret: privateText }],
    "reysonai.trainer.drafts.v1": { name: privateText },
    arbitrary: privateText,
  };
  const db = fakeDb({ accounts: { alice: account, bob: { "reysonai.trainer.history.v1": [answer({ hand: "KK" })] } } });
  const result = await getOwnLearningHistory(db, "alice", { limit: 2 });
  assert.deepEqual(db.calls, [{ sql: "SELECT data_json, version FROM account_data WHERE user_id = ? LIMIT 2", args: ["alice"] }]);
  assert.equal(result.summary.answered, 3);
  assert.equal(result.summary.accuracy, 0.5);
  assert.deepEqual(result.summary.results, { best: 1, mixed: 1, miss: 1 });
  assert.equal(result.recentAnswers.length, 2);
  assert.equal(result.recentAnswers[0].result, "miss");
  assert.equal(result.sessions.completedDrillAttempts, 1);
  assert.equal(result.sessions.completedReviewAttempts, 1);
  assert.equal(result.sessions.recent[0].kind, "review");
  assert.equal(result.sessions.recent[1].handHistorySaved, false);
  const text = JSON.stringify(result);
  for (const secret of [privateText, "secret@example.test", "KK", "cards", "settings", "mix", "arbitrary"]) assert.ok(!text.includes(`\"${secret}\"`));
  assert.ok(!text.includes(privateText));
  const injected = await getOwnLearningHistory(db, "alice' OR '1'='1");
  assert.equal(injected.syncedDataPresent, false);
  assert.deepEqual(db.calls.at(-1).args, ["alice' OR '1'='1"]);
});

test("history accepts imported JSON-string storage without exposing nested content", async () => {
  const db = fakeDb({ accounts: { user: { "reysonai.trainer.history.v1": JSON.stringify([answer()]), "reysonai.trainer.drills.v1": "[]", "reysonai.trainer.review-sessions.v1": "[]" } } });
  const result = await getOwnLearningHistory(db, "user");
  assert.equal(result.summary.answered, 1);
  assert.equal(result.recentAnswers[0].spotId, "BTN_open");
});

test("empty, bounded and malformed history is reported truthfully without invented attempts", async () => {
  const empty = await getOwnLearningHistory(fakeDb(), "user");
  assert.equal(empty.summary.answered, 0);
  assert.equal(empty.summary.accuracy, null);
  assert.equal(empty.syncedDataPresent, false);
  const answers = Array.from({ length: 505 }, (_, index) => answer({ at: index }));
  answers.push(answer({ hand: "AK" }), answer({ spotId: "profile_secret" }), answer({ score: 999 }), answer({ at: "secret" }));
  const db = fakeDb({ accounts: { user: { "reysonai.trainer.history.v1": answers } } });
  const result = await getOwnLearningHistory(db, "user", { limit: 50 });
  assert.equal(result.summary.answered, 496);
  assert.equal(result.historyWindow.invalidRecordsIgnored, 4);
  assert.equal(result.historyWindow.truncated, true);
  assert.equal(result.recentAnswers.length, 50);
  assert.equal(result.recentAnswers[0].at, 504);
  for (const data of ["{", "[]", { "reysonai.trainer.history.v1": "{" }, { "reysonai.trainer.history.v1": {} }, " ".repeat(500_001)]) await assert.rejects(getOwnLearningHistory(fakeDb({ accounts: { user: data } }), "user"), errorCode("invalid_saved_data"));
  await assert.rejects(getOwnLearningHistory(db, ""), errorCode("invalid_argument"));
  await assert.rejects(getOwnLearningHistory(db, "user", { limit: 51 }), errorCode("invalid_argument"));
});

test("completed sessions are bounded and malformed/free-form answers never become hand logs", async () => {
  const session = { at: 100, answered: 1, score: 1, hands: [answer()] };
  const drills = Array.from({ length: 51 }, () => ({ name: "PRIVATE", sessions: Array.from({ length: 51 }, () => session) }));
  const reviews = [null, { at: 100, answered: -1, score: 1 }, { ...session, at: 200, hands: [{ ...answer(), spotId: "PRIVATE" }] }];
  const result = await getOwnLearningHistory(fakeDb({ accounts: { user: { "reysonai.trainer.drills.v1": drills, "reysonai.trainer.review-sessions.v1": reviews } } }), "user", { limit: 1 });
  assert.equal(result.sessions.completedDrillAttempts, 2500);
  assert.equal(result.sessions.completedReviewAttempts, 1);
  assert.equal(result.sessions.invalidRecordsIgnored, 2);
  assert.equal(result.sessions.truncated, true);
  assert.equal(result.sessions.recent.length, 1);
  assert.equal(result.sessions.recent[0].handHistorySaved, false);
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
});

test("missing storage and database errors yield safe typed errors without internal details", async () => {
  await assert.rejects(listSavedRangeCoverage(undefined), errorCode("data_unavailable"));
  const db = { prepare() { throw new Error("SECRET DATABASE MESSAGE"); } };
  await assert.rejects(getOwnLearningHistory(db, "user"), error => errorCode("data_unavailable")(error) && !error.message.includes("SECRET"));
});
