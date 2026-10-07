// Three-player SRP source catalog. Intentionally separate from the immutable HU catalog.
import { hands } from "../../src/data.ts";
import { comboCount, combosOf } from "../lib/equity.ts";
import { validateMultiwayDataset } from "../../src/estimated/multiway-responses.ts";
import { validateDataset } from "../../src/estimated/ranges.ts";
import { validateOpeningDataset } from "../../src/estimated/opening-ranges.ts";

export const MW3_VERSION = 1;
export const MW3_SEAT_ORDER = Object.freeze(["SB", "BB", "UTG", "HJ", "CO", "BTN"]);
const PREFLOP_ORDER = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const BLINDS = { SB: 0.5, BB: 1 };
const sortSeats = seats => MW3_SEAT_ORDER.filter(seat => seats.includes(seat));
const sum = xs => xs.reduce((a, b) => a + b, 0);
const rowsFor = (spot, action) => {
  if (!spot || spot.hands?.length !== 169 || new Set(spot.hands.map(row => row.hand)).size !== 169 ||
      spot.hands.some(row => !hands.includes(row.hand) || !Number.isFinite(row[action]) || row[action] < 0 || row[action] > 100)) {
    throw new Error(`Invalid mw3 source rows: ${spot?.id ?? "missing"}/${action}`);
  }
  return spot.hands.map(row => ({ hand: row.hand, freq: row[action] }));
};

// This is a cheap exact existence test, not an estimate of the joint deal probability.
export function hasCompatibleMw3Hands(seatRows, board = []) {
  const blocked = new Set(board);
  const ranges = Object.values(seatRows).map(rows => rows.filter(row => row.freq > 0)
    .flatMap(row => combosOf(row.hand)).filter(combo => combo.every(card => !blocked.has(card))))
    .sort((a, b) => a.length - b.length);
  const search = index => {
    if (index === ranges.length) return true;
    for (const combo of ranges[index]) {
      if (combo.some(card => blocked.has(card))) continue;
      combo.forEach(card => blocked.add(card));
      if (search(index + 1)) return true;
      combo.forEach(card => blocked.delete(card));
    }
    return false;
  };
  return ranges.length === 3 && search(0);
}

// Exact three-seat action probability under a uniform legal deal, with card removal.
// The other three forced-fold seats remain unmodeled, so this is NOT the probability
// of the entire six-seat terminal history. No Monte Carlo or marginal-product shortcut.
export function mw3JointActionShare(seatRows) {
  const ranges = Object.values(seatRows).map(rows => rows.filter(row => row.freq > 0).flatMap(row =>
    combosOf(row.hand).map(combo => ({ combo, weight: row.freq / 100 }))));
  if (ranges.length !== 3) throw new Error('Joint action share requires exactly three ranges');
  // Sum C's compatible mass by inclusion-exclusion over the four blocked cards.
  const cards = new Float64Array(52), pairs = new Float64Array(52 * 52);
  let total = 0;
  for (const { combo: [a, b], weight } of ranges[2]) { total += weight; cards[a] += weight; cards[b] += weight; pairs[a * 52 + b] += weight; pairs[b * 52 + a] += weight; }
  let weightedTuples = 0, compensation = 0;
  for (const a of ranges[0]) for (const b of ranges[1]) {
    const [a0, a1] = a.combo, [b0, b1] = b.combo;
    if (a0 === b0 || a0 === b1 || a1 === b0 || a1 === b1) continue;
    const blocked = [a0, a1, b0, b1];
    let compatible = total;
    for (const card of blocked) compatible -= cards[card];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) compatible += pairs[blocked[i] * 52 + blocked[j]];
    if (compatible < -1e-9) throw new Error('Invalid joint action normalization');
    const value = a.weight * b.weight * Math.max(0, compatible) - compensation;
    const next = weightedTuples + value; compensation = (next - weightedTuples) - value; weightedTuples = next;
  }
  const legalDeals = 1326 * 1225 * 1128;
  return { method: 'exact_card_conditioned_three_active_action_share_forced_folds_unmodeled',
    weightedLegalTuples: weightedTuples, uniformLegalDeals: legalDeals, probability: weightedTuples / legalDeals };
}

export function buildMw3Catalog({ opening, responses, multiway }) {
  validateOpeningDataset(opening);
  validateDataset(responses);
  for (const source of [opening, responses, multiway]) {
    if (source?.metadata?.rake?.rate !== 0.05 || source.metadata.rake.cap_bb !== 3 || source.metadata.rake.no_flop_no_drop !== true) {
      throw new Error("mw3 sources require the approved 5%/3BB/no-flop-no-drop rake");
    }
  }
  validateMultiwayDataset(multiway, responses);
  const ids = new Set();
  return multiway.spots.map(second => {
    const opener = second.opener, firstCaller = second.callers[0], secondCaller = second.hero;
    const open = opening.spots.find(spot => spot.id === `${opener}_open`);
    const first = responses.spots.find(spot => spot.id === `${firstCaller}_vs_${opener}`);
    const participants = [opener, firstCaller, secondCaller];
    if (new Set(participants).size !== 3 || !participants.every((seat, i) =>
      PREFLOP_ORDER.includes(seat) && (!i || PREFLOP_ORDER.indexOf(participants[i - 1]) < PREFLOP_ORDER.indexOf(seat))) ||
      !first || first.opener !== opener || first.hero !== firstCaller ||
      [open, first, second].some(spot => spot.open_size_bb !== 2.5 || spot.effective_stack_bb !== 100)) {
      throw new Error(`Invalid mw3 source geometry: ${second.id}`);
    }
    const seats = sortSeats(participants);
    const seatRows = { [opener]: rowsFor(open, "open"), [firstCaller]: rowsFor(first, "call"), [secondCaller]: rowsFor(second, "call") };
    const marginalActionShare = Object.fromEntries(participants.map(seat => [seat,
      sum(seatRows[seat].map(row => comboCount(row.hand) * row.freq / 100)) / 1326]));
    const id = `${opener}_open_${firstCaller}_call_${secondCaller}_call`;
    if (ids.has(id)) throw new Error(`Repeated mw3 spot: ${id}`);
    ids.add(id);
    const emptySeats = participants.filter(seat => marginalActionShare[seat] === 0);
    const reachable = emptySeats.length === 0 && hasCompatibleMw3Hands(seatRows);
    const deadBlindBb = sum(Object.entries(BLINDS).filter(([seat]) => !seats.includes(seat)).map(([, amount]) => amount));
    return Object.freeze({
      id, kind: "mw3_srp", version: MW3_VERSION,
      slug: `${participants.join("-").toLowerCase()}-mw3-srp-v1`,
      opener, firstCaller, secondCaller, aggressor: opener,
      seats, roles: Object.fromEntries(seats.map((seat, i) => [seat, ["first", "middle", "last"][i]])),
      openBb: 2.5, potBb: 7.5 + deadBlindBb, stackBb: 97.5, deadBlindBb,
      sources: { openingId: open.id, firstResponseId: first.id, multiwayResponseId: second.id },
      seatRows, reachable, jointActionShare: mw3JointActionShare(seatRows),
      unavailableReason: reachable ? null : emptySeats.length ? `zero_saved_call_support:${emptySeats.join(",")}` : "no_compatible_holecard_tuple",
      // Priority only. This omits forced-fold probabilities and card dependence, and MUST NOT
      // be displayed as the probability of this terminal history or used as an acceptance gate.
      reachPriority: { method: "product_of_marginal_action_shares_not_joint_reach", marginalActionShare,
        score: participants.reduce((product, seat) => product * marginalActionShare[seat], 1) },
      policyStatus: "not_generated",
    });
  }).sort((a, b) => b.jointActionShare.probability - a.jointActionShare.probability || a.id.localeCompare(b.id));
}

export function mw3SpotFor(catalog, { opener, callers, raised = false, activeSeats }) {
  if (raised || !Array.isArray(callers) || callers.length !== 2 || !Array.isArray(activeSeats) || activeSeats.length !== 3 ||
      new Set(activeSeats).size !== 3) return null;
  return catalog.find(spot => spot.opener === opener && spot.firstCaller === callers[0] && spot.secondCaller === callers[1] &&
    spot.seats.every(seat => activeSeats.includes(seat))) ?? null;
}


// Agent/preflop adapters must match the real event sequence, not just count players.
// Exactly one open and two calls are supported. Any squeeze/limp/3bet continuation
// remains unavailable even when it happens to end with three live participants.
export function mw3SpotForEvents(catalog, events) {
  if (!Array.isArray(events) || events.some(event => !event || !PREFLOP_ORDER.includes(event.pos))) return null;
  const voluntary = events.filter(event => event.type !== 'fold' && event.type !== 'check');
  if (voluntary.map(event => event.key).join() !== 'open,call,call' || voluntary[0].type !== 'raise' ||
      voluntary.slice(1).some(event => event.type !== 'call')) return null;
  const [open, first, second] = voluntary;
  const participants = [open.pos, first.pos, second.pos];
  if (events.some(event => event.type === 'fold' && participants.includes(event.pos))) return null;
  return mw3SpotFor(catalog, { opener: open.pos, callers: [first.pos, second.pos], activeSeats: participants });
}
