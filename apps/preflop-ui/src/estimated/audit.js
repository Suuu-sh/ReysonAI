// Consistency audit for persisted estimated ranges. Shared by the CLI, tests and the build pipeline.
const ranks = "AKQJT98765432";
const positions = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const blind = { SB: 0.5, BB: 1 };
const TOLERANCE = 10; // percentage points before an ordering break is reported
const combos = hand => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
const rows = spot => new Map(spot.hands.map(row => [row.hand, row]));
export const pct = value => `${(value * 100).toFixed(1)}%`;

// Hands that should never fold more than the hand after them.
function strengthChains() {
  const chains = [[...ranks].map(rank => rank + rank)];
  for (let i = 0; i < ranks.length - 1; i += 1) {
    for (const suit of ["s", "o"]) {
      const chain = [...ranks.slice(i + 1)].map(kicker => ranks[i] + kicker + suit);
      if (chain.length > 1) chains.push(chain);
    }
  }
  return chains;
}
const chains = strengthChains();

function checkStrengthOrder(add, label, spot, reachable = () => true) {
  const byHand = rows(spot);
  for (const chain of chains) {
    const live = chain.filter(hand => reachable(hand));
    for (let i = 0; i < live.length - 1; i += 1) {
      const stronger = byHand.get(live[i]);
      const weaker = byHand.get(live[i + 1]);
      // A5x over A6x is the standard wheel/blocker exception, not an error.
      if (/^A6/.test(stronger.hand) && /^A5/.test(weaker.hand)) continue;
      if (stronger.fold - weaker.fold > TOLERANCE) {
        add("strength-order", "warn", label, `${stronger.hand} がフォールド${stronger.fold}% > ${weaker.hand} のフォールド${weaker.fold}%`);
      }
    }
  }
  for (let i = 0; i < ranks.length; i += 1) {
    for (let j = i + 1; j < ranks.length; j += 1) {
      const suited = byHand.get(ranks[i] + ranks[j] + "s");
      const offsuit = byHand.get(ranks[i] + ranks[j] + "o");
      if (!reachable(suited.hand) || !reachable(offsuit.hand)) continue;
      if (suited.fold - offsuit.fold > TOLERANCE) {
        add("suited-vs-offsuit", "warn", label, `${suited.hand} フォールド${suited.fold}% > ${offsuit.hand} フォールド${offsuit.fold}%`);
      }
    }
  }
}

function weightedFold(spot, weight = () => 1) {
  let total = 0;
  let folded = 0;
  for (const row of spot.hands) {
    const w = combos(row.hand) * weight(row.hand);
    total += w;
    folded += w * row.fold / 100;
  }
  return total ? folded / total : 0;
}

export function auditEstimates({ opening, responses, threeBets, fourBets, fiveBets, multiway }) {
  const findings = [];
  const add = (check, severity, spot, detail) => findings.push({ check, severity, spot, detail });
  const openBy = new Map(opening.spots.map(spot => [spot.hero, rows(spot)]));
  const responseBy = new Map(responses.spots.map(spot => [`${spot.opener}>${spot.hero}`, spot]));

  // 1. Opening ranges: strength order and position nesting.
  for (const spot of opening.spots) checkStrengthOrder(add, `${spot.hero} open`, { hands: spot.hands.map(row => ({ ...row, fold: row.fold })) });
  const openOrder = ["UTG", "HJ", "CO", "BTN"];
  for (let i = 0; i < openOrder.length - 1; i += 1) {
    const early = openBy.get(openOrder[i]);
    const late = openBy.get(openOrder[i + 1]);
    for (const [hand, row] of early) {
      if (row.open - late.get(hand).open > TOLERANCE) {
        add("position-nesting", "warn", `${openOrder[i]}→${openOrder[i + 1]} open`, `${hand}: ${openOrder[i]} ${row.open}% > ${openOrder[i + 1]} ${late.get(hand).open}%`);
      }
    }
  }

  // 2. Responses to an open: strength order, defense tightening vs earlier openers, auto-profit check.
  for (const spot of responses.spots) checkStrengthOrder(add, `${spot.hero} vs ${spot.opener}`, spot);
  for (const hero of positions) {
    const openers = positions.filter(opener => responseBy.has(`${opener}>${hero}`));
    for (let i = 0; i < openers.length - 1; i += 1) {
      const vsEarly = rows(responseBy.get(`${openers[i]}>${hero}`));
      const vsLate = rows(responseBy.get(`${openers[i + 1]}>${hero}`));
      for (const [hand, row] of vsEarly) {
        if (vsLate.get(hand).fold - row.fold > TOLERANCE) {
          add("defense-nesting", "warn", `${hero} vs ${openers[i]}/${openers[i + 1]}`, `${hand}: vs ${openers[i + 1]} のほうが${vsLate.get(hand).fold - row.fold}pt多くフォールド`);
        }
      }
    }
  }

  const autoProfit = [];
  for (const opener of positions.slice(0, 5)) {
    const risk = 2.5 - (blind[opener] ?? 0);
    const reward = 1.5 - (blind[opener] ?? 0);
    const threshold = risk / (risk + reward);
    const later = positions.slice(positions.indexOf(opener) + 1);
    const allFold = later.reduce((product, hero) => product * weightedFold(responseBy.get(`${opener}>${hero}`)), 1);
    autoProfit.push({ spot: `${opener} open 2.5`, foldRate: allFold, threshold });
    if (allFold > threshold) add("auto-profit", "error", `${opener} open`, `後ろ全員のフォールド率 ${pct(allFold)} > 損益分岐 ${pct(threshold)}（どの2枚でもオープンで得をする）`);
  }

  // 3. Opener facing a 3bet: range flow and auto-profit for the 3bettor.
  const threeBetDefense = [];
  for (const spot of threeBets.spots) {
    const openRows = openBy.get(spot.opener);
    const reachable = hand => openRows.get(hand).open > 0;
    const label = `${spot.opener} vs ${spot.three_bettor} 3bet`;
    for (const row of spot.hands) {
      if (!reachable(row.hand) && row.fold !== 100) add("range-flow", "error", label, `${row.hand} はオープン0%なのにフォールド100%になっていない`);
    }
    checkStrengthOrder(add, label, spot, reachable);
    const bT = blind[spot.three_bettor] ?? 0;
    const bO = blind[spot.opener] ?? 0;
    const dead = 1.5 - bT - bO;
    const risk = spot.three_bet_size_bb - bT;
    const reward = 2.5 + dead;
    const threshold = risk / (risk + reward);
    const foldRate = weightedFold(spot, hand => openRows.get(hand).open / 100);
    threeBetDefense.push({ spot: label, size: spot.three_bet_size_bb, foldRate, threshold });
    if (foldRate > threshold) add("auto-profit", "error", label, `オープナーのフォールド率 ${pct(foldRate)} > 損益分岐 ${pct(threshold)}（どの2枚でも3betで得をする）`);
  }

  // 4. 3bettor facing a 4bet: range flow and auto-profit for the 4bettor.
  const fourBetDefense = [];
  for (const spot of fourBets.spots) {
    const source = rows(responseBy.get(`${spot.opener}>${spot.hero}`));
    const reachable = hand => source.get(hand).three_bet > 0;
    const label = `${spot.hero} vs ${spot.opener} 4bet`;
    for (const row of spot.hands) {
      if (!reachable(row.hand) && row.fold !== 100) add("range-flow", "error", label, `${row.hand} は3bet 0%なのにフォールド100%になっていない`);
    }
    checkStrengthOrder(add, label, spot, reachable);
    const bT = blind[spot.hero] ?? 0;
    const bO = blind[spot.opener] ?? 0;
    const dead = 1.5 - bT - bO;
    const risk = spot.four_bet_size_bb - 2.5;
    const reward = spot.three_bet_size_bb + dead;
    const threshold = risk / (risk + reward);
    const foldRate = weightedFold(spot, hand => source.get(hand).three_bet / 100);
    fourBetDefense.push({ spot: label, size: spot.four_bet_size_bb, foldRate, threshold });
    if (foldRate > threshold) add("auto-profit", "error", label, `3bettorのフォールド率 ${pct(foldRate)} > 損益分岐 ${pct(threshold)}（どの2枚でも4betで得をする）`);
  }

  // 5. Opener facing the 5bet all-in: range flow and auto-profit for the shover.
  const fiveBetDefense = [];
  for (const spot of fiveBets?.spots ?? []) {
    const openRows = openBy.get(spot.opener);
    const previous = rows(threeBets.spots.find(s => s.opener === spot.opener && s.three_bettor === spot.five_bettor));
    const reachable = hand => openRows.get(hand).open > 0 && previous.get(hand).four_bet > 0;
    const label = `${spot.opener} vs ${spot.five_bettor} 5bet`;
    for (const row of spot.hands) {
      if (!reachable(row.hand) && (row.fold !== 100 || !row.reason.includes("対象外"))) add("range-flow", "error", label, `${row.hand} は4bet 0%なのに対象外になっていない`);
      if (reachable(row.hand) && row.reason.includes("対象外")) add("range-flow", "error", label, `${row.hand} は4betしているのに対象外扱い`);
    }
    checkStrengthOrder(add, label, spot, reachable);
    const dead = 1.5 - (blind[spot.opener] ?? 0) - (blind[spot.five_bettor] ?? 0);
    const risk = 100 - spot.three_bet_size_bb;
    const reward = spot.four_bet_size_bb + dead;
    const threshold = risk / (risk + reward);
    const foldRate = weightedFold(spot, hand => openRows.get(hand).open / 100 * previous.get(hand).four_bet / 100);
    fiveBetDefense.push({ spot: label, foldRate, threshold });
    if (foldRate > threshold) add("auto-profit", "error", label, `オープナーのフォールド率 ${pct(foldRate)} > 損益分岐 ${pct(threshold)}（どの2枚でも5betオールインで得をする）`);
  }

  // 6. BB squeeze after an open and one call: preserve family order and keep
  // the two-opponent squeeze narrower than BB's heads-up 3bet vs that opener.
  for (const spot of multiway?.spots ?? []) {
    checkStrengthOrder(add, spot.id, spot);
    const headsUp = responseBy.get(`${spot.opener}>BB`);
    const squeezeCombos = spot.hands.reduce((sum, row) => sum + combos(row.hand) * row.squeeze / 100, 0);
    const threeBetCombos = headsUp.hands.reduce((sum, row) => sum + combos(row.hand) * row.three_bet / 100, 0);
    if (squeezeCombos > threeBetCombos + 1e-9) {
      add("squeeze-width", "warn", spot.id, `スクイーズ ${squeezeCombos.toFixed(1)}コンボ > BBヘッズアップ3bet ${threeBetCombos.toFixed(1)}コンボ`);
    }
  }

  // Range widths for a sanity read.
  const widths = opening.spots.map(spot => ({ spot: `${spot.hero} open`, width: 1 - weightedFold(spot) }));
  return { findings, autoProfit, threeBetDefense, fourBetDefense, fiveBetDefense, widths };
}
