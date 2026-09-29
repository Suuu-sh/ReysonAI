// One-off, reproducible audit fallback. Not a strategy or a solver ranking.
// Usage: node scripts/generate-hand-strength.mjs
import { writeFileSync } from "node:fs";
import { hands } from "../src/data.ts";
import { equityVsRange, seedFor, seededRandom, weightedRange } from "./lib/equity.mjs";

const samples = 30000;
const seedPrefix = "range-balance:random:v1:";
const range = weightedRange(hands.map(hand => ({ hand, weight: 1 })));
const equity = Object.fromEntries(hands.map(hand => [hand,
  equityVsRange(hand, range, samples, seededRandom(seedFor(seedPrefix + hand))),
]));
writeFileSync(new URL("../src/estimated/hand-strength.json", import.meta.url), JSON.stringify({
  method: "scripts/lib/equity.mjs equityVsRange; uniform random opponent; showdown equity including split pots",
  samples_per_hand: samples,
  seed: `seedFor(${seedPrefix}<hand>), seededRandom`,
  equity,
}, null, 2) + "\n");
console.log(`Generated ${hands.length} fixed-seed random-opponent equities (${samples} samples per hand)`);
