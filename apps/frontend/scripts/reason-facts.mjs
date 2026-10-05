import { generateContinuationFacts } from "./lib/continuation-reasons.mjs";
// Computes per-hand facts (equity, pot odds, blockers, fold equity) that ground detailed reasons.
// Usage: node scripts/reason-facts.mjs [spot_id ...]   (no ids = every spot)
// Writes .local/reason-facts/<spot_id>.json; seeded, so reruns are reproducible.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { blockedShare, comboCount, equityVsRange, seedFor, seededRandom, weightedRange } from "./lib/equity.ts";
import { raked } from "../src/estimated/rake.ts";
import { reasonSourceFingerprint } from "./lib/reason-context.mjs";
import { coldFourBetFoldThreshold, callContexts, callFacts, isColdCaller, limpReraiseFoldThreshold, squeezeFoldThreshold, validCallEquities } from "../src/estimated/call-ev.ts";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isInPosition, openSizeFor } from "../src/estimated/sizing.ts";

const SAMPLES = 12000;
const positions = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const blind = { SB: 0.5, BB: 1 };
const dataDir = process.env.ESTIMATES_DIR ? pathToFileURL(resolve(process.env.ESTIMATES_DIR) + "/") : new URL("../src/estimated/", import.meta.url);
const load = name => JSON.parse(readFileSync(new URL(`${name}.json`, dataDir)));
const opening = load("opening-ranges");
const responses = load("preflop-ranges");
const threeBets = load("three-bet-responses");
const fourBets = load("four-bet-responses");
const fiveBets = load("five-bet-responses");
const limpResponses = existsSync(new URL("limp-responses.json", dataDir)) ? load("limp-responses") : { spots: [] };
const multiway = existsSync(new URL("multiway-responses.json", dataDir)) ? load("multiway-responses") : { spots: [] };
const multiway2 = existsSync(new URL("multiway2-responses.json", dataDir)) ? load("multiway2-responses") : { spots: [] };
const coldFourBets = existsSync(new URL("cold-four-bet-responses.json", dataDir)) ? load("cold-four-bet-responses") : { spots: [] };
const squeezes = existsSync(new URL("squeeze-responses.json", dataDir)) ? load("squeeze-responses") : { spots: [] };
const limpDeep = existsSync(new URL("limp-deep-responses.json", dataDir)) ? load("limp-deep-responses") : { spots: [] };
const coldThreeBets = existsSync(new URL("cold-three-bet-responses.json", dataDir)) ? load("cold-three-bet-responses") : { spots: [] };
const outDir = process.env.REASON_FACTS_DIR ? pathToFileURL(resolve(process.env.REASON_FACTS_DIR) + "/") : new URL("../.local/reason-facts/", import.meta.url);
const sourceFingerprint = reasonSourceFingerprint(load);
const callEquities = load("call-equities");
const contexts = new Map(callContexts({ opening, responses, threeBets, fourBets, multiway, limp: limpResponses, squeezes, coldThreeBets, limpDeep, multiway2, coldFourBets }).map(c => [c.spot.id, c]));
for (const context of contexts.values()) if (!validCallEquities(callEquities, context)) throw new Error(`Stale call equity: ${context.spot.id}`);
const primaryEquityKeys = new Set(["equity_vs_open_pct", "equity_vs_three_bet_pct", "equity_vs_four_bet_pct", "equity_vs_bb_iso_pct", "equity_vs_limp_reraise_pct", "equity_vs_bb_four_bet_pct", "equity_vs_cold_four_bet_pct"]);
mkdirSync(outDir, { recursive: true });

const round1 = value => value === null ? null : Math.round(value * 1000) / 10;
const byHand = spot => new Map(spot.hands.map(row => [row.hand, row]));
const openOf = position => byHand(opening.spots.find(s => s.hero === position));
const responseOf = (opener, hero) => responses.spots.find(s => s.opener === opener && s.hero === hero);
const rangeFrom = (spot, weight) => weightedRange(spot.hands.map(row => ({ hand: row.hand, weight: weight(row) })));
const totalWeight = range => range.reduce((acc, item) => acc + item.weight, 0);
const weightedFold = (spot, weight) => {
  let total = 0, folded = 0;
  for (const row of spot.hands) { const w = comboCount(row.hand) * weight(row); total += w; folded += w * row.fold / 100; }
  return total ? folded / total : null;
};
const need = (cost, totalPotAfterCall) => cost / raked(totalPotAfterCall);

function handFacts(spotId, spot, reachable, ranges) {
  const random = seededRandom(seedFor(spotId));
  return spot.hands.map(row => {
    const facts = { hand: row.hand };
    for (const [key, range] of Object.entries(ranges)) {
      if (primaryEquityKeys.has(key)) facts[key] = reachable(row.hand) ? round1(callEquities.spots[spotId].equities[row.hand]) : null;
      else if (key.startsWith("blocked_")) facts[key] = reachable(row.hand) ? round1(blockedShare(row.hand, range)) : null;
      else facts[key] = reachable(row.hand) && range.length ? round1(equityVsRange(row.hand, range, SAMPLES, random)) : null;
    }
    return facts;
  });
}

function openingFacts(spot) {
  const hero = spot.hero;
  const behind = positions.slice(positions.indexOf(hero) + 1);
  const bbResponse = responseOf(hero, "BB");
  const defend = rangeFrom(bbResponse, row => (row.call + row.three_bet) / 100);
  const threeBetsBehind = behind.flatMap(p => rangeFrom(responseOf(hero, p), row => row.three_bet / 100));
  const allFold = behind.reduce((acc, p) => acc * weightedFold(responseOf(hero, p), () => 1), 1);
  const openSize = spot.open_size_bb ?? openSizeFor(hero);
  const risk = openSize - (blind[hero] ?? 0);
  const reward = 1.5 - (blind[hero] ?? 0);
  const comboWeightedPct = action => round1(spot.hands.reduce((sum, row) => sum + comboCount(row.hand) * (row[action] ?? 0) / 100, 0) / 1326);
  return {
    type: "open",
    spot: { hero, players_behind: behind.length, all_fold_pct: round1(allFold), steal_break_even_pct: round1(risk / (risk + reward)),
      bb_defend_combos: Math.round(totalWeight(defend)),
      ...(hero === "SB" ? { raise_pct: comboWeightedPct("open"), limp_pct: comboWeightedPct("limp"), fold_pct: comboWeightedPct("fold") } : {}) },
    hands: handFacts(spot.id, spot, () => true, { equity_vs_defend_pct: defend, blocked_three_bet_pct: threeBetsBehind }),
  };
}

function responseFacts(spot) {
  const { opener, hero } = spot;
  const open = rangeFrom(opening.spots.find(s => s.hero === opener), row => row.open / 100);
  const threeBetSpot = threeBets.spots.find(s => s.opener === opener && s.three_bettor === hero);
  const openRows = openOf(opener);
  const continueRange = rangeFrom(threeBetSpot, row => (row.call + row.four_bet) / 100 * openRows.get(row.hand).open / 100);
  const openSize = spot.open_size_bb ?? openSizeFor(opener);
  const toCall = openSize - (blind[hero] ?? 0);
  const dead = 1.5 - (blind[opener] ?? 0) - (blind[hero] ?? 0);
  const totalPotAfterCall = 2 * openSize + dead;
  const behind = positions.slice(positions.indexOf(hero) + 1);
  return {
    type: "response",
    spot: { opener, hero, position: spot.hero_position_vs_opener, players_behind: behind.length,
      // HJ / CO / BTN flats carry the extra squeeze / overcall discount (COLD_CALL_*_EQR).
      ...(isColdCaller(hero) ? { cold_call_behind: true } : {}),
      call_break_even_equity_pct: round1(need(toCall, totalPotAfterCall)), opener_fold_to_3bet_pct: round1(weightedFold(threeBetSpot, row => openRows.get(row.hand).open / 100)),
      three_bet_size_bb: spot.three_bet_size_bb },
    hands: handFacts(spot.id, spot, () => true, { equity_vs_open_pct: open, equity_vs_continue_pct: continueRange, blocked_open_pct: open }),
  };
}

function threeBetFacts(spot) {
  const { opener, three_bettor: bettor } = spot;
  const response = responseOf(opener, bettor);
  const fourBetSpot = fourBets.spots.find(s => s.opener === opener && s.hero === bettor);
  const threeBetWeight = byHand(response);
  const threeBetRange = rangeFrom(response, row => row.three_bet / 100);
  const continueRange = rangeFrom(fourBetSpot, row => threeBetWeight.get(row.hand).three_bet / 100 * (row.call + row.all_in) / 100);
  const openRows = openOf(opener);
  const dead = 1.5 - (blind[opener] ?? 0) - (blind[bettor] ?? 0);
  const openSize = spot.open_size_bb ?? openSizeFor(opener);
  const totalPotAfterCall = 2 * spot.three_bet_size_bb + dead;
  return {
    type: "three_bet",
    spot: { opener, three_bettor: bettor, position: spot.hero_position_vs_three_bettor, three_bet_size_bb: spot.three_bet_size_bb, four_bet_size_bb: spot.four_bet_size_bb,
      call_break_even_equity_pct: round1(need(spot.three_bet_size_bb - openSize, totalPotAfterCall)),
      three_bettor_fold_to_4bet_pct: round1(weightedFold(fourBetSpot, row => threeBetWeight.get(row.hand).three_bet / 100)) },
    hands: handFacts(spot.id, spot, hand => openRows.get(hand).open > 0,
      { equity_vs_three_bet_pct: threeBetRange, equity_vs_continue_pct: continueRange, blocked_three_bet_pct: threeBetRange }),
  };
}

function fourBetFacts(spot) {
  const { opener, hero } = spot;
  const openRows = openOf(opener);
  const previous = threeBets.spots.find(s => s.opener === opener && s.three_bettor === hero);
  const fourBetRange = rangeFrom(previous, row => openRows.get(row.hand).open / 100 * row.four_bet / 100);
  const response = byHand(responseOf(opener, hero));
  const fiveBet = fiveBets.spots.find(s => s.opener === opener && s.five_bettor === hero);
  const fourBetWeight = byHand(previous);
  const callShoveRange = rangeFrom(fiveBet, row => openRows.get(row.hand).open / 100 * fourBetWeight.get(row.hand).four_bet / 100 * row.call / 100);
  const dead = 1.5 - (blind[opener] ?? 0) - (blind[hero] ?? 0);
  const totalPotAfterCall = 2 * spot.four_bet_size_bb + dead;
  return {
    type: "four_bet",
    spot: { opener, hero, position: spot.hero_position_vs_opener, three_bet_size_bb: spot.three_bet_size_bb, four_bet_size_bb: spot.four_bet_size_bb,
      call_break_even_equity_pct: round1(need(spot.four_bet_size_bb - spot.three_bet_size_bb, totalPotAfterCall)),
      // Shoving risks the rest of the stack; when called the final pot is 200BB plus dead blinds.
      shove_called_break_even_pct: round1(need(100 - spot.three_bet_size_bb, 200 + dead)),
      opener_fold_to_shove_pct: round1(weightedFold(fiveBet, row => openRows.get(row.hand).open / 100 * fourBetWeight.get(row.hand).four_bet / 100)) },
    hands: handFacts(spot.id, spot, hand => response.get(hand).three_bet > 0,
      { equity_vs_four_bet_pct: fourBetRange, equity_vs_shove_call_pct: callShoveRange, blocked_four_bet_pct: fourBetRange }),
  };
}

// BB or SB facing an open plus one cold call: three-way equity against both ranges.
// SB pays 2BB into 8.5BB (BB's blind is dead money) and still has BB behind it.
function multiwayFacts(spot) {
  const { opener, callers: [caller], hero } = spot;
  const open = rangeFrom(opening.spots.find(s => s.hero === opener), row => row.open / 100);
  const called = rangeFrom(responseOf(opener, caller), row => row.call / 100);
  if (!called.length) return { type: "multiway", spot: { opener, caller, hero, unreachable: true },
    hands: spot.hands.map(row => ({ hand: row.hand, equity_3way_pct: null, equity_vs_caller_pct: null, blocked_caller_pct: null })) };
  const random = seededRandom(seedFor(spot.id));
  const participants = [hero, opener, caller];
  const toCall = spot.open_size_bb - (blind[hero] ?? 0);
  const totalPotAfterCall = participants.length * spot.open_size_bb + 1.5 - participants.reduce((n, p) => n + (blind[p] ?? 0), 0);
  return {
    type: "multiway",
    spot: { opener, caller, hero, position: [opener, caller].every(p => isInPosition(hero, p)) ? "IP" : "OOP", squeeze_size_bb: spot.squeeze_size_bb,
      call_break_even_equity_pct: round1(need(toCall, totalPotAfterCall)), fair_share_pct: round1(1 / 3),
      caller_range_combos: Math.round(totalWeight(called)),
      ...(hero === "SB" ? { bb_behind: true } : {}),
      ...(isColdCaller(hero) ? { cold_call_behind: true } : {}) },
    hands: spot.hands.map(row => ({ hand: row.hand,
      equity_3way_pct: round1(callEquities.spots[spot.id].equities[row.hand]),
      equity_vs_caller_pct: round1(equityVsRange(row.hand, called, SAMPLES, random)),
      blocked_caller_pct: round1(blockedShare(row.hand, called)) })),
  };
}

// Opener or caller facing a squeeze (S = BB or SB). Equity is against S's saved
// squeeze range, or three-way against S and the opener's squeeze-call range.
function squeezeFacts(spot) {
  const { opener, caller, squeezer, hero, prior_action: prior } = spot;
  const context = contexts.get(spot.id);
  const source = multiway.spots.find(s => s.id === spot.source_squeeze_id);
  if (!context) {
    if (source.hands.some(row => row.squeeze > 0)) throw new Error(`Missing reachable squeeze context: ${spot.id}`);
    return { type: "squeeze", spot: { opener, caller, squeezer, hero, prior_action: prior, unreachable: true },
      hands: spot.hands.map(row => ({ hand: row.hand, equity_vs_squeeze_pct: null, blocked_squeeze_pct: null })) };
  }
  const squeezeRange = rangeFrom(source, row => row.squeeze / 100);
  const branch = action => squeezes.spots.find(s => s.source_squeeze_id === spot.source_squeeze_id && s.prior_action === action);
  const foldOf = action => { const c = contexts.get(branch(action).id); return weightedFold(c.spot, row => c.reach(row.hand)); };
  const equityKey = prior === "call" ? "equity_3way_pct" : "equity_vs_squeeze_pct";
  const reachable = hand => context.reach(hand) > 0;
  const openerCall = prior === "call" ? context.input.ranges[1].reduce((n, [hand, w]) => n + comboCount(hand) * w, 0) : null;
  return {
    type: "squeeze",
    spot: { opener, caller, squeezer, hero, prior_action: prior, position: context.input.opponents.every(p => isInPosition(hero, p)) ? "IP" : "OOP",
      squeeze_size_bb: spot.squeeze_size_bb, four_bet_size_bb: spot.four_bet_size_bb,
      call_break_even_equity_pct: round1(need(context.input.cost_to_call, context.input.total_pot_after_call)),
      squeeze_range_combos: Math.round(totalWeight(squeezeRange)),
      opener_fold_pct: round1(foldOf(null)), caller_fold_after_opener_fold_pct: round1(foldOf("fold")),
      fold_to_squeeze_pct: round1(foldOf(null) * foldOf("fold")), squeeze_break_even_pct: round1(squeezeFoldThreshold(spot)),
      ...(prior === null ? { caller_behind: true } : {}),
      ...(openerCall !== null ? { opener_call_range_combos: Math.round(openerCall) } : {}) },
    hands: spot.hands.map(row => ({ hand: row.hand,
      [equityKey]: reachable(row.hand) ? round1(callEquities.spots[spot.id].equities[row.hand]) : null,
      blocked_squeeze_pct: reachable(row.hand) ? round1(blockedShare(row.hand, squeezeRange)) : null })),
  };
}

// A later seat (not yet acted) facing a 3bet: equity versus the 3bettor's saved
// 3bet range; the opener and any later seats are still to act (OPENER_BEHIND_EQR).
// The 3bet's immediate win needs both the hero and the opener to fold; their
// combined fold rate is a reference number only (other seats behind are ignored).
function multiway2Facts(spot) {
  const context = contexts.get(spot.id);
  const { opener, callers, hero } = spot;
  if (!context) return { type: "multiway2", spot: { opener, callers, hero, unreachable: true },
    hands: spot.hands.map(row => ({ hand: row.hand, equity_4way_pct: null })) };
  return { type: "multiway2", spot: { opener, callers, hero, position: context.input.opponents.every(p => isInPosition(hero, p)) ? "IP" : "OOP",
    squeeze_size_bb: spot.squeeze_size_bb, call_break_even_equity_pct: round1(need(context.input.cost_to_call, context.input.total_pot_after_call)),
    fair_share_pct: 25, source_caller_ids: spot.source_caller_ids,
    opponent_range_combos: context.input.ranges.map(r => Math.round(r.reduce((n, [h, w]) => n + comboCount(h) * w, 0) * 10) / 10),
    ...(context.input.bb_behind ? { bb_behind: true } : {}), ...(context.input.cold_call_behind ? { cold_call_behind: true } : {}) },
    hands: spot.hands.map(row => ({ hand: row.hand, equity_4way_pct: round1(callEquities.spots[spot.id].equities[row.hand]) })) };
}

function coldFourBetFacts(spot) {
  const context = contexts.get(spot.id);
  const source = coldThreeBets.spots.find(s => s.id === spot.source_cold_three_bet_id);
  const range = rangeFrom(source, row => row.four_bet / 100);
  const branch = prior => coldFourBets.spots.find(s => s.source_cold_three_bet_id === spot.source_cold_three_bet_id && s.prior_action === prior);
  const foldOf = prior => { const c = contexts.get(branch(prior).id); return weightedFold(c.spot, row => c.reach(row.hand)); };
  return { type: "cold_four_bet", spot: { opener: spot.opener, three_bettor: spot.three_bettor, four_bettor: spot.four_bettor, hero: spot.hero,
    prior_action: spot.prior_action, position: isInPosition(spot.hero, spot.four_bettor) ? "IP" : "OOP",
    open_size_bb: spot.open_size_bb, three_bet_size_bb: spot.three_bet_size_bb, four_bet_size_bb: spot.four_bet_size_bb, all_in_size_bb: 100,
    call_break_even_equity_pct: round1(need(context.input.cost_to_call, context.input.total_pot_after_call)),
    four_bet_range_combos: Math.round(totalWeight(range) * 10) / 10, source_cold_three_bet_id: spot.source_cold_three_bet_id,
    combined_fold_pct: round1(foldOf(null) * foldOf("fold")), cold_four_bet_break_even_pct: round1(coldFourBetFoldThreshold(spot)),
    ...(spot.prior_action === null ? { three_bettor_behind: true } : {}) },
    hands: handFacts(spot.id, spot, hand => context.reach(hand) > 0,
      { equity_vs_cold_four_bet_pct: range, blocked_cold_four_bet_pct: range }) };
}

function coldThreeBetFacts(spot) {
  const { opener, three_bettor: bettor, hero } = spot;
  const context = contexts.get(spot.id);
  const threeBetRange = rangeFrom(responseOf(opener, bettor), row => row.three_bet / 100);
  const openRows = openOf(opener);
  const openerResponse = threeBets.spots.find(s => s.opener === opener && s.three_bettor === bettor);
  const openerFold = weightedFold(openerResponse, row => openRows.get(row.hand).open / 100);
  const heroFold = weightedFold(spot, () => 1);
  return {
    type: "cold_three_bet",
    spot: { opener, three_bettor: bettor, hero, position: isInPosition(hero, bettor) ? "IP" : "OOP",
      open_size_bb: spot.open_size_bb, three_bet_size_bb: spot.three_bet_size_bb, four_bet_size_bb: spot.four_bet_size_bb,
      call_break_even_equity_pct: round1(need(context.input.cost_to_call, context.input.total_pot_after_call)),
      three_bet_range_combos: Math.round(totalWeight(threeBetRange)), opener_behind: true,
      hero_fold_pct: round1(heroFold), opener_fold_to_3bet_pct: round1(openerFold),
      hero_and_opener_fold_pct: round1(heroFold * openerFold) },
    hands: handFacts(spot.id, spot, () => true, { equity_vs_three_bet_pct: threeBetRange, blocked_three_bet_pct: threeBetRange }),
  };
}

function limpFacts(spot) {
  const sbOpening = opening.spots.find(s => s.hero === "SB");
  const limpRange = rangeFrom(sbOpening, row => row.limp / 100);
  return {
    type: "limp_response",
    spot: { opener: "SB", hero: "BB", open_size_bb: spot.open_size_bb,
      iso_size_bb: spot.raise_size_bb, sb_limp_range_combos: Math.round(totalWeight(limpRange)) },
    hands: handFacts(spot.id, spot, () => true, {
      equity_vs_sb_limp_pct: limpRange,
      blocked_sb_limp_pct: limpRange,
    }),
  };
}

function isoFacts(spot) {
  const sb = openOf("SB");
  const bb = limpResponses.spots.find(s => s.id === spot.source_limp_response_id);
  const isoRange = rangeFrom(bb, row => row.raise / 100);
  return {
    type: "iso_response",
    spot: { hero: "SB", opponent: "BB", position: "OOP", iso_size_bb: spot.iso_size_bb,
      raise_to_bb: spot.raise_to_bb, bb_iso_range_combos: Math.round(totalWeight(isoRange)),
      call_break_even_equity_pct: round1(need(spot.iso_size_bb - spot.open_size_bb, 2 * spot.iso_size_bb)) },
    hands: handFacts(spot.id, spot, hand => sb.get(hand).limp > 0, {
      equity_vs_bb_iso_pct: isoRange, blocked_bb_iso_pct: isoRange,
    }),
  };
}

// BB facing SB's limp-reraise after its own iso, in position. Equity is against
// SB's limp × limp-reraise range; reach is BB's iso-raise frequency.
function limpReraiseFacts(spot) {
  const context = contexts.get(spot.id);
  const sb = openOf("SB");
  const sbIso = limpResponses.spots.find(s => s.id === spot.source_iso_response_id);
  const reraiseRange = rangeFrom(sbIso, row => sb.get(row.hand).limp / 100 * row.raise / 100);
  const reachable = hand => context.reach(hand) > 0;
  return {
    type: "limp_reraise",
    spot: { hero: "BB", opponent: "SB", position: "IP", iso_size_bb: spot.iso_size_bb,
      limp_reraise_size_bb: spot.limp_reraise_size_bb, four_bet_size_bb: spot.four_bet_size_bb,
      call_break_even_equity_pct: round1(need(context.input.cost_to_call, context.input.total_pot_after_call)),
      sb_reraise_range_combos: Math.round(totalWeight(reraiseRange) * 10) / 10,
      bb_fold_pct: round1(weightedFold(spot, row => context.reach(row.hand))),
      limp_reraise_break_even_pct: round1(limpReraiseFoldThreshold(spot)) },
    hands: handFacts(spot.id, spot, reachable, {
      equity_vs_limp_reraise_pct: reraiseRange, blocked_limp_reraise_pct: reraiseRange,
    }),
  };
}

// All-in call spots (five-bet and limp-deep BB): every chip is in, so the saved equity versus the
// shove range against pot odds is the whole decision. Equity is the dataset's own value.
function allInCallFacts(type, spot, shoveRange, extraSpot) {
  const reachable = row => row.equity_vs_shove_pct !== null && row.equity_vs_shove_pct !== undefined;
  const reach = new Map(spot.hands.map(row => [row.hand, reachable(row)]));
  return {
    type,
    spot: { ...extraSpot, call_break_even_equity_pct: spot.call_break_even_equity_pct, shove_range_combos: spot.shove_range_combos,
      fold_pct: round1(weightedFold(spot, row => reach.get(row.hand) ? 1 : 0)) },
    hands: spot.hands.map(row => ({ hand: row.hand,
      equity_vs_shove_pct: reach.get(row.hand) ? row.equity_vs_shove_pct : null,
      blocked_shove_pct: reach.get(row.hand) ? round1(blockedShare(row.hand, shoveRange)) : null })),
  };
}

function fiveBetFacts(spot) {
  const { opener, five_bettor: bettor } = spot;
  const fourBetSpot = fourBets.spots.find(s => s.opener === opener && s.hero === bettor);
  const threeBetWeight = byHand(responseOf(opener, bettor));
  const shoveRange = rangeFrom(fourBetSpot, row => threeBetWeight.get(row.hand).three_bet / 100 * row.all_in / 100);
  return allInCallFacts("five_bet", spot, shoveRange, { opener, five_bettor: bettor, four_bet_size_bb: spot.four_bet_size_bb, three_bet_size_bb: spot.three_bet_size_bb });
}

function limpFiveBetFacts(spot) {
  const sb = openOf("SB");
  const sbIso = byHand(limpResponses.spots.find(s => s.id === spot.source_iso_response_id));
  const sbFour = limpDeep.spots.find(s => s.id === spot.source_four_bet_response_id);
  const shoveRange = rangeFrom(sbFour, row => sb.get(row.hand).limp / 100 * sbIso.get(row.hand).raise / 100 * row.all_in / 100);
  return allInCallFacts("limp_five_bet", spot, shoveRange, { four_bet_size_bb: spot.four_bet_size_bb, all_in_size_bb: spot.all_in_size_bb });
}

// SB facing BB's 4bet after its limp-reraise: OOP call EV against BB's iso x 4bet range.
function limpFourBetFacts(spot) {
  const context = contexts.get(spot.id);
  const bbIso = byHand(limpResponses.spots.find(s => s.id === spot.source_limp_response_id));
  const bbReraise = limpResponses.spots.find(s => s.id === spot.source_limp_reraise_response_id);
  const fourBetRange = rangeFrom(bbReraise, row => bbIso.get(row.hand).raise / 100 * row.four_bet / 100);
  const fiveBet = limpDeep.spots.find(s => s.id === "BB_vs_SB_limp_five_bet");
  const bbReraiseRows = byHand(bbReraise);
  return {
    type: "limp_four_bet",
    spot: { hero: "SB", opponent: "BB", position: "OOP", limp_reraise_size_bb: spot.limp_reraise_size_bb, four_bet_size_bb: spot.four_bet_size_bb, all_in_size_bb: spot.all_in_size_bb,
      call_break_even_equity_pct: round1(need(context.input.cost_to_call, context.input.total_pot_after_call)),
      bb_four_bet_range_combos: Math.round(totalWeight(fourBetRange) * 10) / 10,
      bb_fold_to_shove_pct: round1(weightedFold(fiveBet, row => bbIso.get(row.hand).raise / 100 * bbReraiseRows.get(row.hand).four_bet / 100)) },
    hands: handFacts(spot.id, spot, hand => context.reach(hand) > 0, { equity_vs_bb_four_bet_pct: fourBetRange, blocked_bb_four_bet_pct: fourBetRange }),
  };
}

const builders = [
  ...opening.spots.map(spot => [spot.id, () => openingFacts(spot)]),
  ...responses.spots.map(spot => [spot.id, () => responseFacts(spot)]),
  ...threeBets.spots.map(spot => [spot.id, () => threeBetFacts(spot)]),
  ...fourBets.spots.map(spot => [spot.id, () => fourBetFacts(spot)]),
  ...multiway.spots.map(spot => [spot.id, () => multiwayFacts(spot)]),
  ...squeezes.spots.map(spot => [spot.id, () => squeezeFacts(spot)]),
  ...multiway2.spots.map(spot => [spot.id, () => multiway2Facts(spot)]),
  ...coldFourBets.spots.map(spot => [spot.id, () => coldFourBetFacts(spot)]),
  ...coldThreeBets.spots.map(spot => [spot.id, () => coldThreeBetFacts(spot)]),
  ...limpResponses.spots.filter(spot => spot.id === "BB_vs_SB_limp").map(spot => [spot.id, () => limpFacts(spot)]),
  ...limpResponses.spots.filter(spot => spot.id === "SB_vs_BB_iso").map(spot => [spot.id, () => isoFacts(spot)]),
  ...limpResponses.spots.filter(spot => spot.id === "BB_vs_SB_limp_reraise").map(spot => [spot.id, () => limpReraiseFacts(spot)]),
  ...fiveBets.spots.map(spot => [spot.id, () => fiveBetFacts(spot)]),
  ...limpDeep.spots.filter(spot => spot.id === "SB_vs_BB_limp_four_bet").map(spot => [spot.id, () => limpFourBetFacts(spot)]),
  ...limpDeep.spots.filter(spot => spot.id === "BB_vs_SB_limp_five_bet").map(spot => [spot.id, () => limpFiveBetFacts(spot)]),
];
const wanted = new Set(process.argv.slice(2));
for (const [id, build] of builders) {
  if (wanted.size && !wanted.has(id)) continue;
  const started = Date.now();
  const facts = { spot_id: id, source_fingerprint: sourceFingerprint, samples: SAMPLES, ...build() };
  const context = contexts.get(id);
  if (context) {
    facts.eqr_note = "EQRは仮定値。ソルバー実装後に置換。実現後の勝率はequity×EQRであり、実際のショウダウン確率ではありません。";
    facts.spot.cost_to_call_bb = context.input.cost_to_call;
    facts.spot.total_pot_after_call_bb = context.input.total_pot_after_call;
    for (const row of facts.hands) {
      Object.assign(row, context.reach(row.hand) > 0
        ? callFacts(context, row.hand, callEquities.spots[id].equities[row.hand])
        : { eqr: null, realized_equity_pct: null, call_ev_bb: null });
    }
  }
  writeFileSync(new URL(`${id}.json`, outDir), JSON.stringify(facts, null, 2) + "\n");
  console.log(`${id} ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

// Keep stage-two facts isolated from the legacy fingerprint so existing
// reason files remain byte-for-byte stable when only continuations are added.
if (existsSync(new URL("continuation-responses.json", dataDir))) {
  const continuationCount = generateContinuationFacts({
    data: load("continuation-responses"), equities: load("continuation-call-equities"), outDir, wanted,
    datasets: { "opening-ranges": opening, "preflop-ranges": responses, "multiway-responses": multiway,
      "multiway2-responses": multiway2, "squeeze-responses": squeezes,
      "cold-three-bet-responses": coldThreeBets, "cold-four-bet-responses": coldFourBets },
  });
  console.log(`${continuationCount} continuation fact files written`);
}
