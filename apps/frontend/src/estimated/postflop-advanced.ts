import type { ExplanationFacts } from "./postflop-facts.ts";
import type { RangeFacts } from "../../scripts/postflop-ai/range-facts.ts";
import { narrative, translateExplanationCopy, type NarrativeLanguage } from "../locales/reason-copy.ts";
// Advanced, jargon-rich postflop explanations: one short paragraph per action, in the vocabulary of experienced
// players (range/nut advantage, polarised vs merged, capped, bluff-catcher, blockers, SPR, geometric sizing...).
// Pure and numberless. Every claim is chosen by qualitative thresholds over computed facts: the per-hand facts
// (fold shares, equity when called, defence facts) and the range-level facts (`explain.range_facts`: tier shares of
// both reach ranges, the bettor's composition per size, SPR, how the last card shifted the ranges).
import { actionForCopy } from "./postflop-action-copy.ts";
import { handRole } from "./postflop-explanation.ts";
import { betSentences, checkSentences, describeHand, displayName, facingHandSentences, featuresForInput, handHeadline, roleFromFeatures, type HC } from "./postflop-hand-copy.ts";

export type AdvancedLocale = "en" | "ja" | "zh-CN" | "es";
type NumericMap = Record<string, number | undefined>;
export type AdvancedInput = {
  locale: AdvancedLocale; node: string; hand: string; actionMix: NumericMap; tiers?: NumericMap;
  texture?: string; explain?: ExplanationFacts | null; positions?: { ip?: string; oop?: string };
  // Concrete cards make the copy hand-specific: the full board ("6h5h2d"), the exact combo ("As4s") or, for an
  // averaged hand class, its combos (the most common combo class is described).
  // Per-decision labels with real amounts (decisionOptions); falls back to the plain labels.
  labels?: Record<string, string>;
  // The raise option is an all-in at this decision (its stack caps it).
  raiseAllIn?: boolean;
  actionMetadata?: Record<string, { allIn?: boolean; amountBb?: number }>;
  board?: string; cards?: string; combos?: { cards: string; weight: number }[];
};
export type AdvancedBlock = { action: string; label: string; frequency: number; text: string };
export type AdvancedExplanation = { headline: string; blocks: AdvancedBlock[]; texture?: string };

const LABELS: Record<string, Record<string, string>> = {
  en: { check: "Check", bet33: "Bet 33%", bet75: "Bet 75%", bet125: "Bet 125%", allin: "All-in", fold: "Fold", call: "Call", raise: "Raise" },
  ja: { check: "チェック", bet33: "ベット 33%", bet75: "ベット 75%", bet125: "ベット 125%", allin: "オールイン", fold: "フォールド", call: "コール", raise: "レイズ" },
};
const ORDER = ["check", "bet33", "bet75", "bet125", "allin", "fold", "call", "raise"];
const FRACTION: Record<string, number> = { bet33: 0.33, bet75: 0.75, bet125: 1.25 };
const MATERIAL = 0.05 - 1e-9;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const aggressive = (a: string) => a.startsWith("bet") || a === "allin" || a === "raise";

type Level = "most" | "many" | "some" | "few";
const foldLevel = (v: unknown): Level | null => !finite(v) ? null : v >= 0.65 ? "most" : v >= 0.45 ? "many" : v >= 0.25 ? "some" : "few";
type Called = "better" | "similar" | "weaker";
const calledLevel = (v: unknown): Called | null => !finite(v) ? null : v < 0.42 ? "better" : v < 0.58 ? "similar" : "weaker";

function mainTier(tiers?: NumericMap) {
  return Object.entries(tiers ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? "air";
}

// ---- range-level classification -------------------------------------------------------------------------
type Tiers = Partial<Record<"monster" | "strong" | "draw" | "medium" | "air", number>>;
const share = (t: Tiers | undefined, ...keys: (keyof Tiers)[]) => keys.reduce((s, k) => s + (t?.[k] ?? 0), 0);
export type SizeKind = "value" | "polar" | "merged" | "wide";
export function sizeKind(t: Tiers | undefined): SizeKind | null {
  if (!t) return null;
  const strong = share(t, "monster", "strong"), medium = share(t, "medium"), weak = share(t, "air", "draw");
  if (strong >= 0.7) return "value";
  if (medium <= 0.15 && strong >= 0.12 && weak >= 0.25) return "polar";
  if (weak <= 0.35) return "merged";
  return "wide";
}
export type Advantage = "hero" | "opp" | "even";
// Range advantage from the share of strong made hands (monster + strong); nut advantage from the monster share.
export function advantages(rf: RangeFacts | null | undefined): { range: Advantage; nuts: Advantage; heroCapped: boolean; oppCapped: boolean } | null {
  const h: Tiers | undefined = rf?.tiers?.hero, o: Tiers | undefined = rf?.tiers?.opp;
  if (!h || !o) return null;
  const d = share(h, "monster", "strong") - share(o, "monster", "strong");
  const range: Advantage = d >= 0.04 ? "hero" : d <= -0.04 ? "opp" : "even";
  const hm = share(h, "monster"), om = share(o, "monster");
  const nuts: Advantage = hm - om >= 0.01 && hm >= om * 1.25 ? "hero" : om - hm >= 0.01 && om >= hm * 1.25 ? "opp" : "even";
  return { range, nuts, heroCapped: hm < 0.015 && om >= 0.02, oppCapped: om < 0.015 && hm >= 0.02 };
}

type Ctx = {
  en: NarrativeLanguage; node: string; hand: string; tier: string; street: "flop" | "turn" | "river"; ip: boolean; facing: boolean;
  rf: RangeFacts | null | undefined; adv: ReturnType<typeof advantages>; line?: string | null; texture?: string; explain: ExplanationFacts | null | undefined; opp: string; equity: number;
};

// ---- context sentences ----------------------------------------------------------------------------------
function advantageSentence(c: Ctx): string {
  const a = c.adv;
  if (!a) return "";
  if (c.facing) {
    if (a.heroCapped) return c.en
      ? narrative("Your range is capped on this line: it holds almost no monsters, so the bettor can lean on you with polarised bets and your continuing hands are mostly bluff-catchers.", [], c.en)
      : "このラインではあなたのレンジはキャップされています。モンスターがほとんどなく、相手はポラライズしたベットで圧力をかけられ、続行する手の大半はブラフキャッチャーになります。";
    if (a.oppCapped) return c.en
      ? narrative("{0}'s range is capped here, so the nuts are not a worry and you can defend wide with your bluff-catchers.", [cap(c.opp)], c.en)
      : "相手のレンジはここでキャップされていて、ナッツを恐れる必要が薄く、ブラフキャッチャーも広く守れます。";
    if (a.range === "opp") return c.en
      ? narrative("The bettor holds the range advantage on this texture, so your defence has to be disciplined about which hands continue.", [], c.en)
      : "このテクスチャでは相手にレンジアドバンテージがあり、どの手で続行するかを厳密に選ぶ必要があります。";
    if (a.range === "hero") return c.en
      ? narrative("Your range is the stronger one on this texture, so you can defend comfortably and still keep raises in the mix.", [], c.en)
      : "このテクスチャではあなたのレンジのほうが強く、無理なく守りつつレイズも混ぜられます。";
    return "";
  }
  if (a.range === "hero" && a.nuts === "hero") return c.en
    ? narrative("You hold both the range advantage and the nut advantage on this texture, so the whole range can apply pressure.", [], c.en)
    : "このテクスチャではレンジアドバンテージとナッツアドバンテージの両方があり、レンジ全体でプレッシャーをかけられます。";
  if (a.range === "hero") return c.en
    ? narrative("You hold the range advantage without a clear nut advantage, so the pressure comes from frequency rather than from polarised sizing.", [], c.en)
    : "レンジアドバンテージはあってもナッツアドバンテージは明確でなく、圧力はポラライズしたサイズではなく高い頻度でかけます。";
  if (a.nuts === "hero") return c.en
    ? narrative("Your range is not ahead overall, but it owns more of the nuts, and that is what supports a polarised line.", [], c.en)
    : "レンジ全体では優位ではないものの、ナッツはあなたのほうが多く、それがポラライズしたラインを支えます。";
  if (a.range === "opp") return c.en
    ? narrative("The opponent's range is ahead on this texture, so checking dominates and only the hands that clearly want to bet do so.", [], c.en)
    : "このテクスチャでは相手のレンジが優位なので、チェックが中心になり、はっきり打ちたい手だけがベットします。";
  return "";
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function sprNote(c: Ctx): string {
  const spr = c.rf?.spr;
  if (!finite(spr)) return "";
  if (spr < 2) return c.en ? narrative("With the SPR this low, the stacks are close to committed already, so hand strength matters more than polarisation.", [], c.en)
    : "SPRがここまで低いと、スタックはほぼコミット済みで、ポラライズよりも手の強さが重要になります。";
  return "";
}

// What kind of range the bet we face comes from (facing decisions only).
function bettorSentence(c: Ctx): string {
  const kind = sizeKind(c.rf?.tiers?.opp);
  if (!c.facing || !kind) return "";
  const o = c.opp;
  return ({
    polar: c.en ? narrative("{0}'s bet comes from a polarised range, strong value plus air, so the hands in the middle are under pressure.", [cap(o)], c.en) : "この相手のベットは強いバリューとエアに分かれたポラライズしたレンジから来ていて、中間の強さの手は圧力を受けます。",
    merged: c.en ? narrative("{0}'s bet comes from a merged range of strong and medium hands, so there are fewer pure bluffs behind it.", [cap(o)], c.en) : "相手のベットは強い手と中程度の手がマージしたレンジから来ていて、純粋なブラフは多くありません。",
    value: c.en ? narrative("{0}'s bet comes from an almost pure value range, so bluff-catching is rarely rewarded.", [cap(o)], c.en) : "相手のベットはほぼバリューだけのレンジから来ていて、ブラフキャッチが報われる場面は多くありません。",
    wide: c.en ? narrative("{0}'s bet comes from a wide range that mixes value, medium hands and bluffs.", [cap(o)], c.en) : "相手のベットはバリュー、中程度の手、ブラフが幅広く混ざったレンジから来ています。",
  } as Record<string, string>)[kind] ?? "";
}

// ---- betting actions -------------------------------------------------------------------------------------
function sizeSentence(a: string, kind: SizeKind | null, c: Ctx): string {
  const nuts = c.adv?.nuts === "hero";
  const en = c.en;
  if (a === "allin") {
    const spr = c.rf?.spr, h = c.hand, tier = c.tier, value = tier === "monster" || tier === "strong";
    if (finite(spr) && spr < 3) {
      if (value) return en ? narrative("{0} is strong enough to stack off: at this low SPR the shove just commits the stacks, so raw hand strength outweighs polarisation.", [h], en)
        : `${h}はスタックを入れきれる強さです。SPRが低いのでオールインは単にスタックをコミットするだけで、ポラライズよりも手の強さが重みを持ちます。`;
      return en ? narrative("{0} shoves as a bluff that the capped value range supports, and at this low SPR the shove is close to the natural geometric size.", [h], en)
        : `${h}はブラフとしてのオールインです。SPRが低くオールインが自然なジオメトリックサイズに近いため、バリューとのバランスの範囲で成立します。`;
    }
    if (value) return en ? narrative("{0} shoves with the remaining stack, a geometric-size bet where only the strongest hands and a few bluffs can go all-in.", [h], en)
      : `${h}は残りスタックをすべて入れるオールインです。ジオメトリックサイズの賭けなので、最強クラスの手と少数のブラフだけが成立します。`;
    return en ? narrative("{0} shoves as a bluff, and only a small share of the range can do so while keeping the value-to-bluff balance.", [h], en)
      : `${h}はブラフとしてのオールインで、バリューとのバランスを保てる範囲の少数のハンドだけが選びます。`;
  }
  if (a === "bet33") switch (kind) {
    case "merged": return c.street === "river"
      ? (en ? narrative("This small size is a linear range of strong and medium hands going for thin value, with few bluffs.", [], en)
        : "この小さいサイズは、強い手と中程度の手がシンバリューを取りに行くリニアなレンジで、ブラフは少なめです。")
      : (en ? narrative("This small size is a linear range of strong and medium hands betting for value and protection with few bluffs.", [], en)
        : "この小さいサイズは、強い手と中程度の手がバリューとプロテクションで打つリニアなレンジで、ブラフは少なめです。");
    case "value": return en ? narrative("Even at a small size the range is almost all value, built to keep worse hands calling.", [], en)
      : "小さいサイズでもレンジはほぼバリューで、劣る手にコールを続けさせるための構成です。";
    case "polar": return en ? narrative("Even at a small size this range is polarised: a few strong hands plus air that can bluff cheaply.", [], en)
      : "小さいサイズでも、このレンジは強い手とエアだけのポラライズで、安くブラフできる形です。";
    default: return en ? narrative("The small size suits a wide, merged range: it taxes the weakest holdings, takes thin value from worse pairs and denies equity cheaply.", [], en)
      : "小さいサイズは広くマージしたレンジに向いていて、弱い手に課税し、劣るペアからシンバリューを取り、安くエクイティデニアルを効かせます。";
  }
  if (a === "bet75") switch (kind) {
    case "polar": return en ? narrative("The large bet is polarised, strong value and air with little in between, which forces the opponent to find calls with bluff-catchers.", [], en)
      : "大きなベットはポラライズされていて、強いバリューとエアが中心で中間の手が少なく、相手はブラフキャッチャーでコールを探すことになります。";
    case "merged": return c.street === "river"
      ? (en ? narrative("The large bet stays merged: strong and good medium hands bet for thin-to-solid value while few pure bluffs join them.", [], en)
        : "大きなベットでもマージを保ち、強い手と良い中程度の手がバリューで打ち、純粋なブラフはわずかです。")
      : (en ? narrative("The large bet stays merged: strong and good medium hands bet for value and protection while few pure bluffs join them.", [], en)
      : "大きなベットですがレンジはマージ寄りで、強い手と良い中程度の手がバリューとプロテクションで打ち、純粋なブラフは少なめです。");
    case "value": return en ? narrative("This size is almost pure value, built to extract from the opponent's calling range.", [], en)
      : "このサイズはほぼバリューだけで、相手のコールレンジから最大限に取るための構成です。";
    default: return en ? narrative("The large bet carries a wide mix of value, medium hands and bluffs, so no single hand type gives it away.", [], en)
      : "大きなベットにはバリュー、中程度の手、ブラフが幅広く混ざっていて、特定の手の種類が透けて見えません。";
  }
  if (a === "bet125") switch (kind) {
    case "polar": return en ? (nuts ? narrative("An overbet needs a polarised range backed by a nut advantage, which you have here, and it puts bluff-catchers under maximum pressure.", [], en)
      : narrative("The overbet is polarised, strong hands plus air, and it puts the opponent's bluff-catchers under maximum pressure.", [], en))
      : (nuts ? "オーバーベットにはナッツアドバンテージに支えられたポラライズが必要で、ここではそれがあり、ブラフキャッチャーを最大限に追い込めます。"
      : "オーバーベットは強い手とエアのポラライズで、相手のブラフキャッチャーを最大限に追い込みます。");
    case "value": return en ? narrative("The overbet is almost pure value, the nuts squeezing the opponent's strongest calling hands.", [], en)
      : "オーバーベットはほぼバリューだけで、ナッツで相手の強いコールレンジを絞り取ります。";
    default: return en ? narrative("The overbet is a rare size, kept for the top of the range together with the best bluffs.", [], en)
      : "オーバーベットは稀なサイズで、レンジの上位と最良のブラフに限って使われます。";
  }
  return "";
}

function responseSentence(f: Level | null, cl: Called | null, c: Ctx, tag = ""): string {
  const base = responseBase(f, cl, c);
  if (!base || !tag) return base;
  const lower = (t: string) => /^[A-Z](?![A-Z])/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  return c.en ? narrative("From {0}, {1}", [tag, lower(base)], c.en) : `${tag}から見ると、${base}`;
}
function responseBase(f: Level | null, cl: Called | null, c: Ctx): string {
  if (!f && !cl) return "";
  const en = c.en, o = c.opp;
  const foldGood = f === "most" || f === "many";
  const foldText = f ? (en ? { most: narrative("most of {0}'s range gives up", [o], en), many: narrative("a large part of {0}'s range folds", [o], en), some: narrative("only part of {0}'s range folds", [o], en), few: narrative("hardly any of {0}'s range folds", [o], en) }[f]
    : { most: `${o}のレンジの大半は降り`, many: `${o}のレンジの多くが降り`, some: `${o}のレンジのうち降りるのは一部で`, few: `${o}のレンジはほとんど降りず` }[f]) : "";
  const calledText = cl ? (en ? { better: narrative("what continues is mostly ahead of you", [], en), similar: narrative("what continues is close to you in strength", [], en), weaker: narrative("what continues is mostly behind you", [], en) }[cl]
    : { better: "続行する手は主に自分より強く", similar: "続行する手は自分と同程度で", weaker: "続行する手は主に自分より弱くなります" }[cl]) : "";
  if (en) {
    if (!f) return cap(calledText) + ".";
    if (!cl) return cap(foldText) + ".";
    const calledGood = cl === "weaker", conj = foldGood === calledGood || cl === "similar" ? narrative("and", [], en) : narrative("but", [], en);
    return narrative("{0}, {1} {2}.", [cap(foldText), conj, calledText], en);
  }
  const jaCalled = cl ? { better: "続行する手は主に自分より強いです", similar: "続行する手は自分と同程度です", weaker: "続行する手は主に自分より弱いです" }[cl] : "";
  const jaFold = f ? { most: `${o}のレンジの大半は降りますが、`, many: `${o}のレンジの多くが降りますが、`, some: `降りるのは${o}のレンジの一部だけで、`, few: `${o}のレンジはほとんど降りず、` }[f] : "";
  if (!f) return `${jaCalled}。`;
  if (!cl) return `${o}のレンジは${({ most: "大半が降ります", many: "多くが降ります", some: "一部だけが降ります", few: "ほとんど降りません" })[f]}。`;
  const calledGood = cl === "weaker";
  if (foldGood === calledGood || cl === "similar") return `${f === "most" ? `${o}のレンジの大半が降り、` : f === "many" ? `${o}のレンジの多くが降り、` : f === "some" ? `降りるのは${o}のレンジの一部で、` : `${o}のレンジはほとんど降りず、`}${jaCalled}。`;
  return `${jaFold}${jaCalled}。`;
}

function streetSentence(a: string, role: string, c: Ctx): string {
  const en = c.en, shift = c.rf?.runout_shift;
  if (c.street === "river") return en ? narrative("No draws are left on the river, so this bet is either value or a bluff.", [], en)
    : "リバーにはもうドローが残っていないので、このベットはバリューかブラフのどちらかです。";
  if (c.street === "turn") {
    if (c.line === "aggressor") return en ? narrative("Continuing from the flop makes this a turn barrel, and the story stays consistent with the earlier bet.", [], en)
      : "フロップからの続きなのでターンバレルで、先のベットとストーリーが一貫します。";
    if (c.line === "checked" && c.ip && c.rf?.pfr === "ip") return en ? narrative("Betting after the flop checked through is a delayed c-bet, which punishes the capped checking range.", [], en)
      : "フロップがチェックで流れたあとのベットはディレイドCベットで、キャップされたチェックレンジを突きます。";
    if (c.line === "defender" && !c.ip) return en ? narrative("A lead from the defender is a donk bet{0}.", [finite(shift?.hero) && finite(shift?.opp) && shift.hero - shift.opp >= 0.03 ? narrative(", which works here because the card favours your range", [], en) : narrative(", a rare line that needs the card to favour your range", [], en)], en)
      : `ディフェンダーからのリードはドンクで、${finite(shift?.hero) && finite(shift?.opp) && shift.hero - shift.opp >= 0.03 ? "このカードがあなたのレンジに有利なので成立します" : "このカードが自分のレンジに有利なときだけ使う稀なラインです"}。`;
  }
  void a; void role;
  return "";
}

// ---- facing a bet -----------------------------------------------------------------------------------------
function strengthOf(c: Ctx) {
  const d = c.explain?.defence;
  if (!d) return null;
  const eq = finite(d.realized_equity) ? d.realized_equity : finite(d.equity) ? d.equity : null;
  const req = finite(d.required_equity) ? d.required_equity : null;
  if (eq === null || req === null) return null;
  const gap = eq - req;
  const level: "comfortable" | "borderline" | "short" = gap >= 0.08 ? "comfortable" : gap > -0.08 ? "borderline" : "short";
  const top = finite(d.percentile) ? 100 - d.percentile * 100 : null;
  const place = top === null ? null : top <= 25 ? "top" : top >= 70 ? "bottom" : "middle";
  const b = d.blockers ?? {};
  const blocker = (b.value_removed_pct ?? 0) > (b.bluff_removed_pct ?? 0) + 2 ? "value" : (b.bluff_removed_pct ?? 0) > (b.value_removed_pct ?? 0) + 2 ? "bluff" : null;
  const bettor = d.bettor_range?.value_pct;
  const mix = !finite(bettor) ? null : bettor >= 70 ? "strong" : bettor <= 45 ? "bluffy" : "mixed";
  return { level, place, blocker, mix, bluffCapped: !!d.faced_action?.capped };
}

function textureNotes(c: Ctx): string[] {
  const en = c.en, t = c.texture ?? "", shift = c.rf?.runout_shift;
  const base: Record<string, [string, string]> = {
    dry: [narrative("Dry board: few draws, so equity realises stably and the range advantage tends to persist, which favours small, frequent bets.", [], en),
      "ドライなボード：ドローが少なくエクイティが安定して実現され、レンジアドバンテージが残りやすいので、小さく高頻度のベットが向きます。"],
    wet: [narrative("Wet board: many draws and a shifting nut hand make equity dynamic, so protection matters and sizing goes up.", [], en),
      "ウェットなボード：ドローが多くナッツが入れ替わるためエクイティが動的で、プロテクションが重要になりサイズも大きくなります。"],
    paired: [narrative("Paired board: trips and full houses are rare, ranges are condensed, and small bets with a wide range are common.", [], en),
      "ペアボード：トリップスやフルハウスは少なくレンジが凝縮されていて、広いレンジでの小さいベットが多くなります。"],
    monotone: [narrative("Monotone board: flush made hands dominate the nuts, range advantage is muted, and the nut flush blocker gains value.", [], en),
      "モノトーンのボード：フラッシュがナッツを支配し、レンジアドバンテージは薄れ、ナッツフラッシュのブロッカーの価値が上がります。"],
    flush: [narrative("The runout puts a third suited card out, so flushes become possible, equity realisation shifts toward the made flush, and weak showdown hands lose value.", [], en),
      "ランアウトで同じスートが3枚になり、フラッシュが成立しうるため、エクイティはメイドフラッシュに寄り、弱いショーダウンバリューは価値を失います。"],
    straight: [narrative("The runout connects the board, so straights become possible and the nuts can change hands.", [], en),
      "ランアウトでボードがつながり、ストレートが成立しうるため、ナッツが入れ替わる可能性があります。"],
    over: [narrative("An overcard on the runout shifts the range advantage toward the side holding more high cards and devalues the middle pairs.", [], en),
      "ランアウトのオーバーカードは高いカードを多く持つ側にレンジアドバンテージを寄せ、中位のペアの価値を下げます。"],
    pair: [narrative("The runout pairs the board, so full houses are possible and one pair loses value.", [], en),
      "ランアウトでボードがペアになり、フルハウスが成立しうるため、ワンペアの価値が下がります。"],
    blank: [narrative("The runout is a blank, so ranges barely change and the previous plan carries over.", [], en),
      "ランアウトはブランクで、レンジはほとんど変わらず、前のストリートの方針がそのまま続きます。"],
  };
  const parts: string[] = [];
  if (base[t]) parts.push(base[t][en ? 0 : 1]);
  if (finite(shift?.hero) && finite(shift?.opp)) {
    const diff = shift.hero - shift.opp;
    if (diff >= 0.04) parts.push(en ? narrative("This card helps your range more than the opponent's, so more of your range can keep betting.", [], en) : "このカードはあなたのレンジに有利に働き、より多くの手がベットを続けられます。");
    else if (diff <= -0.04) parts.push(en ? narrative("This card helps the opponent's range more than yours, so expect fewer barrels and more checking.", [], en) : "このカードは相手のレンジに有利に働き、バレルは減ってチェックが増えます。");
  }
  return parts;
}

const hashOf = (text: string) => { let h = 2166136261; for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

export function buildAdvancedExplanation(input: AdvancedInput): AdvancedExplanation {
  const en = input.locale === "ja" ? false : input.locale;
  const copyAction = (action: string) => actionForCopy(action, input.explain, input.actionMetadata);
  const facing = !!input.explain?.defence || Object.keys(input.actionMix).some(a => a === "fold" || a === "call");
  const rf = input.explain?.range_facts ?? null;
  const entries = Object.entries(input.actionMix).filter(([, f]) => finite(f) && f! > 0)
    .sort((a, b) => b[1]! - a[1]!) as [string, number][];
  const material = entries.filter(([, f]) => f >= MATERIAL);
  const played = material.length ? material : entries.slice(0, 1);
  const names = played.map(([a]) => a);
  const equity = finite(input.explain?.betting?.equity_vs_defender) ? input.explain.betting.equity_vs_defender : (finite(input.explain?.equity) ? input.explain.equity : 0);
  const street: Ctx["street"] = input.node.startsWith("turn_") ? "turn" : input.node.startsWith("river_") ? "river" : "flop";
  const ipNode = input.node.startsWith("btn_") || input.node.startsWith("ip_") || /^(turn|river)_ip_/.test(input.node);
  const opp = input.positions?.[ipNode ? "oop" : "ip"] ?? (en ? narrative("the opponent", [], en) : "相手");
  const features = featuresForInput(input.board, input.cards, input.combos);
  const desc = describeHand(features, displayName(input.cards ?? input.hand), en, mainTier(input.tiers), opp);
  const ctx: Ctx = { en, node: input.node, hand: desc.name, tier: mainTier(input.tiers), street, ip: ipNode, facing, rf,
    adv: advantages(rf), line: input.explain?.line, texture: input.texture, explain: input.explain, equity, opp };
  const kinds: Record<string, SizeKind | null> = {};
  for (const a of Object.keys(input.actionMix)) kinds[a] = sizeKind(rf?.sizes?.[a]?.tiers);
  const st = strengthOf(ctx);
  const hc: HC = { en, o: opp, street, ip: ipNode, st: st ? { level: st.level, place: st.place, blocker: st.blocker, mix: st.mix, bluffCapped: st.bluffCapped } : null,
    bettorMix: st?.mix ?? null, raiseAllIn: input.raiseAllIn };
  const roleOf = (action: string): { role: string; sub: string } => features
    ? roleFromFeatures(features, { action, equity, facingBet: facing })
    : { role: handRole(equity, input.tiers, action), sub: "" };

  const seen = new Set<string>();
  const finish = (sentences: string[], limit = 6): string => {
    const kept: string[] = [];
    for (const s of sentences) {
      if (!s || seen.has(s) || kept.length >= limit) continue;
      seen.add(s);
      kept.push(s);
    }
    return kept.join(en ? " " : "");
  };

  const ordered = [...played].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
  const topAction = played[0]?.[0];
  const blocks: (AdvancedBlock & { _s?: string[] })[] = [];
  const anyBet = names.some(aggressive);
  for (const [action, frequency] of ordered) {
    const sentences: string[] = [];
    if (action === "check") sentences.push(...checkSentences(desc, hc, anyBet ? roleOf(names.find(aggressive)!).role : null));
    else if (facing) sentences.push(...facingHandSentences(desc, action, roleOf(action), hc));
    else {
      const f = foldLevel(input.explain?.actions?.[action]?.foldShare);
      const cl = calledLevel(input.explain?.bet_table?.actions?.[action]?.calledEquity);
      sentences.push(...betSentences(desc, copyAction(action), roleOf(action), hc), responseSentence(f, cl, ctx, desc.tag));
    }
    blocks.push({ action, label: input.labels?.[action] ?? LABELS[en ? "en" : "ja"][copyAction(action)] ?? action, frequency, text: "" });
    blocks[blocks.length - 1]._s = sentences;
  }
  // The single range-level sentence of the explanation: one of the available range statements (advantage, texture,
  // runout, size composition, street story, SPR), chosen per hand so that hands at the same node do not all share it.
  const topBlock = blocks.find(b => b.action === topAction) ?? blocks[0];
  const pool: { texture: boolean; text: string }[] = [
    { texture: false, text: advantageSentence(ctx) },
    ...textureNotes(ctx).map(text => ({ texture: true, text })),
    { texture: false, text: topAction && !facing ? sizeSentence(copyAction(topAction), kinds[topAction], ctx) : "" },
    { texture: false, text: streetSentence(copyAction(topAction ?? ""), "", ctx) },
    { texture: false, text: sprNote(ctx) },
    { texture: false, text: bettorSentence(ctx) },
  ].filter(x => x.text);
  const pick = pool.length ? pool[hashOf(`${input.cards ?? input.hand}|${input.node}`) % pool.length] : null;
  for (const b of blocks) {
    const s: string[] = b._s!;
    delete b._s;
    b.text = finish(b === topBlock && pick && !pick.texture ? [...s.slice(0, 5), pick.text] : s);
  }
  const d = input.explain?.defence;
  if (facing && d && (input.actionMix.call ?? 0) === 0 && (input.actionMix.fold ?? 0) >= 0.95 && finite(d.realized_equity) && finite(d.required_equity) && d.realized_equity >= d.required_equity) {
    blocks.push({ action: "call", label: LABELS[en ? "en" : "ja"].call, frequency: 0, text: finish([en
      ? narrative("{0} has {1}, enough to continue, but it sits near the bottom of the continuing range, so the plan folds it and keeps the defence on better hands.", [desc.name, desc.short], en)
      : `${desc.name}は${desc.short}で続行できる強さがありますが、続行レンジの下のほうなので、より良い手で守る方針でフォールドを選びます。`]) });
  } else if (!facing && !names.some(aggressive) && desc.m === "nuts" && Object.keys(input.actionMix).some(aggressive)) {
    const observable = input.actionMetadata || input.explain?.betting?.actions?.some(item => "allIn" in item);
    const alternative = observable ? Object.keys(input.actionMix).find(aggressive)! : "bet75";
    blocks.push({ action: alternative, label: input.labels?.[alternative] ?? LABELS[en ? "en" : "ja"][copyAction(alternative)], frequency: 0, text: finish([en
      ? narrative("{0} has {1}, so a bet is not used: slowplaying keeps worse hands in and the checking range uncapped.", [desc.name, desc.made || desc.short], en)
      : `${desc.name}は${desc.made || desc.short}で、ベットは使いません。スロープレイで劣る手を残し、チェックレンジのキャップを防ぎます。`]) });
  }
  const main = names[0] ?? "check";
  const headline = handHeadline(desc, copyAction(main), roleOf(main), facing, hc);
  return { headline, blocks: blocks.map(block => ({ ...block, label: translateExplanationCopy(block.label, input.locale) })), ...(pick?.texture ? { texture: pick.text } : {}) };
}

export function renderAdvancedPlainText(e: AdvancedExplanation): string {
  return [e.headline, ...e.blocks.map(b => `${b.label}: ${b.text}`), ...(e.texture ? [e.texture] : [])].join("\n");
}
