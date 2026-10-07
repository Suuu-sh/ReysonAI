// Project an existing, source-matched saved policy with the product's exact board/combination aggregation.
// No policy generation, random strategy, cache fallback, or frequency rounding.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadInputs } from "./postflop-ai/inputs.mjs";
import { validatePolicy } from "./postflop-ai/policy.ts";
import { sha } from "./postflop-ai/browser-inputs.ts";
import { parseFlopBoard } from "./postflop-ai/model.ts";
import { flopNodes } from "./postflop-ai/views.ts";
import { historyFor } from "./postflop-ai/tree.ts";
const directory = process.argv[2];
if (!directory) throw new Error("Pass the directory of existing saved postflop policy artifacts");
const inputs = loadInputs("BTN_open_BB_call");
const candidate = JSON.parse(readFileSync(join(directory, "btn-bb-srp-v1-policy.json"), "utf8"));
const policy = validatePolicy(candidate.policy, inputs.spot.tree);
if (candidate.metadata.source_hash !== inputs.fingerprint || candidate.metadata.policy_hash !== sha(policy)) throw new Error("Saved postflop policy is stale or malformed");
const ranges = [];
for (const board of ["As7d2c", "Th9h8c", "Js8s5d"]) {
  const parsed = parseFlopBoard(board);
  const nodes = flopNodes(inputs, policy, parsed.cards);
  for (const node of ["btn_first", "bb_vs_33", "bb_vs_75", "btn_vs_raise"]) {
    const view = nodes[node];
    if (!view || view.rows.length !== 169) throw new Error(`Missing postflop view ${board}/${node}`);
    const hands = Object.fromEntries(view.rows.map(row => {
      if (Object.values(row.mix).some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error(`Invalid ${board}/${node}/${row.hand}`);
      return [row.hand, row.mix];
    }));
    ranges.push({ id: `${inputs.spot.id}:${board}:${node}`, stage: "postflop", board, street: "Flop", seat: view.seat,
      history: historyFor(inputs.spot.tree, node, "bet33"), actions: view.actions, hands,
      unreachable: view.rows.filter(row => !row.reachable).map(row => row.hand) });
  }
}
writeFileSync(new URL("../src/site/postflop-preview.json", import.meta.url), JSON.stringify({ spot: inputs.spot.id,
  source_hash: inputs.fingerprint, policy_hash: candidate.metadata.policy_hash, aggregation: "product flopNodes row.mix and row.reachable; no rounding", ranges }) + "\n");
console.log(`Projected ${ranges.length} existing postflop matrices`);
