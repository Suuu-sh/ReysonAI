import { adjustedInputOptions, finalizeInputs, inputStructureHash } from "./input-options.ts";
import { profileArtifactKey } from "./candidate-source.ts";
import { multiwayInputData } from "./multiway-inputs.mjs";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { combosOf } from "../lib/equity.ts";
import { gameConfig } from "../../src/estimated/sizing.ts";
import { parseCards } from "./model.ts";
import { DEFAULT_SPOT_ID, spotById } from "./spots.ts";
import pilotConfig from "../data/postflop-ai-pilot.json" with { type: "json" };

// The edge worker (apps/backend) has no filesystem: it installs a source that
// serves bundled range JSON and artifacts preloaded from D1. Node keeps reading files, so
// a running dev server still sees range and artifact edits.
let source = null;
export function useArtifactSource(next) { const previous = source; source = next; return previous; }

export const root = (() => { try { return fileURLToPath(new URL("../..", import.meta.url)); } catch { return ""; } })();
const read = name => source ? source.ranges[name] : JSON.parse(readFileSync(new URL(`../../src/estimated/${name}.json`, import.meta.url), "utf8"));
export const config = pilotConfig;
const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const LATER_KEYS = ["later_streets", "later_raise_multiplier", "later_all_in_merge_ratio"];
// Flop candidate identity predates the later-street tree. Exclude only its new sizing
// keys, keeping the original key order and every original config field in the hash.
// The computed-defence constants (defence.ts) are not part of any candidate's identity either.
// The raise-chain depth (max_raises_per_street) is not part of any identity either: saved policies stay valid.
const NON_FLOP_KEYS = [...LATER_KEYS, "defence_realization", "river_allin_max_pot_ratio", "max_raises_per_street"];
const flopConfig = () => Object.fromEntries(Object.entries(config).filter(([key]) =>
  !NON_FLOP_KEYS.includes(key)));
// Results, unlike flop candidates, must be invalidated when later sizing changes.
export const laterSizingHash = () => sha(Object.fromEntries(LATER_KEYS.map(key => [key, config[key]])));

// Published artifacts of one spot (policies and simulation report) live in git under
// scripts/data/postflop-ai/policies/ and reach D1 through CI on main; offline research
// artifacts (hand EV) stay local under .local/postflop-ai/.
export const POLICY_DIR = "scripts/data/postflop-ai/policies";
export function artifactPaths(spot, { profile = "standard", role } = {}) {
  if (profile !== "standard") return Object.fromEntries(["candidate", "laterCandidate"].map(kind =>
    [kind, join(root, ".local/postflop-ai", `${profileArtifactKey(spot, kind, profile, role)}.json`)]));
  const base = join(root, POLICY_DIR, spot.slug), local = join(root, ".local/postflop-ai", spot.slug);
  return { candidate: `${base}-policy.json`, laterCandidate: `${base}-later-policy.json`, report: `${base}-report.json`,
    handEv: `${local}-hand-ev.json`, laterHandEv: `${local}-later-hand-ev.json` };
}

// One parsed artifact of a spot (a key of artifactPaths), or null when it does not exist.
export function readArtifact(spot, kind, options = {}) {
  if (options.profile && options.profile !== "standard") {
    if (!["candidate", "laterCandidate"].includes(kind)) throw new Error("Profile mode has no published simulation/EV artifacts");
    const key = profileArtifactKey(spot, kind, options.profile, options.role);
    // A D1-backed adapter must resolve this exact artifact key. An old adapter
    // without profileArtifact yields missing, never the standard policy.
    if (source) return source.profileArtifact?.(key) ?? null;
  } else if (source) return source.artifact(spot, kind) ?? null;
  const path = artifactPaths(spot, options)[kind];
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

// Like readArtifact, but a missing file is an ENOENT error (the local view maps it to 404).
export function requireArtifact(spot, kind, options = {}) {
  const data = readArtifact(spot, kind, options);
  if (data) return data;
  const profile = options.profile && options.profile !== "standard";
  const error = new Error(profile ? `${profileArtifactKey(spot, kind, options.profile, options.role)}: profile policy is not generated` : `${spot.slug}: ${kind} is missing`);
  error.code = profile ? "PROFILE_POLICY_MISSING" : "ENOENT";
  throw error;
}

export function loadInputs(spotId = DEFAULT_SPOT_ID, options = {}) {
  const base = loadBaseInputs(spotId, adjustedInputOptions(options));
  return finalizeInputs(base, options, read, sha, inputStructureHash(base, gameConfig, flopConfig(), sha));
}

function loadBaseInputs(spotId, allowUnreachable = false) {
  const spot = spotById(spotId);
  if (!spot.reachable && !allowUnreachable) throw new Error(`${spot.id} is unreachable: the saved ${spot.responseId} range never calls`);
  if ("history" in spot) {
    const { sources, seatRows } = multiwayInputData(spot, read);
    const fingerprint = sha({ spot, sources, gameConfig, config: flopConfig() });
    return { spot, sources, config, fingerprint, seatRows };
  }
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
  if (spot.kind === "4bp") return loadFourBetInputs(spot, opening, baseOk, allowUnreachable);
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
function loadFourBetInputs(spot, opening, baseOk, allowUnreachable = false) {
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
  if (!allowUnreachable && Object.values(seatRows).some(rows => !rows.some(row => row.freq > 0))) throw new Error(`${spot.id} is unreachable: a saved range never reaches the flop`);
  const fingerprint = sha({ spot, opening, response, threeBetResponse, threeBet, gameConfig, config: flopConfig() });
  return { spot, opening, response, threeBetResponse, threeBet, config, fingerprint, seatRows };
}

// Limped pots: each seat's factors are [file, spot id, action] (spots.ts).
function loadLimpInputs(spot, opening, baseOk) {
  const limp = read("limp-responses");
  const byId = id => limp.spots.find(item => item.id === id);
  const bbLimp = byId("BB_vs_SB_limp"), iso = byId("SB_vs_BB_iso"), reraise = byId("BB_vs_SB_limp_reraise");
  if (!baseOk || !bbLimp || !iso || !reraise ||
      opening.hands.some(row => row.limp > 0 && row.limp_size_bb !== 1) || bbLimp.raise_size_bb !== 3.5 ||
      iso.iso_size_bb !== 3.5 || iso.raise_to_bb !== 10.5 || reraise.iso_size_bb !== 3.5 || reraise.limp_reraise_size_bb !== 10.5) {
    throw new Error(`${spot.id} source geometry changed`);
  }
  const deep = read("limp-deep-responses");
  const fourBet = deep.spots.find(item => item.id === "SB_vs_BB_limp_four_bet");
  if (spot.responseId === "SB_vs_BB_limp_four_bet" && (!fourBet || fourBet.limp_reraise_size_bb !== 10.5 || reraise.four_bet_size_bb !== fourBet.four_bet_size_bb)) {
    throw new Error(`${spot.id} source geometry changed`);
  }
  const files = { "opening-ranges": { spots: [opening] }, "limp-responses": limp, "limp-deep-responses": deep };
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
