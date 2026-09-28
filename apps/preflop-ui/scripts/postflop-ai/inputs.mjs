import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { combosOf } from "../lib/equity.mjs";
import { gameConfig } from "../../src/estimated/sizing.ts";
import { parseCards } from "./model.mjs";
import { DEFAULT_SPOT_ID, spotById } from "./spots.mjs";

export const root = fileURLToPath(new URL("../..", import.meta.url));
const read = name => JSON.parse(readFileSync(new URL(`../../src/estimated/${name}.json`, import.meta.url), "utf8"));
export const config = JSON.parse(readFileSync(new URL("../data/postflop-ai-pilot.json", import.meta.url), "utf8"));
const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const LATER_KEYS = ["later_streets", "later_raise_multiplier", "later_all_in_merge_ratio"];
// Flop candidate identity predates the later-street tree. Exclude only its new sizing
// keys, keeping the original key order and every original config field in the hash.
const flopConfig = () => Object.fromEntries(Object.entries(config).filter(([key]) =>
  !LATER_KEYS.includes(key)));
// Results, unlike flop candidates, must be invalidated when later sizing changes.
export const laterSizingHash = () => sha(Object.fromEntries(LATER_KEYS.map(key => [key, config[key]])));

// Local-only artifacts of one spot under .local/postflop-ai/.
export function artifactPaths(spot) {
  const base = join(root, ".local/postflop-ai", spot.slug);
  return { candidate: `${base}-policy.json`, laterCandidate: `${base}-later-policy.json`, report: `${base}-report.json`, handEv: `${base}-hand-ev.json` };
}

export function loadInputs(spotId = DEFAULT_SPOT_ID) {
  const spot = spotById(spotId);
  if (!spot.reachable) throw new Error(`${spot.id} is unreachable: the saved ${spot.responseId} range never calls`);
  const opening = read("opening-ranges").spots.find(item => item.id === spot.openingId);
  const baseOk = opening && opening.hero === spot.opener && (spot.kind === "limp" || opening.open_size_bb === spot.openBb) && opening.effective_stack_bb === 100 &&
    gameConfig.stack_bb === 100 && gameConfig.ante_bb === 0 && gameConfig.rake.rate === 0.05 && gameConfig.rake.cap_bb === 3;
  if (spot.kind === "srp") {
    const response = read("preflop-ranges").spots.find(item => item.id === spot.responseId);
    if (!baseOk || !response || response.opener !== spot.opener || response.hero !== spot.caller ||
        response.open_size_bb !== spot.openBb || response.effective_stack_bb !== 100) throw new Error(`${spot.id} source geometry changed`);
    // The single-raised pots with the first pilot's tree keep its fingerprint shape; the
    // opening and response spots identify the spot. Other spots also hash the spot itself.
    const fingerprint = spot.tree === "oop_checks" ? sha({ opening, response, gameConfig, config: flopConfig() }) : sha({ spot, opening, response, gameConfig, config: flopConfig() });
    const seatRows = { [spot.opener]: freqRows(opening.hands, "open"), [spot.caller]: freqRows(response.hands, "call") };
    return { spot, opening, response, config, fingerprint, seatRows };
  }
  if (spot.kind === "4bp") return loadFourBetInputs(spot, opening, baseOk);
  if (spot.kind === "limp") return loadLimpInputs(spot, opening, baseOk);
  const response = read("three-bet-responses").spots.find(item => item.id === spot.responseId);
  const threeBet = read("preflop-ranges").spots.find(item => item.id === spot.threeBetId);
  if (!baseOk || !response || !threeBet || response.opener !== spot.opener || response.three_bettor !== spot.threeBettor ||
      response.three_bet_size_bb !== spot.threeBetBb || response.effective_stack_bb !== 100 ||
      threeBet.opener !== spot.opener || threeBet.hero !== spot.threeBettor ||
      threeBet.hands.some(row => row.three_bet > 0 && row.three_bet_size_bb !== spot.threeBetBb)) throw new Error(`${spot.id} source geometry changed`);
  const fingerprint = sha({ spot, opening, response, threeBet, gameConfig, config: flopConfig() });
  // The opener reaches the flop with its open frequency × its call frequency versus the 3bet.
  const calls = new Map(response.hands.map(row => [row.hand, row.call]));
  if (calls.size !== opening.hands.length || opening.hands.some(row => !calls.has(row.hand))) throw new Error(`${spot.id} hand rows differ`);
  const seatRows = {
    [spot.opener]: opening.hands.map(row => ({ hand: row.hand, freq: row.open * calls.get(row.hand) / 100 })),
    [spot.threeBettor]: freqRows(threeBet.hands, "three_bet"),
  };
  return { spot, opening, response, threeBet, config, fingerprint, seatRows };
}

const freqRows = (rows, action) => rows.map(row => ({ hand: row.hand, freq: row[action] }));

// Per-hand product of saved frequencies (percent) from several spots, in the first spot's hand order.
function productRows(factors) {
  const maps = factors.map(([rows, action]) => new Map(rows.map(row => [row.hand, row[action]])));
  const hands = factors[0][0].map(row => row.hand);
  if (maps.some(map => map.size !== hands.length || hands.some(hand => !Number.isFinite(map.get(hand))))) throw new Error("Postflop source hand rows differ");
  return hands.map(hand => ({ hand, freq: maps.reduce((product, map) => product * map.get(hand) / 100, 100) }));
}

// O opens, X 3bets, O 4bets, X calls: O = open × 4bet versus the 3bet, X = 3bet × call versus the 4bet.
function loadFourBetInputs(spot, opening, baseOk) {
  const response = read("four-bet-responses").spots.find(item => item.id === spot.responseId);
  const threeBetResponse = read("three-bet-responses").spots.find(item => item.id === spot.fourBetId);
  const threeBet = read("preflop-ranges").spots.find(item => item.id === spot.threeBetId);
  if (!baseOk || !response || !threeBetResponse || !threeBet ||
      response.opener !== spot.opener || response.hero !== spot.threeBettor || response.effective_stack_bb !== 100 ||
      response.three_bet_size_bb !== spot.threeBetBb || response.four_bet_size_bb !== spot.fourBetBb ||
      response.source_three_bet_response_id !== threeBetResponse.id || response.source_response_id !== threeBet.id ||
      threeBetResponse.three_bet_size_bb !== spot.threeBetBb || threeBetResponse.four_bet_size_bb !== spot.fourBetBb ||
      threeBetResponse.hands.some(row => row.four_bet > 0 && row.four_bet_size_bb !== spot.fourBetBb) ||
      threeBet.hands.some(row => row.three_bet > 0 && row.three_bet_size_bb !== spot.threeBetBb)) throw new Error(`${spot.id} source geometry changed`);
  const seatRows = {
    [spot.opener]: productRows([[opening.hands, "open"], [threeBetResponse.hands, "four_bet"]]),
    [spot.threeBettor]: productRows([[threeBet.hands, "three_bet"], [response.hands, "call"]]),
  };
  if (Object.values(seatRows).some(rows => !rows.some(row => row.freq > 0))) throw new Error(`${spot.id} is unreachable: a saved range never reaches the flop`);
  const fingerprint = sha({ spot, opening, response, threeBetResponse, threeBet, gameConfig, config: flopConfig() });
  return { spot, opening, response, threeBetResponse, threeBet, config, fingerprint, seatRows };
}

// Limped pots: each seat's factors are [file, spot id, action] (spots.mjs).
function loadLimpInputs(spot, opening, baseOk) {
  const limp = read("limp-responses");
  const byId = id => limp.spots.find(item => item.id === id);
  const bbLimp = byId("BB_vs_SB_limp"), iso = byId("SB_vs_BB_iso"), reraise = byId("BB_vs_SB_limp_reraise");
  if (!baseOk || !bbLimp || !iso || !reraise ||
      opening.hands.some(row => row.limp > 0 && row.limp_size_bb !== 1) || bbLimp.raise_size_bb !== 3.5 ||
      iso.iso_size_bb !== 3.5 || iso.raise_to_bb !== 10.5 || reraise.iso_size_bb !== 3.5 || reraise.limp_reraise_size_bb !== 10.5) {
    throw new Error(`${spot.id} source geometry changed`);
  }
  const files = { "opening-ranges": { spots: [opening] }, "limp-responses": limp };
  const sources = {};
  const seatRows = Object.fromEntries(Object.entries(spot.ranges).map(([seat, factors]) => [seat, productRows(factors.map(([file, id, action]) => {
    const source = files[file].spots.find(item => item.id === id);
    if (!source) throw new Error(`${spot.id} source ${id} is missing`);
    sources[id] = source;
    return [source.hands, action];
  }))]));
  const response = sources[spot.responseId];
  const fingerprint = sha({ spot, sources, gameConfig, config: flopConfig() });
  return { spot, opening, response, config, fingerprint, seatRows };
}

export function comboRange(rows, action, board) {
  const blocked = new Set(board);
  return rows.flatMap(row => {
    const weight = row[action] / 100;
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(`Invalid ${action} frequency: ${row.hand}`);
    return weight ? combosOf(row.hand).filter(combo => combo.every(card => !blocked.has(card))).map(combo => ({ combo, weight })) : [];
  });
}

// A seat's flop range (weights = the saved preflop frequencies that reach the flop).
export function seatRange(inputs, seat, board) {
  const rows = inputs.seatRows[seat];
  if (!rows) throw new Error(`${seat} is not in ${inputs.spot.id}`);
  return comboRange(rows, "freq", board);
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

// Samples the in-position combo first, then the out-of-position one (the original BTN/BB order).
export function samplePair(ip, oop, random, spot = spotById()) {
  for (let tries = 0; tries < 10000; tries++) {
    const a = ip(random), b = oop(random);
    if (a.every(card => !b.includes(card))) return { [spot.ip]: a, [spot.oop]: b };
  }
  throw new Error(`No compatible ${spot.ip}/${spot.oop} combo pair`);
}
