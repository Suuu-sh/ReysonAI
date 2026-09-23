#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OPENING_POSITIONS, SAMPLE_COUNT, calculateOpenEvForPosition, summarizeOpenEv } from "./lib/open-ev-model.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const inputRoot = join(appRoot, "src", "estimated");
const outputRoot = join(appRoot, ".local", "open-ev");
const load = file => JSON.parse(readFileSync(join(inputRoot, file), "utf8"));

function formatPct(value) { return `${value.toFixed(1)}%`; }
function formatEv(row) { return `${row.hand} (${row.delta_ev_bb > 0 ? "+" : ""}${row.delta_ev_bb.toFixed(3)}bb)`; }
function formatList(rows) { return rows.length ? rows.map(formatEv).join("<br>") : "—"; }

function printSummary(summaries, samples) {
  console.log(`\n## Open EV summary — ${samples.toLocaleString("en-US")} Monte Carlo samples`);
  console.log("\nApproximation only (not a solver); first non-folding seat is modeled and all later seats are assumed to fold. No rake is modeled. +EV-only width opens each positive-EV hand class at 100%.\n");
  console.log("| Position | Current open width (freq-weighted) | ΔEV > 0 only (100%) |");
  console.log("|:--|--:|--:|");
  for (const item of summaries) {
    console.log(`| ${item.position} | ${formatPct(item.current_open_width_pct)} | ${formatPct(item.positive_ev_only_width_pct)} |`);
  }
  console.log("\n| Position | Folded (open < 50%, ΔEV ≥ +0.05bb) | Open (open ≥ 50%, ΔEV ≤ −0.05bb) |");
  console.log("|:--|:--|:--|");
  for (const item of summaries) {
    console.log(`| ${item.position} | ${formatList(item.folded_but_positive)} | ${formatList(item.opened_but_negative)} |`);
  }
}

function main() {
  const requestedPositions = process.argv.slice(2).map(value => value.toUpperCase());
  const positions = requestedPositions.length ? requestedPositions : OPENING_POSITIONS;
  const unknown = positions.filter(position => !OPENING_POSITIONS.includes(position));
  if (unknown.length) throw new Error(`Unsupported position(s): ${unknown.join(", ")}. Choose ${OPENING_POSITIONS.join(", ")}.`);
  if (new Set(positions).size !== positions.length) throw new Error("Do not specify the same position more than once.");
  const samples = process.env.OPEN_EV_SAMPLES === undefined ? SAMPLE_COUNT : Number(process.env.OPEN_EV_SAMPLES);
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("OPEN_EV_SAMPLES must be a positive integer.");

  const datasets = {
    opening: load("opening-ranges.json"),
    preflop: load("preflop-ranges.json"),
    threeBet: load("three-bet-responses.json"),
    fourBet: load("four-bet-responses.json"),
    fiveBet: load("five-bet-responses.json"),
  };
  mkdirSync(outputRoot, { recursive: true });
  const summaries = [];
  for (const hero of positions) {
    const result = calculateOpenEvForPosition({ hero, datasets, samples });
    const file = join(outputRoot, `${hero.toLowerCase()}.json`);
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`Wrote ${file}`);
    summaries.push(summarizeOpenEv(result));
  }
  printSummary(summaries, samples);
}

try {
  main();
} catch (error) {
  console.error(`open-ev: ${error.message}`);
  process.exitCode = 1;
}
