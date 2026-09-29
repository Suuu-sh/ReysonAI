#!/usr/bin/env node
// Records one benchmark entry per strategy version in benchmarks/history.jsonl
// and prints the change from the previous entry.
// Usage: node scripts/benchmark-record.mjs --version v1 [--note "..."] [--tolerance 3] [--dry-run]
// Only aggregates are committed: reference frequencies stay in .local/benchmarks,
// so no per-spot numbers that would let the reference be reconstructed.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { DATASET_NAMES, compareToReferences, loadReferences, loadSpots } from "./lib/benchmark.mjs";
import { OPENING_POSITIONS, calculateOpenEvForPosition, summarizeOpenEv } from "./lib/open-ev-model.mjs";

const root = new URL("../", import.meta.url);
const historyUrl = new URL("benchmarks/history.jsonl", root);
const round = (value, digits = 2) => Number(value.toFixed(digits));

function flag(name, fallback) {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : fallback;
}

export function readHistory(url = historyUrl) {
  if (!existsSync(url)) return [];
  return readFileSync(url, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
}

export function summarizeAgreement(rows, tolerance) {
  const compared = rows.filter(row => row.ours !== null);
  const diffs = compared.map(row => Math.abs(row.diff));
  return {
    tolerance_pt: tolerance,
    spots_compared: new Set(compared.map(row => row.spot_id)).size,
    actions_compared: compared.length,
    mean_abs_diff_pt: diffs.length ? round(diffs.reduce((a, b) => a + b, 0) / diffs.length) : null,
    max_abs_diff_pt: diffs.length ? round(Math.max(...diffs)) : null,
    outside_tolerance: diffs.filter(diff => diff > tolerance).length,
    spots_outside_tolerance: [...new Set(compared.filter(row => Math.abs(row.diff) > tolerance).map(row => row.spot_id))].sort(),
    spots_missing: rows.filter(row => row.ours === null).map(row => row.spot_id).sort(),
  };
}

function git(args) {
  try { return execFileSync("git", args, { cwd: new URL(".", root), encoding: "utf8" }).trim(); } catch { return null; }
}

function datasetHashes() {
  return Object.fromEntries(DATASET_NAMES
    .filter(name => existsSync(new URL(`src/estimated/${name}.json`, root)))
    .map(name => [name, createHash("sha256").update(readFileSync(new URL(`src/estimated/${name}.json`, root))).digest("hex").slice(0, 12)]));
}

function openEvSummary(samples) {
  const load = name => JSON.parse(readFileSync(new URL(`src/estimated/${name}.json`, root)));
  const datasets = { opening: load("opening-ranges"), preflop: load("preflop-ranges"), threeBet: load("three-bet-responses"), fourBet: load("four-bet-responses"), fiveBet: load("five-bet-responses") };
  return Object.fromEntries(OPENING_POSITIONS.map(hero => {
    const summary = summarizeOpenEv(calculateOpenEvForPosition({ hero, datasets, samples }));
    return [hero, {
      open_width_pct: round(summary.current_open_width_pct),
      positive_ev_width_pct: round(summary.positive_ev_only_width_pct),
      folded_but_positive: summary.folded_but_positive.length,
      opened_but_negative: summary.opened_but_negative.length,
    }];
  }));
}

const delta = (now, before) => (now === null || before === null || before === undefined) ? "" : ` (${now - before >= 0 ? "+" : ""}${round(now - before)})`;

function main() {
  const version = flag("--version");
  if (!version) throw new Error("--version を指定してください（例: v1）。");
  const history = readHistory();
  if (history.some(entry => entry.version === version)) throw new Error(`${version} は記録済みです。新しいバージョン名を使ってください。`);
  const tolerance = Number(flag("--tolerance", 3));
  const samples = Number(process.env.OPEN_EV_SAMPLES ?? 1500);

  const entry = {
    version,
    recorded_at: new Date().toISOString(),
    note: flag("--note", ""),
    git: { commit: git(["rev-parse", "--short", "HEAD"]), dirty: Boolean(git(["status", "--porcelain", "--", "src/estimated"])) },
    datasets: datasetHashes(),
    reference_agreement: summarizeAgreement(compareToReferences(loadSpots(root), loadReferences(root)), tolerance),
    open_ev: { samples, model: "scripts/lib/open-ev-model.mjs（近似、ソルバーではない）", positions: openEvSummary(samples) },
  };

  const previous = history.at(-1);
  const a = entry.reference_agreement;
  const p = previous?.reference_agreement ?? {};
  console.log(`## ${version}${previous ? ` vs ${previous.version}` : "（初回）"}`);
  console.log(`参考値との一致: ${a.spots_compared}局面 / 平均差 ${a.mean_abs_diff_pt}pt${delta(a.mean_abs_diff_pt, p.mean_abs_diff_pt)} / 最大 ${a.max_abs_diff_pt}pt${delta(a.max_abs_diff_pt, p.max_abs_diff_pt)} / ±${tolerance}pt超 ${a.outside_tolerance}${delta(a.outside_tolerance, p.outside_tolerance)}`);
  if (a.spots_outside_tolerance.length) console.log(`許容外の局面: ${a.spots_outside_tolerance.join(", ")}`);
  console.log("\n| Position | オープン幅 | +EV幅 | 降りている+EV | 開いている−EV |\n|:--|--:|--:|--:|--:|");
  for (const [position, now] of Object.entries(entry.open_ev.positions)) {
    const before = previous?.open_ev?.positions?.[position] ?? {};
    console.log(`| ${position} | ${now.open_width_pct}%${delta(now.open_width_pct, before.open_width_pct)} | ${now.positive_ev_width_pct}%${delta(now.positive_ev_width_pct, before.positive_ev_width_pct)} | ${now.folded_but_positive}${delta(now.folded_but_positive, before.folded_but_positive)} | ${now.opened_but_negative}${delta(now.opened_but_negative, before.opened_but_negative)} |`);
  }
  if (entry.git.dirty) console.log("\n注意: src/estimated に未コミットの変更があります。データのハッシュで版を特定してください。");
  if (process.argv.includes("--dry-run")) { console.log("\n--dry-run のため記録していません。"); return; }
  appendFileSync(historyUrl, `${JSON.stringify(entry)}\n`);
  console.log(`\n記録しました: benchmarks/history.jsonl`);
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  try { main(); } catch (error) { console.error(`benchmark-record: ${error.message}`); process.exitCode = 1; }
}
