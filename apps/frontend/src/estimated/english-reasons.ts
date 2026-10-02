// English presentation of the recorded hand facts. This does not recompute a
// strategy or EV; it only describes the stored frequencies and audited facts.
const ACTIONS = {
  open: "open", limp: "limp", check: "check", raise: "raise", three_bet: "3-bet",
  four_bet: "4-bet", all_in: "go all-in", call: "call", fold: "fold",
};

export const englishFactLabels = {
  equity_vs_defend_pct: "Equity versus defending range",
  equity_vs_open_pct: "Equity versus opening range",
  equity_vs_continue_pct: "Equity versus continuing range",
  equity_vs_shove_pct: "Equity versus shoving range",
  equity_vs_call_pct: "Equity versus calling range",
  equity_vs_three_bet_pct: "Equity versus 3-bet range",
  equity_vs_four_bet_pct: "Equity versus 4-bet range",
  equity_vs_shove_call_pct: "Equity versus shove-calling range",
  equity_3way_pct: "Equity in three-way pot",
  equity_vs_sb_limp_pct: "Equity versus SB limp range",
  equity_vs_limp_reraise_pct: "Equity versus SB limp-reraise range",
  equity_vs_squeeze_pct: "Equity versus squeeze range",
  equity_vs_bb_iso_pct: "Equity versus BB iso-raise range",
  realized_equity_pct: "Realized equity (estimated)",
  call_ev_bb: "Estimated call EV",
  call_break_even_equity_pct: "Required equity to call",
  eqr: "Assumed EQR",
  all_fold_pct: "Chance all players behind fold",
  blocked_three_bet_pct: "Blocked 3-bet range",
  blocked_open_pct: "Blocked opening range",
  blocked_four_bet_pct: "Blocked 4-bet range",
  blocked_five_bet_pct: "Blocked 5-bet range",
  hero_and_opener_fold_pct: "Chance both you and opener fold to 3-bet",
  opener_fold_to_shove_pct: "Chance opener folds to shove",
  bb_fold_pct: "Chance BB folds (weighted for iso-raise)",
  limp_reraise_break_even_pct: "SB limp-reraise break-even point",
  blocked_limp_reraise_pct: "Blocked limp-reraise range",
  fold_to_squeeze_pct: "Chance both players fold to squeeze",
  blocked_squeeze_pct: "Blocked squeeze range",
  three_bettor_fold_to_4bet_pct: "Chance 3-bettor folds to 4-bet",
};

export const englishEquityNote = "Raw equity estimates showdown chances. Realized equity uses an assumed equity-realization factor (EQR), which may exceed 1. Call EV does not fully model future investments or opponent strategy changes.";

// English postflop explanations mirror the Japanese node/action/tier keys.
// Numeric opponent-range evidence remains the primary explanation when present.
export const englishPostflopReasons = {
  btn_first: {
    check: {
      monster: "Checking some very strong hands leaves room for the opponent to bet.",
      strong: "Checking controls the pot and protects the checking range with strong hands.",
      draw: "Checking takes a free turn card to try to complete the draw.",
      medium: "This hand has showdown value, so checking avoids building a large pot.",
      air: "With little equity and few better hands likely to fold, checking gives up cheaply.",
    },
    bet33: {
      monster: "A small bet can still be called by weaker hands.",
      strong: "This is a thin value bet targeting weaker pairs and draws.",
      draw: "A small semi-bluff can win now or improve after a call.",
      medium: "A small bet protects the hand at lower cost and may fold out weaker hands.",
      air: "When the opponent has many unmade hands, a small bet can seek folds at low cost.",
    },
    bet75: {
      monster: "A large bet builds the pot with a very strong hand.",
      strong: "A large bet charges draws while seeking value.",
      draw: "A strong draw can use a large bet for fold pressure and upside when completed.",
      medium: "Large bets with marginal hands are rare because mostly stronger hands continue.",
      air: "Large bluffs are risky, so they appear only at low frequency.",
    },
    bet125: {
      monster: "An overbet bigger than the pot maximizes value with a very strong hand.",
      strong: "This size is too large for a top pair and is rarely used.",
      draw: "Some strong draws use the larger size to put pressure on the opponent.",
      medium: "There is little reason to overbet with a weak pair, so this size is not used.",
      air: "A small number of bluffs are mixed with strong-hand overbets.",
    },
  },
  bb_vs_33: {
    fold: {
      monster: "Very strong hands almost never fold here.", strong: "Strong made hands almost never fold here.",
      draw: "Weak draws sometimes fold even against a small bet.",
      medium: "Some weak pairs fold when the opponent bets this board frequently.",
      air: "With very little equity, continuing has little justification.",
    },
    call: {
      monster: "Calling lets the opponent keep bluffing and preserves value for later streets.",
      strong: "Against a small bet, calling has sufficient value.",
      draw: "The required equity is relatively low (about 20%), so this draw can continue.",
      medium: "The small bet and low required equity allow a showdown-oriented call.",
      air: "Only the limited chance to improve, such as with overcards, supports continuing.",
    },
    raise: {
      monster: "A check-raise builds the pot for value.",
      strong: "Some strong hands check-raise to charge draws.",
      draw: "A semi-bluff raise can make the opponent fold now.",
      medium: "Raising is rarely useful when mostly stronger hands continue.",
      air: "Bluff raises are used only sparingly.",
    },
  },
  bb_vs_75: {
    fold: {
      monster: "Very strong hands almost never fold here.",
      strong: "Some top pairs with weak kickers fold against the larger bet.",
      draw: "The higher required equity (about 30%) makes weak draws fold.",
      medium: "Calling a large bet with a weak pair is often not worthwhile.",
      air: "With very little equity, continuing has little justification.",
    },
    call: {
      monster: "Calling controls the pot and lets the opponent keep bluffing.",
      strong: "This hand can continue against much of the opponent's value range.",
      draw: "Strong draws retain upside when they complete.",
      medium: "Some calls remain to catch bluffs.",
      air: "Most unmade hands fold; only some with backdoor improvement potential continue.",
    },
    raise: {
      monster: "Raising a large pot seeks more value with a very strong hand.",
      strong: "Some strong hands raise to charge draws.",
      draw: "Some strong draws raise as semi-bluffs.",
      medium: "This hand is generally unsuitable for a raise.",
      air: "Bluff raises are used only sparingly.",
    },
  },
  bb_vs_125: {
    fold: {
      monster: "Very strong hands do not fold.",
      strong: "Against an overbet, some top pairs with weak kickers fold.",
      draw: "The required equity is high (about 36%), so draws with little chance to improve fold.",
      medium: "Weak pairs have difficulty continuing against a large bet, so most fold.",
      air: "There is no reason to continue.",
    },
    call: {
      monster: "Calling keeps the opponent's bluffs in and leaves room to win more later.",
      strong: "Strong top pairs and better continue by calling even against a large bet.",
      draw: "Strong draws continue because they can win a large pot when completed.",
      medium: "Only a very small portion continues to catch the opponent's bluffs.",
      air: "These hands do not continue.",
    },
    raise: {
      monster: "With stacks nearing an all-in, raising takes the remaining value.",
      strong: "Raises are used only rarely.",
      draw: "Raises are used only rarely.",
      medium: "This hand does not raise.",
      air: "This hand does not raise.",
    },
  },
  btn_vs_raise: {
    fold: {
      monster: "Very strong hands do not fold here.",
      strong: "Because check-raises skew strong, some top pairs fold.",
      draw: "Draws without sufficient odds fold to the raise.",
      medium: "Weak pairs are usually behind once raised.",
      air: "There is little reason to continue.",
    },
    call: {
      monster: "Calling keeps strong hands in and preserves value for later streets.",
      strong: "Calling continues against the opponent's possible semi-bluffs.",
      draw: "Draws with enough upside can continue.",
      medium: "Some calls remain to catch bluffs.",
      air: "Unmade hands almost never continue.",
    },
  },
};

function handDescription(hand) {
  if (hand.length === 2) return `${hand} is ${"AKQJT".includes(hand[0]) ? "a high pocket pair with strong showdown potential" : "a pocket pair that can improve to a set"}`;
  if (hand.endsWith("s") && hand[0] === "A") return `${hand} is a suited ace with flush potential and an ace blocker`;
  if (hand.endsWith("s")) return `${hand} is a suited hand with flush potential`;
  return `${hand} is an offsuit hand`;
}

export function englishPreflopReason(hand, detailed, data) {
  if (!detailed) return "No hand-specific explanation is recorded for this spot.";
  if (/前段|到達不能|頻度が0%/.test(detailed.reason)) {
    return "The preceding action has zero recorded frequency for this hand, so this branch is unreachable. A saved 100% fold here is a data placeholder, not a recommendation.";
  }
  const facts = detailed.facts ?? {};
  const parts = [`${handDescription(hand.hand)} in this saved spot.`];
  const equityEntry = Object.entries(facts).find(([key, value]) => key.startsWith("equity_vs_") && key.endsWith("_pct") && Number.isFinite(value));
  if (equityEntry) {
    const [key, value] = equityEntry;
    parts.push(`${englishFactLabels[key] ?? "Raw equity"} is ${value.toFixed(1)}%.`);
  }
  if (Number.isFinite(facts.call_ev_bb)) {
    const sign = facts.call_ev_bb > 0 ? "+" : "";
    parts.push(`Under the recorded EQR assumption, the model's call EV is ${sign}${facts.call_ev_bb.toFixed(2)} bb.`);
    if (Number.isFinite(data?.spot_facts?.call_break_even_equity_pct) && Number.isFinite(facts.realized_equity_pct)) {
      parts.push(`Estimated realized equity (${facts.realized_equity_pct.toFixed(1)}%) is ${facts.realized_equity_pct >= data.spot_facts.call_break_even_equity_pct ? "above" : "below"} the ${data.spot_facts.call_break_even_equity_pct.toFixed(1)}% call threshold.`);
    }
  }
  if (Number.isFinite(data?.spot_facts?.all_fold_pct)) parts.push(`The estimated chance that all players behind fold is ${data.spot_facts.all_fold_pct.toFixed(1)}%.`);
  const blocker = Object.entries(facts).find(([key, value]) => key.startsWith("blocked_") && Number.isFinite(value));
  if (blocker) parts.push(`The saved blocker measure for this hand is ${blocker[1].toFixed(1)}% (${englishFactLabels[blocker[0]] ?? "opponent range"}).`);
  const choices = Object.entries(ACTIONS).filter(([key]) => Number.isFinite(hand[key]) && hand[key] > 0).map(([key, label]) => `${label} ${hand[key]}%`);
  if (choices.length) parts.push(`Saved action mix: ${choices.join(", ")}.`);
  else parts.push("The recorded action mix is shown above.");
  return parts.join(" ");
}
