import test from "node:test";
import assert from "node:assert/strict";
import { defaultModeForLevel, dominantAction, summarizeMix } from "../src/estimated/display-mode.ts";

const mix = actions => ({ actions });
const order = ["raise_ai", "call", "fold"];
const labels = { raise_ai: "レイズ 12BB" };

test("summarizes mixed frequencies in plain language", () => {
  assert.equal(summarizeMix(mix({ raise_ai: 0, call: 0.95, fold: 0.05 }), order, labels), "コール");
  assert.equal(summarizeMix(mix({ raise_ai: 0.25, call: 0.7, fold: 0.05 }), order, labels), "基本はコール、ときどきレイズ 12BB");
  assert.equal(summarizeMix(mix({ raise_ai: 0.4, call: 0.55, fold: 0.05 }), order, labels), "コールとレイズ 12BBを混ぜる");
});

test("simple mode colors each hand by its most frequent action", () => {
  assert.equal(dominantAction(mix({ raise_ai: 0.4, call: 0.55, fold: 0.05 }), order), "call");
  assert.equal(defaultModeForLevel("beginner"), "simple");
  assert.equal(defaultModeForLevel("intermediate"), "standard");
});
