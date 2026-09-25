import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { seededRandom } from "../scripts/lib/equity.mjs";
import { boards, loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { parseCards } from "../scripts/postflop-ai/model.mjs";
import { referencePolicy } from "../scripts/postflop-ai/policy.mjs";
import { HISTORIES, handEvForBoard, playFromNode } from "../scripts/postflop-ai/hand-ev.mjs";

const flop = parseCards("As7d2c", 3);
const hands = { BTN: parseCards("AhKd", 2), BB: parseCards("7h7c", 2) };
const runout = parseCards("3s4s", 2);
const play = (history, forced, seed = 1) => playFromNode({ hands, flop, runout, history, forced, policy: referencePolicy, random: seededRandom(seed) });

test("folding at a flop decision is worth exactly zero from that decision on", () => {
  assert.equal(play(["bet33"], "fold"), 0);
  assert.equal(play(["bet75", "raise"], "fold"), 0);
  assert.equal(play(["bet33", "raise"], "fold"), 0);
});

test("chips already put in before the decision are sunk, not counted in its EV", () => {
  // BTN (AK) bets 33% and calls the check-raise with a set of sevens against it: it loses the
  // chips it adds from the call on, not the 1.82BB bet it made earlier.
  const callRaise = play(["bet33", "raise"], "call");
  assert.ok(callRaise < 0);
  assert.ok(callRaise >= -97.5);
  // BB's set wins; facing the 33% bet its call is worth more than the sunk-free fold.
  assert.ok(play(["bet33"], "call") > 0);
});

test("per-hand rows carry equity, EQR, per-action EV and the class mix for every decision", () => {
  const inputs = loadInputs();
  const board = boards().find(item => item.id === "As7d2c");
  const result = handEvForBoard(board, inputs, referencePolicy, 40);
  assert.deepEqual(Object.keys(result), Object.keys(HISTORIES));
  const root = result[""];
  assert.deepEqual([root.node, root.actor, root.pot_bb], ["btn_first", "BTN", 5.5]);
  const aa = root.rows.AA;
  assert.deepEqual(Object.keys(aa.ev_bb), ["check", "bet33", "bet75"]);
  assert.ok(aa.equity_pct > 80 && aa.eqr > 0);
  assert.equal(Object.values(aa.mix).reduce((sum, value) => sum + value, 0), 100);
  // EQR follows the preflop definition: EV = equity × EQR × raked(pot).
  const raked = 5.5 - Math.min(5.5 * 0.05, 3);
  assert.ok(Math.abs(aa.eqr - aa.mix_ev_bb / (aa.equity_pct / 100 * raked)) < 0.02);
  assert.equal(result.bet33.rows.bet33, undefined);
  assert.ok(Object.values(result.bet33.rows).every(row => row.ev_bb.fold === 0));
});

let server;
let view;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), logLevel: "silent",
    server: { middlewareMode: true, watch: null, hmr: false, ws: false }, appType: "custom" });
  view = await server.ssrLoadModule("/src/estimated/PostflopHandEv.jsx");
});
after(async () => { await server?.close(); });

test("hand EV view shows EQR, per-action EV with the best action, and the non-GTO note", () => {
  const data = { pot_bb: 7.32, samples: 2000, row: { equity_pct: 42.25, eqr: 0.05, mix_ev_bb: 0.16,
    ev_bb: { fold: 0, call: 1.07, raise: 1.89 }, mix: { fold: 85, call: 15, raise: 0 } } };
  const html = renderToStaticMarkup(createElement(view.HandEvView, { data }));
  assert.match(html, /EQR<\/dt><dd>0\.05</);
  assert.match(html, /<tr class="best">[\s\S]*?Raise 3×<small>最大<\/small>[\s\S]*?\+1\.89bb/);
  assert.match(html, /85%/);
  assert.match(html, /GTO・ソルバーのEVではありません/);
  assert.match(renderToStaticMarkup(createElement(view.HandEvView, { data: { ...data, row: null } })), /この場面に来ません/);
  assert.equal(view.handEvQuery("As7d2c", ["bet33", "raise"], "AKo"), "/local-postflop-hand-ev?board=As7d2c&history=bet33%2Craise&hand=AKo");
});
