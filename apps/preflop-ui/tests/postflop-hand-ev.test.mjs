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

test("the expanded breakdown puts each action's EV beside its frequency bar, with EQR above", () => {
  const row = { equity_pct: 42.25, eqr: 0.05, mix_ev_bb: 0.16, ev_bb: { fold: 0, call: 1.07, raise: 1.89 }, mix: { fold: 85, call: 15, raise: 0 } };
  const ev = { data: { pot_bb: 7.32, samples: 2000, row }, error: null, loading: false };
  const items = [{ action: "fold", frequency: 0.85 }, { action: "call", frequency: 0.15 }, { action: "raise", frequency: 0 }];
  const render = props => renderToStaticMarkup(createElement(view.HandEvBars, { items, labels: { raise: "3倍チェックレイズ" }, ...props }));
  const html = render({ ev });
  assert.match(html, /EQR<\/dt><dd>0\.05</);
  assert.equal((html.match(/class="bar-row with-ev/g) || []).length, 3);
  // The highest-EV action (the check-raise here) is marked; every row shows its EV after the frequency.
  assert.match(html, /bar-row with-ev best-ev"[^>]*><span>[^<]*<i[^>]*><\/i>3倍チェックレイズ<\/span>[\s\S]*?<b>0\.0%<\/b><em class="ev-positive"[^>]*>\+1\.89bb<\/em>/);
  assert.match(html, /<b>85\.0%<\/b><em class="ev-positive">0\.00bb<\/em>/);
  assert.match(html, /GTO・ソルバーのEVではありません/);
  // A single combo shows its own frequencies without the class-average EV.
  const combo = render({ ev, comboSelected: true });
  assert.doesNotMatch(combo, /with-ev|EQR<\/dt>/);
  assert.match(combo, /EVはハンド平均で表示します/);
  assert.match(render({ ev: { data: { ...ev.data, row: null }, error: null, loading: false } }), /この場面に来ません/);
  assert.match(render({ ev: { data: null, error: null, loading: true } }), /EVを読み込み中/);
  assert.equal(view.handEvQuery("As7d2c", ["bet33", "raise"], "AKo"), "/local-postflop-hand-ev?board=As7d2c&history=bet33%2Craise&hand=AKo");
});
