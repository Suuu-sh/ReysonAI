import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root)));

test("SB review packets include all legal actions, balance rubric and limp-path reachability", () => {
  const ids = ["SB_open", "BB_vs_SB_limp", "SB_vs_BB_iso"];
  const result = spawnSync(process.execPath, ["scripts/review/build-packets.mjs", ...ids], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const sb = read("src/estimated/opening-ranges.json").spots.find(s => s.hero === "SB");
  const limps = new Map(sb.hands.map(row => [row.hand, row.limp]));
  const actions = [["open", "limp", "fold"], ["raise", "check"], ["raise", "call", "fold"]];
  for (const [index, id] of ids.entries()) {
    for (const mode of ["blind", "critique"]) {
      const packet = read(`.local/review/packets/${id}.${mode}.json`);
      assert.deepEqual(packet.legal_actions, actions[index]);
      assert.ok(packet.rubric.some(text => text.includes("レンジのバランス") && text.includes("キャップ・分離しすぎ")));
      if (mode === "blind") {
        assert.equal(packet.hands.length, 30);
        assert.ok(packet.hands.every(row => !Object.hasOwn(row, "mix")));
        if (id === "SB_vs_BB_iso") assert.ok(packet.hands.every(row => limps.get(row.hand) > 0));
      } else {
        assert.equal(packet.hands.length, 169);
        for (const row of packet.hands) {
          assert.deepEqual(Object.keys(row.mix), actions[index]);
          assert.equal(Object.values(row.mix).reduce((a, b) => a + b, 0), 100);
          if (id === "SB_vs_BB_iso") assert.equal(row.unreachable, limps.get(row.hand) === 0);
        }
      }
    }
  }
});
