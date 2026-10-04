// Consistency audit for persisted estimated ranges. Shared by the CLI, tests and the build pipeline.
import { dataset } from "./datasets.ts";
import { auditContinuationEstimates } from "./continuation-audit.ts";
import { openSizeFor } from "./sizing.ts";
import { coldFourBetFoldThreshold, callContexts, callFacts, validCallEquities, callDefenseCapacity, limpFiveBetFoldThreshold, limpFourBetFoldThreshold, limpReraiseFoldThreshold, squeezeFoldThreshold } from "./call-ev.ts";

// Published preflop datasets (src/estimated/datasets.ts); preloaded before this module runs in the browser.
const handStrength = dataset("hand-strength");
const callEquitiesTable = dataset("call-equities");
const ranks = "AKQJT98765432";
const positions = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const blind = { SB: 0.5, BB: 1 };
const TOLERANCE = 10; // percentage points before an ordering break is reported
const combos = hand => hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12;
const rows = spot => new Map(spot.hands.map(row => [row.hand, row]));
export const pct = value => `${(value * 100).toFixed(1)}%`;

import { BALANCE_CHECKS, isBlockingAuditFinding } from "./audit-policy.ts";
export { BALANCE_CHECKS, isBlockingAuditFinding };
const PASSIVE_ACTIONS = ["limp", "call", "check"];
const AGGRESSIVE_ACTIONS = ["open", "three_bet", "four_bet", "squeeze", "raise", "all_in"];
const ACTIONS = [...PASSIVE_ACTIONS, ...AGGRESSIVE_ACTIONS, "fold"];
// Preserve ordinary consistency failures; expose proven, fully defended EV-capacity conflicts separately.
// Balance and cross-family strength warnings are advisory, not publication blockers.

export function checkCrossStrengthInversion(spot, weight = () => 1) {
  const live = spot.hands.filter(row => row.hand.length === 3 && weight(row.hand) > 0)
    .map(row => ({ hand: row.hand, equity: handStrength.equity[row.hand],
      continuation: ACTIONS.filter(action => action !== "fold").reduce((sum, action) => sum + (row[action] ?? 0), 0) }));
  const playable = hand => /^A[5432][so]$/.test(hand) || Math.abs(ranks.indexOf(hand[0]) - ranks.indexOf(hand[1])) <= 2;
  const findings = [];
  // Offsuit only: suited connectors/gappers legitimately outplay weak suited Kx/Qx through
  // straight+flush playability that raw equity vs a random hand does not capture.
  for (const kind of ["o"]) {
    const candidates = live.filter(row => row.hand.endsWith(kind));
    const inversions = [];
    for (const stronger of candidates) {
      for (const weaker of candidates) {
        // Only B's playability is an exception. Frequencies are conditional on
        // reaching this node; positive source weights must not dilute them.
        if (playable(weaker.hand) || stronger.equity - weaker.equity < 0.04 - 1e-12 ||
            weaker.continuation - stronger.continuation < 20) continue;
        inversions.push({ stronger, weaker });
      }
    }
    if (!inversions.length) continue;
    inversions.sort((a, b) => (b.stronger.equity - b.weaker.equity) - (a.stronger.equity - a.weaker.equity) ||
      (b.weaker.continuation - b.stronger.continuation) - (a.weaker.continuation - a.stronger.continuation) ||
      a.stronger.hand.localeCompare(b.stronger.hand) || a.weaker.hand.localeCompare(b.weaker.hand));
    const examples = inversions.slice(0, 3);
    const detail = examples.map(({ stronger: a, weaker: b }) =>
      `${a.hand}（勝率${pct(a.equity)}・継続${a.continuation}%） > ${b.hand}（勝率${pct(b.equity)}・継続${b.continuation}%）`).join(" / ");
    findings.push({ check: "cross-strength-inversion", severity: "warn", spot: spot.id,
      kind, count: inversions.length, examples,
      detail: `${kind === "s" ? "スーテッド" : "オフスート"}の強さと継続率が逆転: ${inversions.length}組（勝率差4pt以上・継続率差20pt以上）。代表例: ${detail}` });
  }
  return findings;
}

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

export function auditEstimates({ opening, responses, threeBets, fourBets, fiveBets, multiway, squeezes, limp, limpDeep, coldThreeBets, multiway2, coldFourBets, continuations, continuationEquities, callEquities = callEquitiesTable }) {
  const findings = [];
  const add = (check, severity, spot, detail) => findings.push({ check, severity, spot, detail });
  const openBy = new Map(opening.spots.map(spot => [spot.hero, rows(spot)]));
  const callModels = callContexts({ opening, responses, threeBets, fourBets, multiway, limp, squeezes, coldThreeBets, limpDeep, multiway2, coldFourBets });
  const capacityConflicts = [];
  const reportOverfold = (context, label, foldRate, threshold, detail) => {
    const capacity = context && validCallEquities(callEquities, context) ? callDefenseCapacity(context, callEquities) : null;
    // Narrow, visible exception: impossible even at maximum legal call frequency,
    // AND this strategy actually reaches that bound. Merely deleting calls, or
    // presenting stale equities, can never turn an ordinary overfold into a warning.
    if (capacity && capacity.minimumFoldRate > threshold + 1e-12 && foldRate <= capacity.minimumFoldRate + 1e-12) {
      capacityConflicts.push({ spot: context.spot.id, ...capacity, requiredContinuationPct: (1 - threshold) * 100 });
      add("ev-capacity-conflict", "warn", label, `${detail}。ただし指定EV制約・固定レイズ下の最大継続率は${capacity.maximumContinuationPct.toFixed(2)}%。全ての合法コールを埋めても両立不能（均衡未達）。`);
    } else add("auto-profit", "error", label, detail);
  };
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
  const limpReraiseDefense = [];
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
      // BB facing SB's limp-reraise. Reach: BB's iso-raise frequency. SB's reraise
      // bluffs auto-profit when BB's reach-weighted fold rate exceeds the break-even.
      const bbReraise = limp.spots.find(spot => spot.id === "BB_vs_SB_limp_reraise");
      if (!bbReraise) add("range-flow", "error", "BB vs SB limp-reraise", "リンプ・リレイズへのBB応答の局面がない");
      else {
        const isoByHand = rows(bbLimp);
        const reach = hand => (isoByHand.get(hand)?.raise ?? 0) / 100;
        const label = "BB vs SB limp-reraise";
        for (const row of bbReraise.hands) {
          if (!reach(row.hand) && (row.fold !== 100 || row.call !== 0 || row.four_bet !== 0)) {
            add("range-flow", "error", label, `${row.hand}: BBのアイソ0%なのに到達不能プレースホルダーでない`);
          }
        }
        checkStrengthOrder(add, label, bbReraise, hand => reach(hand) > 0);
        const threshold = limpReraiseFoldThreshold(bbReraise);
        const foldRate = weightedFold(bbReraise, reach);
        limpReraiseDefense.push({ spot: label, foldRate, threshold });
        if (foldRate > threshold) reportOverfold(callModels.find(c => c.spot === bbReraise), label, foldRate, threshold, `BBのフォールド率 ${pct(foldRate)} > 損益分岐 ${pct(threshold)}（SBがどの2枚でもリンプ・リレイズで得をする）`);
      }
    }
  }

  // Deep limp branch (limp-deep-responses.json): SB facing BB's 4bet after its
  // limp-reraise, then BB facing SB's all-in. Reach: SB limp × limp-reraise, and
  // BB iso × 4bet. Each aggressor auto-profits when the responder's reach-weighted
  // fold rate exceeds its break-even (limpFourBetFoldThreshold / limpFiveBetFoldThreshold).
  const limpDeepDefense = [];
  const limpDeepReach = new Map();
  if (limpDeep) {
    const find = (data, id) => data?.spots.find(spot => spot.id === id);
    const sbOpenRows = openBy.get("SB");
    const bbIso = find(limp, "BB_vs_SB_limp"), sbIso = find(limp, "SB_vs_BB_iso"), bbReraise = find(limp, "BB_vs_SB_limp_reraise");
    const sbFourBet = find(limpDeep, "SB_vs_BB_limp_four_bet"), bbFiveBet = find(limpDeep, "BB_vs_SB_limp_five_bet");
    if (!sbOpenRows || !bbIso || !sbIso || !bbReraise || !sbFourBet || !bbFiveBet) {
      add("range-flow", "error", "SB limp deep", "リンプ深部（4bet・オールイン応答）の局面または前段が不足");
    } else {
      const sbIsoRows = rows(sbIso), bbIsoRows = rows(bbIso), bbReraiseRows = rows(bbReraise), sbFourBetRows = rows(sbFourBet);
      const sbReach = hand => (sbOpenRows.get(hand)?.limp ?? 0) / 100 * (sbIsoRows.get(hand)?.raise ?? 0) / 100;
      const bbReach = hand => (bbIsoRows.get(hand)?.raise ?? 0) / 100 * (bbReraiseRows.get(hand)?.four_bet ?? 0) / 100;
      limpDeepReach.set(sbFourBet.id, sbReach).set(bbFiveBet.id, bbReach);
      const sbLabel = "SB vs BB limp 4bet", bbLabel = "BB vs SB limp all-in";
      for (const row of sbFourBet.hands) {
        if (row.fold + row.call + row.all_in !== 100) add("range-flow", "error", sbLabel, `${row.hand}: fold/call/all_inの合計が100でない`);
        if (!sbReach(row.hand) && row.fold !== 100) add("range-flow", "error", sbLabel, `${row.hand}: SBのリンプ×リレイズ0%なのに到達不能プレースホルダーでない`);
      }
      for (const row of bbFiveBet.hands) {
        if (row.fold + row.call !== 100) add("range-flow", "error", bbLabel, `${row.hand}: fold/callの合計が100でない`);
        if (!bbReach(row.hand) && (row.fold !== 100 || row.equity_vs_shove_pct !== null)) add("range-flow", "error", bbLabel, `${row.hand}: BBのアイソ×4bet 0%なのに到達不能プレースホルダーでない`);
        if (bbReach(row.hand) && row.equity_vs_shove_pct === null) add("range-flow", "error", bbLabel, `${row.hand}: 4betしているのに対象外扱い`);
      }
      const shoveCombos = sbFourBet.hands.reduce((sum, row) => sum + combos(row.hand) * sbReach(row.hand) * (sbFourBetRows.get(row.hand).all_in / 100), 0);
      if (Math.abs(shoveCombos - bbFiveBet.shove_range_combos) > 0.05 + 1e-9) {
        add("range-flow", "error", bbLabel, `保存済みのSBオールインレンジ ${shoveCombos.toFixed(2)}コンボと応答の前提 ${bbFiveBet.shove_range_combos}コンボが一致しない`);
      }
      checkStrengthOrder(add, sbLabel, sbFourBet, hand => sbReach(hand) > 0);
      checkStrengthOrder(add, bbLabel, bbFiveBet, hand => bbReach(hand) > 0);
      const sbThreshold = limpFourBetFoldThreshold(sbFourBet);
      const sbFold = weightedFold(sbFourBet, sbReach);
      limpDeepDefense.push({ spot: sbLabel, foldRate: sbFold, threshold: sbThreshold });
      if (sbFold > sbThreshold) reportOverfold(callModels.find(c => c.spot === sbFourBet), sbLabel, sbFold, sbThreshold, `SBのフォールド率 ${pct(sbFold)} > 損益分岐 ${pct(sbThreshold)}（BBがどの2枚でも4betで得をする）`);
      const bbThreshold = limpFiveBetFoldThreshold(bbFiveBet);
      const bbFold = weightedFold(bbFiveBet, bbReach);
      limpDeepDefense.push({ spot: bbLabel, foldRate: bbFold, threshold: bbThreshold });
      if (bbFold > bbThreshold) add("auto-profit", "error", bbLabel, `BBのフォールド率 ${pct(bbFold)} > 損益分岐 ${pct(bbThreshold)}（SBがどの2枚でもオールインで得をする）`);
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
    if (foldRate > threshold) reportOverfold(callModels.find(c => c.spot === spot), label, foldRate, threshold, `オープナーのフォールド率 ${pct(foldRate)} > 損益分岐 ${pct(threshold)}（どの2枚でも3betで得をする）`);
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

  // 6. BB/SB squeeze after an open and one call: preserve family order and keep
  // the two-opponent squeeze narrower than the same hero's heads-up 3bet vs that opener.
  for (const spot of multiway?.spots ?? []) {
    const reachable = spot.callers.every(caller => responseBy.get(`${spot.opener}>${caller}`).hands.some(row => row.call > 0));
    for (const row of spot.hands) if (!reachable && row.fold !== 100) add("range-flow", "error", spot.id, `${row.hand}: 到達不能なコール履歴なのにfold100ではない`);
    checkStrengthOrder(add, spot.id, spot, () => reachable);
    const headsUp = responseBy.get(`${spot.opener}>${spot.hero}`);
    const squeezeCombos = spot.hands.reduce((sum, row) => sum + combos(row.hand) * row.squeeze / 100, 0);
    const threeBetCombos = headsUp.hands.reduce((sum, row) => sum + combos(row.hand) * row.three_bet / 100, 0);
    if (squeezeCombos > threeBetCombos + 1e-9) {
      add("squeeze-width", "warn", spot.id, `スクイーズ ${squeezeCombos.toFixed(1)}コンボ > ${spot.hero}ヘッズアップ3bet ${threeBetCombos.toFixed(1)}コンボ`);
    }
  }

  const multiway2Reach = spot => {
    const [c1, c2] = spot.callers;
    const first = responseBy.get(`${spot.opener}>${c1}`);
    const second = multiway?.spots.find(s => s.id === `${c2}_vs_${spot.opener}_${c1}call`);
    if (!first || !second) throw new Error(`Missing multiway2 predecessors: ${spot.id}`);
    return first.hands.some(r => r.call > 0) && second.hands.some(r => r.call > 0);
  };
  for (const spot of multiway2?.spots ?? []) {
    const reachable = multiway2Reach(spot);
    for (const row of spot.hands) {
      if (row.fold + row.call + row.squeeze !== 100 || (!reachable && row.fold !== 100)) add("range-flow", "error", spot.id, `${row.hand}: 2caller履歴と応答が不整合`);
    }
    checkStrengthOrder(add, spot.id, spot, () => reachable);
    const hu = responseBy.get(`${spot.opener}>${spot.hero}`);
    const weighted = (s, a) => s.hands.reduce((n, r) => n + combos(r.hand) * r[a] / 100, 0);
    if (weighted(spot, "squeeze") > weighted(hu, "three_bet") + 1e-9) add("squeeze-width", "warn", spot.id, "2callerスクイーズが同HeroのHU3betより広い");
  }

  // 6b. Facing a squeeze. Reach: the opener's RFI, or the caller's cold call.
  // The squeezer's bluffs auto-profit when opener fold × caller fold (after the
  // opener folded) exceeds its break-even.
  const squeezeReach = spot => {
    if (!responseBy.get(`${spot.opener}>${spot.caller}`).hands.some(row => row.call > 0)) return () => 0;
    const source = spot.prior_action === null ? openBy.get(spot.opener) : rows(responseBy.get(`${spot.opener}>${spot.caller}`));
    return hand => (spot.prior_action === null ? source.get(hand).open : source.get(hand).call) / 100;
  };
  const squeezeDefense = [];
  for (const spot of squeezes?.spots ?? []) {
    const reach = squeezeReach(spot);
    for (const row of spot.hands) {
      if (!reach(row.hand) && row.fold !== 100) add("range-flow", "error", spot.id, `${row.hand} は前段0%なのにフォールド100%になっていない`);
    }
    checkStrengthOrder(add, spot.id, spot, hand => reach(hand) > 0);
  }
  for (const first of (squeezes?.spots ?? []).filter(s => s.prior_action === null)) {
    if (!first.hands.some(row => squeezeReach(first)(row.hand) > 0)) continue;
    const second = squeezes.spots.find(s => s.prior_action === "fold" && s.source_squeeze_id === first.source_squeeze_id);
    if (!second) { add("range-flow", "error", first.id, "オープナーがフォールドした後のコーラーの局面がない"); continue; }
    const threshold = squeezeFoldThreshold(first);
    const openerFold = weightedFold(first, squeezeReach(first));
    const callerFold = weightedFold(second, squeezeReach(second));
    const foldRate = openerFold * callerFold;
    squeezeDefense.push({ spot: first.source_squeeze_id, openerFold, callerFold, foldRate, threshold });
    if (foldRate <= threshold + 1e-12) continue;
    const detail = `オープナーのフォールド率 ${pct(openerFold)} × コーラーのフォールド率 ${pct(callerFold)} = ${pct(foldRate)} > 損益分岐 ${pct(threshold)}（どの2枚でもスクイーズで得をする）`;
    const models = [first, second].map(spot => callModels.find(c => c.spot === spot));
    const capacities = models.map(c => c && validCallEquities(callEquities, c) ? callDefenseCapacity(c, callEquities, { ordered: true }) : null);
    const minimum = capacities.every(Boolean) ? capacities[0].minimumFoldRate * capacities[1].minimumFoldRate : null;
    // Same narrow exception as reportOverfold: both spots already call every legal hand
    // and even that maximum cannot reach the break-even.
    if (minimum !== null && minimum > threshold + 1e-12 && openerFold <= capacities[0].minimumFoldRate + 1e-12 &&
        callerFold <= capacities[1].minimumFoldRate + 1e-12) {
      capacityConflicts.push({ spot: first.source_squeeze_id, minimumFoldRate: minimum, maximumContinuationPct: (1 - minimum) * 100,
        requiredContinuationPct: (1 - threshold) * 100 });
      add("ev-capacity-conflict", "warn", first.source_squeeze_id, `${detail}。ただし指定EV制約・固定4bet下の最小フォールド率は${pct(minimum)}。全ての合法コールを埋めても両立不能（均衡未達）。`);
    } else add("auto-profit", "error", first.source_squeeze_id, detail);
  }

  // 6c. Cold response to a 3bet (Y has not acted: every hand reaches). Family
  // order, and the cold continuation must stay narrower than Y's heads-up
  // continuation (call + 3bet) versus the same 3bettor's open. Auto-profit of
  // X's 3bet also depends on the opener's response, so only the combined
  // opener × hero fold rate is reported (not a finding).
  const coldThreeBetDefense = [];
  for (const spot of coldThreeBets?.spots ?? []) {
    for (const row of spot.hands) {
      if (row.fold + row.call + row.four_bet !== 100) add("range-flow", "error", spot.id, `${row.hand}: fold/call/4betの合計が100でない`);
    }
    checkStrengthOrder(add, spot.id, spot);
    const source = responseBy.get(`${spot.opener}>${spot.three_bettor}`);
    const threeBet = threeBets.spots.find(s => s.opener === spot.opener && s.three_bettor === spot.three_bettor);
    if (!source || !threeBet) { add("range-flow", "error", spot.id, "3bet元または3betへのオープナー応答の局面がない"); continue; }
    const headsUp = responseBy.get(`${spot.three_bettor}>${spot.hero}`);
    const continued = s => s.hands.reduce((sum, row) => sum + combos(row.hand) * (100 - row.fold) / 100, 0);
    if (headsUp && continued(spot) > continued(headsUp) + 1e-9) {
      add("cold-width", "warn", spot.id, `コールド継続 ${continued(spot).toFixed(1)}コンボ > ${spot.hero}の対${spot.three_bettor}ヘッズアップ継続 ${continued(headsUp).toFixed(1)}コンボ`);
    }
    const openRows = openBy.get(spot.opener);
    const openerFold = weightedFold(threeBet, hand => openRows.get(hand).open / 100);
    const heroFold = weightedFold(spot);
    coldThreeBetDefense.push({ spot: spot.id, heroFold, openerFold, foldRate: heroFold * openerFold });
  }

  // Cold 4bet reopens the opener, then the original 3bettor after the opener folds.
  const coldFourBetReach = spot => {
    const source = spot.hero === spot.opener ? openBy.get(spot.opener) : rows(responseBy.get(`${spot.opener}>${spot.three_bettor}`));
    return hand => (spot.hero === spot.opener ? source.get(hand).open : source.get(hand).three_bet) / 100;
  };
  const coldFourBetDefense = [];
  for (const spot of coldFourBets?.spots ?? []) {
    const reach = coldFourBetReach(spot);
    for (const row of spot.hands) {
      if (row.fold + row.call + row.all_in !== 100 || (!reach(row.hand) && row.fold !== 100) || row.all_in_size_bb !== (row.all_in > 0 ? 100 : null)) add("range-flow", "error", spot.id, `${row.hand}: cold4bet応答の到達または100BB5betが不正`);
    }
    checkStrengthOrder(add, spot.id, spot, hand => reach(hand) > 0);
  }
  for (const first of (coldFourBets?.spots ?? []).filter(s => s.prior_action === null)) {
    const second = coldFourBets.spots.find(s => s.source_cold_three_bet_id === first.source_cold_three_bet_id && s.prior_action === "fold");
    if (!second) { add("range-flow", "error", first.id, "opener fold後の3bettor応答がない"); continue; }
    const openerFold = weightedFold(first, coldFourBetReach(first)), threeBettorFold = weightedFold(second, coldFourBetReach(second));
    const foldRate = openerFold * threeBettorFold, threshold = coldFourBetFoldThreshold(first);
    coldFourBetDefense.push({ spot: first.source_cold_three_bet_id, openerFold, threeBettorFold, foldRate, threshold });
    if (foldRate <= threshold + 1e-12) continue;
    const models = [first, second].map(spot => callModels.find(c => c.spot === spot));
    const capacities = models.map(c => c && validCallEquities(callEquities, c) ? callDefenseCapacity(c, callEquities, { ordered: true }) : null);
    const minimum = capacities.every(Boolean) ? capacities.reduce((v, c) => v * c.minimumFoldRate, 1) : null;
    const detail = `cold4betに2人とも降りる率 ${pct(foldRate)} > 損益分岐 ${pct(threshold)}`;
    if (minimum !== null && minimum > threshold && foldRate <= minimum + 1e-12) {
      capacityConflicts.push({ spot: first.source_cold_three_bet_id, minimumFoldRate: minimum, maximumContinuationPct: (1 - minimum) * 100, requiredContinuationPct: (1 - threshold) * 100 });
      add("ev-capacity-conflict", "warn", first.source_cold_three_bet_id, `${detail}。全ての合法コールを埋めても両立不能（均衡未達）。`);
    } else add("auto-profit", "error", first.source_cold_three_bet_id, detail);
  }

  // 7. Advisory balance and cross-strength checks on every dataset. Source action frequencies
  // weight incoming combos; unreachable fold=100 placeholders count for neither
  // the top-strength decile nor pure-action share.
  const rangeBalance = [];
  const inspectRange = (spot, weight, exemption) => {
    findings.push(...checkCrossStrengthInversion(spot, weight));
    const result = checkRangeBalance(spot, weight, exemption);
    findings.push(...result.findings);
    const { findings: ignored, ...metrics } = result;
    rangeBalance.push(metrics);
  };
  for (const spot of opening.spots) {
    // Ordinary fold/open RFI is naturally close to pure; SB's limp is NOT exempt.
    const binary = spot.hands.every(row => !Object.hasOwn(row, "limp"));
    inspectRange(spot, undefined, binary ? "fold/open RFI" : null);
  }
  for (const spot of responses.spots) inspectRange(spot);
  for (const spot of threeBets.spots) inspectRange(spot, hand => openBy.get(spot.opener).get(hand).open / 100);
  for (const spot of fourBets.spots) {
    const source = rows(responseBy.get(`${spot.opener}>${spot.hero}`));
    inspectRange(spot, hand => source.get(hand).three_bet / 100);
  }
  for (const spot of fiveBets?.spots ?? []) {
    const previous = rows(threeBets.spots.find(s => s.opener === spot.opener && s.three_bettor === spot.five_bettor));
    // Facing a 5bet all-in, only equity and price decide call/fold: b is exempt,
    // but a (passive-range cap detection) still runs.
    inspectRange(spot, hand => openBy.get(spot.opener).get(hand).open / 100 * previous.get(hand).four_bet / 100, "5bet all-in response");
  }
  for (const spot of multiway?.spots ?? []) inspectRange(spot, () => spot.callers.every(caller => responseBy.get(`${spot.opener}>${caller}`).hands.some(row => row.call > 0)) ? 1 : 0);
  for (const spot of squeezes?.spots ?? []) inspectRange(spot, squeezeReach(spot));
  for (const spot of coldThreeBets?.spots ?? []) inspectRange(spot);
  for (const spot of multiway2?.spots ?? []) inspectRange(spot, () => multiway2Reach(spot) ? 1 : 0);
  for (const spot of coldFourBets?.spots ?? []) inspectRange(spot, coldFourBetReach(spot));
  for (const spot of limp?.spots ?? []) {
    const iso = spot.source_iso_response_id ? rows(limp.spots.find(s => s.id === spot.source_limp_response_id)) : null;
    inspectRange(spot, spot.hero === "SB" ? hand => openBy.get("SB").get(hand).limp / 100
      : iso ? hand => iso.get(hand).raise / 100 : undefined);
  }
  for (const spot of limpDeep?.spots ?? []) {
    const reach = limpDeepReach.get(spot.id);
    // Facing the all-in, only equity and price decide call/fold (same exemption as five-bet-responses).
    if (reach) inspectRange(spot, reach, spot.id === "BB_vs_SB_limp_five_bet" ? "5bet all-in response" : null);
  }
  // Stage-two continuations use their own source-pinned equity table. Legacy
  // call inputs and frequencies remain unchanged.
  const continuationReport = continuations ? auditContinuationEstimates(continuations, {
    "opening-ranges": opening, "preflop-ranges": responses, "multiway-responses": multiway,
    "multiway2-responses": multiway2, "squeeze-responses": squeezes,
    "cold-three-bet-responses": coldThreeBets, "cold-four-bet-responses": coldFourBets,
  }, continuationEquities, { checkRangeBalance, checkCrossStrengthInversion }) : { findings: [], rangeBalance: [], defense: [] };
  findings.push(...continuationReport.findings);
  rangeBalance.push(...continuationReport.rangeBalance);
  const continuationConflicts = new Set(continuationReport.findings.filter(finding => finding.check === "ev-capacity-conflict").map(finding => finding.spot));
  capacityConflicts.push(...continuationReport.defense.filter(item => continuationConflicts.has(item.spot)).map(item => ({
    spot: item.spot, context_type: "continuation", minimumFoldRate: item.minimumFoldRate,
    maximumContinuationPct: (1 - item.minimumFoldRate) * 100, requiredContinuationPct: (1 - item.threshold) * 100,
    foldConfidence: item.foldConfidence, capacityConfidence: item.capacityConfidence, samples: item.samples, method: item.method,
  })));
  const balanceSummary = Object.fromEntries(BALANCE_CHECKS.map(check => {
    const matches = findings.filter(f => f.check === check);
    return [check, { count: matches.length, spots: [...new Set(matches.map(f => f.spot))].sort() }];
  }));
  const inversions = findings.filter(f => f.check === "cross-strength-inversion");
  const crossStrengthSummary = { count: inversions.reduce((sum, f) => sum + f.count, 0),
    warnings: inversions.length, spots: [...new Set(inversions.map(f => f.spot))].sort() };

  // 8. Reproducible EV audit: checked-in seeded equities, never .local facts.
  // Refuse stale/missing inputs rather than silently trusting a hand EV field.
  for (const context of callModels) {
    if (!validCallEquities(callEquities, context)) {
      add("call-equity-source", "error", context.spot.id, "勝率表が未生成・不正、または相手レンジ／サイズが変更済み。build:estimatesで再計算が必要。");
      continue;
    }
    for (const row of context.spot.hands) {
      if (context.reach(row.hand) <= 0 || row.call <= 0) continue;
      const { call_ev_bb: ev } = callFacts(context, row.hand, callEquities.spots[context.spot.id].equities[row.hand]);
      if (ev < -0.05) {
        add("negative-ev-call", row.call >= 10 && ev < -0.2 ? "error" : "warn", context.spot.id,
          `${row.hand}: call ${row.call}% / コールEV ${ev.toFixed(4)}bb`);
      } else if (ev < 0.05 && row.call > 50) {
        add("boundary-ev-call", "error", context.spot.id, `${row.hand}: 境界EV ${ev.toFixed(4)}bbでcall ${row.call}% > 50%`);
      }
    }
  }

  // Range widths for a sanity read.
  const widths = opening.spots.map(spot => ({ spot: `${spot.hero} open`, width: 1 - weightedFold(spot) }));
  return { findings, capacityConflicts, continuationDefense: continuationReport.defense, autoProfit, threeBetDefense, fourBetDefense, fiveBetDefense, squeezeDefense, limpReraiseDefense, limpDeepDefense, coldThreeBetDefense, coldFourBetDefense, widths, rangeBalance, balanceSummary, crossStrengthSummary };
}
