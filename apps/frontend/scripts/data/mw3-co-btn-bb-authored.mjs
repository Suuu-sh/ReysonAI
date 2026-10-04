// Independently authored three-player-origin AI estimate. NOT a solver/GTO output.
// This file is an OFFLINE authoring recipe: consumers use only the resulting saved
// rules. It imports no HU strategy, computed defence, equity, EV or optimizer.
// Values are judgmental percentage-point profiles, not fitted acceptance targets.
import { TIERS } from '../postflop-ai/model.mjs';
import { describeMw3Node, mw3PolicyContextKey } from '../postflop-ai/mw3-tree.mjs';
import { mw3AnySelector, validateMw3Policy } from '../postflop-ai/mw3-policy.mjs';

export const MW3_PILOT_AUTHORSHIP = Object.freeze({
  spotId: 'CO_open_BTN_call_BB_call', version: 1, model: 'gpt-6-astra',
  sourceFingerprint: 'c9828f0e54b8156bf64c12929efc2dfe55774b3339c980a009805271206a9117',
  status: 'first_candidate_requires_independent_review_not_publishable',
  tierOrder: ['monster', 'strong', 'draw', 'medium', 'air'],
});
const FLOP_TEXTURES = ['dry', 'wet', 'monotone', 'paired'].flatMap(shape =>
  ['high', 'mid', 'low'].map(height => `${shape}_${height}`));
const LATER_TEXTURES = ['blank', 'over', 'pair', 'straight', 'flush'];
const at = (values, tier) => values[TIERS.indexOf(tier)];
const bounded = value => Math.max(0, Math.min(100, Math.round(value)));

// Percent betting, separately authored for BB lead, CO c-bet after BB check,
// and BTN stab after TWO checks. The same role is never substituted for another.
// CO owns all premium pairs; BTN flats retain 10% AA/KK and mostly suited hands /
// middling pairs. BB's overcall is broader and contains no AA/KK in this input.
const FLOP_BET = {
  first: {
    dry_high: [24, 7, 8, 2, 1], dry_mid: [28, 9, 11, 2, 1], dry_low: [34, 12, 14, 3, 1],
    wet_high: [34, 8, 13, 2, 1], wet_mid: [39, 10, 17, 2, 1], wet_low: [44, 12, 19, 3, 1],
    monotone_high: [17, 4, 6, 1, 1], monotone_mid: [19, 5, 8, 1, 1], monotone_low: [22, 6, 9, 1, 1],
    paired_high: [16, 5, 4, 1, 1], paired_mid: [19, 7, 5, 2, 1], paired_low: [23, 9, 6, 2, 1],
  },
  middle: {
    dry_high: [62, 58, 28, 18, 12], dry_mid: [60, 52, 25, 12, 8], dry_low: [53, 40, 22, 9, 6],
    wet_high: [65, 46, 28, 7, 4], wet_mid: [67, 41, 29, 6, 4], wet_low: [64, 35, 27, 5, 3],
    monotone_high: [39, 27, 17, 5, 3], monotone_mid: [37, 23, 17, 4, 2], monotone_low: [34, 20, 16, 3, 2],
    paired_high: [48, 42, 13, 12, 7], paired_mid: [44, 36, 12, 9, 5], paired_low: [40, 31, 11, 7, 4],
  },
  last: {
    dry_high: [72, 64, 38, 25, 20], dry_mid: [75, 64, 41, 23, 19], dry_low: [72, 58, 39, 20, 16],
    wet_high: [73, 56, 38, 12, 9], wet_mid: [77, 56, 43, 11, 10], wet_low: [74, 53, 40, 10, 9],
    monotone_high: [48, 37, 23, 9, 6], monotone_mid: [50, 37, 25, 8, 6], monotone_low: [47, 34, 24, 7, 5],
    paired_high: [58, 50, 22, 19, 13], paired_mid: [59, 48, 24, 17, 12], paired_low: [55, 44, 22, 15, 10],
  },
};

// Conditional size allocation within the authored betting share: 33 / 75 / 125.
// Monotone/paired textures stay small because the five-tier abstraction lacks
// nut-suit / private-made-hand distinctions. Wet unpaired boards use more 75%.
const FLOP_SIZES = {
  dry:      [[30, 58, 12], [72, 28, 0], [55, 42, 3], [95, 5, 0], [75, 23, 2]],
  wet:      [[16, 72, 12], [40, 60, 0], [38, 59, 3], [90, 10, 0], [58, 40, 2]],
  monotone: [[75, 25, 0], [92, 8, 0], [88, 12, 0], [100, 0, 0], [90, 10, 0]],
  paired:   [[82, 18, 0], [90, 10, 0], [90, 10, 0], [100, 0, 0], [95, 5, 0]],
};

// Later-street betting totals. Keys are CURRENT live position, not original role.
// 2-player rows remain explicitly three-player-origin, with previous MW action
// selection and dead chips; these numbers are not imported HU profiles.
const LATER_BET = {
  turn: {
    3: {
      checked:   { first: [36, 16, 16, 5, 3], middle: [46, 25, 23, 8, 5], last: [66, 46, 36, 17, 12] },
      aggressor: { first: [65, 36, 28, 6, 5], middle: [72, 45, 33, 8, 7], last: [80, 58, 42, 13, 13] },
      defender:  { first: [18, 8, 8, 2, 1], middle: [21, 10, 10, 2, 1], last: [55, 30, 24, 8, 7] },
    },
    2: {
      checked:   { first: [45, 28, 27, 9, 6], last: [78, 62, 49, 25, 21] },
      aggressor: { first: [76, 54, 44, 12, 13], last: [87, 69, 56, 21, 23] },
      defender:  { first: [20, 10, 10, 3, 2], last: [63, 41, 38, 14, 14] },
    },
  },
  river: {
    3: {
      checked:   { first: [32, 14, 0, 3, 2], middle: [45, 24, 0, 5, 4], last: [68, 43, 0, 12, 9] },
      aggressor: { first: [68, 29, 0, 3, 4], middle: [74, 40, 0, 4, 6], last: [83, 52, 0, 8, 10] },
      defender:  { first: [15, 5, 0, 1, 1], middle: [18, 7, 0, 1, 1], last: [56, 26, 0, 5, 6] },
    },
    2: {
      checked:   { first: [45, 24, 0, 6, 6], last: [80, 58, 0, 22, 18] },
      aggressor: { first: [78, 46, 0, 7, 12], last: [89, 67, 0, 17, 23] },
      defender:  { first: [17, 7, 0, 2, 2], last: [66, 40, 0, 12, 14] },
    },
  },
};
const RUNOUT_BET_DELTA = {
  turn: {
    blank: [0, 0, 0, 0, 0], over: [0, -5, 0, -3, 0], pair: [-15, -7, -9, -4, -3],
    straight: [-12, -10, -5, -4, -3], flush: [-22, -17, -12, -6, -5],
  },
  river: {
    blank: [0, 0, 0, 0, 0], over: [-2, -7, 0, -4, 0], pair: [-20, -10, 0, -5, -3],
    straight: [-17, -13, 0, -5, -4], flush: [-26, -18, 0, -7, -6],
  },
};
const LATER_SIZES = {
  turn: [[20, 64, 16], [58, 42, 0], [40, 54, 6], [92, 8, 0], [40, 50, 10]],
  river: [[12, 63, 25], [62, 38, 0], [100, 0, 0], [100, 0, 0], [25, 55, 20]],
};

// Response anchors: [continue total, raise share], each ordered by TIERS.
// Baseline is a three-player cold decision WITH another response pending, at
// standard price. 33/75 are separate despite both usually being 'standard'.
const RESPONSE = {
  flop: {
    33: [[100, 89, 52, 28, 3], [38, 4, 8, 1, 0]],
    75: [[99, 70, 35, 12, 1], [44, 3, 6, 0, 0]],
    125: [[96, 48, 19, 4, 0], [38, 1, 3, 0, 0]],
    raise1: [[94, 34, 23, 4, 0], [34, 1, 3, 0, 0]],
    raise2: [[87, 18, 12, 1, 0], [0, 0, 0, 0, 0]],
    allin: [[88, 28, 15, 2, 0], [0, 0, 0, 0, 0]],
  },
  turn: {
    33: [[99, 82, 38, 19, 2], [35, 3, 6, 0, 0]],
    75: [[96, 58, 22, 7, 0], [39, 2, 4, 0, 0]],
    125: [[91, 36, 10, 2, 0], [31, 1, 2, 0, 0]],
    raise1: [[88, 22, 11, 2, 0], [29, 1, 2, 0, 0]],
    raise2: [[79, 10, 4, 0, 0], [0, 0, 0, 0, 0]],
    allin: [[82, 20, 8, 1, 0], [0, 0, 0, 0, 0]],
  },
  river: {
    33: [[96, 70, 0, 22, 1], [25, 2, 0, 0, 0]],
    75: [[90, 46, 0, 9, 0], [29, 1, 0, 0, 0]],
    125: [[82, 27, 0, 3, 0], [24, 0, 0, 0, 0]],
    raise1: [[77, 14, 0, 2, 0], [16, 0, 0, 0, 0]],
    raise2: [[64, 6, 0, 0, 0], [0, 0, 0, 0, 0]],
    allin: [[73, 16, 0, 1, 0], [0, 0, 0, 0, 0]],
  },
};
const PRICE_CONTINUE = {
  flop: { cheap: [1, 12, 19, 12, 2], standard: [0, 0, 0, 0, 0], expensive: [-6, -17, -17, -8, -2] },
  turn: { cheap: [2, 11, 15, 9, 1], standard: [0, 0, 0, 0, 0], expensive: [-8, -17, -12, -6, -1] },
  river: { cheap: [4, 14, 0, 13, 2], standard: [0, 0, 0, 0, 0], expensive: [-10, -16, 0, -8, -1] },
};
const FLOP_RESPONSE_DELTA = {
  dry: [[0, 5, 0, 4, 1], [0, 1, 0, 0, 0]],
  wet: [[-2, -7, 8, -4, -1], [6, -1, 3, 0, 0]],
  monotone: [[-12, -18, -4, -10, -2], [-12, -2, -3, 0, 0]],
  paired: [[-10, 0, -7, -6, -1], [-12, -1, -4, 0, 0]],
};
const RUNOUT_RESPONSE_DELTA = {
  turn: {
    blank: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
    over: [[0, -7, 0, -5, -1], [0, -1, 0, 0, 0]],
    pair: [[-14, -5, -8, -6, -1], [-12, -2, -3, 0, 0]],
    straight: [[-10, -11, -3, -6, -1], [-8, -2, -2, 0, 0]],
    flush: [[-20, -19, -9, -10, -2], [-16, -3, -4, 0, 0]],
  },
  river: {
    blank: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
    over: [[-2, -9, 0, -7, -1], [-2, -1, 0, 0, 0]],
    pair: [[-18, -8, 0, -8, -1], [-14, -2, 0, 0, 0]],
    straight: [[-14, -15, 0, -9, -1], [-11, -2, 0, 0, 0]],
    flush: [[-24, -23, 0, -13, -2], [-18, -3, 0, 0, 0]],
  },
};

// Pure offline arithmetic for expressing hand-authored percentages as integers.
// This is not a runtime cap or normalization of another saved policy.
function allocate(total, shares) {
  if (shares.reduce((sum, n) => sum + n, 0) !== 100) throw new Error('Invalid authored size allocation');
  const exact = shares.map(n => total * n / 100), out = exact.map(Math.floor);
  const order = exact.map((n, i) => ({ i, fraction: n - out[i] })).sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (let left = total - out.reduce((sum, n) => sum + n, 0), i = 0; left > 0; left--, i++) out[order[i].i]++;
  return out;
}

function firstMix(d, tier, texture) {
  const descriptor = describeMw3Node(d.node), index = TIERS.indexOf(tier);
  let total, shares;
  if (d.street === 'flop') {
    total = at(FLOP_BET[descriptor.role][texture], tier);
    shares = [...FLOP_SIZES[texture.split('_')[0]][index]];
    // BB's rare leads are less polarized than CO/BTN's value-protection bets.
    if (descriptor.role === 'first' && shares[2]) { shares[1] += shares[2]; shares[2] = 0; }
  } else {
    total = at(LATER_BET[d.street][d.players][d.line][d.activePosition], tier);
    total += at(RUNOUT_BET_DELTA[d.street][texture], tier);
    if (texture === 'over' && d.line === 'aggressor') total += at([0, 0, 3, 0, 2], tier);
    if (texture === 'over' && d.line === 'checked' && d.activePosition === 'last') total += at([0, 0, 1, 0, 1], tier);
    // Remaining SPR reduces future liability for made hands, but does not make
    // weak draws or air into automatic stack-offs.
    if (d.sprBand === 'shallow') total += at([6, 3, -5, -3, -2], tier);
    if (d.sprBand === 'medium') total += at([2, 1, -2, -1, -1], tier);
    shares = [...LATER_SIZES[d.street][index]];
    if (['pair', 'flush', 'straight'].includes(texture)) {
      shares = tier === 'monster' ? [62, 38, 0] : tier === 'strong' ? [85, 15, 0]
        : tier === 'draw' ? [78, 22, 0] : [90, 10, 0];
    }
    if (d.line === 'defender' && d.activePosition !== 'last') {
      // Leading into the previous aggressor is deliberately rare at BOTH OOP
      // positions; river overbet donks are absent without blocker information.
      shares[0] += shares[2]; shares[2] = 0;
      total = Math.min(total, at(d.street === 'turn' ? [24, 12, 12, 3, 2] : [20, 9, 0, 2, 2], tier));
    }
  }
  total = bounded(total);
  if (d.street === 'river' && tier === 'draw') total = 0; // structurally required, card-unreachable tier
  const mix = Object.fromEntries(descriptor.actions.map(action => [action, 0]));
  mix.check = 100 - total;
  if (descriptor.actions.includes('allin')) {
    // Below SPR 1 we use an honest check/shove abstraction. Several sized actions
    // can already merge into all-in. At medium SPR use small bet / shove only.
    if (d.sprBand === 'shallow') mix.allin = total;
    else {
      const shovePart = at(d.players === 3 ? [65, 30, 30, 5, 20] : [75, 45, 45, 10, 40], tier);
      [mix.bet33, mix.allin] = allocate(total, [100 - shovePart, shovePart]);
    }
  } else [mix.bet33, mix.bet75, mix.bet125] = allocate(total, shares);
  return mix;
}

function responseMix(d, tier, texture) {
  const n = describeMw3Node(d.node), [continuations, raises] = RESPONSE[d.street][n.facing];
  let continued = at(continuations, tier), raised = at(raises, tier);
  const delta = d.street === 'flop' ? FLOP_RESPONSE_DELTA[texture.split('_')[0]] : RUNOUT_RESPONSE_DELTA[d.street][texture];
  continued += at(delta[0], tier); raised += at(delta[1], tier);
  continued += at(PRICE_CONTINUE[d.street][d.priceBand], tier);
  if (d.priceBand === 'expensive') raised += at([-4, -1, -2, 0, 0], tier);
  // Removing a player is not a switch into the old HU policy. Actual OOP/IP is
  // recomputed from live seats, so original CO middle can become either one.
  if (d.players === 2) {
    continued += at(d.street === 'river' ? [4, 13, 0, 14, 2] : [2, 9, 12, 12, 2], tier);
    raised += at(d.street === 'river' ? [5, 1, 0, 0, 1] : [5, 1, 3, 0, 1], tier);
  } else if (!n.pendingBehind) {
    // Overcalling closes the action, but another player already continued:
    // do not treat this as an uncontested heads-up defence opportunity.
    continued += at([0, -3, 6, 2, 0], tier);
    raised += at([-8, -1, -1, 0, 0], tier);
  }
  if (d.activePosition === 'last') continued += at([0, 2, 4, 3, 0], tier);
  else if (d.street !== 'river') continued += at([0, 0, -3, -2, 0], tier);
  if (d.players === 3 && n.pendingBehind) {
    continued += at([0, 0, -4, -4, 0], tier);
    raised += at([0, 0, -1, 0, 0], tier);
  }
  // Invested is range/history information, not a sunk-cost discount. Price is
  // already the incremental, raked call price; this smaller shift is separate.
  if (d.responseType === 'invested') {
    continued += at(d.street === 'river' ? [2, 7, 0, 1, 0] : [2, 10, 7, 2, 0], tier);
    raised += at([3, 0, 1, 0, 0], tier);
  }
  if (d.sprBand === 'shallow' && n.facing !== 'allin') continued += at([2, 3, -2, 0, 0], tier);
  if (d.sprBand === 'deep' && d.street !== 'river' && d.activePosition !== 'last') continued += at([0, -1, -3, -2, 0], tier);
  if (d.street === 'flop') {
    const height = texture.split('_')[1];
    // Source-range distinctions are deliberately small within this broad tier:
    // high-card CO overpairs, suited-connected BB low boards, BTN middle boards.
    if (n.role === 'middle' && height === 'high') continued += at([0, 3, 0, 0, 0], tier);
    if (n.role === 'first' && height === 'high') continued += at([0, -2, 0, -1, 0], tier);
    if (n.role === 'first' && height === 'low') continued += at([0, 1, 2, 1, 0], tier);
    if (n.role === 'last' && height === 'mid') continued += at([0, 1, 2, 1, 0], tier);
  } else {
    if (d.line === 'aggressor') continued += at([1, 3, 2, 0, 0], tier);
    if (d.line === 'defender') { continued += at([0, -2, -1, -1, 0], tier); raised += at([-2, 0, -1, 0, 0], tier); }
  }
  // Air is only a tiny bluff-raise candidate, never an indiscriminate call-down.
  // Without blockers, cold multiway river raises are often genuinely value-only.
  if (tier === 'air') {
    raised = Math.max(0, Math.min(raised, d.players === 3 ? 1 : 2));
    if (d.street === 'river') continued = raised;
    if (['raise1', 'raise2', 'allin', '125'].includes(n.facing)) { raised = 0; continued = 0; }
  }
  if (d.street === 'river' && tier === 'draw') { continued = 0; raised = 0; }
  continued = bounded(continued);
  raised = n.actions.includes('raise') ? Math.min(continued, bounded(raised)) : 0;
  const mix = { fold: 100 - continued, call: continued - raised };
  if (n.actions.includes('raise')) mix.raise = raised;
  return mix;
}
const authoredMix = (d, tier, texture) => d.facing ? responseMix(d, tier, texture) : firstMix(d, tier, texture);

// Defaults are explicit schema safety coverage, not a runtime strategy substitute.
// The exhaustive current-geometry exact-context overrides below are selected in
// preference to ALL of them; audits must verify no observed context uses priority 0.
function fallbackDecision(node) {
  const n = describeMw3Node(node), facing = n.facing !== null;
  return { node, street: n.street, role: n.role, facing, players: 3, activePosition: n.role,
    line: n.street === 'flop' ? 'checked' : 'defender', responseType: facing ? 'cold' : 'none',
    priceBand: facing ? ['125', 'allin', 'raise2'].includes(n.facing) ? 'expensive' : 'standard' : 'none',
    sprBand: n.situation.endsWith('low_spr') || n.facing === 'allin' ? 'shallow' : 'deep' };
}

export function buildMw3PilotPolicies(inputs, probe) {
  if (inputs?.spot?.id !== MW3_PILOT_AUTHORSHIP.spotId || inputs.fingerprint !== MW3_PILOT_AUTHORSHIP.sourceFingerprint ||
      inputs.spot.seats.join() !== 'BB,CO,BTN' || inputs.spot.potBb !== 8 || inputs.spot.stackBb !== 97.5) {
    throw new Error('MW3 pilot authoring is pinned to the reviewed CO / BTN / BB inputs; re-author changed sources');
  }
  if (!probe?.nodes || !probe.contexts || Object.keys(probe.nodes).length !== 117 || Object.keys(probe.contexts).length !== 1209) {
    throw new Error('MW3 pilot authoring requires the complete reviewed 117-node / 1209-context probe');
  }
  const flop = { version: 1, kind: 'ai_estimate_not_gto', spot_id: inputs.spot.id, streets: ['flop'], rules: [] };
  const later = { version: 1, kind: 'ai_estimate_not_gto', spot_id: inputs.spot.id, streets: ['turn', 'river'], rules: [] };
  for (const node of Object.keys(probe.nodes).sort()) {
    const d = fallbackDecision(node), policy = d.street === 'flop' ? flop : later;
    for (const tier of TIERS) policy.rules.push({ node, tier, when: mw3AnySelector(), priority: 0,
      mix: authoredMix(d, tier, d.street === 'flop' ? 'monotone_high' : 'flush') });
  }
  for (const [key, d] of Object.entries(probe.contexts).sort(([a], [b]) => a.localeCompare(b))) {
    if (key !== mw3PolicyContextKey(d) || !probe.nodes[d.node]) throw new Error('Invalid MW3 authoring context');
    const policy = d.street === 'flop' ? flop : later;
    for (const texture of d.street === 'flop' ? FLOP_TEXTURES : LATER_TEXTURES) for (const tier of TIERS) {
      policy.rules.push({ node: d.node, tier, when: { line: d.line, texture, players: d.players,
        position: d.activePosition, response: d.responseType, price: d.priceBand, spr: d.sprBand },
      priority: 100, mix: authoredMix(d, tier, texture) });
    }
  }
  validateMw3Policy(flop, { spotId: inputs.spot.id, nodes: probe.nodes });
  validateMw3Policy(later, { spotId: inputs.spot.id, nodes: probe.nodes });
  return { flop, later };
}
