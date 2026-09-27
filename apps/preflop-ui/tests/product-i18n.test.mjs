import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { englishFactLabels, englishPreflopReason } from "../src/estimated/english-reasons.js";
import { productLocale, translateProductCopy } from "../src/i18n.js";
import { actionReason, evidenceReason } from "../src/estimated/postflop-reasons.js";
import { displayDrillName, PRESET_DRILLS } from "../src/trainer/drill-store.js";

const previousWindow = globalThis.window;
before(() => { globalThis.window = { localStorage: { getItem: () => null } }; });
after(() => { globalThis.window = previousWindow; });

test("the product defaults to English without a saved choice", () => {
  assert.equal(productLocale(), "en");
  assert.equal(translateProductCopy("練習セッション"), "Practice sessions");
  assert.equal(translateProductCopy("セッションの状態"), "Session status");
  assert.equal(displayDrillName(PRESET_DRILLS[0]), "All-spot mix");
  assert.equal(PRESET_DRILLS[0].name, "全局面ミックス");
});

test("preflop reasoning uses recorded facts without Japanese or invented EV", () => {
  const hand = { hand: "22", fold: 0, call: 95, three_bet: 5 };
  const detailed = { reason: "保存済み説明", facts: { equity_vs_open_pct: 47.5, realized_equity_pct: 41, call_ev_bb: 0.64 } };
  const data = { spot_facts: { call_break_even_equity_pct: 25 } };
  const reason = englishPreflopReason(hand, detailed, data);
  assert.match(reason, /47\.5%/);
  assert.match(reason, /\+0\.64 bb/);
  assert.match(reason, /call 95%/);
  assert.match(reason, /3-bet 5%/);
  assert.doesNotMatch(reason, /[ぁ-んァ-ヶ一-龠]/);
  assert.equal(englishFactLabels.call_ev_bb, "Estimated call EV");
});

test("flop explanations are English while their numeric evidence stays intact", () => {
  assert.match(actionReason("btn_first", "bet33", "strong"), /thin value bet/);
  const reason = evidenceReason("call", { required: 0.25 }, 0.42);
  assert.match(reason, /42%/);
  assert.match(reason, /25%/);
  assert.doesNotMatch(reason, /[ぁ-んァ-ヶ一-龠]/);
});
