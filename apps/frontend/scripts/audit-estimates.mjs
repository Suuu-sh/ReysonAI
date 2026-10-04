// Audits persisted estimates. Balance/cross-strength warnings are advisory, not an exit-1 gate.
// Usage: node scripts/audit-estimates.mjs [--dir <estimates dir>] [--json]
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditEstimates, auditOpponentProfiles, BALANCE_CHECKS, isBlockingAuditFinding, pct } from "../src/estimated/audit.ts";

import { loadOpponentProfileBundles, profileSourceFindings } from "./lib/opponent-profile-build.mjs";
import { OPPONENT_PROFILE_DATASETS } from "../src/estimated/opponent-profiles.ts";

const dirFlag = process.argv.indexOf("--dir");
const dir = dirFlag > 0 ? resolve(process.argv[dirFlag + 1]) : new URL("../src/estimated/", import.meta.url).pathname;
const load = name => JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8"));
const continuationArtifacts = existsSync(`${dir}/continuation-responses.json`);
if (!continuationArtifacts && existsSync(`${dir}/continuation-call-equities.json`)) throw new Error("Partial Stage 2 artifacts: continuation strategy is missing");
const report = auditEstimates({
  callEquities: load("call-equities"),
  ...(continuationArtifacts ? {
    continuations: load("continuation-responses"), continuationEquities: load("continuation-call-equities"),
  } : {}),
  opening: load("opening-ranges"),
  responses: load("preflop-ranges"),
  threeBets: load("three-bet-responses"),
  fourBets: load("four-bet-responses"),
  fiveBets: load("five-bet-responses"),
  multiway: load("multiway-responses"),
  squeezes: load("squeeze-responses"),
  coldThreeBets: load("cold-three-bet-responses"),
  multiway2: load("multiway2-responses"), coldFourBets: load("cold-four-bet-responses"),
  limp: load("limp-responses"),
  limpDeep: load("limp-deep-responses"),
});
report.continuationArtifacts = continuationArtifacts ? "audited" : "not-generated";
const profiles = loadOpponentProfileBundles(dir);
report.opponentProfiles = auditOpponentProfiles(profiles, Object.fromEntries(OPPONENT_PROFILE_DATASETS.map(n => [n, load(n)])));
report.findings.push(...report.opponentProfiles.findings, ...profileSourceFindings(profiles, dir));
const { findings, autoProfit, threeBetDefense, fourBetDefense, widths } = report;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const count = (check, severity) => findings.filter(f => f.check === check && (!severity || f.severity === severity)).length;
  console.log("# 推定レンジ検証レポート\n");
  if (!continuationArtifacts) console.log("Stage 2 artifacts are not generated; this run audits legacy data only. Run node scripts/build-continuations.mjs --install to validate Stage 2.\n");
  console.log("| チェック | 件数 |\n|---|---|");
  for (const check of ["profile-coverage", "profile-frequency", "profile-range-flow", "profile-sizing-context", "profile-source", "profile-strength-order", "ev-capacity-conflict", "negative-ev-call", "boundary-ev-call", "call-equity-source", "range-flow", "auto-profit", "strength-order", "suited-vs-offsuit", "position-nesting", "defense-nesting", "squeeze-width", "cold-width", "cross-strength-inversion", ...BALANCE_CHECKS]) console.log(`| ${check} | ${count(check)} |`);
  console.log("\n## 系列をまたいだ強さの逆転（警告のみ）");
  console.log("同じ種類の非ペアを対ランダム勝率で比較。勝率差4pt以上かつ弱い手の継続率が20pt以上高い組を検出。弱い側のホイールA・コネクター・1つ飛び、および到達不能ハンドは除外。");
  const cross = report.crossStrengthSummary;
  console.log(`- cross-strength-inversion: ${cross.count}組 / ${cross.warnings}件の集約警告 / ${cross.spots.length}局面 — ${cross.spots.join(", ") || "なし"}`);
  console.log(`\n## レンジのバランス（全${report.rangeBalance.length}局面・警告のみ）`);
  console.log("強さ順: hand-strength.json の固定シード対ランダム勝率。到達頻度×コンボで加重し、上位10%境界は按分。局面別の相手レンジ対勝率ではないため、最終判断はレビューで行います。");
  for (const check of BALANCE_CHECKS) {
    const { count, spots } = report.balanceSummary[check];
    console.log(`- ${check}: ${count}件 / ${spots.length}局面 — ${spots.join(", ") || "なし"}`);
  }
  console.log("\n## オープン幅");
  for (const w of widths) console.log(`- ${w.spot}: ${pct(w.width)}`);
  console.log("\n## オープンへの全員フォールド率（損益分岐）");
  for (const a of autoProfit) console.log(`- ${a.spot}: ${pct(a.foldRate)}（分岐 ${pct(a.threshold)}）${a.foldRate > a.threshold ? " ⚠" : ""}`);
  console.log("\n## 3betへのオープナーのフォールド率");
  for (const d of threeBetDefense) console.log(`- ${d.spot} ${d.size}BB: ${pct(d.foldRate)}（分岐 ${pct(d.threshold)}）${d.foldRate > d.threshold ? " ⚠" : ""}`);
  console.log("\n## 4betへの3bettorのフォールド率");
  for (const d of fourBetDefense) console.log(`- ${d.spot} ${d.size}BB: ${pct(d.foldRate)}（分岐 ${pct(d.threshold)}）${d.foldRate > d.threshold ? " ⚠" : ""}`);
  console.log("\n## スクイーズへのオープナー×コーラー（オープナーが降りた後）のフォールド率");
  for (const d of report.squeezeDefense) console.log(`- ${d.spot}: ${pct(d.openerFold)} × ${pct(d.callerFold)} = ${pct(d.foldRate)}（分岐 ${pct(d.threshold)}）${d.foldRate > d.threshold ? " ⚠" : ""}`);
  console.log("\n## リンプ・リレイズへのBBのフォールド率");
  for (const d of report.limpReraiseDefense) console.log(`- ${d.spot}: ${pct(d.foldRate)}（分岐 ${pct(d.threshold)}）${d.foldRate > d.threshold ? " ⚠" : ""}`);
  console.log("\n## リンプ・リレイズ後の4bet／オールインへのフォールド率");
  for (const d of report.limpDeepDefense) console.log(`- ${d.spot}: ${pct(d.foldRate)}（分岐 ${pct(d.threshold)}）${d.foldRate > d.threshold ? " ⚠" : ""}`);
  console.log("\n## 3betへのコールド応答（Hero×オープナーのフォールド率、参考値）");
  for (const d of report.coldThreeBetDefense) console.log(`- ${d.spot}: ${pct(d.heroFold)} × ${pct(d.openerFold)} = ${pct(d.foldRate)}`);
  console.log("\n## 指摘一覧");
  for (const f of findings) console.log(`- [${f.severity}] ${f.check} · ${f.spot}: ${f.detail}`);
}

process.exitCode = findings.some(isBlockingAuditFinding) ? 1 : 0;
