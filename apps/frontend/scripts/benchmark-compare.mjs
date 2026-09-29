// Compares saved ranges' combo-weighted action frequencies with reference benchmarks in .local/benchmarks.
// Usage: node scripts/benchmark-compare.mjs [--tolerance 3]   (benchmarks are never committed)
import { compareToReferences, loadReferences, loadSpots } from "./lib/benchmark.mjs";

const root = new URL("../", import.meta.url);
const tolFlag = process.argv.indexOf("--tolerance");
const tolerance = tolFlag > 0 ? Number(process.argv[tolFlag + 1]) : 3;
const references = loadReferences(root);
if (!references.length) { console.log("ベンチマークがありません（.local/benchmarks/<spot_id>.json）。"); process.exit(0); }
let outside = 0;
console.log(`| 局面 | アクション | 保存データ | 参考値 | 差 |\n|---|---|---|---|---|`);
for (const row of compareToReferences(loadSpots(root), references)) {
  if (row.ours === null) { console.log(`| ${row.spot_id} | — | 保存データなし | | |`); continue; }
  const over = Math.abs(row.diff) > tolerance;
  if (over) outside += 1;
  console.log(`| ${row.spot_id} | ${row.action} | ${row.ours.toFixed(1)}% | ${row.reference.toFixed(1)}% | ${row.diff >= 0 ? "+" : ""}${row.diff.toFixed(1)}${over ? " ⚠" : ""} |`);
}
console.log(`\n許容差 ±${tolerance}pt を超えた項目: ${outside}`);
