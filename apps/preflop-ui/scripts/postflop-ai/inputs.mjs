import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { combosOf } from "../lib/equity.mjs";
import { gameConfig } from "../../src/estimated/sizing.js";
import { parseCards } from "./model.mjs";

export const root = fileURLToPath(new URL("../..", import.meta.url));
const read = name => JSON.parse(readFileSync(new URL(`../../src/estimated/${name}.json`, import.meta.url), "utf8"));
export const config = JSON.parse(readFileSync(new URL("../data/postflop-ai-pilot.json", import.meta.url), "utf8"));
const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function loadInputs() {
  const opening = read("opening-ranges").spots.find(spot => spot.id === "BTN_open");
  const response = read("preflop-ranges").spots.find(spot => spot.id === "BB_vs_BTN");
  if (!opening || !response || opening.open_size_bb !== 2.5 || response.open_size_bb !== 2.5 ||
      opening.effective_stack_bb !== 100 || response.effective_stack_bb !== 100 ||
      gameConfig.stack_bb !== 100 || gameConfig.ante_bb !== 0 ||
      gameConfig.rake.rate !== 0.05 || gameConfig.rake.cap_bb !== 3) throw new Error("BTN/BB source geometry changed");
  const fingerprint = sha({ opening, response, gameConfig, config });
  return { opening, response, config, fingerprint };
}

export function comboRange(rows, action, board) {
  const blocked = new Set(board);
  return rows.flatMap(row => {
    const weight = row[action] / 100;
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(`Invalid ${action} frequency: ${row.hand}`);
    return weight ? combosOf(row.hand).filter(combo => combo.every(card => !blocked.has(card))).map(combo => ({ combo, weight })) : [];
  });
}

export function boards() {
  if (config.boards.length !== 12 || config.boards.filter(board => board.split === "design").length !== 8 ||
      config.boards.filter(board => board.split === "holdout").length !== 4) throw new Error("Expected 8 design and 4 holdout boards");
  const unique = new Set();
  return config.boards.map(item => {
    const cards = parseCards(item.cards, 3);
    if (unique.has(item.cards)) throw new Error("Repeated representative flop");
    unique.add(item.cards);
    return { ...item, id: item.cards, cards };
  });
}

export function makeSampler(rows) {
  let total = 0;
  const cumulative = rows.map(row => (total += row.weight));
  if (!total) throw new Error("Empty sampled range");
  return random => {
    const target = random() * total;
    let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cumulative[mid] < target) lo = mid + 1; else hi = mid; }
    return rows[lo].combo;
  };
}

export function samplePair(btn, bb, random) {
  for (let tries = 0; tries < 10000; tries++) {
    const a = btn(random), b = bb(random);
    if (a.every(card => !b.includes(card))) return { BTN: a, BB: b };
  }
  throw new Error("No compatible BTN/BB combo pair");
}
