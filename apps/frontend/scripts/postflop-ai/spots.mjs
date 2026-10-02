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
import { dataset } from "../../src/estimated/datasets.ts";
import { gameConfig, isInPosition, isoVsLimpToBb, limpReraiseToBb, openSizeFor, sbCompleteToBb } from "../../src/estimated/sizing.ts";

// Published preflop datasets (src/estimated/datasets.ts); preloaded before this module runs in the browser.
const responses = dataset("preflop-ranges");
const threeBetResponses = dataset("three-bet-responses");
const openingRanges = dataset("opening-ranges");
const limpResponses = dataset("limp-responses");

export const DEFAULT_SPOT_ID = "BTN_open_BB_call";
const BLINDS = { SB: 0.5, BB: 1 };
const round = value => Math.round(value * 100) / 100;
const deadBlinds = (...seats) => Object.entries(BLINDS).filter(([seat]) => !seats.includes(seat)).reduce((sum, [, bb]) => sum + bb, 0);

// `aggressor` made the last preflop raise (null in a limped pot, where `lead` sets the tree).
function geometry({ id, kind, opener, caller, aggressor, sizeBb, slug, reachable, sources, extra = {}, openBb, lead }) {
  const other = aggressor ?? opener;
  const ip = isInPosition(caller, other) ? caller : other;
  const oop = ip === caller ? other : caller;
  return Object.freeze({
    id, kind, opener, caller, aggressor, ip, oop, ...extra,
    tree: lead ?? (aggressor === oop ? "oop_leads" : "oop_checks"),
    ...sources,
    openBb: openBb ?? openSizeFor(opener), potBb: round(2 * sizeBb + deadBlinds(caller, other)), stackBb: round(gameConfig.stack_bb - sizeBb),
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

// 4bet pot: O opens, X 3bets, O 4bets to the saved size, X calls. X is the caller, O the aggressor.
// The call frequencies live in four-bet-responses.json, which the app loads lazily; they are
// checked when the inputs are loaded (inputs.mjs), so `reachable` here covers O's 4bet and X's 3bet.
export function describeFourBetSpot(opener, threeBettor, threeBetSpot = threeBetResponses.spots.find(item => item.opener === opener && item.three_bettor === threeBettor)) {
  if (!threeBetSpot) throw new Error(`Unsupported 4bet pot: ${opener} → ${threeBettor}`);
  const response = responses.spots.find(item => item.id === threeBetSpot.source_response_id);
  const opening = openingRanges.spots.find(item => item.id === `${opener}_open`);
  const open = new Map(opening?.hands.map(row => [row.hand, row.open]));
  const id = `${opener}_open_${threeBettor}_4bp_call`;
  return geometry({ id, kind: "4bp", opener, caller: threeBettor, aggressor: opener, sizeBb: threeBetSpot.four_bet_size_bb,
    slug: `${opener.toLowerCase()}-${threeBettor.toLowerCase()}-4bp-v1`,
    reachable: threeBetSpot.hands.some(row => row.four_bet > 0 && open.get(row.hand) > 0) && Boolean(response?.hands.some(row => row.three_bet > 0)),
    sources: { openingId: `${opener}_open`, responseId: `${threeBettor}_vs_${opener}_four_bet`, threeBetId: threeBetSpot.source_response_id, fourBetId: threeBetSpot.id },
    extra: { threeBettor, threeBetBb: threeBetSpot.three_bet_size_bb, fourBetBb: threeBetSpot.four_bet_size_bb } });
}

// Limped pots: SB completes to 1BB. Range factors are [file, spot id, action]; the seat's
// flop weight is their product (inputs.mjs).
const LIMPS = [
  { id: "SB_limp_BB_check", caller: "BB", aggressor: null, sizeBb: sbCompleteToBb, lead: "oop_leads", slug: "sb-bb-limp-v1", responseId: "BB_vs_SB_limp",
    ranges: { SB: [["opening-ranges", "SB_open", "limp"]], BB: [["limp-responses", "BB_vs_SB_limp", "check"]] } },
  { id: "SB_limp_BB_iso_call", caller: "SB", aggressor: "BB", sizeBb: isoVsLimpToBb, slug: "sb-bb-iso-v1", responseId: "SB_vs_BB_iso",
    ranges: { SB: [["opening-ranges", "SB_open", "limp"], ["limp-responses", "SB_vs_BB_iso", "call"]], BB: [["limp-responses", "BB_vs_SB_limp", "raise"]] } },
  { id: "SB_limp_BB_iso_SB_reraise_call", caller: "BB", aggressor: "SB", sizeBb: limpReraiseToBb, slug: "sb-bb-limp-reraise-v1", responseId: "BB_vs_SB_limp_reraise",
    ranges: { SB: [["opening-ranges", "SB_open", "limp"], ["limp-responses", "SB_vs_BB_iso", "raise"]],
      BB: [["limp-responses", "BB_vs_SB_limp", "raise"], ["limp-responses", "BB_vs_SB_limp_reraise", "call"]] } },
];
const limpFiles = { "opening-ranges": openingRanges, "limp-responses": limpResponses };

export function describeLimpSpot(definition) {
  const { id, caller, aggressor, sizeBb, lead, slug, responseId, ranges } = definition;
  // Per-hand product of the saved frequencies (percent), e.g. SB limp × SB call versus the iso.
  const weights = factors => {
    const maps = factors.map(([file, spotId, action]) => new Map(limpFiles[file].spots.find(item => item.id === spotId)?.hands.map(row => [row.hand, row[action]])));
    return [...maps[0].keys()].map(hand => maps.reduce((product, map) => product * (map.get(hand) ?? 0) / 100, 1));
  };
  return geometry({ id, kind: "limp", opener: "SB", caller, aggressor, sizeBb, slug, lead, openBb: sbCompleteToBb,
    reachable: Object.values(ranges).every(factors => weights(factors).some(weight => weight > 0)),
    sources: { openingId: "SB_open", responseId },
    extra: { ranges } });
}

export const POSTFLOP_SPOTS = Object.freeze([
  ...responses.spots.map(spot => describeSpot(spot.opener, spot.hero, spot)),
  ...threeBetResponses.spots.map(spot => describeThreeBetSpot(spot.opener, spot.three_bettor, spot)),
  ...threeBetResponses.spots.map(spot => describeFourBetSpot(spot.opener, spot.three_bettor, spot)),
  ...LIMPS.map(describeLimpSpot),
]);

export function spotById(id = DEFAULT_SPOT_ID) {
  const spot = POSTFLOP_SPOTS.find(item => item.id === id);
  if (!spot) throw new Error(`Unknown postflop spot: ${id}`);
  return spot;
}

export function spotFor(opener, caller) {
  return POSTFLOP_SPOTS.find(item => item.kind === "srp" && item.opener === opener && item.caller === caller) ?? null;
}

export function fourBetSpotFor(opener, threeBettor) {
  return POSTFLOP_SPOTS.find(item => item.kind === "4bp" && item.opener === opener && item.threeBettor === threeBettor) ?? null;
}

export const limpSpotFor = id => POSTFLOP_SPOTS.find(item => item.kind === "limp" && item.id === id) ?? null;

export function threeBetSpotFor(opener, threeBettor) {
  return POSTFLOP_SPOTS.find(item => item.kind === "3bp" && item.opener === opener && item.threeBettor === threeBettor) ?? null;
}
