import { comboCount, combosOf, equityVsRange, seedFor, seededRandom, weightedRange } from "./equity.mjs";
import { rake, rakeMetadata, raked } from "../../src/estimated/rake.ts";
import { openSizeFor } from "../../src/estimated/sizing.ts";

export const SAMPLE_COUNT = 6000;
export const OPEN_SIZE_BB = 2.5;
export const EFFECTIVE_STACK_BB = 100;
export const BLINDS = Object.freeze({ SB: 0.5, BB: 1 });
export const OPENING_POSITIONS = Object.freeze(["UTG", "HJ", "CO", "BTN", "SB"]);
const PREFLOP_ORDER = Object.freeze(["UTG", "HJ", "CO", "BTN", "SB", "BB"]);
const POSTFLOP_ORDER = Object.freeze(["SB", "BB", "UTG", "HJ", "CO", "BTN"]);

// Approximate postflop equity realization assumptions. All assumptions live here
// so callers can override them without changing the branch accounting.
export const REALIZATION_FACTORS = Object.freeze({
  IP: Object.freeze({ pair: 1, suited: 1, offsuit: 0.9 }),
  OOP: Object.freeze({ pair: 0.85, suited: 0.85, offsuit: 0.75 }),
});

const ACTIONS = Object.freeze({ response: ["fold", "call", "three_bet"], threeBettorFacingFourBet: ["fold", "call", "all_in"] });
const pct = value => (Number(value) || 0) / 100;
const handType = hand => hand.length === 2 ? "pair" : hand.endsWith("s") ? "suited" : "offsuit";
const spotRows = spot => spot?.hands ?? [];
const rowFor = (spot, hand) => spotRows(spot).find(row => row.hand === hand);
const round = value => Number.isFinite(value) ? Number(value.toFixed(6)) : null;

function requireSpot(spots, predicate, description) {
  const found = spots.find(predicate);
  if (!found) throw new Error(`Missing saved range spot: ${description}`);
  return found;
}

function behindPositions(hero) {
  const index = PREFLOP_ORDER.indexOf(hero);
  if (index < 0 || hero === "BB") throw new Error(`Unsupported opening position: ${hero}`);
  return PREFLOP_ORDER.slice(index + 1);
}

export function deadBlinds(hero, opponent) {
  return Object.entries(BLINDS).reduce((sum, [position, amount]) => sum + (position !== hero && position !== opponent ? amount : 0), 0);
}

export function isInPosition(hero, opponent) {
  const heroIndex = POSTFLOP_ORDER.indexOf(hero);
  const opponentIndex = POSTFLOP_ORDER.indexOf(opponent);
  if (heroIndex < 0 || opponentIndex < 0 || hero === opponent) throw new Error(`Invalid heads-up positions: ${hero} vs ${opponent}`);
  return heroIndex > opponentIndex;
}

export function realizationFactor(hand, hero, opponent, overrides = REALIZATION_FACTORS) {
  return overrides[isInPosition(hero, opponent) ? "IP" : "OOP"][handType(hand)];
}

// Compute action probabilities after removing every opponent combo that
// overlaps a particular concrete hero combo. baseField is used when the
// respondent's combos must first be weighted by a source range (the 3bet
// range when modeling a 4bet response).
function probabilitiesForCombo(rows, heroCombo, actionFields, baseField = null) {
  const blocked = new Set(heroCombo);
  let totalMass = 0;
  const actionMass = Object.fromEntries(actionFields.map(action => [action, 0]));
  for (const row of rows) {
    const base = baseField ? pct(row[baseField]) : 1;
    if (base <= 0) continue;
    const liveCombos = combosOf(row.hand).filter(combo => !combo.some(card => blocked.has(card)));
    for (const _combo of liveCombos) {
      totalMass += base;
      for (const action of actionFields) actionMass[action] += base * pct(row[action]);
    }
  }
  if (!totalMass) return Object.fromEntries(actionFields.map(action => [action, 0]));
  return Object.fromEntries(actionFields.map(action => [action, actionMass[action] / totalMass]));
}

export function actionProbabilitiesForHand({ rows, hand, actions, baseField = null }) {
  const combos = combosOf(hand);
  const sums = Object.fromEntries(actions.map(action => [action, 0]));
  for (const combo of combos) {
    const probabilities = probabilitiesForCombo(rows, combo, actions, baseField);
    for (const action of actions) sums[action] += probabilities[action] / combos.length;
  }
  return sums;
}

function weightedRangeFor(rows, weightForRow) {
  return weightedRange(rows.map(row => ({ hand: row.hand, weight: weightForRow(row) })));
}

function createEquityLookup({ hand, hero, samples, equityCalculator, randomFactory }) {
  const cache = new Map();
  return (label, rows, weightForRow) => {
    const range = weightedRangeFor(rows, weightForRow);
    if (!range.length) return null;
    const cacheKey = `${label}:${rows.map(row => `${row.hand}=${weightForRow(row)}`).join(",")}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const random = randomFactory(seedFor(`open-ev|${hero}|${hand}|${label}`));
    const equity = equityCalculator(hand, range, samples, random);
    if (equity === null || !Number.isFinite(equity)) throw new Error(`Could not calculate equity for ${hero} ${hand} vs ${label}`);
    cache.set(cacheKey, equity);
    return equity;
  };
}

function addLeaf(leafMap, path, probability, netEv, details = {}) {
  probability *= leafMap.comboWeight ?? 1;
  if (probability <= 0) return;
  const key = path.join("/");
  const current = leafMap.get(key) ?? { path, probability: 0, netContribution: 0, details };
  current.probability += probability;
  current.netContribution += probability * netEv;
  leafMap.set(key, current);
}

function makeBranchTree(leafMap, blind) {
  const root = {};
  for (const leaf of leafMap.values()) {
    const net = leaf.netContribution / leaf.probability;
    let cursor = root;
    let prefix = [];
    for (const segment of leaf.path) {
      prefix.push(segment);
      cursor[segment] ??= { _probability: 0, _netContribution: 0, outcomes: {} };
      cursor = cursor[segment];
      cursor._probability += leaf.probability;
      cursor._netContribution += leaf.netContribution;
      if (prefix.length === leaf.path.length) Object.assign(cursor, leaf.details);
      else cursor = cursor.outcomes;
    }
  }

  const finalize = (node, parentProbability = 1) => {
    for (const [key, value] of Object.entries(node)) {
      const probability = value._probability;
      const netEv = probability ? value._netContribution / probability : 0;
      const hasOutcomes = Object.keys(value.outcomes ?? {}).length > 0;
      const output = {
        probability: round(probability),
        conditional_probability: round(parentProbability ? probability / parentProbability : 0),
        net_ev_bb: round(netEv),
        delta_ev_bb: round(netEv + blind),
        ev_contribution_bb: round(value._netContribution),
        ...Object.fromEntries(Object.entries(value).filter(([field]) => !field.startsWith("_") && field !== "outcomes")),
      };
      if (hasOutcomes) output.outcomes = finalize(value.outcomes, probability);
      node[key] = output;
    }
    return node;
  };
  return finalize(root);
}

/**
 * Estimate a single hand's open EV, relative to folding, using the persisted
 * six-max response datasets. This is deliberately an approximation, not a
 * solver: only the first non-folding seat is modeled and later seats fold.
 */
export function calculateOpenEvForHand({
  hero,
  hand,
  openFreq = 0,
  datasets,
  samples = SAMPLE_COUNT,
  realizationFactors = REALIZATION_FACTORS,
  equityCalculator = equityVsRange,
  randomFactory = seededRandom,
}) {
  if (!datasets?.opening || !datasets?.preflop || !datasets?.threeBet || !datasets?.fourBet || !datasets?.fiveBet) {
    throw new Error("The opening, preflop, three-bet, four-bet and five-bet saved datasets are required");
  }
  const openingSpot = requireSpot(datasets.opening.spots, spot => spot.hero === hero, `${hero}_open`);
  const openSize = openingSpot.open_size_bb ?? openSizeFor(hero);
  if (!rowFor(openingSpot, hand)) throw new Error(`Missing ${hero} opening hand ${hand} in ${openingSpot.id}`);
  const seats = behindPositions(hero);
  const handCombos = combosOf(hand);
  const blind = BLINDS[hero] ?? 0;
  const leafMap = new Map();
  leafMap.comboWeight = 1 / handCombos.length;
  const equity = createEquityLookup({ hand, hero, samples, equityCalculator, randomFactory });
  const spotData = seats.map(position => {
    const response = requireSpot(datasets.preflop.spots, spot => spot.opener === hero && spot.hero === position, `${position}_vs_${hero}`);
    const threeBet = requireSpot(datasets.threeBet.spots, spot => spot.opener === hero && spot.three_bettor === position, `${hero}_vs_${position}_three_bet`);
    const fourBet = requireSpot(datasets.fourBet.spots, spot => spot.opener === hero && spot.hero === position, `${position}_vs_${hero}_four_bet`);
    const fiveBet = requireSpot(datasets.fiveBet.spots, spot => spot.opener === hero && spot.five_bettor === position, `${hero}_vs_${position}_five_bet`);
    const threeBetSourceByHand = new Map(spotRows(response).map(row => [row.hand, row]));
    const fourBetWeightedRows = spotRows(fourBet).map(row => ({ ...row, three_bet: threeBetSourceByHand.get(row.hand)?.three_bet ?? 0 }));
    return { position, response, threeBet, fourBet, fourBetWeightedRows, fiveBet };
  });

  const callEquities = new Map();
  const threeBetEquities = new Map();
  const fourBetCallEquities = new Map();
  const shoveEquities = new Map();
  const realized = new Map();

  handCombos.forEach(heroCombo => {
    const seatActions = spotData.map(({ response }) => probabilitiesForCombo(spotRows(response), heroCombo, ACTIONS.response));
    let priorFolds = 1;
    for (let index = 0; index < spotData.length; index += 1) {
      const { position, response, threeBet, fourBet, fourBetWeightedRows, fiveBet } = spotData[index];
      const actionProbabilities = seatActions[index];
      const dead = deadBlinds(hero, position);
      const openCallProbability = priorFolds * actionProbabilities.call;
      if (openCallProbability > 0) {
        const key = position;
        if (!callEquities.has(key)) {
          callEquities.set(key, equity(`open-call:${position}`, spotRows(response), row => pct(row.call)));
          realized.set(`open-call:${position}`, realizationFactor(hand, hero, position, realizationFactors));
        }
        const eq = callEquities.get(key);
        const r = realized.get(`open-call:${position}`);
        const grossPot = openSize + openSize + dead;
        const pot = raked(grossPot);
        addLeaf(leafMap, ["calls", position], openCallProbability, eq * r * pot - openSize,
          { equity: round(eq), realization: r, pot_bb: grossPot, raked_pot_bb: round(pot), rake_bb: round(rake(grossPot)) });
      }

      const threeBetProbability = priorFolds * actionProbabilities.three_bet;
      if (threeBetProbability > 0) {
        const unreachable = rowFor(openingSpot, hand).open === 0;
        if (unreachable) {
          addLeaf(leafMap, ["three_bets", position, "fold"], threeBetProbability, -openSize, { unreachable: true });
        } else {
          const heroDecision = rowFor(threeBet, hand);
          if (!heroDecision) throw new Error(`Missing ${hero} response hand ${hand} in ${threeBet.id}`);
          const size = threeBet.three_bet_size_bb;
          const rPostflop = realizationFactor(hand, hero, position, realizationFactors);
          const heroFold = pct(heroDecision.fold);
          const heroCall = pct(heroDecision.call);
          const heroFourBet = pct(heroDecision.four_bet);

          addLeaf(leafMap, ["three_bets", position, "fold"], threeBetProbability * heroFold, -openSize);

          if (heroCall > 0) {
            if (!threeBetEquities.has(position)) {
              threeBetEquities.set(position, equity(`three-bet:${position}`, spotRows(response), row => pct(row.three_bet)));
              realized.set(`three-bet:${position}`, rPostflop);
            }
            const eq = threeBetEquities.get(position);
            const grossPot = 2 * size + dead;
            const pot = raked(grossPot);
            addLeaf(leafMap, ["three_bets", position, "call"], threeBetProbability * heroCall, eq * rPostflop * pot - size,
              { equity: round(eq), realization: rPostflop, pot_bb: grossPot, raked_pot_bb: round(pot), rake_bb: round(rake(grossPot)), three_bet_size_bb: size });
          }

          if (heroFourBet > 0) {
            const opponentActions = probabilitiesForCombo(fourBetWeightedRows, heroCombo, ACTIONS.threeBettorFacingFourBet, "three_bet");
            const fourBetSize = threeBet.four_bet_size_bb;
            const fourBetProbability = threeBetProbability * heroFourBet;

            addLeaf(leafMap, ["three_bets", position, "four_bet", "fold"], fourBetProbability * opponentActions.fold, size + dead, { three_bet_size_bb: size, four_bet_size_bb: fourBetSize });

            if (opponentActions.call > 0) {
              if (!fourBetCallEquities.has(position)) {
                fourBetCallEquities.set(position, equity(
                  `four-bet-call:${position}`,
                  fourBetWeightedRows,
                  row => pct(row.three_bet) * pct(row.call),
                ));
                realized.set(`four-bet-call:${position}`, rPostflop);
              }
              const eq = fourBetCallEquities.get(position);
              const grossPot = 2 * fourBetSize + dead;
              const pot = raked(grossPot);
              addLeaf(leafMap, ["three_bets", position, "four_bet", "call"], fourBetProbability * opponentActions.call, eq * rPostflop * pot - fourBetSize,
                { equity: round(eq), realization: rPostflop, pot_bb: grossPot, raked_pot_bb: round(pot), rake_bb: round(rake(grossPot)), three_bet_size_bb: size, four_bet_size_bb: fourBetSize });
            }

            if (opponentActions.all_in > 0) {
              const fiveBetDecision = rowFor(fiveBet, hand);
              if (!fiveBetDecision) throw new Error(`Missing ${hero} 5bet response hand ${hand} in ${fiveBet.id}`);
              const heroCallFiveBet = pct(fiveBetDecision.call);
              const heroFoldFiveBet = pct(fiveBetDecision.fold);
              let shoveEquity = null;
              if (heroCallFiveBet > 0) {
                if (!shoveEquities.has(position)) {
                  shoveEquities.set(position, equity(
                    `shove:${position}`,
                    fourBetWeightedRows,
                    row => pct(row.three_bet) * pct(row.all_in),
                  ));
                }
                shoveEquity = shoveEquities.get(position);
              }
              const allInProbability = fourBetProbability * opponentActions.all_in;
              if (heroCallFiveBet > 0) {
                const grossPot = 2 * EFFECTIVE_STACK_BB + dead;
                const pot = raked(grossPot);
                const net = shoveEquity * pot - EFFECTIVE_STACK_BB;
                addLeaf(leafMap, ["three_bets", position, "four_bet", "all_in", "call"], allInProbability * heroCallFiveBet, net,
                  { equity: round(shoveEquity), realization: 1, pot_bb: grossPot, raked_pot_bb: round(pot), rake_bb: round(rake(grossPot)), all_in_size_bb: EFFECTIVE_STACK_BB });
              }
              if (heroFoldFiveBet > 0) {
                addLeaf(leafMap, ["three_bets", position, "four_bet", "all_in", "fold"], allInProbability * heroFoldFiveBet, -fourBetSize, { all_in_size_bb: EFFECTIVE_STACK_BB, four_bet_size_bb: fourBetSize });
              }
            }
          }
        }
      }
      priorFolds *= actionProbabilities.fold;
    }
    addLeaf(leafMap, ["all_fold"], priorFolds, 1.5 - blind);
  });

  const totalProbability = [...leafMap.values()].reduce((sum, leaf) => sum + leaf.probability, 0);
  if (Math.abs(totalProbability - 1) > 1e-8) {
    throw new Error(`Branch probabilities for ${hero} ${hand} sum to ${totalProbability}, not 1`);
  }
  const expectedNet = [...leafMap.values()].reduce((sum, leaf) => sum + leaf.netContribution, 0);
  const branches = makeBranchTree(leafMap, blind);
  return {
    hand,
    open_freq: openFreq,
    delta_ev_bb: round(expectedNet + blind),
    expected_net_ev_bb: round(expectedNet),
    p_all_fold: branches.all_fold?.probability ?? 0,
    branches,
    samples,
  };
}

export function calculateOpenEvForPosition({ hero, datasets, samples = SAMPLE_COUNT, ...options }) {
  if (!OPENING_POSITIONS.includes(hero)) throw new Error(`Unsupported opening position: ${hero}`);
  const opening = requireSpot(datasets.opening.spots, spot => spot.hero === hero, `${hero}_open`);
  return {
    position: hero,
    open_size_bb: opening.open_size_bb,
    effective_stack_bb: opening.effective_stack_bb,
    samples,
    model: "Approximate EV vs fold using persisted response ranges; not a solver. First non-fold action only; later seats fold. Showdown branches use configured 5% rake capped at 3BB; all-fold branches are rake-free under no flop no drop.",
    assumptions: {
      open_size_bb: opening.open_size_bb,
      realization_factors: options.realizationFactors ?? REALIZATION_FACTORS,
      effective_stack_bb: EFFECTIVE_STACK_BB,
      blinds: BLINDS,
      rake: rakeMetadata,
    },
    hands: opening.hands.map(row => calculateOpenEvForHand({ hero, hand: row.hand, openFreq: row.open, datasets, samples, ...options })),
  };
}

export function summarizeOpenEv(positionResult) {
  const handRows = positionResult.hands;
  const totalCombos = handRows.reduce((sum, row) => sum + comboCount(row.hand), 0);
  const currentWeightedCombos = handRows.reduce((sum, row) => sum + comboCount(row.hand) * row.open_freq / 100, 0);
  const positiveCombos = handRows.reduce((sum, row) => sum + (row.delta_ev_bb > 0 ? comboCount(row.hand) : 0), 0);
  const foldedButPositive = handRows
    .filter(row => row.open_freq < 50 && row.delta_ev_bb >= 0.05)
    .sort((a, b) => b.delta_ev_bb - a.delta_ev_bb || a.hand.localeCompare(b.hand));
  const openedButNegative = handRows
    .filter(row => row.open_freq >= 50 && row.delta_ev_bb <= -0.05)
    .sort((a, b) => a.delta_ev_bb - b.delta_ev_bb || a.hand.localeCompare(b.hand));
  return {
    position: positionResult.position,
    current_open_width_pct: currentWeightedCombos / totalCombos * 100,
    positive_ev_only_width_pct: positiveCombos / totalCombos * 100,
    folded_but_positive: foldedButPositive,
    opened_but_negative: openedButNegative,
  };
}
