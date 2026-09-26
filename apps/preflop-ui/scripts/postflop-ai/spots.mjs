// Heads-up flop spots of the local AI pilot. Pure data so the browser and the Node scripts
// share the same geometry.
//
// Single-raised pots ("srp", 15): an opener O raises (2.5BB; SB 3.5BB), a later seat C calls
//   and every other seat folds — one per open response in preflop-ranges.json.
// 3bet pots ("3bp", 15): O opens, a later seat X 3bets (the saved size), O calls and every
//   other seat folds — one per spot in three-bet-responses.json.
//
// The flop tree depends on who made the last preflop raise: if that player is out of
// position the tree is "oop_leads", otherwise "oop_checks" (the first pilot's tree; tree.mjs).
import responses from "../../src/estimated/preflop-ranges.json" with { type: "json" };
import threeBetResponses from "../../src/estimated/three-bet-responses.json" with { type: "json" };
import { gameConfig, isInPosition, openSizeFor } from "../../src/estimated/sizing.js";

export const DEFAULT_SPOT_ID = "BTN_open_BB_call";
const BLINDS = { SB: 0.5, BB: 1 };
const round = value => Math.round(value * 100) / 100;
const deadBlinds = (...seats) => Object.entries(BLINDS).filter(([seat]) => !seats.includes(seat)).reduce((sum, [, bb]) => sum + bb, 0);

function geometry({ id, kind, opener, caller, aggressor, sizeBb, slug, reachable, sources, extra = {} }) {
  const ip = isInPosition(caller, aggressor) ? caller : aggressor;
  const oop = ip === caller ? aggressor : caller;
  return Object.freeze({
    id, kind, opener, caller, aggressor, ip, oop, ...extra,
    tree: aggressor === oop ? "oop_leads" : "oop_checks",
    ...sources,
    openBb: openSizeFor(opener), potBb: round(2 * sizeBb + deadBlinds(caller, aggressor)), stackBb: round(gameConfig.stack_bb - sizeBb),
    slug, reachable,
  });
}

// Single-raised pot: O opens, C calls.
export function describeSpot(opener, caller, response = responses.spots.find(item => item.opener === opener && item.hero === caller)) {
  const { positions } = gameConfig;
  if (!positions.includes(opener) || !positions.includes(caller) || opener === "BB" ||
      positions.indexOf(caller) <= positions.indexOf(opener)) throw new Error(`Unsupported postflop spot: ${opener} → ${caller}`);
  const id = `${opener}_open_${caller}_call`;
  return geometry({ id, kind: "srp", opener, caller, aggressor: opener, sizeBb: openSizeFor(opener),
    // The first pilot keeps its original file names so the saved candidate, report and EV stay valid.
    slug: id === DEFAULT_SPOT_ID ? "btn-bb-srp-v1" : `${opener.toLowerCase()}-${caller.toLowerCase()}-srp-v1`,
    // SB is saved as 3bet-or-fold (call 0% for every hand), so SB-call spots cannot occur:
    // they stay listed but have no range to generate, simulate or show.
    reachable: Boolean(response?.hands.some(row => row.call > 0)),
    sources: { openingId: `${opener}_open`, responseId: `${caller}_vs_${opener}` } });
}

// 3bet pot: O opens, X 3bets to the saved size, O calls. O is the caller, X the aggressor.
export function describeThreeBetSpot(opener, threeBettor, response = threeBetResponses.spots.find(item => item.opener === opener && item.three_bettor === threeBettor)) {
  if (!response) throw new Error(`Unsupported 3bet pot: ${opener} → ${threeBettor}`);
  const id = `${opener}_open_${threeBettor}_3bet_call`;
  return geometry({ id, kind: "3bp", opener, caller: opener, aggressor: threeBettor, sizeBb: response.three_bet_size_bb,
    slug: `${opener.toLowerCase()}-${threeBettor.toLowerCase()}-3bp-v1`,
    reachable: response.hands.some(row => row.call > 0),
    sources: { openingId: `${opener}_open`, responseId: response.id, threeBetId: response.source_response_id },
    extra: { threeBettor, threeBetBb: response.three_bet_size_bb } });
}

export const POSTFLOP_SPOTS = Object.freeze([
  ...responses.spots.map(spot => describeSpot(spot.opener, spot.hero, spot)),
  ...threeBetResponses.spots.map(spot => describeThreeBetSpot(spot.opener, spot.three_bettor, spot)),
]);

export function spotById(id = DEFAULT_SPOT_ID) {
  const spot = POSTFLOP_SPOTS.find(item => item.id === id);
  if (!spot) throw new Error(`Unknown postflop spot: ${id}`);
  return spot;
}

export function spotFor(opener, caller) {
  return POSTFLOP_SPOTS.find(item => item.kind === "srp" && item.opener === opener && item.caller === caller) ?? null;
}

export function threeBetSpotFor(opener, threeBettor) {
  return POSTFLOP_SPOTS.find(item => item.kind === "3bp" && item.opener === opener && item.threeBettor === threeBettor) ?? null;
}
