// Advanced, jargon-rich postflop explanations: one short paragraph per action, in the vocabulary of experienced
// players (range/nut advantage, polarised vs merged, capped, bluff-catcher, blockers, SPR, geometric sizing...).
// Pure and numberless. Every claim is chosen by qualitative thresholds over computed facts: the per-hand facts
// (fold shares, equity when called, defence facts) and the range-level facts (`explain.range_facts`: tier shares of
// both reach ranges, the bettor's composition per size, SPR, how the last card shifted the ranges).
import { handRole } from "./postflop-explanation.ts";

export type AdvancedLocale = "en" | "ja";
type NumericMap = Record<string, number | undefined>;
export type AdvancedInput = {
  locale: AdvancedLocale; node: string; hand: string; actionMix: NumericMap; tiers?: NumericMap;
  texture?: string; explain?: any; positions?: { ip?: string; oop?: string };
};
export type AdvancedBlock = { action: string; label: string; frequency: number; text: string };
export type AdvancedExplanation = { headline: string; blocks: AdvancedBlock[]; texture?: string };

const LABELS: Record<string, Record<string, string>> = {
  en: { check: "Check", bet33: "Bet 33%", bet75: "Bet 75%", bet125: "Bet 125%", allin: "All-in", fold: "Fold", call: "Call", raise: "Raise 3×" },
  ja: { check: "チェック", bet33: "ベット 33%", bet75: "ベット 75%", bet125: "ベット 125%", allin: "オールイン", fold: "フォールド", call: "コール", raise: "レイズ 3倍" },
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
export function advantages(rf: any): { range: Advantage; nuts: Advantage; heroCapped: boolean; oppCapped: boolean } | null {
  const h: Tiers | undefined = rf?.tiers?.hero, o: Tiers | undefined = rf?.tiers?.opp;
  if (!h || !o) return null;
  const d = share(h, "monster", "strong") - share(o, "monster", "strong");
  const range: Advantage = d >= 0.04 ? "hero" : d <= -0.04 ? "opp" : "even";
  const hm = share(h, "monster"), om = share(o, "monster");
  const nuts: Advantage = hm - om >= 0.01 && hm >= om * 1.25 ? "hero" : om - hm >= 0.01 && om >= hm * 1.25 ? "opp" : "even";
  return { range, nuts, heroCapped: hm < 0.015 && om >= 0.02, oppCapped: om < 0.015 && hm >= 0.02 };
}

// Streets left to play (including the current one) and the geometric fraction that puts the stacks in by the river.
function geometricFraction(rf: any): number | null {
  const spr = rf?.spr, left = rf?.street === "flop" ? 3 : rf?.street === "turn" ? 2 : 1;
  if (!finite(spr) || spr <= 0 || left < 2) return null;
  return (Math.pow(1 + 2 * spr, 1 / left) - 1) / 2;
}

type Ctx = {
  en: boolean; node: string; hand: string; tier: string; street: "flop" | "turn" | "river"; ip: boolean; facing: boolean;
  rf: any; adv: ReturnType<typeof advantages>; line?: string; texture?: string; explain: any; opp: string; equity: number;
};

const textureWord = (c: Ctx): string => {
  const t = c.texture ?? "";
  const w: Record<string, [string, string]> = {
    dry: ["a dry board", "ドライなボード"], wet: ["a wet board", "ウェットなボード"], paired: ["a paired board", "ペアボード"],
    monotone: ["a monotone board", "モノトーンのボード"], blank: ["a blank runout", "ブランクのランアウト"],
    over: ["an overcard runout", "オーバーカードのランアウト"], pair: ["a board-pairing runout", "ボードがペアになるランアウト"],
    straight: ["a straight-completing runout", "ストレートが絡むランアウト"], flush: ["a flush-completing runout", "フラッシュが絡むランアウト"],
  };
  return (w[t] ?? ["this board", "このボード"])[c.en ? 0 : 1];
};

// ---- context sentences ----------------------------------------------------------------------------------
function advantageSentence(c: Ctx): string {
  const a = c.adv;
  if (!a) return "";
  if (c.facing) {
    if (a.heroCapped) return c.en
      ? "Your range is capped on this line: it holds almost no monsters, so the bettor can lean on you with polarised bets and your continuing hands are mostly bluff-catchers."
      : "このラインではあなたのレンジはキャップされています。モンスターがほとんどなく、相手はポラライズしたベットで圧力をかけられ、続行する手の大半はブラフキャッチャーになります。";
    if (a.oppCapped) return c.en
      ? `${cap(c.opp)}'s range is capped here, so the nuts are not a worry and you can defend wide with your bluff-catchers.`
      : "相手のレンジはここでキャップされていて、ナッツを恐れる必要が薄く、ブラフキャッチャーも広く守れます。";
    if (a.range === "opp") return c.en
      ? "The bettor holds the range advantage on this texture, so your defence has to be disciplined about which hands continue."
      : "このテクスチャでは相手にレンジアドバンテージがあり、どの手で続行するかを厳密に選ぶ必要があります。";
    if (a.range === "hero") return c.en
      ? "Your range is the stronger one on this texture, so you can defend comfortably and still keep raises in the mix."
      : "このテクスチャではあなたのレンジのほうが強く、無理なく守りつつレイズも混ぜられます。";
    return "";
  }
  if (a.range === "hero" && a.nuts === "hero") return c.en
    ? "You hold both the range advantage and the nut advantage on this texture, so the whole range can apply pressure."
    : "このテクスチャではレンジアドバンテージとナッツアドバンテージの両方があり、レンジ全体でプレッシャーをかけられます。";
  if (a.range === "hero") return c.en
    ? "You hold the range advantage without a clear nut advantage, so the pressure comes from frequency rather than from polarised sizing."
    : "レンジアドバンテージはあってもナッツアドバンテージは明確でなく、圧力はポラライズしたサイズではなく高い頻度でかけます。";
  if (a.nuts === "hero") return c.en
    ? "Your range is not ahead overall, but it owns more of the nuts, and that is what supports a polarised line."
    : "レンジ全体では優位ではないものの、ナッツはあなたのほうが多く、それがポラライズしたラインを支えます。";
  if (a.range === "opp") return c.en
    ? "The opponent's range is ahead on this texture, so checking dominates and only the hands that clearly want to bet do so."
    : "このテクスチャでは相手のレンジが優位なので、チェックが中心になり、はっきり打ちたい手だけがベットします。";
  return c.en
    ? "Neither range has a clear edge here, so the line comes down to each hand's own incentives."
    : "どちらのレンジにも明確な優位がなく、ラインは各ハンドごとの事情で決まります。";
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function sprNote(c: Ctx): string {
  const spr = c.rf?.spr;
  if (!finite(spr)) return "";
  if (spr < 2) return c.en ? "With the SPR this low, the stacks are close to committed already, so hand strength matters more than polarisation."
    : "SPRがここまで低いと、スタックはほぼコミット済みで、ポラライズよりも手の強さが重要になります。";
  return "";
}

// ---- betting actions -------------------------------------------------------------------------------------
function sizeSentence(a: string, kind: SizeKind | null, c: Ctx): string {
  const nuts = c.adv?.nuts === "hero";
  const en = c.en;
  if (a === "allin") {
    const spr = c.rf?.spr, h = c.hand, tier = c.tier, value = tier === "monster" || tier === "strong";
    if (finite(spr) && spr < 3) {
      if (value) return en ? `${h} is strong enough to stack off: at this low SPR the shove just commits the stacks, so raw hand strength outweighs polarisation.`
        : `${h}はスタックを入れきれる強さです。SPRが低いのでオールインは単にスタックをコミットするだけで、ポラライズよりも手の強さが重みを持ちます。`;
      return en ? `${h} shoves as a bluff that the capped value range supports, and at this low SPR the shove is close to the natural geometric size.`
        : `${h}はブラフとしてのオールインです。SPRが低くオールインが自然なジオメトリックサイズに近いため、バリューとのバランスの範囲で成立します。`;
    }
    if (value) return en ? `${h} shoves with the remaining stack, a geometric-size bet where only the strongest hands and a few bluffs can go all-in.`
      : `${h}は残りスタックをすべて入れるオールインです。ジオメトリックサイズの賭けなので、最強クラスの手と少数のブラフだけが成立します。`;
    return en ? `${h} shoves as a bluff, and only a small share of the range can do so while keeping the value-to-bluff balance.`
      : `${h}はブラフとしてのオールインで、バリューとのバランスを保てる範囲の少数のハンドだけが選びます。`;
  }
  if (a === "bet33") switch (kind) {
    case "merged": return c.street === "river"
      ? (en ? "This small size is a linear range of strong and medium hands going for thin value, with few bluffs."
        : "この小さいサイズは、強い手と中程度の手がシンバリューを取りに行くリニアなレンジで、ブラフは少なめです。")
      : (en ? "This small size is a linear range of strong and medium hands betting for value and protection with few bluffs."
        : "この小さいサイズは、強い手と中程度の手がバリューとプロテクションで打つリニアなレンジで、ブラフは少なめです。");
    case "value": return en ? "Even at a small size the range is almost all value, built to keep worse hands calling."
      : "小さいサイズでもレンジはほぼバリューで、劣る手にコールを続けさせるための構成です。";
    case "polar": return en ? "Even at a small size this range is polarised: a few strong hands plus air that can bluff cheaply."
      : "小さいサイズでも、このレンジは強い手とエアだけのポラライズで、安くブラフできる形です。";
    default: return en ? "The small size suits a wide, merged range: it taxes the weakest holdings, takes thin value from worse pairs and denies equity cheaply."
      : "小さいサイズは広くマージしたレンジに向いていて、弱い手に課税し、劣るペアからシンバリューを取り、安くエクイティデニアルを効かせます。";
  }
  if (a === "bet75") switch (kind) {
    case "polar": return en ? "The large bet is polarised, strong value and air with little in between, which forces the opponent to find calls with bluff-catchers."
      : "大きなベットはポラライズされていて、強いバリューとエアが中心で中間の手が少なく、相手はブラフキャッチャーでコールを探すことになります。";
    case "merged": return c.street === "river"
      ? (en ? "The large bet stays merged: strong and good medium hands bet for thin-to-solid value while few pure bluffs join them."
        : "大きなベットでもマージを保ち、強い手と良い中程度の手がバリューで打ち、純粋なブラフはわずかです。")
      : (en ? "The large bet stays merged: strong and good medium hands bet for value and protection while few pure bluffs join them."
      : "大きなベットですがレンジはマージ寄りで、強い手と良い中程度の手がバリューとプロテクションで打ち、純粋なブラフは少なめです。");
    case "value": return en ? "This size is almost pure value, built to extract from the opponent's calling range."
      : "このサイズはほぼバリューだけで、相手のコールレンジから最大限に取るための構成です。";
    default: return en ? "The large bet carries a wide mix of value, medium hands and bluffs, so no single hand type gives it away."
      : "大きなベットにはバリュー、中程度の手、ブラフが幅広く混ざっていて、特定の手の種類が透けて見えません。";
  }
  if (a === "bet125") switch (kind) {
    case "polar": return en ? (nuts ? "An overbet needs a polarised range backed by a nut advantage, which you have here, and it puts bluff-catchers under maximum pressure."
      : "The overbet is polarised, strong hands plus air, and it puts the opponent's bluff-catchers under maximum pressure.")
      : (nuts ? "オーバーベットにはナッツアドバンテージに支えられたポラライズが必要で、ここではそれがあり、ブラフキャッチャーを最大限に追い込めます。"
      : "オーバーベットは強い手とエアのポラライズで、相手のブラフキャッチャーを最大限に追い込みます。");
    case "value": return en ? "The overbet is almost pure value, the nuts squeezing the opponent's strongest calling hands."
      : "オーバーベットはほぼバリューだけで、ナッツで相手の強いコールレンジを絞り取ります。";
    default: return en ? "The overbet is a rare size, kept for the top of the range together with the best bluffs."
      : "オーバーベットは稀なサイズで、レンジの上位と最良のブラフに限って使われます。";
  }
  return "";
}

function handSentence(a: string, role: string, kind: SizeKind | null, called: Called | null, c: Ctx, level: Level | null): string {
  const en = c.en, h = c.hand, tier = c.tier;
  const small = a === "bet33";
  switch (role) {
    case "value":
      if (tier === "monster") return en ? `${h} is at the very top of the range and bets to build the pot.` : `${h}はレンジの最上位で、ポットを育てるためにベットします。`;
      if (kind === "polar") return en ? `${h} is part of the strong end, a polar value bet that wants calls from second-best hands.`
        : `${h}は強い側に入り、2番手の手にコールさせたいポラライズしたバリューベットです。`;
      if (kind === "value") return en ? `${h} is part of the strong core of this size and wants calls from second-best hands.`
        : `${h}はこのサイズの強い中核に入り、2番手の手にコールさせたい手です。`;
      if (called === "similar" || tier === "medium") return en ? `${h} bets for thin value, with showdown strength that still beats most of what calls.`
        : `${h}はシンバリューのベットで、ショーダウンバリューがコールしてくる手の大半に勝っています。`;
      return en ? `${h} bets for value and protection: worse pairs and draws can call, and the bet denies them a cheap card.`
        : `${h}はバリューとプロテクションのベットで、劣るペアやドローのコールを引き出しつつ、安くカードを見せません。`;
    case "semi-bluff":
      return en ? `${h} is a semi-bluff: it wins when the opponent folds and keeps equity that is easy to realise when called, so it does not need to hit to profit.`
        : `${h}はセミブラフで、相手が降りれば勝て、コールされても実現しやすいエクイティが残るため、ヒットしなくても利益になります。`;
    case "protection":
      return en ? `${h} bets for protection, denying equity to overcards and draws that could outdraw it and getting thin value from weaker hands.`
        : `${h}はプロテクションのベットで、逆転しうるオーバーカードやドローのエクイティを奪い、弱い手からシンバリューも取ります。`;
    default: {
      if (small) return en ? `${h} sits in the bluffing part of the range, and the small size makes it cheap because few folds are needed.`
        : `${h}はレンジの中でブラフ側に入り、小さいサイズなので必要なフォールドが少なく、安く打てます。`;
      return level === "most" || level === "many"
        ? (en ? `${h} is a pure bluff with little showdown value, supported by how many hands in the opponent's range give up.`
          : `${h}はショーダウンバリューの乏しい純粋なブラフで、相手のレンジに降りる手が多いことが根拠です。`)
        : (en ? `${h} is a thin bluff with little showdown value, so it is used only part of the time.`
          : `${h}はショーダウンバリューの乏しい薄いブラフで、使うのは一部の頻度に限られます。`);
    }
  }
}

function responseSentence(f: Level | null, cl: Called | null, c: Ctx): string {
  if (!f && !cl) return "";
  const en = c.en, o = c.opp;
  const foldGood = f === "most" || f === "many";
  const foldText = f ? (en ? { most: `most of ${o}'s range gives up`, many: `a large part of ${o}'s range folds`, some: `only part of ${o}'s range folds`, few: `hardly any of ${o}'s range folds` }[f]
    : { most: `${o}のレンジの大半は降り`, many: `${o}のレンジの多くが降り`, some: `${o}のレンジのうち降りるのは一部で`, few: `${o}のレンジはほとんど降りず` }[f]) : "";
  const calledText = cl ? (en ? { better: "what continues is mostly ahead of you", similar: "what continues is close to you in strength", weaker: "what continues is mostly behind you" }[cl]
    : { better: "続行する手は主に自分より強く", similar: "続行する手は自分と同程度で", weaker: "続行する手は主に自分より弱くなります" }[cl]) : "";
  if (en) {
    if (!f) return cap(calledText) + ".";
    if (!cl) return cap(foldText) + ".";
    const calledGood = cl === "weaker", conj = foldGood === calledGood || cl === "similar" ? "and" : "but";
    return `${cap(foldText)}, ${conj} ${calledText}.`;
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
  if (c.street === "river") return en ? "No draws are left on the river, so this bet is either value or a bluff."
    : "リバーにはもうドローが残っていないので、このベットはバリューかブラフのどちらかです。";
  if (c.street === "turn") {
    if (c.line === "aggressor") return en ? "Continuing from the flop makes this a turn barrel, and the story stays consistent with the earlier bet."
      : "フロップからの続きなのでターンバレルで、先のベットとストーリーが一貫します。";
    if (c.line === "checked" && c.ip && c.rf?.pfr === "ip") return en ? "Betting after the flop checked through is a delayed c-bet, which punishes the capped checking range."
      : "フロップがチェックで流れたあとのベットはディレイドCベットで、キャップされたチェックレンジを突きます。";
    if (c.line === "defender" && !c.ip) return en ? `A lead from the defender is a donk bet${finite(shift?.hero) && finite(shift?.opp) && shift.hero - shift.opp >= 0.03 ? ", which works here because the card favours your range" : ", a rare line that needs the card to favour your range"}.`
      : `ディフェンダーからのリードはドンクで、${finite(shift?.hero) && finite(shift?.opp) && shift.hero - shift.opp >= 0.03 ? "このカードがあなたのレンジに有利なので成立します" : "このカードが自分のレンジに有利なときだけ使う稀なラインです"}。`;
  }
  void a; void role;
  return "";
}

function extraBetSentence(a: string, role: string, c: Ctx, usedGeo: { done: boolean }): string {
  const g = geometricFraction(c.rf);
  if (g !== null && FRACTION[a] && Math.abs(FRACTION[a] - g) <= 0.15 && !usedGeo.done) {
    usedGeo.done = true;
    return c.en ? "This size is close to geometric for the stacks behind, setting up a river shove."
      : "このサイズは残りスタックに対してほぼジオメトリックで、リバーのオールインまで見据えた設計です。";
  }
  return streetSentence(a, role, c);
}

// ---- check ------------------------------------------------------------------------------------------------
function checkSentences(played: string[], c: Ctx): string[] {
  const en = c.en, h = c.hand, tier = c.tier, bets = played.filter(aggressive).length > 0;
  const out: string[] = [];
  if (tier === "monster" || tier === "strong") {
    out.push(en ? `${h} checks as a slowplay, hiding its strength so the checking range does not end up capped.`
      : `${h}はスロープレイでチェックし、強さを隠してチェックレンジがキャップされないようにします。`);
    if (c.street === "flop" && c.ip) out.push(en ? "Checking back still leaves a delayed c-bet on the turn."
      : "チェックバックしてもターンでのディレイドCベットが残ります。");
  } else if (tier === "draw") {
    out.push(en ? `${h} takes the free card: a draw with this much equity realises it best without putting more chips in.`
      : `${h}はフリーカードを見に行きます。エクイティのあるドローは、追加のチップを入れずに実現するのが最も効率的です。`);
  } else if (tier === "medium") {
    out.push(en ? `${h} is a showdown-value hand that does not like a big pot, so it checks to control the pot and induces bluffs from worse.`
      : `${h}はショーダウンバリューのある手で大きなポットは好まないため、チェックでポットコントロールし、劣る手のブラフを誘います。`);
  } else {
    out.push(en ? `${h} falls outside the bluffing part of the range, so it checks and gives up cheaply.`
      : `${h}はブラフに回るレンジの外側にあり、チェックして安くあきらめます。`);
  }
  const a = c.adv;
  if (a?.range === "opp") out.push(en ? "On this texture the opponent's range is ahead, so a high checking frequency is the baseline."
    : "このテクスチャでは相手のレンジが優位で、高いチェック頻度が基本になります。");
  if (bets) out.push(en ? "Because the same kind of hand also bets, the action alone does not reveal what you hold."
    : "同種の手がベットにも回るので、アクションだけでは手の中身を読まれません。");
  return out;
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

function positionNote(c: Ctx): string {
  return c.ip
    ? (c.en ? "Being in position helps you realise equity, which supports continuing." : "ポジションがあるため実現しやすいエクイティが増え、続行を後押しします。")
    : (c.en ? "Out of position you realise less of your equity, so every continue needs some margin." : "ポジションがないと実現できるエクイティが減るため、続行にはある程度の余裕が必要です。");
}

function facingSentences(action: string, c: Ctx, zero: boolean): string[] {
  const en = c.en, h = c.hand, st = strengthOf(c), tier = c.tier, o = c.opp;
  const out: string[] = [];
  const lv = st?.level, place = st?.place;
  const raiseNode = c.node.includes("raise");
  const bettorKind = sizeKind(c.rf?.tiers?.opp);
  const mixEn = st?.mix === "strong" ? "value-heavy" : st?.mix === "bluffy" ? "full of bluffs" : st?.mix === "mixed" ? "balanced between value and bluffs" : "";
  const mixJa = st?.mix === "strong" ? "バリュー寄り" : st?.mix === "bluffy" ? "ブラフが多め" : st?.mix === "mixed" ? "バリューとブラフが拮抗" : "";
  if (action === "call") {
    if (zero) {
      out.push(en ? `${h} is good enough to continue but sits near the bottom of the continuing range, so the plan folds it and keeps the defence on better hands.`
        : `${h}は続行できる強さがありますが、続行レンジの下のほうなので、より良い手で守る方針でフォールドを選びます。`);
      out.push(en ? "You only need to defend enough of your range, and the weakest continues go first."
        : "守るべきなのはレンジの必要な割合だけで、最も弱い続行候補から先に降ります。");
      return out;
    }
    if (tier === "monster" || tier === "strong" && place === "top") out.push(en ? `${h} is a value call from the top of the continuing range, and flatting keeps worse hands and bluffs in.`
      : `${h}は続行レンジの上位にあるバリューコールで、フラットに受けると劣る手やブラフを残せます。`);
    else if (tier === "air") out.push(en ? `${h} has no pair, so it only beats the pure bluffs and calls as a marginal bluff-catcher.`
      : `${h}はペアがなく、純粋なブラフにしか勝てない境界線上のブラフキャッチャーとしてコールします。`);
    else if (tier === "draw") out.push(en ? `${h} continues as a draw, with enough equity and implied odds to call.`
      : `${h}はドローとして続行し、エクイティとインプライドオッズでコールできます。`);
    else out.push(en ? `${h} is a bluff-catcher: it beats the bluffs and loses to the value${mixEn ? `, and the bettor's range is ${mixEn}` : ""}.`
      : `${h}はブラフキャッチャーで、ブラフには勝ちバリューには負けます${mixJa ? `。相手のレンジは${mixJa}です` : ""}。`);
    if (lv === "comfortable") out.push(en ? "Its realised equity clears the price comfortably, so this is a clean call."
      : "実現エクイティは必要な水準を余裕で上回り、迷いのないコールです。");
    else if (lv === "borderline") out.push(en ? "It sits right at the indifference point, which is why the strategy mixes calls and folds."
      : "ちょうど無差別の水準にあり、そのためコールとフォールドを混ぜる戦略になっています。");
    else out.push(en ? "It is below the price on paper, so it calls only at a low frequency to keep the defence unexploitable."
      : "数字上は必要な水準に届かず、守りを搾取されないために低い頻度でだけコールします。");
    out.push(positionNote(c));
    if (st?.blocker === "value") out.push(en ? "Its blockers remove part of the value range, which improves the call."
      : "ブロッカーが相手のバリューレンジの一部を消し、コールの質を高めます。");
    else if (st?.blocker === "bluff") out.push(en ? "Its blockers remove some of the bluffs, which makes catching less attractive."
      : "ブロッカーが相手のブラフを一部消すため、ブラフキャッチの魅力は下がります。");
    return out;
  }
  if (action === "fold") {
    if (lv === "short") out.push(en ? `${h} falls below the price: it loses to most of the value and has too little equity against the rest.`
      : `${h}は必要な水準を下回り、バリューの大半に負け、残りに対してもエクイティが足りません。`);
    else out.push(en ? `${h} is close to the threshold but not clearly worth continuing, so folding keeps its place in the mix.`
      : `${h}は続行の水準に近いものの、はっきり続けるほどではないため、フォールドも混ぜて残します。`);
    out.push(en ? `You only need to defend enough of your range${place === "bottom" ? ", and a hand at the bottom of it is the first to go" : ""}.`
      : place === "bottom" ? "守るべきなのはレンジの必要な割合だけで、レンジの下位にあるこの手は真っ先に降ります。" : "守るべきなのはレンジの必要な割合だけです。");
    if (st?.blocker === "bluff") out.push(en ? "It also blocks the bettor's bluffs, so folding gives up little."
      : "さらに相手のブラフを減らしてしまうため、降りても失うものは小さくなります。");
    else if (st?.blocker === "value") out.push(en ? "It does block some of the value, which is why it is not folded every time."
      : "相手のバリューを一部ブロックしているので、毎回フォールドするわけではありません。");
    if (st?.bluffCapped) out.push(en ? `${cap(o)}'s bluffs are limited on this line, so bluff-catchers lose value.`
      : "このラインでは相手のブラフ頻度が抑えられていて、ブラフキャッチャーの価値は下がります。");
    return out;
  }
  // raise
  if (lv === "comfortable") {
    out.push(en ? `${h} raises for value: it is well ahead of the bettor's range, so worse hands get to pay more.`
      : `${h}はバリューレイズで、相手のレンジを大きく上回っているため、劣る手からより多く取れます。`);
    out.push(c.ip ? (en ? "Raising over a lead also puts a capped betting range under pressure." : "リードへのレイズは、キャップされたベットレンジにも圧力をかけます。")
      : (en ? "As a check-raise it also builds the pot out of position, where it is hard to get value otherwise." : "チェックレイズにすれば、ポジションがなくても取りにくいバリューを引き出せます。"));
  } else if (tier === "draw") {
    out.push(en ? `${h} raises as a semi-bluff: it wins when the bettor folds and keeps equity that is easy to realise when called.`
      : `${h}はセミブラフのレイズで、相手が降りれば勝て、コールされても実現しやすいエクイティが残ります。`);
  } else {
    out.push(en ? `${h} is too weak to call profitably, so it becomes a bluff-raise candidate that folds out hands that beat it.`
      : `${h}はコールでは採算が合わない弱さで、勝っている手を降ろすためのブラフレイズ候補になります。`);
    if (st?.blocker === "value") out.push(en ? "Its blockers remove part of the bettor's value, which is exactly what a bluff-raise wants."
      : "ブロッカーが相手のバリューの一部を消しており、ブラフレイズが求める条件を満たします。");
  }
  if (raiseNode || bettorKind === "polar") out.push(en ? "Raising against a polarised bet keeps your own range from being only bluff-catchers."
    : "ポラライズしたベットに対してレイズを混ぜると、自分のレンジがブラフキャッチャーだけにならずに済みます。");
  return out;
}

// ---- headline ----------------------------------------------------------------------------------------------
function headlineFor(c: Ctx, played: [string, number][], role: string, facing: boolean, kinds: Record<string, SizeKind | null>): string {
  const en = c.en, a = c.adv, main = played[0]?.[0] ?? "check", tex = textureWord(c), h = c.hand;
  if (facing) {
    const bk = sizeKind(c.rf?.tiers?.opp);
    const who = bk === "polar" ? (en ? "a polarised bet" : "ポラライズしたベット") : bk === "value" ? (en ? "a value-heavy bet" : "バリュー寄りのベット") : (en ? "a merged bet" : "マージしたベット");
    const state = a?.heroCapped ? (en ? " with a capped range" : "（レンジがキャップ）") : a?.range === "opp" ? (en ? " while the bettor holds the range advantage" : "（相手にレンジアドバンテージ）") : "";
    const plan = ({
      call: c.tier === "monster" || c.tier === "strong" ? (en ? `${h} is a value call that continues mostly by calling` : `${h}は主にコールで続行するバリューコール`)
        : (en ? `${h} is a bluff-catcher that continues mostly by calling` : `${h}は主にコールで続行するブラフキャッチャー`),
      fold: en ? `${h} sits below the defence line and mostly folds` : `${h}はディフェンスの線を下回り、基本はフォールド`,
      raise: en ? `${h} leans on raising, as value or as a semi-bluff` : `${h}はバリューまたはセミブラフとしてレイズ中心`,
    } as Record<string, string>)[main] ?? (en ? `${h} mixes continuing and giving up` : `${h}は続行とギブアップの混合`);
    return en ? `Facing ${who} on ${tex}${state}: ${plan}.` : `${tex}で${who}に直面${state}：${plan}。`;
  }
  const lead = a?.range === "hero" && a.nuts === "hero" ? (en ? "Range and nut advantage" : "レンジ・ナッツアドバンテージ")
    : a?.range === "hero" ? (en ? "Range advantage" : "レンジアドバンテージ")
    : a?.nuts === "hero" ? (en ? "Nut advantage" : "ナッツアドバンテージ")
    : a?.range === "opp" ? (en ? "Opponent's range advantage" : "相手のレンジアドバンテージ") : (en ? "Even ranges" : "拮抗したレンジ");
  const k = kinds[main];
  const plan = main === "check"
    ? (played.length > 1 ? (en ? "mostly check, with a bet mixed in to keep the checking range protected" : "基本はチェックで、チェックレンジを守るためにベットを混ぜる")
      : (en ? "check and keep the pot small" : "チェックでポットを小さく保つ"))
    : main === "bet33" ? (en ? `high-frequency small bet with a ${k === "polar" ? "polarised" : "merged"} range` : `${k === "polar" ? "ポラライズ" : "マージ"}したレンジでの高頻度の小さいベット`)
    : main === "bet75" ? (en ? `large bet with a ${k === "polar" ? "polarised" : k === "value" ? "value-heavy" : "merged"} range` : `${k === "polar" ? "ポラライズ" : k === "value" ? "バリュー寄り" : "マージ"}したレンジでの大きなベット`)
    : main === "bet125" ? (en ? "overbet with a polarised range" : "ポラライズしたレンジでのオーバーベット")
    : (en ? "shove to commit the stacks" : "オールインでスタックをコミット");
  const handPlan = role === "value" ? (en ? `${h} bets for value` : `${h}はバリューで打つ`)
    : role === "semi-bluff" ? (en ? `${h} semi-bluffs` : `${h}はセミブラフ`)
    : role === "protection" ? (en ? `${h} bets for protection` : `${h}はプロテクション目的で打つ`)
    : role === "bluff" ? (en ? `${h} is a bluff candidate` : `${h}はブラフ候補`)
    : (en ? `${h} checks to control the pot` : `${h}はポットコントロールでチェック`);
  return en ? `${lead} on ${tex}: ${plan}; ${handPlan}.` : `${tex}での${lead}：${plan}。${handPlan}。`;
}

function textureNote(c: Ctx): string | undefined {
  const en = c.en, t = c.texture ?? "", shift = c.rf?.runout_shift;
  const base: Record<string, [string, string]> = {
    dry: ["Dry board: few draws, so equity realises stably and the range advantage tends to persist, which favours small, frequent bets.",
      "ドライなボード：ドローが少なくエクイティが安定して実現され、レンジアドバンテージが残りやすいので、小さく高頻度のベットが向きます。"],
    wet: ["Wet board: many draws and a shifting nut hand make equity dynamic, so protection matters and sizing goes up.",
      "ウェットなボード：ドローが多くナッツが入れ替わるためエクイティが動的で、プロテクションが重要になりサイズも大きくなります。"],
    paired: ["Paired board: trips and full houses are rare, ranges are condensed, and small bets with a wide range are common.",
      "ペアボード：トリップスやフルハウスは少なくレンジが凝縮されていて、広いレンジでの小さいベットが多くなります。"],
    monotone: ["Monotone board: flush made hands dominate the nuts, range advantage is muted, and the nut flush blocker gains value.",
      "モノトーンのボード：フラッシュがナッツを支配し、レンジアドバンテージは薄れ、ナッツフラッシュのブロッカーの価値が上がります。"],
    flush: ["The runout puts a third suited card out, so flushes become possible, equity realisation shifts toward the made flush, and weak showdown hands lose value.",
      "ランアウトで同じスートが3枚になり、フラッシュが成立しうるため、エクイティはメイドフラッシュに寄り、弱いショーダウンバリューは価値を失います。"],
    straight: ["The runout connects the board, so straights become possible and the nuts can change hands.",
      "ランアウトでボードがつながり、ストレートが成立しうるため、ナッツが入れ替わる可能性があります。"],
    over: ["An overcard on the runout shifts the range advantage toward the side holding more high cards and devalues the middle pairs.",
      "ランアウトのオーバーカードは高いカードを多く持つ側にレンジアドバンテージを寄せ、中位のペアの価値を下げます。"],
    pair: ["The runout pairs the board, so full houses are possible and one pair loses value.",
      "ランアウトでボードがペアになり、フルハウスが成立しうるため、ワンペアの価値が下がります。"],
    blank: ["The runout is a blank, so ranges barely change and the previous plan carries over.",
      "ランアウトはブランクで、レンジはほとんど変わらず、前のストリートの方針がそのまま続きます。"],
  };
  const parts: string[] = [];
  if (base[t]) parts.push(base[t][en ? 0 : 1]);
  if (finite(shift?.hero) && finite(shift?.opp)) {
    const diff = shift.hero - shift.opp;
    if (diff >= 0.04) parts.push(en ? "This card helps your range more than the opponent's, so more of your range can keep betting." : "このカードはあなたのレンジに有利に働き、より多くの手がベットを続けられます。");
    else if (diff <= -0.04) parts.push(en ? "This card helps the opponent's range more than yours, so expect fewer barrels and more checking." : "このカードは相手のレンジに有利に働き、バレルは減ってチェックが増えます。");
  }
  return parts.length ? parts.join(en ? " " : "") : undefined;
}

export function buildAdvancedExplanation(input: AdvancedInput): AdvancedExplanation {
  const en = input.locale === "en";
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
  const ctx: Ctx = { en, node: input.node, hand: input.hand, tier: mainTier(input.tiers), street, ip: ipNode, facing, rf,
    adv: advantages(rf), line: input.explain?.line, texture: input.texture, explain: input.explain, equity,
    opp: input.positions?.[ipNode ? "oop" : "ip"] ?? (en ? "the opponent" : "相手") };
  const kinds: Record<string, SizeKind | null> = {};
  for (const a of Object.keys(input.actionMix)) kinds[a] = sizeKind(rf?.sizes?.[a]?.tiers);

  const seen = new Set<string>();
  const finish = (sentences: string[], limit = 4): string => {
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
  const geo = { done: false };
  const blocks: AdvancedBlock[] = [];
  for (const [action, frequency] of ordered) {
    const sentences: string[] = [];
    if (action === "check") sentences.push(...checkSentences(names, ctx));
    else if (facing) {
      const lead = action === topAction ? advantageSentence(ctx) : "";
      sentences.push(...facingSentences(action, ctx, false));
      if (lead) sentences.splice(1, 0, lead);
    } else {
      const role = handRole(equity, input.tiers, action);
      const f = foldLevel(input.explain?.actions?.[action]?.foldShare);
      const cl = calledLevel(input.explain?.bet_table?.actions?.[action]?.calledEquity);
      sentences.push(sizeSentence(action, kinds[action], ctx), handSentence(action, role, kinds[action], cl, ctx, f),
        responseSentence(f, cl, ctx));
      if (action === topAction) sentences.splice(2, 0, advantageSentence(ctx));
      sentences.push(extraBetSentence(action, role, ctx, geo), sprNote(ctx));
    }
    blocks.push({ action, label: LABELS[input.locale][action] ?? action, frequency, text: finish(sentences) });
  }
  const sizes = blocks.filter(b => b.action.startsWith("bet") || b.action === "allin");
  if (!facing && sizes.length > 1) {
    const last = sizes[sizes.length - 1];
    const first = kinds[sizes[0].action], lastKind = kinds[last.action];
    const wideFirst = first === "merged" || first === "wide";
    last.text += en
      ? (wideFirst && lastKind === "polar" ? " Splitting the sizes lets the small bet carry the merged range and the large one the polarised range, so neither size gives the hand away."
        : wideFirst && lastKind === "value" ? " Splitting the sizes lets the small bet carry the wide range while the large one is reserved for the value-heavy top of the range."
        : first !== lastKind ? " Each size carries a different composition, so no single size gives the hand away."
        : " The hand is close to indifferent between the sizes, which is why the frequencies are split.")
      : (wideFirst && lastKind === "polar" ? "サイズを分けることで、小さいベットがマージしたレンジを、大きいベットがポラライズしたレンジを担い、どのサイズからも手が読まれません。"
        : wideFirst && lastKind === "value" ? "サイズを分けることで、小さいベットが広いレンジを担い、大きいベットはバリュー寄りのレンジの上位に限られます。"
        : first !== lastKind ? "サイズごとにレンジの構成が違うため、どのサイズからも手が読まれません。"
        : "サイズ間でほぼ無差別なので、頻度を分けています。");
  }
  const d = input.explain?.defence;
  if (facing && d && (input.actionMix.call ?? 0) === 0 && (input.actionMix.fold ?? 0) >= 0.95 && finite(d.realized_equity) && finite(d.required_equity) && d.realized_equity >= d.required_equity) {
    blocks.push({ action: "call", label: LABELS[input.locale].call, frequency: 0, text: finish(facingSentences("call", ctx, true)) });
  } else if (!facing && !names.some(aggressive) && ctx.tier === "monster" && (input.tiers?.monster ?? 0) >= 0.8 && Object.keys(input.actionMix).some(aggressive)) {
    blocks.push({ action: "bet75", label: LABELS[input.locale].bet75, frequency: 0, text: finish([en
      ? "A bet is not used with this very strong hand: slowplaying keeps worse hands in and the checking range uncapped."
      : "とても強いこの手ではベットを使いません。スロープレイで劣る手を残し、チェックレンジのキャップを防ぎます。"]) });
  }
  const role = handRole(equity, input.tiers, names.find(aggressive) ?? names[0] ?? "check");
  return { headline: headlineFor(ctx, played, role, facing, kinds), blocks, ...(textureNote(ctx) ? { texture: textureNote(ctx) } : {}) };
}

export function renderAdvancedPlainText(e: AdvancedExplanation): string {
  return [e.headline, ...e.blocks.map(b => `${b.label}: ${b.text}`), ...(e.texture ? [e.texture] : [])].join("\n");
}
