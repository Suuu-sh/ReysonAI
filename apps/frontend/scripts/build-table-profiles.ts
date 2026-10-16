#!/usr/bin/env node
// Precomputes open-range adjustments for every non-default table profile so the
// UI only reads saved data. Rerun after opening or response ranges change.
// Usage: OPEN_EV_SAMPLES=1500 node scripts/build-table-profiles.ts
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OPENING_POSITIONS, calculateOpenEvForPosition } from "./lib/open-ev-model.ts";
import { MARGIN_BB, WIDTH_BUDGET, compareOpenEv, limitToBudget } from "./exploit-open.ts";
import { PROFILE_LEVELS, applyTableProfile, isDefaultProfile, profileKey } from "../src/estimated/table-profile.ts";

const estimatedRoot = join(dirname(dirname(fileURLToPath(import.meta.url))), "src", "estimated");
const read: any = (file: any) : any => readFileSync(join(estimatedRoot, file));
const load = (file: any) : any => JSON.parse(read(file));
const samples = Number(process.env.OPEN_EV_SAMPLES ?? 1500);
const datasets = { opening: load("opening-ranges.json"), preflop: load("preflop-ranges.json"), threeBet: load("three-bet-responses.json"), fourBet: load("four-bet-responses.json"), fiveBet: load("five-bet-responses.json") };
const round3 = (value: any) : any => Number(value.toFixed(3));

const base = Object.fromEntries(OPENING_POSITIONS.map((hero: any) : any => [hero, calculateOpenEvForPosition({ hero, datasets, samples })]));
const profiles: any = {};
for (const call of PROFILE_LEVELS) for (const three_bet of PROFILE_LEVELS) {
  const profile: any = { call, three_bet };
  if (isDefaultProfile(profile)) continue;
  const adjusted = { ...datasets, preflop: applyTableProfile(datasets.preflop, profile) };
  profiles[profileKey(profile)] = Object.fromEntries(OPENING_POSITIONS.map((hero: any) : any => {
    const { add, drop } = limitToBudget(compareOpenEv(base[hero], calculateOpenEvForPosition({ hero, datasets: adjusted, samples })), base[hero]);
    return [hero, { add: add.map((row: any) : any => [row.hand, round3(row.shift_bb)]), drop: drop.map((row: any) : any => [row.hand, round3(row.shift_bb)]) }];
  }));
  console.log(`${profileKey(profile)} done`);
}

const hash = (file: any) : any => createHash("sha256").update(read(file)).digest("hex").slice(0, 12);
writeFileSync(join(estimatedRoot, "table-profile-adjustments.json"), `${JSON.stringify({
  metadata: {
    strategy_type: "ai_estimate_not_gto",
    model: "scripts/lib/open-ev-model.ts（近似、ソルバーではない）",
    samples,
    margin_bb: MARGIN_BB,
    width_budget: WIDTH_BUDGET,
    source_hashes: { "opening-ranges.json": hash("opening-ranges.json"), "preflop-ranges.json": hash("preflop-ranges.json") },
  },
  profiles,
}, null, 1)}\n`);
console.log("Wrote src/estimated/table-profile-adjustments.json");
