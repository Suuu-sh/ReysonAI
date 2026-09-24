// Computes per-hand facts (equity, pot odds, blockers, fold equity) that ground detailed reasons.
// Usage: node scripts/reason-facts.mjs [spot_id ...]   (no ids = every spot)
// Writes .local/reason-facts/<spot_id>.json; seeded, so reruns are reproducible.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { blockedShare, comboCount, equityVsRange, seedFor, seededRandom, weightedRange } from "./lib/equity.mjs";
import { raked } from "../src/estimated/rake.js";
import { reasonSourceFingerprint } from "./lib/reason-context.mjs";
import { callContexts, callFacts, validCallEquities } from "../src/estimated/call-ev.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openSizeFor } from "../src/estimated/sizing.js";

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
const outDir = process.env.REASON_FACTS_DIR ? pathToFileURL(resolve(process.env.REASON_FACTS_DIR) + "/") : new URL("../.local/reason-facts/", import.meta.url);
const sourceFingerprint = reasonSourceFingerprint(load);
const callEquities = load("call-equities");
const contexts = new Map(callContexts({ opening, responses, threeBets, fourBets, multiway, limp: limpResponses }).map(c => [c.spot.id, c]));
for (const context of contexts.values()) if (!validCallEquities(callEquities, context)) throw new Error(`Stale call equity: ${context.spot.id}`);
const primaryEquityKeys = new Set(["equity_vs_open_pct", "equity_vs_three_bet_pct", "equity_vs_four_bet_pct", "equity_vs_bb_iso_pct"]);
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

// BB facing an open plus one cold call: three-way equity against both ranges.
function multiwayFacts(spot) {
  const { opener, callers: [caller] } = spot;
  const open = rangeFrom(opening.spots.find(s => s.hero === opener), row => row.open / 100);
  const called = rangeFrom(responseOf(opener, caller), row => row.call / 100);
  const random = seededRandom(seedFor(spot.id));
  return {
    type: "multiway",
    spot: { opener, caller, hero: spot.hero, position: "OOP", squeeze_size_bb: spot.squeeze_size_bb,
      call_break_even_equity_pct: round1(need(1.5, 8)), fair_share_pct: round1(1 / 3),
      caller_range_combos: Math.round(totalWeight(called)) },
    hands: spot.hands.map(row => ({ hand: row.hand,
      equity_3way_pct: round1(callEquities.spots[spot.id].equities[row.hand]),
      equity_vs_caller_pct: round1(equityVsRange(row.hand, called, SAMPLES, random)),
      blocked_caller_pct: round1(blockedShare(row.hand, called)) })),
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

const builders = [
  ...opening.spots.map(spot => [spot.id, () => openingFacts(spot)]),
  ...responses.spots.map(spot => [spot.id, () => responseFacts(spot)]),
  ...threeBets.spots.map(spot => [spot.id, () => threeBetFacts(spot)]),
  ...fourBets.spots.map(spot => [spot.id, () => fourBetFacts(spot)]),
  ...multiway.spots.map(spot => [spot.id, () => multiwayFacts(spot)]),
  ...limpResponses.spots.filter(spot => spot.id === "BB_vs_SB_limp").map(spot => [spot.id, () => limpFacts(spot)]),
  ...limpResponses.spots.filter(spot => spot.id === "SB_vs_BB_iso").map(spot => [spot.id, () => isoFacts(spot)]),
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
