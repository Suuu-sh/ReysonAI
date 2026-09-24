// Consistency audit for persisted estimated ranges. Shared by the CLI, tests and the build pipeline.
import { openSizeFor } from "./sizing.js";
import handStrength from "./hand-strength.json" with { type: "json" };
const ranks = "AKQJT98765432";
const positions = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const blind = { SB: 0.5, BB: 1 };
const TOLERANCE = 10; // percentage points before an ordering break is reported
const combos = hand => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
const rows = spot => new Map(spot.hands.map(row => [row.hand, row]));
export const pct = value => `${(value * 100).toFixed(1)}%`;

export const BALANCE_CHECKS = Object.freeze(["range-capped", "over-segregated"]);
const PASSIVE_ACTIONS = ["limp", "call", "check"];
const AGGRESSIVE_ACTIONS = ["open", "three_bet", "four_bet", "squeeze", "raise", "all_in"];
const ACTIONS = [...PASSIVE_ACTIONS, ...AGGRESSIVE_ACTIONS, "fold"];
// Preserve the existing consistency gate, including its historical warn checks.
// Only the new balance warnings are advisory; they must never block publishing.
export const isBlockingAuditFinding = finding => finding.severity === "error" || !BALANCE_CHECKS.includes(finding.check);

export function checkRangeBalance(spot, weight = () => 1, segregationExemption = null) {
  const live = spot.hands.map(row => ({ row, weight: combos(row.hand) * weight(row.hand) }))
    .filter(item => item.weight > 0);
  const total = live.reduce((sum, item) => sum + item.weight, 0);
  const actions = ACTIONS.filter(action => spot.hands.some(row => Object.hasOwn(row, action)));
  const findings = [];
  if (!total) return { spot: spot.id, reachableCombos: 0, findings };

  // A checked-in random-opponent equity table is deliberately used for all
  // nodes: cheap at build time, and never dependent on missing/stale local facts.
  // Rank the incoming (reach-weighted) range, not the outgoing passive range.
  const ranked = [...live].sort((a, b) => handStrength.equity[b.row.hand] - handStrength.equity[a.row.hand]);
  const strongWeight = new Map();
  let remaining = total * 0.1;
  for (let start = 0; start < ranked.length && remaining > 0;) {
    let end = start + 1;
    while (end < ranked.length && handStrength.equity[ranked[end].row.hand] === handStrength.equity[ranked[start].row.hand]) end += 1;
    const group = ranked.slice(start, end);
    const groupWeight = group.reduce((sum, item) => sum + item.weight, 0);
    const fraction = Math.min(1, remaining / groupWeight);
    for (const item of group) strongWeight.set(item.row.hand, item.weight * fraction);
    remaining -= groupWeight * fraction;
    start = end;
  }
  const totals = Object.fromEntries(actions.map(action => [action,
    live.reduce((sum, item) => sum + item.weight * (item.row[action] ?? 0) / 100, 0),
  ]));
  const actionFrequencies = Object.fromEntries(actions.map(action => [action, totals[action] / total]));
  const passiveStrongShares = {};
  for (const action of PASSIVE_ACTIONS.filter(action => actions.includes(action))) {
    const strong = live.reduce((sum, { row }) => sum + (strongWeight.get(row.hand) ?? 0) * (row[action] ?? 0) / 100, 0);
    const share = totals[action] ? strong / totals[action] : 0;
    passiveStrongShares[action] = share;
    if (actionFrequencies[action] >= 0.1 - 1e-12 && share < 0.02 - 1e-12) {
      findings.push({ check: "range-capped", severity: "warn", spot: spot.id,
        detail: `${spot.id} の ${action} に強いハンドがほぼ含まれない（頻度 ${pct(actionFrequencies[action])}、上位10%の占有率 ${pct(share)} < 2%）` });
    }
  }
  const pureShare = live.reduce((sum, { row, weight }) => sum + (actions.some(action => row[action] === 100) ? weight : 0), 0) / total;
  if (!segregationExemption && pureShare > 0.85 + 1e-12 && Object.values(actionFrequencies).filter(f => f >= 0.1 - 1e-12).length >= 2) {
    findings.push({ check: "over-segregated", severity: "warn", spot: spot.id,
      detail: `単一アクション100%のハンドが到達コンボの ${pct(pureShare)} > 85%（2つ以上のアクションを各10%以上使用）` });
  }
  return { spot: spot.id, reachableCombos: total, strengthSource: "hand-strength.json (random opponent)",
    actionFrequencies, passiveStrongShares, pureShare, segregationExemption, findings };
}

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

export function auditEstimates({ opening, responses, threeBets, fourBets, fiveBets, multiway, limp }) {
  const findings = [];
  const add = (check, severity, spot, detail) => findings.push({ check, severity, spot, detail });
  const openBy = new Map(opening.spots.map(spot => [spot.hero, rows(spot)]));
  const responseBy = new Map(responses.spots.map(spot => [`${spot.opener}>${spot.hero}`, spot]));

  // 1. Opening ranges: strength order and position nesting.
  for (const spot of opening.spots) {
    const hasLimp = spot.hero === "SB";
    for (const row of spot.hands) {
      if (hasLimp ? row.open + row.limp + row.fold !== 100 : row.open + row.fold !== 100 || Object.hasOwn(row, "limp")) {
        add("range-flow", "error", `${spot.hero} open`, `${row.hand}: open/limp/foldの合計またはlimp位置が不正`);
      }
    }
    checkStrengthOrder(add, `${spot.hero} open`, { hands: spot.hands.map(row => ({ ...row, fold: row.fold })) });
  }
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
      // SB splits participation between a 3.5BB raise and a protected limp;
      // unlike BTN's 2.5BB RFI this is a selected branch, so nesting ends here.
      if (hero === "BB" && openers[i + 1] === "SB") continue;
      const vsEarly = rows(responseBy.get(`${openers[i]}>${hero}`));
      const vsLate = rows(responseBy.get(`${openers[i + 1]}>${hero}`));
      for (const [hand, row] of vsEarly) {
        if (vsLate.get(hand).fold - row.fold > TOLERANCE) {
          add("defense-nesting", "warn", `${hero} vs ${openers[i]}/${openers[i + 1]}`, `${hand}: vs ${openers[i + 1]} のほうが${vsLate.get(hand).fold - row.fold}pt多くフォールド`);
        }
      }
    }
  }

  // SB limp path: its action split is complete, and the iso response honors
  // reachability while continuing more often with stronger hands.
  if (limp) {
    const openingSb = opening.spots.find(spot => spot.id === "SB_open" && spot.hero === "SB");
    const bbLimp = limp.spots.find(spot => spot.id === "BB_vs_SB_limp");
    const sbIso = limp.spots.find(spot => spot.id === "SB_vs_BB_iso");
    if (!openingSb || !bbLimp || !sbIso) {
      add("range-flow", "error", "SB limp", "必要なSB limp局面が不足");
    } else {
      const limpByHand = rows(openingSb);
      checkStrengthOrder(add, "BB vs SB limp", {
        hands: bbLimp.hands.map(row => ({ ...row, fold: 100 - row.raise })),
      });
      checkStrengthOrder(add, "SB vs BB iso", sbIso, hand => (limpByHand.get(hand)?.limp ?? 0) > 0);
      for (const row of sbIso.hands) {
        if ((limpByHand.get(row.hand)?.limp ?? 0) === 0 &&
            (row.fold !== 100 || row.call !== 0 || row.raise !== 0)) {
          add("range-flow", "error", "SB vs BB iso", `${row.hand}: SB limp 0%なのに到達不能プレースホルダーでない`);
        }
      }
    }
  }

  const autoProfit = [];
  for (const opener of positions.slice(0, 5)) {
    const openSize = openSizeFor(opener);
    const risk = openSize - (blind[opener] ?? 0);
    const reward = 1.5 - (blind[opener] ?? 0);
    const threshold = risk / (risk + reward);
    const later = positions.slice(positions.indexOf(opener) + 1);
    const allFold = later.reduce((product, hero) => product * weightedFold(responseBy.get(`${opener}>${hero}`)), 1);
    autoProfit.push({ spot: `${opener} open ${openSize}`, foldRate: allFold, threshold });
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
    const reward = openSizeFor(spot.opener) + dead;
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
    const risk = spot.four_bet_size_bb - openSizeFor(spot.opener);
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

  // 7. Advisory balance checks on every dataset. Source action frequencies
  // weight incoming combos; unreachable fold=100 placeholders count for neither
  // the top-strength decile nor pure-action share.
  const rangeBalance = [];
  const balance = (spot, weight, exemption) => {
    const result = checkRangeBalance(spot, weight, exemption);
    findings.push(...result.findings);
    const { findings: ignored, ...metrics } = result;
    rangeBalance.push(metrics);
  };
  for (const spot of opening.spots) {
    // Ordinary fold/open RFI is naturally close to pure; SB's limp is NOT exempt.
    const binary = spot.hands.every(row => !Object.hasOwn(row, "limp"));
    balance(spot, undefined, binary ? "fold/open RFI" : null);
  }
  for (const spot of responses.spots) balance(spot);
  for (const spot of threeBets.spots) balance(spot, hand => openBy.get(spot.opener).get(hand).open / 100);
  for (const spot of fourBets.spots) {
    const source = rows(responseBy.get(`${spot.opener}>${spot.hero}`));
    balance(spot, hand => source.get(hand).three_bet / 100);
  }
  for (const spot of fiveBets?.spots ?? []) {
    const previous = rows(threeBets.spots.find(s => s.opener === spot.opener && s.three_bettor === spot.five_bettor));
    // Facing a 5bet all-in, only equity and price decide call/fold: b is exempt,
    // but a (passive-range cap detection) still runs.
    balance(spot, hand => openBy.get(spot.opener).get(hand).open / 100 * previous.get(hand).four_bet / 100, "5bet all-in response");
  }
  for (const spot of multiway?.spots ?? []) balance(spot);
  for (const spot of limp?.spots ?? []) {
    balance(spot, spot.hero === "SB" ? hand => openBy.get("SB").get(hand).limp / 100 : undefined);
  }
  const balanceSummary = Object.fromEntries(BALANCE_CHECKS.map(check => {
    const matches = findings.filter(f => f.check === check);
    return [check, { count: matches.length, spots: [...new Set(matches.map(f => f.spot))].sort() }];
  }));

  // Range widths for a sanity read.
  const widths = opening.spots.map(spot => ({ spot: `${spot.hero} open`, width: 1 - weightedFold(spot) }));
  return { findings, autoProfit, threeBetDefense, fourBetDefense, fiveBetDefense, widths, rangeBalance, balanceSummary };
}
