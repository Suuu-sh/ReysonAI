import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateGtoBenchmark } from "../src/gto/benchmark.ts";
import { loadAppearance, loadRangeSource, saveAppearance, saveRangeSource } from "../src/account/preferences.ts";

const saved = JSON.parse(readFileSync(new URL("../src/gto/benchmark-flop.json", import.meta.url), "utf8"));
const fixture = () => structuredClone(saved);

test("fixed saved GTO scope rejects truncated, zero-reach, and substituted sources", () => {
  assert.deepEqual(validateGtoBenchmark(fixture()).nodes.map(node => [node.combos.length, node.classes.length]), [[1176, 169], [690, 119]]);
  for (const mutate of [
    data => { data.metadata.rakePercent = 5; },
    data => { data.metadata.board[0] = "Qd"; },
    data => { data.metadata.upstream.sha = "a".repeat(40); },
    data => { data.metadata.inputs.BTN_open.rangeSha256 = "a".repeat(64); },
    data => { data.metadata.inputs.BB_call.nodeId = "another-node"; },
    data => { data.nodes[0].combos.pop(); },
    data => { data.nodes[1].classes.pop(); },
    data => { data.nodes[0].combos[0].reachWeight = 0; },
    data => { data.nodes[0].classes[0].frequencies.bet = 0.5; },
    data => { data.nodes[0].combos[0].combo = "QsKc"; },
    data => { data.nodes[1].history = []; },
  ]) { const data = fixture(); mutate(data); assert.throws(() => validateGtoBenchmark(data)); }
});

test("range source defaults to AI, preserves appearance, and repairs corrupt records", () => {
  const previous = globalThis.window;
  const values = new Map();
  const key = "reysonai:appearance:v1";
  globalThis.window = { localStorage: { getItem: item => values.get(item) ?? null, setItem: (item, value) => values.set(item, value) }, dispatchEvent() {} };
  try {
    assert.equal(loadRangeSource(), "ai");
    saveAppearance({ cards: "two", motion: "reduce" });
    saveRangeSource("gto");
    assert.equal(loadRangeSource(), "gto");
    saveAppearance({ cards: "four", motion: "standard" });
    assert.deepEqual(JSON.parse(values.get(key)), { cards: "four", motion: "standard", rangeSource: "gto" });
    values.set(key, "not-json");
    assert.equal(loadRangeSource(), "ai");
    assert.deepEqual(loadAppearance(), { cards: "four", motion: "standard" });
    saveRangeSource("gto");
    assert.deepEqual(JSON.parse(values.get(key)), { rangeSource: "gto" });
    values.set(key, "[1,2]");
    saveAppearance({ cards: "two", motion: "reduce" });
    assert.deepEqual(JSON.parse(values.get(key)), { cards: "two", motion: "reduce", rangeSource: "ai" });
    values.set(key, JSON.stringify({ cards: "two", motion: "reduce", rangeSource: "invalid" }));
    saveRangeSource("invalid");
    assert.deepEqual(JSON.parse(values.get(key)), { cards: "two", motion: "reduce", rangeSource: "ai" });
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});
