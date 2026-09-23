// Audits the persisted estimated ranges. Exits 1 when any finding remains.
// Usage: node scripts/audit-estimates.mjs [--dir <estimates dir>] [--json]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditEstimates, pct } from "../src/estimated/audit.js";

const dirFlag = process.argv.indexOf("--dir");
const dir = dirFlag > 0 ? resolve(process.argv[dirFlag + 1]) : new URL("../src/estimated/", import.meta.url).pathname;
const load = name => JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8"));
const report = auditEstimates({
  opening: load("opening-ranges"),
  responses: load("preflop-ranges"),
  threeBets: load("three-bet-responses"),
  fourBets: load("four-bet-responses"),
  fiveBets: load("five-bet-responses"),
  multiway: load("multiway-responses"),
});
const { findings, autoProfit, threeBetDefense, fourBetDefense, widths } = report;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ findings, autoProfit, threeBetDefense, fourBetDefense, widths }, null, 2));
} else {
  const count = (check, severity) => findings.filter(f => f.check === check && (!severity || f.severity === severity)).length;
  console.log("# 推定レンジ検証レポート\n");
  console.log("| チェック | 件数 |\n|---|---|");
  for (const check of ["range-flow", "auto-profit", "strength-order", "suited-vs-offsuit", "position-nesting", "defense-nesting", "squeeze-width"]) console.log(`| ${check} | ${count(check)} |`);
  console.log("\n## オープン幅");
  for (const w of widths) console.log(`- ${w.spot}: ${pct(w.width)}`);
  console.log("\n## オープンへの全員フォールド率（損益分岐）");
  for (const a of autoProfit) console.log(`- ${a.spot}: ${pct(a.foldRate)}（分岐 ${pct(a.threshold)}）${a.foldRate > a.threshold ? " ⚠" : ""}`);
  console.log("\n## 3betへのオープナーのフォールド率");
  for (const d of threeBetDefense) console.log(`- ${d.spot} ${d.size}BB: ${pct(d.foldRate)}（分岐 ${pct(d.threshold)}）${d.foldRate > d.threshold ? " ⚠" : ""}`);
  console.log("\n## 4betへの3bettorのフォールド率");
  for (const d of fourBetDefense) console.log(`- ${d.spot} ${d.size}BB: ${pct(d.foldRate)}（分岐 ${pct(d.threshold)}）${d.foldRate > d.threshold ? " ⚠" : ""}`);
  console.log("\n## 指摘一覧");
  for (const f of findings) console.log(`- [${f.severity}] ${f.check} · ${f.spot}: ${f.detail}`);
}

process.exitCode = findings.length ? 1 : 0;
