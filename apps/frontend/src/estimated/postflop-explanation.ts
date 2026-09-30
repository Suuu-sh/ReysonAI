// Structured, fact-led postflop explanations. This module is pure: callers supply the selected
// locale, policy mix, board classifier, computed defence facts, and optional self-play hand EV.

export type ExplanationLocale = "en" | "ja";
type NumericMap = Record<string, number | undefined>;
type TooltipLine = { label: string; value: string; tooltip: string };
type ExplanationInput = {
  locale: ExplanationLocale;
  node: string;
  hand: string;
  actionMix: NumericMap;
  tiers?: NumericMap;
  texture?: string;
  explain?: any;
  handEv?: { ev_bb?: NumericMap } | null;
  positions?: { ip?: string; oop?: string };
};
export type StructuredPostflopExplanation = {
  headline: string;
  facing?: { title: string; rows: TooltipLine[] };
  betting?: { title: string; role: string; reason: string; mixReason?: string; sizes: string[]; alternatives: string[] };
  texture?: string;
  evNote?: string;
};

const TIER_LABELS: Record<string, Record<string, string>> = {
  en: { monster: "two pair or better", strong: "top pair or better", draw: "a draw", medium: "a weak pair", air: "unpaired high cards" },
  ja: { monster: "ツーペア以上", strong: "トップペア以上", draw: "ドロー", medium: "弱いペア", air: "役なし" },
};
const ACTION_LABELS: Record<string, Record<string, string>> = {
  en: { check: "Check", bet33: "Bet 33%", bet75: "Bet 75%", bet125: "Bet 125%", allin: "All-in", fold: "Fold", call: "Call", raise: "Raise 3×" },
  ja: { check: "チェック", bet33: "ベット 33%", bet75: "ベット 75%", bet125: "ベット 125%", allin: "オールイン", fold: "フォールド", call: "コール", raise: "レイズ 3倍" },
};
const pct = (value: number) => `${Math.round(value * 100)}%`;
const pctNumber = (value: number) => `${Math.round(value)}%`;
const bb = (value: number) => `${value.toFixed(1)}bb`;
const fraction = (value: number | null | undefined) => Number.isFinite(value) ? value! : 0;
const isAggressive = (action: string) => action.startsWith("bet") || action === "allin" || action === "raise";
const MATERIAL_MIX = 0.05 - 1e-9;

function actionLabel(action: string, locale: ExplanationLocale): string {
  return ACTION_LABELS[locale][action] ?? action;
}

function tierDescription(tiers: NumericMap | undefined, hand: string, locale: ExplanationLocale): string {
  const entries = Object.entries(tiers ?? {}).filter(([, share]) => Number.isFinite(share) && share! > 0)
    .sort((a, b) => b[1]! - a[1]!);
  if (!entries.length) return hand;
  const [tier, share] = entries[0];
  const label = TIER_LABELS[locale][tier] ?? hand;
  if (entries.length === 1 || share! >= 0.8) return label;
  return locale === "en" ? `mostly ${label}` : `主に${label}`;
}

function actingRole(node: string): "ip" | "oop" {
  const [prefix, streetRole] = node.split("_");
  if (prefix === "btn" || prefix === "ip") return "ip";
  if (prefix === "bb" || prefix === "oop") return "oop";
  if (["flop", "turn", "river"].includes(prefix) && (streetRole === "ip" || streetRole === "oop")) return streetRole;
  return "oop";
}

function facingDescription(node: string, opponent: string, locale: ExplanationLocale): string {
  const action = node.split("_vs_")[1] ?? "bet";
  if (locale === "en") {
    if (action === "raise") return `${opponent}'s raise`;
    if (action === "allin") return `${opponent}'s all-in`;
    return `${opponent}'s ${action}% bet`;
  }
  if (action === "raise") return `${opponent}のレイズ`;
  if (action === "allin") return `${opponent}のオールイン`;
  return `${opponent}の${action}%ベット`;
}

function recommendation(actionMix: NumericMap, locale: ExplanationLocale) {
  const ordered = Object.entries(actionMix).filter(([, frequency]) => Number.isFinite(frequency) && frequency! > 0)
    .sort((a, b) => b[1]! - a[1]!);
  if (!ordered.length) return [] as Array<[string, number]>;
  const prominent = ordered.filter(([, frequency]) => frequency! >= MATERIAL_MIX);
  return (prominent.length ? prominent : ordered.slice(0, 1)).map(([action, frequency]) => [action, frequency!] as [string, number]);
}

function showEvNote({ actionMix, handEv, locale }: Pick<ExplanationInput, "actionMix" | "handEv" | "locale">) {
  const evs = handEv?.ev_bb;
  if (!evs) return undefined;
  const policyMain = recommendation(actionMix, locale)[0]?.[0];
  const available = Object.entries(evs).filter(([, value]) => Number.isFinite(value)) as Array<[string, number]>;
  if (!policyMain || !Number.isFinite(evs[policyMain])) return undefined;
  const best = available.sort((a, b) => b[1] - a[1])[0];
  if (!best || best[0] === policyMain || best[1] - evs[policyMain]! <= 0.3) return undefined;
  const difference = best[1] - evs[policyMain]!;
  return locale === "en"
    ? `Self-play EV rates ${actionLabel(best[0], locale)} ${bb(difference)} higher than the policy's main ${actionLabel(policyMain, locale)}.`
    : `自己対戦EVでは${actionLabel(best[0], locale)}が、方針の主行動${actionLabel(policyMain, locale)}より${bb(difference)}高い評価です。`;
}

function makeFacing({ locale, node, positions, hand, tiers, explain }: ExplanationInput): StructuredPostflopExplanation["facing"] {
  const facts = explain?.defence;
  if (!facts) return undefined;
  const english = locale === "en";
  const actorRole = actingRole(node), opponent = positions?.[actorRole === "ip" ? "oop" : "ip"] ?? (english ? "the opponent" : "相手");
  const faced = facingDescription(node, opponent, locale);
  const equity = fraction(facts.equity), realized = fraction(facts.realized_equity);
  const required = fraction(facts.required_equity);
  const potToWin = Math.max(0, facts.pot_before_bb + facts.bet_bb - facts.rake_bb);
  const top = Math.max(0, Math.min(100, 100 - (facts.percentile ?? 0) * 100));
  const bettorRange = facts.bettor_range ?? {};
  const blockers = facts.blockers ?? {};
  const valueRemoved = blockers.value_removed_pct ?? 0;
  const bluffRemoved = blockers.bluff_removed_pct ?? 0;
  const tier = tierDescription(tiers, hand, locale);
  const blockerEffect = valueRemoved > bluffRemoved + 2
    ? english ? "blocks more value than bluffs, improving calls" : "バリューをブラフより多く減らすため、コールに有利です"
    : bluffRemoved > valueRemoved + 2
      ? english ? "blocks more bluffs than value, making calls worse" : "ブラフをバリューより多く減らすため、コールに不利です"
      : english ? "removes similar shares of value and bluffs" : "バリューとブラフを同程度減らします";
  const rows: TooltipLine[] = [
    {
      label: english ? "Pot odds" : "ポットオッズ",
      value: english
        ? `Call ${bb(facts.call_bb)} to win ${bb(potToWin)} → need ${pct(required)} (rake included)`
        : `${bb(facts.call_bb)}をコールして${bb(potToWin)}を獲得 → 必要勝率${pct(required)}（レーキ込み）`,
      tooltip: english ? "The call's break-even equity after the configured rake." : "設定されたレーキを差し引いたあと、コールが損益分岐になる勝率です。",
    },
    {
      label: english ? "Equity vs bettor" : "ベット側レンジへの勝率",
      value: english ? `${pct(equity)} against ${faced}` : `${faced}に対して${pct(equity)}`,
      tooltip: english ? "Showdown share against the combos that reached this exact bet or raise, after card removal." : "このベット／レイズまで進んだ相手コンボに対するショーダウン勝率です。手札によるブロッカーを反映します。",
    },
    {
      label: english ? "Realized equity" : "実現勝率",
      value: english ? `${pct(equity)} × ${facts.realization.toFixed(2)} = ${pct(realized)}` : `${pct(equity)} × ${facts.realization.toFixed(2)} = ${pct(realized)}`,
      tooltip: facts.street === "river"
        ? (english ? "River equity is exact; no future street remains." : "リバーは残りのカードがないため、勝率をそのまま使います。")
        : (english ? `The ${facts.street} estimate discounts equity by the ${tier} realization factor for this position.` : `${facts.street === "flop" ? "フロップ" : "ターン"}では、${tier}の手が後のストリートまで勝率を保てる度合いを係数で見積もります。`),
    },
    {
      label: english ? "Place in your range" : "自分のレンジ内の位置",
      value: english ? `Top ${pctNumber(top)} of combos reaching this decision` : `この判断に到達したコンボの上位${pctNumber(top)}`,
      tooltip: english ? "Ranks this hand by realized equity against every combo in your own range at this decision." : "この判断に到達した自分のレンジ内で、実現勝率を比べた順位です。",
    },
    {
      label: english ? "Range defence" : "レンジ全体の守り",
      value: english ? `Continues ${pct(fraction(facts.defence_frequency))} vs MDF ${pct(fraction(facts.mdf))}` : `続行${pct(fraction(facts.defence_frequency))}／MDF ${pct(fraction(facts.mdf))}`,
      tooltip: english ? "Continue includes calls and raises. MDF is the minimum share that prevents any two cards from profiting immediately." : "続行率にはコールとレイズを含みます。MDFは、相手がどんな2枚でもすぐ利益を出せないように最低限守る割合です。",
    },
    {
      label: english ? "Bettor range" : "ベット側の内訳",
      value: english
        ? `${pctNumber(bettorRange.value_pct ?? 0)} value / ${pctNumber(bettorRange.bluff_pct ?? 0)} bluffs${facts.faced_action?.capped ? ` · bluff share capped at ${pct(fraction(facts.faced_action.alpha))}` : ""}`
        : `バリュー${pctNumber(bettorRange.value_pct ?? 0)}／ブラフ${pctNumber(bettorRange.bluff_pct ?? 0)}${facts.faced_action?.capped ? ` · ブラフ比率は損益分岐の${pct(fraction(facts.faced_action.alpha))}に制限` : ""}`,
      tooltip: english ? "Value hands have at least 50% equity against your whole range; the rest are classified as bluffs." : "自分のレンジ全体に対して勝率50%以上の手をバリュー、それ以外をブラフとして数えています。",
    },
    {
      label: english ? "Blockers" : "ブロッカー",
      value: english ? `Removes ${pctNumber(valueRemoved)} of value, ${pctNumber(bluffRemoved)} of bluffs → ${blockerEffect}` : `バリューを${pctNumber(valueRemoved)}、ブラフを${pctNumber(bluffRemoved)}除去 → ${blockerEffect}`,
      tooltip: english ? "Shows which share of the bettor's value and bluff combos your two cards remove." : "手札の2枚が、相手のバリューとブラフのコンボをそれぞれ何%減らすかを示します。",
    },
  ];
  const capped = facts.faced_action?.capped;
  if (capped) {
    const capShare = facts.faced_action.bluff_share_after_pct;
    rows[5].tooltip += english
      ? ` This action's bluff share is held at the caller's break-even α (${pct(facts.faced_action.alpha)}).`
      : ` このアクションのブラフ比率は、コール側の損益分岐α（${pct(facts.faced_action.alpha)}）に抑えられています。`;
    if (Number.isFinite(capShare)) rows[5].value += english ? ` (${pctNumber(capShare)} after cap)` : `（制限後${pctNumber(capShare)}）`;
  }
  return { title: english ? "Facing this bet" : "このベットへの対応", rows };
}

function handRole(equity: number, tiers: NumericMap | undefined, main: string) {
  const tier = Object.entries(tiers ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? "air";
  if (!isAggressive(main)) return "pot-control";
  if (equity >= 0.5) return "value";
  if (tier === "medium" && equity >= 0.25) return "protection";
  return "bluff";
}

function bettingCopy({ locale, role, main, equity, tiers }: {
  locale: ExplanationLocale; role: string; main: string; equity: number; tiers?: NumericMap;
}) {
  const english = locale === "en", handTier = tierDescription(tiers, "hand", locale);
  const text = {
    value: english ? `This hand has ${pct(equity)} equity against the defender's range, supporting a value bet.` : `この手は相手レンジに対して勝率${pct(equity)}で、バリューベットを支える強さです。`,
    bluff: english ? `This hand has ${pct(equity)} equity against the defender's range; this ${actionLabel(main, locale).toLowerCase()} relies on fold equity.` : `この手の相手レンジへの勝率は${pct(equity)}です。この${actionLabel(main, locale)}はフォールドを引き出す狙いです。`,
    protection: english ? `This hand has ${pct(equity)} equity against the defender's range; betting can deny free cards.` : `この手は相手レンジに対して勝率${pct(equity)}です。ベットで無料のカードを防げます。`,
    "pot-control": english ? `Checking keeps the pot smaller; this hand has ${pct(equity)} equity with ${handTier}.` : `この手は${handTier}で相手レンジに対して勝率${pct(equity)}を保ちながら、チェックでポットを小さくします。`,
  };
  return text[role] ?? (english ? `This policy mixes ${actionLabel(main, locale)} at ${pct(equity)} equity.` : `勝率${pct(equity)}の手に${actionLabel(main, locale)}を混ぜる方針です。`);
}

function textureSentence(texture: string | undefined, locale: ExplanationLocale) {
  if (locale === "en") return ({
    dry: "Dry flop: few immediate straight or flush draws can change the lead.",
    wet: "Wet flop: straight and flush draws leave more turn cards able to shift equity.",
    monotone: "Monotone flop: one suit already appears three times, so flush blockers matter more.",
    paired: "Paired flop: fewer distinct ranks remain, making full-house runouts more relevant.",
    blank: "Blank runout: the last card adds no new pair, overcard, straight, or flush signal.",
    over: "Overcard runout: the last card ranks above the previous board and can weaken one-pair hands.",
    pair: "Paired runout: the last card pairs a board rank and changes full-house possibilities.",
    straight: "Straight runout: the last card adds a new straight-completing possibility.",
    flush: "Flush runout: three cards of the new card's suit are on board, increasing flush risk.",
  } as Record<string, string>)[texture ?? ""];
  return ({
    dry: "ドライボードで、すぐにストレートやフラッシュが完成するカードは多くありません。",
    wet: "ウェットボードで、ターン次第でストレートやフラッシュの勝率が動きやすい盤面です。",
    monotone: "同じスートが3枚あるため、そのスートのブロッカーが重要です。",
    paired: "ボードがペアなので、フルハウスにつながるランアウトも意識します。",
    blank: "ブランク：最後のカードでペア・オーバーカード・ストレート・フラッシュの新しい要素は増えていません。",
    over: "オーバーカード：最後のカードがボードの既存ランクより高く、ワンペアの価値を下げることがあります。",
    pair: "ペアカード：ボードのランクが重なり、フルハウスの可能性が変わります。",
    straight: "ストレートカード：最後のカードでストレートが完成する組み合わせが増えます。",
    flush: "フラッシュカード：そのスートがボードに3枚あり、フラッシュの危険が高まります。",
  } as Record<string, string>)[texture ?? ""];
}

function rangeBudgetFoldReason(facts: any, locale: ExplanationLocale): string | undefined {
  if (!facts?.faced_action?.capped || !Number.isFinite(facts.defence_frequency) || !Number.isFinite(facts.mdf) ||
      facts.defence_frequency > facts.mdf + 0.01 || !Number.isFinite(facts.percentile)) return undefined;
  const top = Math.max(0, Math.min(100, 100 - facts.percentile * 100));
  const continueShare = Math.max(0, Math.min(100, facts.defence_frequency * 100));
  if (top <= continueShare + 1) return undefined;
  return locale === "en"
    ? `The capped range continues only ${pct(facts.defence_frequency)}; this combo ranks in the top ${pctNumber(top)}, outside the top ${pctNumber(continueShare)} continuation budget.`
    : `ブラフ上限を適用したレンジの続行は${pct(facts.defence_frequency)}までです。このコンボは上位${pctNumber(top)}に位置し、続行枠の上位${pctNumber(continueShare)}には届きません。`;
}

export function buildPostflopExplanation(input: ExplanationInput): StructuredPostflopExplanation {
  const { locale, node, hand, actionMix, tiers, explain } = input;
  const english = locale === "en";
  const selected = recommendation(actionMix, locale);
  const main = selected[0]?.[0] ?? "check";
  const headlineActions = selected.map(([action, frequency]) => `${actionLabel(action, locale)} ${pct(frequency)}`).join(english ? " / " : "・");
  const facingFacts = explain?.defence;
  const actingRoleKey = actingRole(node);
  const opponent = input.positions?.[actingRoleKey === "ip" ? "oop" : "ip"] ?? (english ? "the opponent" : "相手");
  const classStrength = tierDescription(tiers, hand, locale);
  const rawEquity = fraction(facingFacts?.equity ?? explain?.equity ?? 0);
  let mainReason: string;
  let mixRationale: string | undefined;
  if (facingFacts && Number.isFinite(facingFacts.required_equity)) {
    const realized = fraction(facingFacts.realized_equity);
    const required = fraction(facingFacts.required_equity);
    const faced = facingDescription(node, opponent, locale);
    const above = realized >= required;
    const exactCombo = /^([2-9TJQKA][cdhs]){2}$/.test(hand);
    const className = exactCombo ? hand : english ? `${hand} hand class (${classStrength})` : `${hand}のハンドクラス（${classStrength}）`;
    const budgetReason = main === "fold" && (actionMix.fold ?? 0) >= 0.95 && above
      ? rangeBudgetFoldReason(facingFacts, locale) : undefined;
    mainReason = budgetReason
      ? (english
        ? `${className} has ${pct(rawEquity)} equity (${pct(realized)} realized) against ${faced}, above the ${pct(required)} needed. ${budgetReason}`
        : `${className}は${faced}に対して勝率${pct(rawEquity)}（実現勝率${pct(realized)}）で、必要な${pct(required)}を上回ります。${budgetReason}`)
      : english
        ? `${className} has ${pct(rawEquity)} equity (${pct(realized)} realized) against ${faced}, ${above ? "above" : "below"} the ${pct(required)} needed.`
        : `${className}は${faced}に対して勝率${pct(rawEquity)}（実現勝率${pct(realized)}）で、必要な${pct(required)}を${above ? "上回ります" : "下回ります"}。`;
    const call = (actionMix.call ?? 0), fold = (actionMix.fold ?? 0);
    if (call >= MATERIAL_MIX && fold >= MATERIAL_MIX) {
      const gap = Math.abs(realized - required);
      mixRationale = gap <= 0.05
        ? english ? `Call and fold mix because realized equity is within ${pct(gap)} of break-even.` : `実現勝率が損益分岐から${pct(gap)}以内のため、コールとフォールドを混ぜます。`
        : english ? "The saved mix keeps both a continue and a fold branch for this hand." : "この手には続行とフォールドの両方を残す方針です。";
    } else if (call >= MATERIAL_MIX && (actionMix.raise ?? 0) >= MATERIAL_MIX) {
      mixRationale = english ? "The saved policy keeps a small raise branch alongside the main call." : "コールを主軸にしつつ、方針上の小さなレイズ頻度も残しています。";
    } else if (fold >= MATERIAL_MIX && (actionMix.raise ?? 0) >= MATERIAL_MIX) {
      mixRationale = english ? "The saved policy mixes a bluff-raise with folds for this hand." : "この手はフォールドを基本に、方針上ブラフレイズも混ぜています。";
    } else if (selected.length > 1) {
      mixRationale = english ? "The saved mix keeps more than one response for this hand." : "この手には複数の応答を残す方針です。";
    }
  } else {
    const roleEquity = fraction(explain?.betting?.equity_vs_defender ?? rawEquity);
    const mixedSizes = selected.filter(([action]) => isAggressive(action));
    // When a check is the main branch of a check/bet mix, describe the hand's betting role
    // from the saved bet branch rather than calling the entire hand a pot-control hand.
    const roleAction = main === "check" && mixedSizes.length ? mixedSizes[0][0] : main;
    const role = handRole(roleEquity, tiers, roleAction);
    if (main === "check" && mixedSizes.length) {
      const roleLabel = english
        ? ({ value: "value", bluff: "bluff", protection: "protection", "pot-control": "pot-control" } as Record<string, string>)[role]
        : ({ value: "バリュー", bluff: "ブラフ", protection: "プロテクション", "pot-control": "ポットコントロール" } as Record<string, string>)[role];
      const sizeMix = mixedSizes.length > 1;
      const sizeRole = role === "value" ? "value-bet" : roleLabel;
      mainReason = english
        ? sizeMix
          ? `At ${pct(roleEquity)} equity against the defender's range, the policy checks more often and mixes ${sizeRole} sizes.`
          : `At ${pct(roleEquity)} equity against the defender's range, the policy checks more often while keeping a ${roleLabel} bet in the mix.`
        : sizeMix
          ? `相手レンジへの勝率${pct(roleEquity)}を理由に、チェックを中心にしながら${roleLabel}のベットサイズを混ぜています。`
          : `相手レンジへの勝率${pct(roleEquity)}を理由に、チェックを中心にしながら${roleLabel}の${actionLabel(roleAction, locale)}も混ぜています。`;
      // This headline already gives the reason for using both the check and bet branches.
      mixRationale = undefined;
    } else {
      mainReason = bettingCopy({ locale, role, main: roleAction, equity: roleEquity, tiers });
    }
    if (main === "check" && mixedSizes.length) {
      // Explained in the headline above without repeating the same action mix below it.
    } else if (mixedSizes.length > 1) mixRationale = english
      ? "The saved policy mixes bet sizes for this hand instead of choosing one size every time."
      : "毎回同じサイズに固定せず、ベットサイズを混ぜる方針です。";
    else if (selected.length > 1 && selected.some(([action]) => action === "check") && mixedSizes.length) mixRationale = english
      ? `The policy keeps both a check and a ${actionLabel(mixedSizes[0][0], locale)} branch for this ${role} hand.`
      : `この${({ value: "バリュー", protection: "プロテクション", bluff: "ブラフ", "pot-control": "ポットコントロール" } as Record<string, string>)[role]}候補は、チェックと${actionLabel(mixedSizes[0][0], locale)}の両方を使います。`;
    else if (selected.length > 1) mixRationale = english
      ? "The saved policy keeps both a continue and a fold branch for this hand."
      : "この手には続行とフォールドの両方を残す方針です。";
  }
  const headline = `${headlineActions}: ${mainReason}${mixRationale ? ` ${mixRationale}` : ""}`;
  const facing = makeFacing(input);
  let betting: StructuredPostflopExplanation["betting"];
  if (selected.some(([action]) => isAggressive(action))) {
    const roleEquity = fraction(explain?.betting?.equity_vs_defender ?? rawEquity);
    const roleNames = locale === "en"
      ? { value: "Value", bluff: "Bluff", protection: "Protection", "pot-control": "Pot control" }
      : { value: "バリュー", bluff: "ブラフ", protection: "プロテクション", "pot-control": "ポットコントロール" };
    const allFacts = explain?.betting?.actions ?? [];
    const factsByAction = new Map(allFacts.map((item: any) => [item.action, item]));
    const selectedSizes = selected.filter(([action]) => isAggressive(action));
    const mainSize = selectedSizes[0]?.[0] ?? main;
    const mainFoldShare = explain?.actions?.[mainSize]?.foldShare;
    const sizeLine = (action: string) => {
      const price = factsByAction.get(action) as any;
      const foldShare = explain?.actions?.[action]?.foldShare;
      const base = Number.isFinite(foldShare)
        ? (english ? `Opponent folds ${pct(foldShare)} after ${actionLabel(action, locale)}.` : `${actionLabel(action, locale)}のあと相手が${pct(foldShare)}フォールドする見込みです。`)
        : (english ? `${actionLabel(action, locale)} is used ${pct(actionMix[action] ?? 0)}.` : `${actionLabel(action, locale)}を${pct(actionMix[action] ?? 0)}使います。`);
      const cappedStreet = explain?.street === "river" || action === "allin" || (action === "raise" && price?.capped);
      if (!cappedStreet || !price || !Number.isFinite(price.alpha)) return base;
      const alpha = pct(fraction(price.alpha));
      const bluffs = Math.round(price.bluffs_per_100_value ?? (price.alpha / (1 - price.alpha) * 100));
      const cap = price.capped
        ? (english ? ` Bluff share is capped at α ${alpha}.` : ` ブラフ比率は損益分岐α ${alpha}に制限。`)
        : "";
      return english
        ? `${base} Caller break-even α is ${alpha}, supporting about ${bluffs} bluffs per 100 value combos.${cap}`
        : `${base} コール側の損益分岐αは${alpha}で、バリュー100コンボあたり約${bluffs}ブラフを支えます。${cap}`;
    };
    const sizes = selectedSizes.map(([action]) => sizeLine(action));
    const legalActions = Object.keys(actionMix).filter(isAggressive);
    const evs = input.handEv?.ev_bb ?? {};
    const evMain = evs[mainSize];
    const alternatives = legalActions.filter(action => !selectedSizes.some(([picked]) => picked === action)).filter(action => {
      const frequency = actionMix[action] ?? 0;
      const evGap = Number.isFinite(evs[action]) && Number.isFinite(evMain) ? Math.abs(evs[action]! - evMain!) : 0;
      return frequency >= MATERIAL_MIX || evGap >= 0.3;
    }).map(action => {
      const altFold = explain?.actions?.[action]?.foldShare;
      const selectedFold = mainFoldShare;
      if (Number.isFinite(altFold) && Number.isFinite(selectedFold)) {
        const difference = Math.round(Math.abs(altFold - selectedFold) * 100);
        return english
          ? `${actionLabel(action, locale)} is used ${pct(actionMix[action] ?? 0)}; it changes expected folds by ${difference} points vs ${actionLabel(mainSize, locale)}.`
          : `${actionLabel(action, locale)}は${pct(actionMix[action] ?? 0)}使用し、${actionLabel(mainSize, locale)}より相手のフォールド見込みが${difference}ポイント変わります。`;
      }
      return english
        ? `${actionLabel(action, locale)} is used ${pct(actionMix[action] ?? 0)} in this mix.`
        : `${actionLabel(action, locale)}はこのミックスで${pct(actionMix[action] ?? 0)}使用します。`;
    });
    const equity = rawEquity;
    const role = handRole(roleEquity, tiers, mainSize);
    const reason = bettingCopy({ locale, role, main: mainSize, equity: roleEquity, tiers });
    const mixReason = undefined;
    betting = { title: english ? "Betting plan" : "ベットの考え方", role: roleNames[role] ?? role, reason, mixReason, sizes, alternatives };
  }
  const texture = textureSentence(input.texture, locale);
  return { headline, ...(facing ? { facing } : {}), ...(betting ? { betting } : {}), ...(texture ? { texture } : {}),
    ...(showEvNote(input) ? { evNote: showEvNote(input) } : {}) };
}

export function renderExplanationPlainText(explanation: StructuredPostflopExplanation): string {
  const lines = [explanation.headline];
  if (explanation.facing) {
    lines.push(explanation.facing.title);
    for (const row of explanation.facing.rows) lines.push(`${row.label}: ${row.value}`);
  }
  if (explanation.betting) {
    lines.push(`${explanation.betting.title} · ${explanation.betting.role}: ${explanation.betting.reason}`);
    if (explanation.betting.mixReason) lines.push(explanation.betting.mixReason);
    lines.push(...explanation.betting.sizes, ...explanation.betting.alternatives);
  }
  if (explanation.texture) lines.push(explanation.texture);
  if (explanation.evNote) lines.push(explanation.evNote);
  return lines.join("\n");
}
