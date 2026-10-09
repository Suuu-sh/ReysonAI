// Common *authored* contextual judgments for the fifteen new SRPs, not a solver.
// Per-spot/per-seat numeric anchors live in profiles/*.json. These shared priors
// express price, action closure, present position and runout semantics. They are
// disclosed recipe inputs, not an assertion of fifteen unrelated optimizations.
// No accepted-pilot or HU strategy is imported. No MDF/equity fitting is performed.
export const BASE_TIERS = Object.freeze(['monster', 'strong', 'draw', 'medium', 'air']);
export const FLOP_TEXTURES = Object.freeze(['dry', 'wet', 'monotone', 'paired'].flatMap(shape => ['high', 'mid', 'low'].map(height => `${shape}_${height}`)));
export const LATER_TEXTURES = Object.freeze(['blank', 'over', 'pair', 'straight', 'flush']);
export const LINES = Object.freeze(['checked', 'aggressor', 'defender']);
export const FACES = Object.freeze(['33', '75', '125', 'raise1', 'raise2', 'allin']);
export const PRICE_ORDER = Object.freeze(['cheap', 'standard', 'expensive']);
export const SHAPES = Object.freeze(['dry', 'wet', 'monotone', 'paired']);
export const bounded = value => Math.max(0, Math.min(100, Math.round(value)));
export const valueAt = (values, tier) => {
  const index = BASE_TIERS.indexOf(tier);
  if (index < 0 || values?.length !== 5) throw new Error('Malformed new Mw3 residual-tier profile');
  return values[index];
};
export function allocate(total, weights) {
  if (weights.reduce((sum, x) => sum + x, 0) !== 100) throw new Error('Malformed authored size allocation');
  const exact = weights.map(x => total * x / 100), result = exact.map(Math.floor);
  const order = exact.map((x, i) => ({ i, remainder: x - result[i] })).sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (let left = total - result.reduce((a, b) => a + b, 0), i = 0; left; left--, i++) result[order[i].i]++;
  return result;
}

export const FIRST_RUNOUT = {
  turn: { blank: [0,0,0,0,0], over: [0,-5,0,-3,0], pair: [-8,-7,-8,-4,-2], straight: [-11,-10,-5,-4,-3], flush: [-21,-17,-11,-6,-4] },
  river: { blank: [0,0,0,0,0], over: [-2,-7,0,-4,0], pair: [-12,-10,0,-5,-3], straight: [-16,-13,0,-5,-3], flush: [-25,-18,0,-7,-5] },
};
export const FIRST_TWO_PLAYER = {
  turn: { first: { checked: [7,8,8,4,3], aggressor: [9,11,10,4,5], defender: [2,2,2,1,1] },
    last: { checked: [17,19,18,10,11], aggressor: [12,17,16,9,11], defender: [19,20,18,7,8] } },
  river: { first: { checked: [8,7,0,3,4], aggressor: [8,10,0,3,6], defender: [2,2,0,1,1] },
    last: { checked: [14,17,0,9,10], aggressor: [9,15,0,8,11], defender: [16,18,0,6,8] } },
};
export const FIRST_SPR = { deep: [0,0,0,0,0], medium: [2,1,-2,-1,-1], shallow: [5,3,-4,-2,-2] };
export const SHOVE_SHARE = { 2: [76,43,42,9,34], 3: [64,28,28,4,16] };
export const FLOP_SIZES = {
  dry: [[29,60,11],[74,26,0],[57,40,3],[95,5,0],[80,18,2]],
  wet: [[16,73,11],[45,55,0],[40,58,2],[93,7,0],[64,35,1]],
  monotone: [[76,24,0],[94,6,0],[89,11,0],[100,0,0],[94,6,0]],
  paired: [[69,31,0],[93,7,0],[92,8,0],[100,0,0],[97,3,0]],
};
export const LATER_SIZES = {
  turn: [[22,63,15],[62,38,0],[44,52,4],[94,6,0],[48,45,7]],
  river: [[15,63,22],[68,32,0],[100,0,0],[100,0,0],[32,52,16]],
};
export const PRICE_CONTINUE = {
  flop: { cheap: [1,12,18,11,1], standard: [0,0,0,0,0], expensive: [-6,-16,-15,-7,-1] },
  turn: { cheap: [2,11,14,9,1], standard: [0,0,0,0,0], expensive: [-8,-16,-11,-6,-1] },
  river: { cheap: [4,14,0,12,1], standard: [0,0,0,0,0], expensive: [-10,-15,0,-7,-1] },
};
export const FLOP_RESPONSE = {
  dry: [[0,4,0,3,0],[0,1,0,0,0]], wet: [[-2,-7,7,-4,-1],[5,-1,3,0,0]],
  monotone: [[-10,-17,-4,-9,-1],[-10,-2,-3,0,0]], paired: [[-4,-5,-6,-5,-1],[-5,-2,-3,0,0]],
};
export const LATER_RESPONSE = {
  turn: { blank: [[0,0,0,0,0],[0,0,0,0,0]], over: [[0,-7,0,-5,-1],[0,-1,0,0,0]],
    pair: [[-8,-5,-7,-6,-1],[-7,-2,-3,0,0]], straight: [[-10,-11,-3,-6,-1],[-7,-2,-2,0,0]], flush: [[-19,-18,-8,-10,-1],[-15,-3,-4,0,0]] },
  river: { blank: [[0,0,0,0,0],[0,0,0,0,0]], over: [[-2,-9,0,-7,-1],[-2,-1,0,0,0]],
    pair: [[-10,-8,0,-8,-1],[-8,-2,0,0,0]], straight: [[-14,-14,0,-9,-1],[-10,-2,0,0,0]], flush: [[-23,-22,0,-12,-1],[-17,-3,0,0,0]] },
};
export const RESPONSE_TWO_PLAYER = { flop: [2,8,10,10,1], turn: [2,9,9,8,1], river: [4,12,0,12,1] };
export const INVESTED = { flop: [2,9,6,2,0], turn: [2,8,4,1,0], river: [2,6,0,1,0] };
export const LATER_RAISE_CHANGE = { turn: [-3,-1,-2,0,0], river: [-12,-2,-8,-1,0] };

// These rank-safety priors deliberately do not infer a future equity guarantee
// from a current nut. Future-certified absolute hands have a separate profile.
export const NUT_CONTINUE = {
  flop: {33:[100,100,100],75:[100,100,100],125:[100,100,100],raise1:[100,100,98],raise2:[100,99,97],allin:[100,99,97]},
  turn: {33:[100,100,100],75:[100,100,100],125:[100,100,100],raise1:[100,99,96],raise2:[100,97,94],allin:[100,97,94]},
  river: {33:[100,100,100],75:[100,100,100],125:[100,100,100],raise1:[100,100,100],raise2:[100,100,100],allin:[100,100,100]},
};
export const NUT_RAISE = { flop:[52,60,65,50,0,0],turn:[56,64,70,57,0,0],river:[70,78,86,83,0,0] };
export const ABSOLUTE_RAISE = { flop:[46,54,60,64,0,0],turn:[60,70,80,86,0,0],river:[86,93,98,98,0,0] };
export const SPECIAL_SIZES = {
  flop: { dry:[28,60,12],wet:[14,70,16],monotone:[48,47,5],paired:[66,34,0] },
  turn: { blank:[24,60,16],over:[24,62,14],pair:[48,47,5],straight:[24,62,14],flush:[24,62,14] },
  river: { blank:[14,64,22],over:[18,64,18],pair:[43,48,9],straight:[24,62,14],flush:[24,62,14] },
};
export const ABSOLUTE_SIZES = {
  flop: { first:[72,28,0],middle:[64,36,0],last:[57,43,0] },
  turn: { blank:[38,53,9],over:[42,49,9],pair:[52,43,5],straight:[34,57,9],flush:[28,59,13] },
  river: { blank:[18,64,18],over:[24,59,17],pair:[33,58,9],straight:[18,60,22],flush:[14,59,27] },
};
export const SPECIAL_TWO_PLAYER = { first:{checked:7,aggressor:5,defender:2},last:{checked:8,aggressor:5,defender:6} };
export const SHARED_CALL = {
  2: {33:[65,44,29],75:[47,26,16],125:[30,12,4],raise1:[25,10,3],raise2:[18,5,1],allin:[32,13,4]},
  3: {33:[46,29,15],75:[28,13,5],125:[17,5,1],raise1:[14,4,1],raise2:[9,2,0],allin:[20,6,1]},
};
