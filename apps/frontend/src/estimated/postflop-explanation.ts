import type { HandFeatures } from "../../scripts/postflop-ai/hand-features.ts";
import type { DefenceFacts, ExplanationFacts } from "./postflop-facts.ts";
// Structured, fact-led postflop explanations. This module is pure: callers supply the selected
// locale, policy mix, board classifier and computed defence facts. It never states an EV: the strategy is the answer.

import { actionForCopy } from "./postflop-action-copy.ts";
import { roleFromFeatures } from "../../scripts/postflop-ai/hand-role.ts";
import { featuresFromText } from "../../scripts/postflop-ai/hand-features.ts";

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
  explain?: ExplanationFacts | null;
  positions?: { ip?: string; oop?: string };
  // Optional concrete cards ("As4s" on "6h5h2d"): when present the role comes from the hand's features.
  board?: string;
  cards?: string;
};
export type ActionTableRow = {
  action: string; label: string; frequency: number;
  foldShare: number | null; calledEquity: number | null;
};
export type ActionTable = {
  caption: string; headers: { action: string; frequency: string; folds: string; equity: string };
  rows: ActionTableRow[];
};
export type StructuredPostflopExplanation = {
  headline: string;
  facing?: { title: string; rows: TooltipLine[] };
  betting?: { title: string; role: string; reason: string; mixReason?: string; sizes: string[]; alternatives: string[]; table?: ActionTable };
  texture?: string;
};

const TIER_LABELS: Record<string, Record<string, string>> = {
  en: { monster: "two pair or better", strong: "top pair or better", draw: "a draw", medium: "a weak pair", air: "unpaired high cards" },
  ja: { monster: "ツーペア以上", strong: "トップペア以上", draw: "ドロー", medium: "弱いペア", air: "役なし" },
};
const ACTION_LABELS: Record<string, Record<string, string>> = {
  en: { check: "Check", bet33: "Bet 33%", bet75: "Bet 75%", bet125: "Bet 125%", allin: "All-in", fold: "Fold", call: "Call", raise: "Raise" },
  ja: { check: "チェック", bet33: "ベット 33%", bet75: "ベット 75%", bet125: "ベット 125%", allin: "オールイン", fold: "フォールド", call: "コール", raise: "レイズ" },
};
const pct = (value: number) => `${Math.round(value * 100)}%`;
const pctNumber = (value: number) => `${Math.round(value)}%`;
const bb = (value: number) => `${value.toFixed(1)}bb`;
const fraction = (value: number | null | undefined) => Number.isFinite(value) ? value! : 0;
const isAggressive = (action: string) => action.startsWith("bet") || action === "allin" || action === "raise";
const MATERIAL_MIX = 0.05 - 1e-9;

function actionLabel(action: string, locale: ExplanationLocale, explain?: any): string {
  return ACTION_LABELS[locale][actionForCopy(action, explain)] ?? action;
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

function facingDescription(node: string, opponent: string, locale: ExplanationLocale, explain?: any): string {
  if (explain?.defence?.faced_action?.allIn) return locale === "en" ? `${opponent}'s all-in` : `${opponent}のオールイン`;
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

function makeFacing({ locale, node, positions, hand, tiers, explain }: ExplanationInput): StructuredPostflopExplanation["facing"] {
  const facts = explain?.defence;
  if (!facts) return undefined;
  const english = locale === "en";
  const actorRole = actingRole(node), opponent = positions?.[actorRole === "ip" ? "oop" : "ip"] ?? (english ? "the opponent" : "相手");
  const faced = facingDescription(node, opponent, locale, explain);
  const equity = fraction(facts.equity), realized = fraction(facts.realized_equity);
  const required = fraction(facts.required_equity);
  const potToWin = Math.max(0, facts.pot_before_bb! + facts.bet_bb! - facts.rake_bb!);
  const top = Math.max(0, Math.min(100, 100 - (facts.percentile! ?? 0) * 100));
  const bettorRange = facts.bettor_range ?? {};
  const facedAction = facts.faced_action;
  const observableCap = Array.isArray(facedAction?.aliases) || typeof facedAction?.wasReduced === "boolean";
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
        ? `Call ${bb(facts.call_bb!)} to win ${bb(potToWin)} → need ${pct(required)} (rake included)`
        : `${bb(facts.call_bb!)}をコールして${bb(potToWin)}を獲得 → 必要勝率${pct(required)}（レーキ込み）`,
      tooltip: english ? "The call's break-even equity after the configured rake." : "設定されたレーキを差し引いたあと、コールが損益分岐になる勝率です。",
    },
    {
      label: english ? "Equity vs bettor" : "ベット側レンジへの勝率",
      value: english ? `${pct(equity)} against ${faced}` : `${faced}に対して${pct(equity)}`,
      tooltip: english ? "Showdown share against the combos that reached this exact bet or raise, after card removal." : "このベット／レイズまで進んだ相手コンボに対するショーダウン勝率です。手札によるブロッカーを反映します。",
    },
    {
      label: english ? "Realized equity" : "実現勝率",
      value: english ? `${pct(equity)} × ${facts.realization!.toFixed(2)} = ${pct(realized)}` : `${pct(equity)} × ${facts.realization!.toFixed(2)} = ${pct(realized)}`,
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
      value: english ? `Continues ${pct(fraction(facts.defence_frequency!))} vs MDF ${pct(fraction(facts.mdf!))}` : `続行${pct(fraction(facts.defence_frequency!))}／MDF ${pct(fraction(facts.mdf!))}`,
      tooltip: english ? "Continue includes calls and raises. MDF is the minimum share that prevents any two cards from profiting immediately." : "続行率にはコールとレイズを含みます。MDFは、相手がどんな2枚でもすぐ利益を出せないように最低限守る割合です。",
    },
    {
      label: english ? "Bettor range" : "ベット側の内訳",
      value: english
        ? `${pctNumber(bettorRange.value_pct ?? 0)} value / ${pctNumber(bettorRange.bluff_pct ?? 0)} bluffs${facedAction?.capped && !observableCap ? ` · bluff share capped at ${pct(fraction(facedAction!.alpha!))}` : ""}`
        : `バリュー${pctNumber(bettorRange.value_pct ?? 0)}／ブラフ${pctNumber(bettorRange.bluff_pct ?? 0)}${facedAction?.capped && !observableCap ? ` · ブラフ比率は損益分岐の${pct(fraction(facedAction!.alpha!))}に制限` : ""}`,
      tooltip: english ? "Value hands have at least 50% equity against your whole range; the rest are classified as bluffs." : "自分のレンジ全体に対して勝率50%以上の手をバリュー、それ以外をブラフとして数えています。",
    },
    {
      label: english ? "Blockers" : "ブロッカー",
      value: english ? `Removes ${pctNumber(valueRemoved)} of value, ${pctNumber(bluffRemoved)} of bluffs → ${blockerEffect}` : `バリューを${pctNumber(valueRemoved)}、ブラフを${pctNumber(bluffRemoved)}除去 → ${blockerEffect}`,
      tooltip: english ? "Shows which share of the bettor's value and bluff combos your two cards remove." : "手札の2枚が、相手のバリューとブラフのコンボをそれぞれ何%減らすかを示します。",
    },
  ];
  if (observableCap) {
    const capShare = facedAction!.bluff_share_after_pct;
    if (Number.isFinite(capShare)) rows[5].value += english
      ? ` · pooled bluff share ${pctNumber(capShare!)} after component caps`
      : ` · 個別上限の適用後、統合したブラフ比率${pctNumber(capShare!)}`;
    // A reduced component does not imply that the pooled action saturates its cap.
    if (facedAction!.wasReduced ?? facedAction!.capped) rows[5].tooltip += english
      ? " Component caps reduced bluff weight before equivalent actions were pooled."
      : " 同じ結果になるアクションを統合する前に、個別の上限によってブラフの重みが減りました。";
    else if ((facedAction!.wasReduced as boolean | null | undefined) === false) rows[5].tooltip += english
      ? " No component cap reduced bluff weight; the pooled share reflects the saved mix."
      : " 個別の上限によるブラフの削減はなく、統合後の比率は保存された配分を反映しています。";
    if (Number.isFinite(facedAction!.alpha)) rows[5].tooltip += english
      ? ` The pooled share can remain below the caller's break-even α (${pct(facedAction!.alpha!)}).`
      : ` 統合後の比率は、コール側の損益分岐α（${pct(facedAction!.alpha!)}）を下回ることがあります。`;
  } else if (facts.faced_action?.capped) {
    const capShare = facts.faced_action!.bluff_share_after_pct;
    rows[5].tooltip += english
      ? ` This action's bluff share is held at the caller's break-even α (${pct(facts.faced_action!.alpha!)}).`
      : ` このアクションのブラフ比率は、コール側の損益分岐α（${pct(facts.faced_action!.alpha!)}）に抑えられています。`;
    if (Number.isFinite(capShare)) rows[5].value += english ? ` (${pctNumber(capShare!)} after cap)` : `（制限後${pctNumber(capShare!)}）`;
  }
  return { title: english ? "Facing this bet" : "このベットへの対応", rows };
}

export function handRole(equity: number, tiers: NumericMap | undefined, main: string, features?: HandFeatures | null) {
  if (features) return roleFromFeatures(features, { action: main, equity }).role;
  const tier = Object.entries(tiers ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? "air";
  if (!isAggressive(main)) return "pot-control";
  // A draw bets for fold equity plus its outs, even near 50% equity against the whole range.
  if (tier === "draw" && equity < 0.6) return "semi-bluff";
  if (equity >= 0.5) return "value";
  if (tier === "medium" && equity >= 0.25) return "protection";
  return "bluff";
}

function bettingCopy({ locale, role, main, equity, tiers }: {
  locale: ExplanationLocale; role: string; main: string; equity: number; tiers?: NumericMap;
}) {
  const english = locale === "en", handTier = tierDescription(tiers, "hand", locale);
  const text: Record<string, string> = {
    value: english ? `This hand has ${pct(equity)} equity against the defender's range, supporting a value bet.` : `この手は相手レンジに対して勝率${pct(equity)}で、バリューベットを支える強さです。`,
    bluff: english ? `This hand has ${pct(equity)} equity against the defender's range; this ${actionLabel(main, locale).toLowerCase()} relies on fold equity.` : `この手の相手レンジへの勝率は${pct(equity)}です。この${actionLabel(main, locale)}はフォールドを引き出す狙いです。`,
    "semi-bluff": english ? `This draw has ${pct(equity)} equity against the defender's range; betting wins when they fold and still has outs when called.` : `このドローは相手レンジに対して勝率${pct(equity)}です。ベットで相手を降ろせるうえ、コールされても完成の可能性が残るセミブラフです。`,
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

function rangeBudgetFoldReason(facts: DefenceFacts | null | undefined, locale: ExplanationLocale): string | undefined {
  if (!facts?.faced_action?.capped || !Number.isFinite(facts.defence_frequency!) || !Number.isFinite(facts.mdf!) ||
      facts.defence_frequency! > facts.mdf! + 0.01 || !Number.isFinite(facts.percentile!)) return undefined;
  const top = Math.max(0, Math.min(100, 100 - facts.percentile! * 100));
  const continueShare = Math.max(0, Math.min(100, facts.defence_frequency! * 100));
  if (top <= continueShare + 1) return undefined;
  return locale === "en"
    ? `The capped range continues only ${pct(facts.defence_frequency!)}; this combo ranks in the top ${pctNumber(top)}, outside the top ${pctNumber(continueShare)} continuation budget.`
    : `ブラフ上限を適用したレンジの続行は${pct(facts.defence_frequency!)}までです。このコンボは上位${pctNumber(top)}に位置し、続行枠の上位${pctNumber(continueShare)}には届きません。`;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// One row per legal action: shown frequency, how often the opponent folds, the hero's equity against the
// part of the opponent's range that continues.
function buildActionTable({ locale, actionMix, explain }: ExplanationInput, rawEquity: number): ActionTable {
  const english = locale === "en";
  const bet = explain?.bet_table?.actions ?? {};
  const rows: ActionTableRow[] = Object.keys(actionMix).map(action => {
    const aggressive = isAggressive(action);
    const fold = aggressive ? explain?.actions?.[action]?.foldShare : null;
    // Folding has no showdown; calling is judged against the range that bet, the rest against the range that continues.
    const called = aggressive || action === "check" ? bet[action]?.calledEquity : action === "call" ? (explain?.defence ? rawEquity : null) : null;
    return { action, label: actionLabel(action, locale, explain), frequency: fraction(actionMix[action]),
      foldShare: finite(fold) ? fold : null, calledEquity: finite(called) ? called : null };
  });
  return {
    caption: english ? "Each action compared" : "アクションごとの比較",
    headers: english
      ? { action: "Action", frequency: "Shown frequency", folds: "Opponent folds", equity: "Your equity when called" }
      : { action: "アクション", frequency: "表示中の頻度", folds: "相手のフォールド", equity: "コールされた時の勝率" },
    rows,
  };
}

function tableSentences(table: ActionTable, locale: ExplanationLocale): string[] {
  const english = locale === "en";
  const lines: string[] = [];
  const aggressive = table.rows.filter(row => isAggressive(row.action));
  const played = aggressive.filter(row => row.frequency >= MATERIAL_MIX).sort((a, b) => b.frequency - a.frequency);
  const focus = played[0] ?? [...aggressive].sort((a, b) => b.frequency - a.frequency)[0];
  if (focus && focus.foldShare !== null) {
    const fold = pct(focus.foldShare), eq = focus.calledEquity;
    const who = eq === null ? "" : eq < 0.45 ? (english ? "is called mostly by better hands" : "コールしてくるのは主に自分より強い手です")
      : eq > 0.55 ? (english ? "is called mostly by weaker hands" : "コールしてくるのは主に自分より弱い手です")
        : (english ? "is called by hands about as strong as yours" : "コールしてくる手は自分と同じくらいの強さです");
    lines.push(english
      ? `${focus.label} gets folds ${fold} of the time${eq === null ? "" : ` and ${who} (your equity when called ${pct(eq)})`}.`
      : `${focus.label}は相手が${fold}フォールドします${eq === null ? "" : `。${who}（コールされた時の勝率${pct(eq)}）`}。`);
  }
  const sizes = played.filter(row => row.foldShare !== null).sort((a, b) => a.foldShare! - b.foldShare!);
  if (sizes.length > 1) {
    const low = sizes[0], high = sizes[sizes.length - 1];
    const calledNote = low.calledEquity !== null && high.calledEquity !== null
      ? (english ? `; your equity when called is ${pct(low.calledEquity)} vs ${pct(high.calledEquity)}` : `。コールされた時の勝率は${pct(low.calledEquity)}と${pct(high.calledEquity)}`) : "";
    lines.push(english
      ? `The strategy mixes ${low.label} (folds ${pct(low.foldShare!)}) with ${high.label} (folds ${pct(high.foldShare!)})${calledNote}.`
      : `戦略は${low.label}（相手のフォールド${pct(low.foldShare!)}）と${high.label}（相手のフォールド${pct(high.foldShare!)}）を混ぜて使います${calledNote}。`);
  }
  return lines;
}

export function buildPostflopExplanation(input: ExplanationInput): StructuredPostflopExplanation {
  const { locale, node, hand, actionMix, tiers, explain } = input;
  const english = locale === "en";
  const selected = recommendation(actionMix, locale);
  const main = selected[0]?.[0] ?? "check";
  const headlineActions = selected.map(([action, frequency]) => `${actionLabel(action, locale, explain)} ${pct(frequency)}`).join(english ? " / " : "・");
  const facingFacts = explain?.defence;
  const actingRoleKey = actingRole(node);
  const opponent = input.positions?.[actingRoleKey === "ip" ? "oop" : "ip"] ?? (english ? "the opponent" : "相手");
  const classStrength = tierDescription(tiers, hand, locale);
  const rawEquity = fraction(facingFacts?.equity ?? explain?.equity ?? 0);
  let cardFeatures: HandFeatures | undefined;
  if (input.board && input.cards) { try { cardFeatures = featuresFromText(input.cards, input.board); } catch { cardFeatures = undefined; } }
  let mainReason: string;
  let mixRationale: string | undefined;
  if (facingFacts && Number.isFinite(facingFacts.required_equity)) {
    const realized = fraction(facingFacts.realized_equity);
    const required = fraction(facingFacts.required_equity);
    const faced = facingDescription(node, opponent, locale, explain);
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
    const role = handRole(roleEquity, tiers, roleAction, cardFeatures);
    if (main === "check" && mixedSizes.length) {
      const roleLabel = english
        ? ({ value: "value", "semi-bluff": "semi-bluff", bluff: "bluff", protection: "protection", "pot-control": "pot-control" } as Record<string, string>)[role]
        : ({ value: "バリュー", "semi-bluff": "セミブラフ", bluff: "ブラフ", protection: "プロテクション", "pot-control": "ポットコントロール" } as Record<string, string>)[role];
      const sizeMix = mixedSizes.length > 1;
      const sizeRole = role === "value" ? "value-bet" : roleLabel;
      mainReason = english
        ? sizeMix
          ? `At ${pct(roleEquity)} equity against the defender's range, the policy checks more often and mixes ${sizeRole} sizes.`
          : `At ${pct(roleEquity)} equity against the defender's range, the policy checks more often while keeping a ${roleLabel} bet in the mix.`
        : sizeMix
          ? `相手レンジへの勝率${pct(roleEquity)}を理由に、チェックを中心にしながら${roleLabel}のベットサイズを混ぜています。`
          : `相手レンジへの勝率${pct(roleEquity)}を理由に、チェックを中心にしながら${roleLabel}の${actionLabel(roleAction, locale, explain)}も混ぜています。`;
      // This headline already gives the reason for using both the check and bet branches.
      mixRationale = undefined;
    } else {
      mainReason = bettingCopy({ locale, role, main: actionForCopy(roleAction, explain), equity: roleEquity, tiers });
    }
    if (main === "check" && mixedSizes.length) {
      // Explained in the headline above without repeating the same action mix below it.
    } else if (mixedSizes.length > 1) mixRationale = english
      ? "The saved policy mixes bet sizes for this hand instead of choosing one size every time."
      : "毎回同じサイズに固定せず、ベットサイズを混ぜる方針です。";
    else if (selected.length > 1 && selected.some(([action]) => action === "check") && mixedSizes.length) mixRationale = english
      ? `The policy keeps both a check and a ${actionLabel(mixedSizes[0][0], locale, explain)} branch for this ${role} hand.`
      : `この${({ value: "バリュー", "semi-bluff": "セミブラフ", protection: "プロテクション", bluff: "ブラフ", "pot-control": "ポットコントロール" } as Record<string, string>)[role]}候補は、チェックと${actionLabel(mixedSizes[0][0], locale, explain)}の両方を使います。`;
    else if (selected.length > 1) mixRationale = english
      ? "The saved policy keeps both a continue and a fold branch for this hand."
      : "この手には続行とフォールドの両方を残す方針です。";
  }
  const headline = `${headlineActions}: ${mainReason}${mixRationale ? ` ${mixRationale}` : ""}`;
  const facing = makeFacing(input);
  let betting: StructuredPostflopExplanation["betting"];
  const bettingDecision = Object.keys(actionMix).some(isAggressive);
  if (bettingDecision) {
    const roleEquity = fraction(explain?.betting?.equity_vs_defender ?? rawEquity);
    const roleNames: Record<string, string> = locale === "en"
      ? { value: "Value", "semi-bluff": "Semi-bluff", bluff: "Bluff", protection: "Protection", "pot-control": "Pot control" }
      : { value: "バリュー", "semi-bluff": "セミブラフ", bluff: "ブラフ", protection: "プロテクション", "pot-control": "ポットコントロール" };
    const mainSize = selected.find(([action]) => isAggressive(action))?.[0] ?? main;
    const table = buildActionTable(input, rawEquity);
    const role = handRole(roleEquity, tiers, mainSize, cardFeatures);
    const reason = bettingCopy({ locale, role, main: mainSize, equity: roleEquity, tiers });
    betting = { title: english ? "Betting plan" : "ベットの考え方", role: roleNames[role] ?? role, reason,
      sizes: tableSentences(table, locale), alternatives: [], table };
  }
  const texture = textureSentence(input.texture, locale);
  return { headline, ...(facing ? { facing } : {}), ...(betting ? { betting } : {}), ...(texture ? { texture } : {}) };
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
    const table = explanation.betting.table;
    if (table) {
      const h = table.headers, cell = (value: number | null, format: (n: number) => string) => value === null ? "—" : format(value);
      lines.push([h.action, h.frequency, h.folds, h.equity].join(" | "));
      for (const row of table.rows) lines.push([row.label, pct(row.frequency), cell(row.foldShare, pct),
        cell(row.calledEquity, pct)].join(" | "));
    }
    lines.push(...explanation.betting.sizes, ...explanation.betting.alternatives);
  }
  if (explanation.texture) lines.push(explanation.texture);
  return lines.join("\n");
}
