import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { expandContinuationReasons } from "../src/estimated/continuation-reason-format.ts";
import { hands } from "../src/data.ts";

const dir = new URL("../src/estimated/reasons/", import.meta.url);
const load = name => JSON.parse(readFileSync(new URL(`../src/estimated/${name}.json`, import.meta.url)));
const sources = [
  [existsSync(new URL("../src/estimated/continuation-responses.json", import.meta.url)) ? load("continuation-responses") : { spots: [] }, [["four_bet", "4bet"], ["all_in", "オールイン"], ["call", "コール"], ["fold", "フォールド"]]],
  [load("opening-ranges"), [["open", "オープン"], ["limp", "リンプ"], ["fold", "フォールド"]]],
  [load("preflop-ranges"), [["three_bet", "3bet"], ["call", "コール"], ["fold", "フォールド"]]],
  [load("three-bet-responses"), [["four_bet", "4bet"], ["call", "コール"], ["fold", "フォールド"]]],
  [load("multiway-responses"), [["squeeze", "スクイーズ"], ["call", "コール"], ["fold", "フォールド"]]],
  [load("multiway2-responses"), [["squeeze", "スクイーズ"], ["call", "コール"], ["fold", "フォールド"]]],
  [load("cold-four-bet-responses"), [["all_in", "オールイン"], ["call", "コール"], ["fold", "フォールド"]]],
  [load("squeeze-responses"), [["four_bet", "4bet"], ["call", "コール"], ["fold", "フォールド"]]],
  [load("cold-three-bet-responses"), [["four_bet", "4bet"], ["call", "コール"], ["fold", "フォールド"]]],
  [{ spots: load("limp-responses").spots.filter(s => s.id === "SB_vs_BB_iso") }, [["raise", "リレイズ"], ["call", "コール"], ["fold", "フォールド"]]],
  [{ spots: load("limp-responses").spots.filter(s => s.id === "BB_vs_SB_limp") }, [["raise", "アイソレイズ"], ["check", "チェック"]]],
  [{ spots: load("limp-responses").spots.filter(s => s.id === "BB_vs_SB_limp_reraise") }, [["four_bet", "4bet"], ["call", "コール"], ["fold", "フォールド"]]],
  [load("four-bet-responses"), [["all_in", "オールイン"], ["call", "コール"], ["fold", "フォールド"]]],
  [load("five-bet-responses"), [["call", "コール"], ["fold", "フォールド"]]],
  [load("limp-deep-responses"), [["all_in", "オールイン"], ["call", "コール"], ["fold", "フォールド"]]],
];

test("every detailed-reason file covers all 169 hands of an existing spot and quotes its saved mix", () => {
  const files = readdirSync(dir).filter(name => name.endsWith(".json"));
  assert.ok(files.length >= 1);
  for (const file of files) {
    const data = expandContinuationReasons(JSON.parse(readFileSync(new URL(file, dir))));
    const match = sources.map(([dataset, actions]) => [dataset.spots.find(s => s.id === data.spot_id), actions]).find(([spot]) => spot);
    assert.ok(match, `${file}: unknown spot ${data.spot_id}`);
    const [spot, actions] = match;
    assert.deepEqual(Object.keys(data.hands).sort(), [...hands].sort());
    assert.ok(Array.isArray(data.fact_labels) && data.fact_labels.length, `${file}: fact_labels`);
    for (const row of spot.hands) {
      const reason = data.hands[row.hand].reason;
      if (reason.includes("対象外")) continue;
      for (const [key, name] of actions) {
        if (row[key]) assert.match(reason, new RegExp(`${name} ${row[key]}%`), `${file} ${row.hand}`);
      }
      // Wording that commits to a pure action must match the saved mix.
      if (/(?<!一部は|ほとんど)フォールドします。/.test(reason)) assert.ok(row.fold >= 90, `${file} ${row.hand}: says fold`);
      if (/オープンして利益が出る|オープンで利益が見込めます/.test(reason)) assert.ok(row.open >= 90, `${file} ${row.hand}: says open`);
    }
  }
});
