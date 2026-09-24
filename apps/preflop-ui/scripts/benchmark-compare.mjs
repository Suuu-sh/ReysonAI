// Compares saved ranges' combo-weighted action frequencies with reference benchmarks in .local/benchmarks.
// Usage: node scripts/benchmark-compare.mjs [--tolerance 3]   (benchmarks are never committed)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { comboCount } from "./lib/equity.mjs";

const root = new URL("../", import.meta.url);
const tolFlag = process.argv.indexOf("--tolerance");
const tolerance = tolFlag > 0 ? Number(process.argv[tolFlag + 1]) : 3;
const datasets = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses", "multiway-responses"]
  .filter(name => existsSync(new URL(`src/estimated/${name}.json`, root)))
  .flatMap(name => JSON.parse(readFileSync(new URL(`src/estimated/${name}.json`, root))).spots);
const openBy = new Map(datasets.filter(s => s.id.endsWith("_open")).map(s => [s.hero, new Map(s.hands.map(r => [r.hand, r.open / 100]))]));
const responseBy = new Map(datasets.filter(s => /^[A-Z]+_vs_[A-Z]+$/.test(s.id)).map(s => [`${s.opener}>${s.hero}`, new Map(s.hands.map(r => [r.hand, r]))]));

// Weight of each hand reaching the spot, so frequencies match what a solver reports for the node.
function reachWeight(spot) {
  if (spot.id.endsWith("_three_bet")) return hand => openBy.get(spot.opener).get(hand);
  if (spot.id.endsWith("_four_bet")) return hand => responseBy.get(`${spot.opener}>${spot.hero}`).get(hand).three_bet / 100;
  return () => 1;
}

function aggregate(spot) {
  const reach = reachWeight(spot);
  const actions = Object.keys(spot.hands[0]).filter(key => ["open", "three_bet", "four_bet", "all_in", "squeeze", "call", "fold"].includes(key));
  const totals = Object.fromEntries(actions.map(action => [action, 0]));
  let weight = 0;
  for (const row of spot.hands) {
    const w = comboCount(row.hand) * reach(row.hand);
    weight += w;
    for (const action of actions) totals[action] += w * row[action];
  }
  return Object.fromEntries(actions.map(action => [action, totals[action] / weight]));
}

const dir = new URL(".local/benchmarks/", root);
const files = existsSync(dir) ? readdirSync(dir).filter(name => name.endsWith(".json")) : [];
if (!files.length) { console.log("ベンチマークがありません（.local/benchmarks/<spot_id>.json）。"); process.exit(0); }
let outside = 0;
console.log(`| 局面 | アクション | 保存データ | 参考値 | 差 |\n|---|---|---|---|---|`);
for (const file of files) {
  const bench = JSON.parse(readFileSync(new URL(file, dir)));
  const spot = datasets.find(s => s.id === bench.spot_id);
  if (!spot) { console.log(`| ${bench.spot_id} | — | 保存データなし | | |`); continue; }
  const ours = aggregate(spot);
  for (const [action, ref] of Object.entries(bench.frequencies)) {
    const diff = (ours[action] ?? 0) - ref;
    if (Math.abs(diff) > tolerance) outside += 1;
    console.log(`| ${spot.id} | ${action} | ${(ours[action] ?? 0).toFixed(1)}% | ${ref.toFixed(1)}% | ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}${Math.abs(diff) > tolerance ? " ⚠" : ""} |`);
  }
}
console.log(`\n許容差 ±${tolerance}pt を超えた項目: ${outside}`);
