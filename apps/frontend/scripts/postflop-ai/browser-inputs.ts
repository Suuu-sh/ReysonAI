import type { FrequencyRow, Inputs, PostflopDatasets, SourceAction, SourceDataset, SourceHand, SourceSpot } from "./types.ts";
import type { WeightedCombo } from "../lib/equity.ts";
import type { MultiwaySpot } from "./spots.ts";
import { multiwayInputData } from "./multiway-inputs.mjs";
import { combosOf } from "../lib/equity.ts";
import { gameConfig } from "../../src/estimated/sizing.ts";
import { parseCards } from "./model.ts";
import { DEFAULT_SPOT_ID, createPostflopSpots } from "./spots-core.ts";
import pilotConfig from "../data/postflop-ai-pilot.json" with { type: "json" };

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotateRight = (value: number, amount: number): number => (value >>> amount) | (value << (32 - amount));

// Synchronous SHA-256 for fingerprints used by the Node and browser compute paths.
export function sha256(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const bitLength = BigInt(bytes.length) * 8n;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  for (let index = 0; index < 8; index++) padded[paddedLength - 1 - index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);

  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) {
      const start = offset + index * 4;
      words[index] = ((padded[start] << 24) | (padded[start + 1] << 16) | (padded[start + 2] << 8) | padded[start + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index++) {
      const x = words[index - 15], y = words[index - 2];
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index++) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choose + SHA256_K[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map(value => value.toString(16).padStart(8, "0")).join("");
}

export const sha = (value: unknown): string => sha256(JSON.stringify(value));

const LATER_KEYS = ["later_streets", "later_raise_multiplier", "later_all_in_merge_ratio"];
const NON_FLOP_KEYS = [...LATER_KEYS, "defence_realization", "river_allin_max_pot_ratio", "max_raises_per_street"];
const flopConfig = () => Object.fromEntries(Object.entries(pilotConfig).filter(([key]) => !NON_FLOP_KEYS.includes(key)));
const getDataset = (datasets: PostflopDatasets, key: string, ...aliases: string[]): SourceDataset | null => {
  for (const name of [key, ...aliases]) if (datasets?.[name]) return datasets[name];
  return null;
};
const findSpot = (dataset: SourceDataset | null, id: string | undefined): SourceSpot | undefined => dataset?.spots?.find(item => item.id === id);
const freqRows = (rows: SourceHand[], action: SourceAction): FrequencyRow[] => rows.map(row => ({ hand: row.hand, freq: row[action] }));

function productRows(factors: readonly (readonly [SourceHand[], SourceAction])[]): FrequencyRow[] {
  const maps = factors.map(([rows, action]) => new Map(rows.map(row => [row.hand, row[action]])));
  const hands = factors[0][0].map(row => row.hand);
  if (maps.some(map => map.size !== hands.length || hands.some(hand => !Number.isFinite(map.get(hand))))) {
    throw new Error("Postflop source hand rows differ");
  }
  return hands.map(hand => ({ hand, freq: maps.reduce((product, map) => product * map.get(hand)! / 100, 100) }));
}

export function buildInputs(spotId: string = DEFAULT_SPOT_ID, datasets: PostflopDatasets = {}): Inputs {
  const spot = createPostflopSpots(datasets).spotById(spotId);
  if (!spot.reachable) throw new Error(`${spot.id} is unreachable: the saved ${spot.responseId} range never calls`);

  if (spot.history) {
    const { sources, seatRows } = multiwayInputData(spot as MultiwaySpot, file => datasets[file]);
    const fingerprint = sha({ spot, sources, gameConfig, config: flopConfig() });
    return { spot, sources, config: pilotConfig, fingerprint, seatRows };
  }

  const openingData = getDataset(datasets, "opening", "openingRanges", "opening-ranges");
  const responseData = getDataset(datasets, "responses", "preflopRanges", "preflop-ranges");
  const threeBetData = getDataset(datasets, "threeBets", "threeBetResponses", "three-bet-responses");
  const fourBetData = getDataset(datasets, "fourBets", "fourBetResponses", "four-bet-responses");
  const limpData = getDataset(datasets, "limp", "limpResponses", "limp-responses");
  const opening = findSpot(openingData, spot.openingId);
  const baseOk = opening && opening.hero === spot.opener && (spot.kind === "limp" || opening.open_size_bb === spot.openBb) && opening.effective_stack_bb === 100 &&
    gameConfig.stack_bb === 100 && gameConfig.ante_bb === 0 && gameConfig.rake.rate === 0.05 && gameConfig.rake.cap_bb === 3;
  const config = pilotConfig;

  if (spot.kind === "srp") {
    const response = findSpot(responseData, spot.responseId);
    if (!baseOk || !response || response.opener !== spot.opener || response.hero !== spot.caller ||
        response.open_size_bb !== spot.openBb || response.effective_stack_bb !== 100) throw new Error(`${spot.id} source geometry changed`);
    const fingerprint = spot.tree === "oop_checks"
      ? sha({ opening, response, gameConfig, config: flopConfig() })
      : sha({ spot, opening, response, gameConfig, config: flopConfig() });
    const seatRows = { [spot.opener]: freqRows(opening.hands, "open"), [spot.caller]: freqRows(response.hands, "call") };
    return { spot, opening, response, config, fingerprint, seatRows };
  }

  if (spot.kind === "4bp") {
    const response = findSpot(fourBetData, spot.responseId);
    const threeBetResponse = findSpot(threeBetData, spot.fourBetId);
    const threeBet = findSpot(responseData, spot.threeBetId);
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

  if (spot.kind === "limp") {
    const limp = limpData;
    const byId = (id: string) => findSpot(limp, id);
    const bbLimp = byId("BB_vs_SB_limp"), iso = byId("SB_vs_BB_iso"), reraise = byId("BB_vs_SB_limp_reraise");
    if (!baseOk || !bbLimp || !iso || !reraise ||
        opening.hands.some(row => row.limp > 0 && row.limp_size_bb !== 1) || bbLimp.raise_size_bb !== 3.5 ||
        iso.iso_size_bb !== 3.5 || iso.raise_to_bb !== 10.5 || reraise.iso_size_bb !== 3.5 || reraise.limp_reraise_size_bb !== 10.5) {
      throw new Error(`${spot.id} source geometry changed`);
    }
    const deep = getDataset(datasets, "limpDeep", "limpDeepResponses", "limp-deep-responses");
    const fourBet = findSpot(deep, "SB_vs_BB_limp_four_bet");
    if (spot.responseId === "SB_vs_BB_limp_four_bet" && (!fourBet || fourBet.limp_reraise_size_bb !== 10.5 || reraise.four_bet_size_bb !== fourBet.four_bet_size_bb)) {
      throw new Error(`${spot.id} source geometry changed`);
    }
    const files: Record<string, SourceDataset | null> = { "opening-ranges": { spots: [opening] }, "limp-responses": limp, "limp-deep-responses": deep ?? { spots: [] } };
    const sources: Record<string, SourceSpot> = {};
    const seatRows = Object.fromEntries(Object.entries(spot.ranges).map(([seat, factors]) => [seat, productRows(factors.map(([file, id, action]) => {
      const source = files[file]!.spots.find(item => item.id === id);
      if (!source) throw new Error(`${spot.id} source ${id} is missing`);
      sources[id] = source;
      return [source.hands, action];
    }))]));
    const response = sources[spot.responseId];
    const fingerprint = sha({ spot, sources, gameConfig, config: flopConfig() });
    return { spot, opening, response, config, fingerprint, seatRows };
  }

  const response = findSpot(threeBetData, spot.responseId);
  const threeBet = findSpot(responseData, spot.threeBetId);
  if (!baseOk || !response || !threeBet || response.opener !== spot.opener || response.three_bettor !== spot.threeBettor ||
      response.three_bet_size_bb !== spot.threeBetBb || response.effective_stack_bb !== 100 ||
      threeBet.opener !== spot.opener || threeBet.hero !== spot.threeBettor ||
      threeBet.hands.some(row => row.three_bet > 0 && row.three_bet_size_bb !== spot.threeBetBb)) throw new Error(`${spot.id} source geometry changed`);
  const fingerprint = sha({ spot, opening, response, threeBet, gameConfig, config: flopConfig() });
  const calls = new Map(response.hands.map(row => [row.hand, row.call]));
  if (calls.size !== opening.hands.length || opening.hands.some(row => !calls.has(row.hand))) throw new Error(`${spot.id} hand rows differ`);
  const seatRows = {
    [spot.opener]: opening.hands.map(row => ({ hand: row.hand, freq: row.open * calls.get(row.hand)! / 100 })),
    [spot.threeBettor]: freqRows(threeBet.hands, "three_bet"),
  };
  return { spot, opening, response, threeBet, config, fingerprint, seatRows };
}

export function comboRange<K extends string>(rows: readonly ({ hand: string } & Record<K, number>)[], action: K, board: readonly number[]): WeightedCombo[] {
  const blocked = new Set(board);
  return rows.flatMap(row => {
    const weight = row[action] / 100;
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error(`Invalid ${action} frequency: ${row.hand}`);
    return weight ? combosOf(row.hand).filter(combo => combo.every(card => !blocked.has(card))).map(combo => ({ combo, weight })) : [];
  });
}

export function seatRange(inputs: Inputs, seat: string, board: readonly number[]): WeightedCombo[] {
  const rows = inputs.seatRows[seat];
  if (!rows) throw new Error(`${seat} is not in ${inputs.spot.id}`);
  return comboRange(rows, "freq", board);
}

export function boards() {
  if (pilotConfig.boards.length !== 12 || pilotConfig.boards.filter(board => board.split === "design").length !== 8 ||
      pilotConfig.boards.filter(board => board.split === "holdout").length !== 4) throw new Error("Expected 8 design and 4 holdout boards");
  const unique = new Set<string>();
  return pilotConfig.boards.map(item => {
    const cards = parseCards(item.cards, 3);
    if (unique.has(item.cards)) throw new Error("Repeated representative flop");
    unique.add(item.cards);
    return { ...item, id: item.cards, cards };
  });
}
