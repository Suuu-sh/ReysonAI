// Heads-up single-raised-pot flop spots for the local AI pilot: an opener O raises
// (2.5BB; SB 3.5BB), a later seat C calls and every other seat folds. One spot per
// saved open response in src/estimated/preflop-ranges.json (15 spots). Pure data so the
// browser and the Node scripts share the same geometry.
import responses from "../../src/estimated/preflop-ranges.json" with { type: "json" };
import { gameConfig, isInPosition, openSizeFor } from "../../src/estimated/sizing.js";

export const DEFAULT_SPOT_ID = "BTN_open_BB_call";
const BLINDS = { SB: 0.5, BB: 1 };
const round = value => Math.round(value * 100) / 100;

// The pilot tree keeps its original node names for compatibility: "btn_*" nodes are
// played by the in-position player (ip) and "bb_*" nodes by the out-of-position one (oop).
export function describeSpot(opener, caller, response = responses.spots.find(item => item.opener === opener && item.hero === caller)) {
  const { positions } = gameConfig;
  if (!positions.includes(opener) || !positions.includes(caller) || opener === "BB" ||
      positions.indexOf(caller) <= positions.indexOf(opener)) throw new Error(`Unsupported postflop spot: ${opener} → ${caller}`);
  const openBb = openSizeFor(opener);
  const deadBb = Object.entries(BLINDS).filter(([seat]) => seat !== opener && seat !== caller).reduce((sum, [, bb]) => sum + bb, 0);
  const ip = isInPosition(caller, opener) ? caller : opener;
  const id = `${opener}_open_${caller}_call`;
  return Object.freeze({
    id, opener, caller, ip, oop: ip === caller ? opener : caller,
    openingId: `${opener}_open`, responseId: `${caller}_vs_${opener}`,
    openBb, potBb: round(2 * openBb + deadBb), stackBb: round(gameConfig.stack_bb - openBb),
    // SB is saved as 3bet-or-fold (call 0% for every hand), so SB-call spots cannot occur:
    // they stay listed but have no range to generate, simulate or show.
    reachable: Boolean(response?.hands.some(row => row.call > 0)),
    // The first pilot keeps its original file names so the saved candidate, report and EV stay valid.
    slug: id === DEFAULT_SPOT_ID ? "btn-bb-srp-v1" : `${opener.toLowerCase()}-${caller.toLowerCase()}-srp-v1`,
  });
}

export const POSTFLOP_SPOTS = Object.freeze(responses.spots.map(spot => describeSpot(spot.opener, spot.hero, spot)));

export function spotById(id = DEFAULT_SPOT_ID) {
  const spot = POSTFLOP_SPOTS.find(item => item.id === id);
  if (!spot) throw new Error(`Unknown postflop spot: ${id}`);
  return spot;
}

export function spotFor(opener, caller) {
  return POSTFLOP_SPOTS.find(item => item.opener === opener && item.caller === caller) ?? null;
}
