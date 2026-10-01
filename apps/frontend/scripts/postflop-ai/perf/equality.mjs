// Offline W1 golden capture/replay. Never writes .local artifacts.
// Usage: node scripts/postflop-ai/perf/equality.mjs <capture|compare> /private/tmp/goldens [case]
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadInputs, config } from "../inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "../generate.mjs";
import { simulate } from "../simulation.mjs";
import { handEvForBoard, flopHandEvForHand } from "../flop-hand-ev-core.mjs";
import { laterHandEvForHand } from "../later-hand-ev-core.mjs";
import { parseFlopBoard, parseCards } from "../model.mjs";
import { flopNodes } from "../views.mjs";
import { explainCombo } from "../explain.mjs";
import { auditExperiment } from "../audit.mjs";

const [mode, directory, selected] = process.argv.slice(2);
assert.ok(["capture", "compare"].includes(mode) && directory, "capture|compare directory [case]");
const inputs = loadInputs("BTN_open_BB_call");
const candidate = loadCandidate(inputs), laterCandidate = loadLaterCandidate(inputs, candidate);
const shared = { inputs, flopPolicy: candidate.policy, laterPolicy: laterCandidate.policy };
const hands = ["AA", "AKo", "KQs", "77", "65s"];
const cases = {
  simulate400: () => simulate(inputs, candidate.policy, 400, laterCandidate),
  simulateDefault: () => simulate(inputs, candidate.policy, config.samples_per_board_profile_seat, laterCandidate),
  boardAs7d2c: () => handEvForBoard(parseFlopBoard("As7d2c"), inputs, candidate.policy, 200, laterCandidate.policy),
  boardKhTh4s: () => handEvForBoard(parseFlopBoard("KhTh4s"), inputs, candidate.policy, 200, laterCandidate.policy),
  flopHands: () => ["Kh6s3d", "Qc9h4s"].flatMap(flop => hands.map(hand => ({ flop, hand,
    result: flopHandEvForHand({ ...shared, flop, history: [], hand, samples: 200 }) }))),
  riverHands: () => hands.map(hand => ({ hand, result: laterHandEvForHand({ ...shared, flop: "As7d2c",
    flopActions: ["bet33", "call"], turn: "3s", turnActions: ["check", "check"], river: "5s",
    riverActions: ["check", "bet75"], hand, samples: 600 }) })),
  viewsExplain: () => {
    const boardCards = parseCards("KhTh4s", 3), nodes = ["btn_first", "bb_vs_75", "btn_vs_raise"];
    const views = flopNodes(inputs, candidate.policy, boardCards);
    return nodes.map(node => ({ node, view: views[node], explanation: explainCombo({ boardCards,
      node, cards: "AcQd", inputs, policy: candidate.policy }) }));
  },
  coldFlop160: () => flopHandEvForHand({ ...shared, flop: "As7d2c", hand: "AKo", samples: 160 }),
  coldFlop600: () => flopHandEvForHand({ ...shared, flop: "As7d2c", hand: "AKo", samples: 600 }),
  coldTurn600: () => laterHandEvForHand({ ...shared, flop: "As7d2c", flopActions: ["bet33", "call"],
    turn: "3s", hand: "AKo", samples: 600 }),
  coldRiver600: () => laterHandEvForHand({ ...shared, flop: "As7d2c", flopActions: ["bet33", "call"],
    turn: "3s", turnActions: ["check", "check"], river: "5s", riverActions: ["check", "bet75"],
    hand: "AKo", samples: 600 }),
  auditDefault: () => auditExperiment(inputs, candidate,
    JSON.parse(readFileSync(join(directory, "simulateDefault.json"), "utf8")), laterCandidate),
};
mkdirSync(directory, { recursive: true });
for (const [name, run] of Object.entries(cases)) {
  if (selected ? name !== selected : name.startsWith("cold") || name === "simulateDefault" || name === "auditDefault") continue;
  const started = performance.now();
  const result = run(), ms = performance.now() - started;
  const output = JSON.stringify(result);
  const path = join(directory, `${name}.json`);
  if (mode === "capture") writeFileSync(path, output + "\n");
  else {
    // Goldens are JSON reports; JSON serialises a rounded -0 as 0 on both paths.
    assert.deepEqual(JSON.parse(output), JSON.parse(readFileSync(path, "utf8")), `${name}: deep equality`);
    assert.equal(output + "\n", readFileSync(path, "utf8"), `${name}: byte equality`);
  }
  console.log(JSON.stringify({ mode, name, ms: Math.round(ms), bytes: output.length, equal: mode === "compare" }));
}
assert.ok(!selected || selected in cases, `Unknown case: ${selected}`);
