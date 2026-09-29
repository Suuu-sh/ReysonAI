import test from "node:test";
import assert from "node:assert/strict";
import { config, loadInputs, boards, useArtifactSource } from "../scripts/postflop-ai/inputs.mjs";
import { parseCards } from "../scripts/postflop-ai/model.mjs";
import { referencePolicy } from "../scripts/postflop-ai/policy.mjs";
import { referenceLaterPolicy } from "../scripts/postflop-ai/later-policy.mjs";
import { streetHistories } from "../scripts/postflop-ai/later-tree.mjs";
import { laterDecision, laterStart, replayLater } from "../src/estimated/postflop-trial.ts";
import { explainLaterCombo, laterExplainContext, laterOpponentRange } from "../scripts/postflop-ai/explain-later.mjs";
import { laterHandEvForBoard, laterHandEvKey, loadLaterHandEv, representativeLaterRunouts } from "../scripts/postflop-ai/later-hand-ev.mjs";
import { localPostflopMiddleware } from "../scripts/postflop-ai/local-view.mjs";
import { sha } from "../scripts/postflop-ai/generate.mjs";

const inputs = loadInputs("BTN_open_BB_call");
const flopPolicy = referencePolicy;
const laterPolicy = referenceLaterPolicy();
const hero = parseCards("AhKd", 2);
const base = { flop: "As7d2c", flopActions: "check", turn: "3s", cards: "AhKd", inputs, flopPolicy, laterPolicy };
const cardText = card => "23456789TJQKA"[card >> 2] + "cdhs"[card & 3];
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

function assertSharesConserve(detail) {
  const groups = detail.groups.reduce((sum, item) => sum + item.share, 0);
  near(groups + (detail.foldShare ?? 0), 1, 1e-8);
}

test("turn/river evidence groups conserve range share and pot odds match replayed chips", () => {
  const turn = explainLaterCombo({ ...base, turnActions: "bet75" });
  assert.equal(turn.street, "turn");
  assert.equal(turn.node, "turn_ip_vs_75");
  for (const detail of Object.values(turn.actions)) assertSharesConserve(detail);

  const turnStart = laterStart(["check"], inputs.spot);
  const turnReplay = replayLater("turn", ["bet75"], turnStart, inputs.spot);
  const turnDecision = laterDecision("turn", ["bet75"], turnStart, inputs.spot);
  const turnRole = turnDecision.role;
  const turnOther = turnRole === "ip" ? "oop" : "ip";
  const turnCall = inputs.spot.stackBb - turnReplay.stacks[turnOther] - (inputs.spot.stackBb - turnReplay.stacks[turnRole]);
  near(turn.actions.call.required, turnCall / (turnReplay.pot + turnCall));

  const river = explainLaterCombo({ ...base, turnActions: "check,check", river: "5s", riverActions: "bet75" });
  assert.equal(river.street, "river");
  assert.equal(river.node, "river_ip_vs_75");
  for (const detail of Object.values(river.actions)) assertSharesConserve(detail);
  const checkedTurn = replayLater("turn", ["check", "check"], laterStart(["check"], inputs.spot), inputs.spot);
  const riverStart = { pot: checkedTurn.pot, stacks: checkedTurn.stacks, lastAggressor: checkedTurn.lastAggressor };
  const riverReplay = replayLater("river", ["bet75"], riverStart, inputs.spot);
  const riverDecision = laterDecision("river", ["bet75"], riverStart, inputs.spot);
  const riverRole = riverDecision.role, riverOther = riverRole === "ip" ? "oop" : "ip";
  const riverCall = inputs.spot.stackBb - riverReplay.stacks[riverOther] - (inputs.spot.stackBb - riverReplay.stacks[riverRole]);
  near(river.actions.call.required, riverCall / (riverReplay.pot + riverCall));
});

test("opponent reach is narrowed by its own earlier saved actions and excludes hero/board cards", () => {
  const checked = laterExplainContext({ ...base, turnActions: "check,check", river: "5s" }, inputs);
  const called = laterExplainContext({ ...base, turnActions: "bet75,call", river: "5s" }, inputs);
  const checkedRange = laterOpponentRange({ context: checked, inputs, hero, flopPolicy, laterPolicy });
  const calledRange = laterOpponentRange({ context: called, inputs, hero, flopPolicy, laterPolicy });
  const total = items => items.reduce((sum, item) => sum + item.weight, 0);
  assert.notEqual(total(checkedRange), total(calledRange));
  for (const item of [...checkedRange, ...calledRange]) {
    assert.ok(item.combo.every(card => !hero.includes(card)));
    assert.ok(item.combo.every(card => !checked.board.includes(card)));
  }
});

test("turn equity reports its bounded top-weight sample when needed", () => {
  const detail = explainLaterCombo({ ...base, turnActions: "" });
  assert.equal(detail.street, "turn");
  assert.equal(detail.truncated, true);
  assert.equal(detail.combos, 300);
});

test("later hand-EV is testable without local writes and marks zero-reach nodes", () => {
  const board = boards().find(item => item.id === "As7d2c");
  const runout = representativeLaterRunouts(board)[0];
  const turnHistories = streetHistories("turn"), riverHistories = streetHistories("river");
  const later = structuredClone(laterPolicy);
  // Remove the OOP bet-33 branch from every policy rule: its responder range must be unreachable.
  for (const rule of later.streets.turn.rules.filter(item => item.node === "turn_oop_first")) {
    rule.mix.check += rule.mix.bet33;
    rule.mix.bet33 = 0;
  }
  const result = laterHandEvForBoard(board, inputs, flopPolicy, later, 20, {
    runouts: [runout],
    turnHistories: { "": turnHistories[""], bet33: turnHistories.bet33 },
    riverHistories: { "": riverHistories[""] },
  });
  const turnKey = laterHandEvKey({ flop: board.id, turn: cardText(runout.turn), flopActions: ["check"], turnActions: [] });
  const turnNode = result[turnKey];
  assert.equal(turnNode.node, "turn_oop_first");
  assert.ok(Object.keys(turnNode.rows).length > 0);
  for (const [hand, row] of Object.entries(turnNode.rows)) {
    assert.match(hand, /^(?:[2-9TJQKA]{2}|[2-9TJQKA]{2}[so])$/);
    assert.deepEqual(Object.keys(row).sort(), ["eqr", "equity_pct", "ev_bb", "mix", "mix_ev_bb"]);
    assert.ok(Number.isFinite(row.equity_pct));
    assert.ok(Object.keys(row.ev_bb).length > 0);
    near(Object.values(row.mix).reduce((sum, value) => sum + value, 0), 100, 1e-8);
  }
  const noBetKey = laterHandEvKey({ flop: board.id, turn: cardText(runout.turn), flopActions: ["check"], turnActions: ["bet33"] });
  assert.equal(result[noBetKey].unreachable, true);
  assert.deepEqual(result[noBetKey].rows, {});
  assert.ok(Object.keys(result).some(key => key.includes(">")), "river action histories are addressable in the last key segment");
});

test("new local later endpoints preserve GET-only and localhost restrictions", () => {
  const request = (path, method, host) => {
    const response = { headers: {}, status: null, body: null,
      setHeader(key, value) { this.headers[key] = value; },
      writeHead(status) { this.status = status; return this; },
      end(body) { this.body = body; return this; } };
    let continued = false;
    localPostflopMiddleware({ url: path, method, headers: { host } }, response, () => { continued = true; });
    return { response, continued };
  };
  for (const path of ["/local-postflop-later-explain", "/local-postflop-later-hand-ev"]) {
    assert.equal(request(path, "POST", "localhost:5173").response.status, 405);
    const external = request(path, "GET", "example.com");
    assert.equal(external.response.status, 403);
    assert.equal(external.continued, false);
  }
});

test("later hand-EV lookup returns null for a policy/hash mismatch", () => {
  const candidate = { metadata: { policy_hash: "flop-policy" } };
  const laterCandidate = { policy: { version: 1, rules: [] } };
  const artifact = { kind: "ai_estimate_not_gto", version: 1, source_hash: inputs.fingerprint,
    policy_hash: candidate.metadata.policy_hash, later_policy_hash: sha(laterCandidate.policy), samples: 20, seed: config.seed, boards: {} };
  try {
    useArtifactSource({ ranges: {}, artifact: () => artifact });
    assert.equal(loadLaterHandEv(inputs, candidate, laterCandidate), artifact);
    useArtifactSource({ ranges: {}, artifact: () => ({ ...artifact, policy_hash: "stale" }) });
    assert.equal(loadLaterHandEv(inputs, candidate, laterCandidate), null);
  } finally {
    useArtifactSource(null);
  }
});
