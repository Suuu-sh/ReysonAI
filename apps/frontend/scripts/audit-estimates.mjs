// Audits persisted estimates. Balance/cross-strength warnings are advisory, not an exit-1 gate.
// Usage: node scripts/audit-estimates.mjs [--dir <estimates dir>] [--json]
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { auditEstimates, auditOpponentProfiles, BALANCE_CHECKS, isBlockingAuditFinding, pct, checkRangeBalance, checkCrossStrengthInversion } from "../src/estimated/audit.ts";
import { STAGE3_DATASETS } from "./lib/stage3-artifacts.mjs";

import { loadOpponentProfileBundles, profileSourceFindings } from "./lib/opponent-profile-build.mjs";
import { OPPONENT_PROFILE_DATASETS } from "../src/estimated/opponent-profiles.ts";

const dirFlag = process.argv.indexOf("--dir");
const dir = dirFlag > 0 ? resolve(process.argv[dirFlag + 1]) : new URL("../src/estimated/", import.meta.url).pathname;
const load = name => JSON.parse(readFileSync(`${dir}/${name}.json`, "utf8"));
const stage3Present = STAGE3_DATASETS.filter(name => existsSync(`${dir}/${name}.json`));
const stage3Reasons = existsSync(`${dir}/reasons`) && readdirSync(`${dir}/reasons`).some(name => /^s3_.*\.json$/.test(name));
if ((stage3Present.length || stage3Reasons) && stage3Present.length !== STAGE3_DATASETS.length) throw new Error("Partial Stage 3 artifacts: complete strategies/equities/audit/coverage are required");
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
report.stage3Artifacts = stage3Present.length ? "audited" : "not-generated";
if (stage3Present.length) {
  const { validateStage3Dataset } = await import("../src/estimated/stage3-responses.ts");
  const { validateStage3Coverage } = await import("../src/estimated/stage3-coverage.ts");
  const { auditStage3Estimates } = await import("../src/estimated/stage3-audit.ts");
  const { STAGE3_PREREQUISITES } = await import("./lib/stage3-publication.mjs");
  const datasets = Object.fromEntries(STAGE3_PREREQUISITES.map(name => [name, load(name)]));
  const data = load("stage3-responses"), equities = load("stage3-call-equities");
  validateStage3Dataset(data, datasets);
  validateStage3Coverage(load("stage3-coverage"), data, datasets);
  report.stage3 = auditStage3Estimates(data, datasets, equities, { checkRangeBalance, checkCrossStrengthInversion });
  if (!isDeepStrictEqual(report.stage3, load("stage3-audit-report"))) throw new Error("Saved Stage 3 audit is stale or changed");
  report.findings.push(...report.stage3.findings);
  report.rangeBalance.push(...report.stage3.rangeBalance.map(({ findings: ignored, ...metrics }) => metrics));
  const conflicts = new Set(report.stage3.findings.filter(finding => finding.check === "ev-capacity-conflict").map(finding => finding.spot));
  report.capacityConflicts.push(...report.stage3.defense.filter(item => conflicts.has(item.spot)).map(item => ({
    spot: item.spot, context_type: "stage3", minimumFoldRate: item.minimumFoldRate,
    maximumContinuationPct: (1 - item.minimumFoldRate) * 100, requiredContinuationPct: (1 - item.threshold) * 100,
    foldConfidence: item.foldConfidence, capacityConfidence: item.capacityConfidence, samples: item.samples, method: item.method,
  })));
}
const profiles = loadOpponentProfileBundles(dir);
report.opponentProfiles = auditOpponentProfiles(profiles, Object.fromEntries(OPPONENT_PROFILE_DATASETS.map(n => [n, load(n)])));
report.findings.push(...report.opponentProfiles.findings, ...profileSourceFindings(profiles, dir));
// Shared summaries describe the entire audited snapshot, including appended
// Stage 3 findings. Keep the protected legacy audit implementation unchanged.
report.balanceSummary = Object.fromEntries(BALANCE_CHECKS.map(check => {
  const matches = report.findings.filter(finding => finding.check === check);
  return [check, { count: matches.length, spots: [...new Set(matches.map(finding => finding.spot))].sort() }];
}));
const inversions = report.findings.filter(finding => finding.check === "cross-strength-inversion");
report.crossStrengthSummary = { count: inversions.reduce((sum, finding) => sum + finding.count, 0),
  warnings: inversions.length, spots: [...new Set(inversions.map(finding => finding.spot))].sort() };
const { findings, autoProfit, threeBetDefense, fourBetDefense, widths } = report;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const count = (check, severity) => findings.filter(f => f.check === check && (!severity || f.severity === severity)).length;
  console.log("# 推定レンジ検証レポート\n");
  if (!continuationArtifacts) console.log("Stage 2 artifacts are not generated; this run audits legacy data only. Run node scripts/build-continuations.mjs --install to validate Stage 2.\n");
  if (!stage3Present.length) console.log("Stage 3 artifacts are not generated; Stage 3 was not audited. Use the isolated --stage3-only authoring route locally.\n");
  else console.log(`Stage 3: ${load("stage3-responses").spot_count} saved decisions, ${report.stage3.findings.length} findings.\n`);
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
