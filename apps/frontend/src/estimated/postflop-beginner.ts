// Beginner-first postflop explanations: one short natural-language paragraph per action. Pure and numberless;
// every sentence is chosen by qualitative thresholds over the stored facts and never states an EV.
import { handRole } from "./postflop-explanation.ts";

export type BeginnerLocale = "en" | "ja";
type NumericMap = Record<string, number | undefined>;
export type BeginnerInput = {
  locale: BeginnerLocale; node: string; hand: string; actionMix: NumericMap; tiers?: NumericMap;
  texture?: string; explain?: any; positions?: { ip?: string; oop?: string };
};
export type BeginnerBlock = { action: string; label: string; frequency: number; text: string };
export type BeginnerExplanation = { headline: string; blocks: BeginnerBlock[]; texture?: string };

const LABELS: Record<string, Record<string, string>> = {
  en: { check: "Check", bet33: "Bet 33%", bet75: "Bet 75%", bet125: "Bet 125%", allin: "All-in", fold: "Fold", call: "Call", raise: "Raise 3×" },
  ja: { check: "チェック", bet33: "ベット 33%", bet75: "ベット 75%", bet125: "ベット 125%", allin: "オールイン", fold: "フォールド", call: "コール", raise: "レイズ 3倍" },
};
const ORDER = ["check", "bet33", "bet75", "bet125", "allin", "fold", "call", "raise"];
const MATERIAL = 0.05 - 1e-9;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const aggressive = (a: string) => a.startsWith("bet") || a === "allin" || a === "raise";

type FoldLevel = "most" | "many" | "some" | "few";
const foldLevel = (v: unknown): FoldLevel | null => !finite(v) ? null : v >= 0.65 ? "most" : v >= 0.45 ? "many" : v >= 0.25 ? "some" : "few";
type CalledLevel = "better" | "similar" | "weaker";
const calledLevel = (v: unknown): CalledLevel | null => !finite(v) ? null : v < 0.42 ? "better" : v < 0.58 ? "similar" : "weaker";

function mainTier(tiers?: NumericMap) {
  return Object.entries(tiers ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? "air";
}

// Words that need an in-line gloss the first time they appear in one explanation.
class Glossary {
  private seen = new Set<string>();
  private english: boolean;
  constructor(english: boolean) { this.english = english; }
  term(key: string, plain: string, gloss: string) {
    if (this.seen.has(key)) return plain;
    this.seen.add(key);
    return this.english ? `${plain} (${gloss})` : `${plain}（${gloss}）`;
  }
}

function textureClause(texture: string | undefined, english: boolean): string | undefined {
  const t = ({
    en: {
      wet: "On a coordinated board like this, many cards help draws, so the pot can swing quickly.",
      monotone: "Three cards of one suit are on the board, so anyone holding that suit may already have a flush.",
      paired: "The board is paired, so strong made hands are rarer and a single pair is worth less.",
      flush: "The last card made three of one suit, so a flush is now possible and weak hands are less sure of winning.",
      straight: "The last card connects with the others, so a straight is now possible.",
      over: "The last card is higher than anything before it, which can turn a good pair into an average one.",
      pair: "The last card paired the board, which makes full houses possible and weakens ordinary pairs.",
      dry: "The board is dry, so few draws exist and the best hand tends to stay the best.",
      blank: "The last card changed very little, so the picture is much like before.",
    },
    ja: {
      wet: "このボードはカードがつながっていて、ドローが完成しやすく、形勢が変わりやすい状況です。",
      monotone: "同じマークが3枚並んでいるので、そのマークを持つ人はすでにフラッシュかもしれません。",
      paired: "ボードがペアなので、強い役が出にくく、ワンペアの価値は少し下がります。",
      flush: "最後のカードで同じマークが3枚になり、フラッシュがありえるため、弱い手は勝てると言い切れなくなります。",
      straight: "最後のカードが他とつながり、ストレートがありえる形になりました。",
      over: "最後のカードがそれまでより高く、良いペアでも平凡な手に見えやすくなります。",
      pair: "最後のカードでボードがペアになり、フルハウスがありえて、ふつうのペアの価値は下がります。",
      dry: "ボードがドライでドローが少なく、今一番強い手がそのまま勝ちやすい状況です。",
      blank: "最後のカードはほとんど状況を変えませんでした。",
    },
  } as Record<string, Record<string, string>>)[english ? "en" : "ja"];
  return t[texture ?? ""];
}

const SIZE = {
  en: { bet33: "small bet", bet75: "medium-sized bet", bet125: "big bet", allin: "all-in" } as Record<string, string>,
  ja: { bet33: "小さめのベット", bet75: "中くらいのベット", bet125: "大きなベット", allin: "オールイン" } as Record<string, string>,
};

function foldPhrase(level: FoldLevel | null, english: boolean): string {
  if (!level) return "";
  return english
    ? { most: "most of the opponent's weaker hands fold", many: "many of the opponent's weaker hands fold", some: "only some of the opponent's weaker hands fold", few: "hardly any hands fold" }[level]
    : { most: "相手の弱い手の大半は降ります", many: "相手の弱い手の多くは降ります", some: "降りる手は一部だけです", few: "ほとんど降りません" }[level];
}
function calledPhrase(level: CalledLevel | null, english: boolean): string {
  if (!level) return "";
  return english
    ? { better: "the hands that keep calling are mostly better than yours", similar: "the hands that keep calling are about as strong as yours", weaker: "the hands that keep calling are mostly weaker than yours" }[level]
    : { better: "残ってコールするのは主に自分より強い手です", similar: "残ってコールするのは自分と同じくらいの強さの手です", weaker: "残ってコールするのは主に自分より弱い手です" }[level];
}

function roleSentence(role: string, tier: string, english: boolean, gl: Glossary, again: boolean): string {
  if (english) {
    switch (role) {
      case "value": return again ? "Here too you are betting because you probably hold the better hand."
        : `This is a ${gl.term("value", "value bet", "you bet because you probably have the better hand and want worse hands to pay you")}.`;
      case "semi-bluff": return again ? "The same idea holds: winning now or improving later."
        : `This is a ${gl.term("semi-bluff", "semi-bluff", "a bet with a hand that is not best yet but can improve")}: you win at once if they fold, and a ${gl.term("draw", "draw", "a hand that needs one more card to become strong")} still gives you a chance if they call.`;
      case "bluff": return again ? "Again the bet works mainly by pushing better hands out."
        : `This is a ${gl.term("bluff", "bluff", "a bet with a weak hand, hoping the opponent folds")}: your hand is probably behind, so the bet works mainly by making better hands fold.`;
      case "protection": return again ? "The bet also protects a hand that could be overtaken."
        : `The bet is also ${gl.term("protection", "protection", "charging opponents who could catch up so they cannot see the next card cheaply")} for a medium-strength hand.`;
      default: return "";
    }
  }
  switch (role) {
    case "value": return again ? "ここでも、自分のほうが強い可能性が高いので賭けます。"
      : `これは${gl.term("value", "バリューベット", "自分が勝っていそうなので、弱い手からも賭け金を取る狙いのベット")}です。`;
    case "semi-bluff": return again ? "同じく、その場で勝つか、あとで手が良くなるかを狙います。"
      : `これは${gl.term("semi-bluff", "セミブラフ", "今は最強ではないが、これから強くなれる手での賭け")}です。相手が降りればすぐ勝て、コールされても${gl.term("draw", "ドロー", "あと1枚で強い手が完成する形")}なので逆転の可能性が残ります。`;
    case "bluff": return again ? "ここでも、相手のより強い手を降ろすことが狙いです。"
      : `これは${gl.term("bluff", "ブラフ", "弱い手で賭け、相手を降ろそうとすること")}です。自分の手は負けていそうなので、強い手を降ろして勝つのが狙いになります。`;
    case "protection": return again ? "このベットは、追いつかれそうな手を守る意味もあります。"
      : `このベットは${gl.term("protection", "プロテクション", "追いつかれそうな相手から、次のカードを安く見せない守りの賭け")}の意味もあり、中くらいの強さの手を守ります。`;
    default: return "";
  }
}

function checkText(input: BeginnerInput, played: string[], role: string, english: boolean, gl: Glossary): string {
  const tier = mainTier(input.tiers);
  const bets = played.filter(aggressive);
  if (english) {
    const base = tier === "monster" || tier === "strong"
      ? `Checking with a strong hand is a ${gl.term("trap", "trap", "hiding your strength so the opponent keeps betting or bluffing into you")}, and it also keeps your checks from being only weak hands.`
      : tier === "draw" ? "Checking lets you see the next card for free while your draw is still unfinished."
      : tier === "medium" ? "A medium hand is worth a showdown but does not like a big pot, so checking keeps it cheap."
      : "With a hand this weak, checking gives up the pot cheaply instead of bluffing every time.";
    return bets.length ? `${base} Because you also bet sometimes, opponents cannot tell your hand from the action alone.` : base;
  }
  const base = tier === "monster" || tier === "strong"
    ? `強い手であえてチェックするのは${gl.term("trap", "罠", "強さを隠して、相手に賭けさせたりブラフさせたりする作戦")}で、チェックが弱い手ばかりにならないようにする意味もあります。`
    : tier === "draw" ? "ドローがまだ完成していないので、チェックして次のカードを無料で見ます。"
    : tier === "medium" ? "中くらいの手は最後まで残る価値はありますが、大きなポットは苦手なので、チェックで安く済ませます。"
    : "ここまで弱い手では、毎回ブラフするよりも、チェックで安くあきらめるほうが無難です。";
  return bets.length ? `${base}ときどき賭けるので、行動だけでは相手に手の強さを読まれません。` : base;
}

function betText(action: string, input: BeginnerInput, role: string, again: boolean, first: boolean, gl: Glossary): string {
  const english = input.locale === "en";
  const a = input.explain?.actions?.[action];
  const f = foldLevel(a?.foldShare);
  const c = calledLevel(input.explain?.bet_table?.actions?.[action]?.calledEquity);
  const fold = foldPhrase(f, english), called = calledPhrase(c, english);
  const roleText = roleSentence(role, mainTier(input.tiers), english, gl, again);
  const size = SIZE[input.locale][action];
  const tex = first && ["wet", "flush", "straight", "monotone"].includes(input.texture ?? "") ? textureClause(input.texture, english) : undefined;
  let s: string;
  if (english) {
    const lead = ({
      bet33: `A small bet is cheap to call, so it keeps weaker hands in the pot${fold ? ` — ${fold}` : ""}${called ? `, and ${called}` : ""}.`,
      bet75: `Betting a solid, medium amount puts real pressure on the opponent${fold ? `: ${fold}` : ""}${called ? `, while ${called}` : ""}.`,
      bet125: `A big bet asks a hard question${fold ? `, and ${fold}` : ""}${called ? `, but ${called}` : ""}.`,
      allin: `Going all-in ends the hand's guessing${fold ? `: ${fold}` : ""}${called ? `, and ${called}` : ""}.`,
    } as Record<string, string>)[action] ?? `The ${size} is part of the plan.`;
    s = [lead, roleText, tex].filter(Boolean).join(" ");
  } else {
    const lead = ({
      bet33: `小さめのベットは相手にとってコールしやすく、弱い手を残します${fold ? `。${fold}` : ""}${called ? `し、${called}` : ""}。`,
      bet75: `中くらいの大きさで賭けると、相手にしっかり圧力がかかります${fold ? `。${fold}` : ""}${called ? `が、${called}` : ""}。`,
      bet125: `大きなベットは相手に難しい選択を迫ります${fold ? `。${fold}` : ""}${called ? `が、${called}` : ""}。`,
      allin: `オールインはここで勝負を決める賭けです${fold ? `。${fold}` : ""}${called ? `し、${called}` : ""}。`,
    } as Record<string, string>)[action] ?? `${size}も作戦の一部です。`;
    s = [lead, roleText, tex].filter(Boolean).join("");
  }
  return s;
}

function strength(input: BeginnerInput) {
  const d = input.explain?.defence;
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
  return { level, place, blocker, mix, capped: !!d.faced_action?.capped, above: gap >= 0 };
}

function facingText(action: string, input: BeginnerInput, role: string, gl: Glossary, zero: boolean): string {
  const mixed = (input.actionMix.call ?? 0) >= MATERIAL;
  const english = input.locale === "en";
  const st = strength(input);
  const opp = english ? "the opponent" : "相手";
  const place = st?.place, lv = st?.level;
  const blockerEn = st?.blocker === "value" ? ` Your cards also act as a ${gl.term("blocker", "blocker", "cards in your hand that make some of the opponent's hands less likely")}, removing some of their strong hands.`
    : st?.blocker === "bluff" ? ` Your cards remove some of the opponent's bluffs, which makes calling a little less attractive.` : "";
  const blockerJa = st?.blocker === "value" ? `また、手札が${gl.term("blocker", "ブロッカー", "相手の持ちうる手を減らす自分の手札")}となり、相手の強い手を減らしています。`
    : st?.blocker === "bluff" ? "手札が相手のブラフを減らしているため、コールの魅力は少し下がります。" : "";
  const mixEn = st?.mix === "strong" ? "the bet is mostly made with strong hands" : st?.mix === "bluffy" ? "the bet includes plenty of bluffs" : st?.mix === "mixed" ? "the bet mixes strong hands and bluffs" : "";
  const mixJa = st?.mix === "strong" ? "このベットは主に強い手で行われます" : st?.mix === "bluffy" ? "このベットにはブラフがかなり含まれます" : st?.mix === "mixed" ? "このベットは強い手とブラフが混ざっています" : "";
  if (english) {
    if (action === "call") {
      if (zero) return `Calling is not used here even though the hand is playable: it sits near the bottom of the hands you continue with, and the plan folds those instead.`;
      const head = lv === "comfortable" ? `Against what ${opp} bets with, this hand is strong enough to pay.`
        : lv === "borderline" ? `This hand is only just good enough against ${opp}'s bet, so calling is close.` : `Calling is a stretch because the hand is weak against ${opp}'s bet, but it is not used all the time.`;
      const pl = place === "top" ? " It is among the best hands you continue with." : place === "bottom" ? " It is near the bottom of what you continue with." : "";
      return `${head}${mixEn ? ` Remember that ${mixEn}.` : ""}${pl}${blockerEn}`;
    }
    if (action === "fold") {
      const head = lv === "short" ? `This hand is too weak against what ${opp} bets with, so folding saves chips.`
        : mixed ? `Even though the hand is decent against ${opp}'s bet, it is not far above the line, so folding keeps a place in the mix.`
        : `The hand is not clearly strong enough against ${opp}'s bet, so folding is a safe choice.`;
      return `${head}${place === "bottom" ? " It is also near the bottom of the hands you could continue with." : ""}${mixEn ? ` Also note that ${mixEn}.` : ""}`;
    }
    if (action === "raise") {
      return lv === "comfortable"
        ? `Raising makes ${opp}'s weaker hands pay more, because this hand is well ahead of what they bet with.${blockerEn}`
        : `Raising turns a hand that is not safe to call into a try to win right away, since ${opp} may fold hands that can beat you.`;
    }
  } else {
    if (action === "call") {
      if (zero) return "この手は続行できる強さがありますが、続行する手の中では下のほうなので、コールではなくフォールドを選ぶ方針です。";
      const head = lv === "comfortable" ? `${opp}のベットの内容に対して、この手は払うだけの強さがあります。`
        : lv === "borderline" ? `${opp}のベットに対して、この手はぎりぎり足りる程度で、コールは際どい判断です。` : `${opp}のベットに対して手が弱く、コールは苦しい選択なので、毎回は使いません。`;
      const pl = place === "top" ? "続行する手の中でも上位の強さです。" : place === "bottom" ? "続行する手の中では下のほうです。" : "";
      return `${head}${mixJa ? `${mixJa}。` : ""}${pl}${blockerJa}`;
    }
    if (action === "fold") {
      const head = lv === "short" ? `${opp}のベットの内容に対して手が弱すぎるので、降りてチップを守ります。`
        : mixed ? `${opp}のベットに対して悪くない手ですが、余裕があるほどではないため、フォールドも一部に残します。`
        : `${opp}のベットに対して十分強いとは言い切れないので、降りるのが安全です。`;
      return `${head}${place === "bottom" ? "続行できる手の中でも下のほうです。" : ""}${mixJa ? `なお、${mixJa}。` : ""}`;
    }
    if (action === "raise") {
      return lv === "comfortable"
        ? `この手は${opp}のベットの内容よりかなり強いので、レイズして弱い手からも多く払わせます。${blockerJa}`
        : `コールするには不安な手ですが、レイズすれば${opp}が自分に勝てる手を降ろす可能性があり、その場で勝つチャンスを作れます。`;
    }
  }
  return "";
}

function headline(input: BeginnerInput, played: [string, number][], role: string, facing: boolean): string {
  const english = input.locale === "en";
  const main = played[0]?.[0] ?? "check";
  const second = played[1]?.[0];
  if (english) {
    if (facing) return ({
      call: "Mostly call: this hand is worth paying to see what happens next.",
      fold: "Mostly fold: the hand is not strong enough to keep paying.",
      raise: "Mostly raise: put the pressure back on the opponent.",
    } as Record<string, string>)[main] ?? "Choose between continuing and giving up.";
    if (main === "check") return second
      ? "Mostly check, with a sometimes-bet mixed in so the opponent cannot read your hand."
      : "Check: keep the pot small and see what happens.";
    const tail = role === "value" ? "get paid by weaker hands" : role === "semi-bluff" ? "win now or improve later" : role === "bluff" ? "make better hands fold" : role === "protection" ? "protect a hand that could be overtaken" : "keep control of the pot";
    return ({
      bet33: `Mostly bet small: ${tail}, while keeping the pot manageable.`,
      bet75: `Mostly bet a medium amount: ${tail}.`,
      bet125: `Mostly bet big: ${tail}, and make the opponent face a hard decision.`,
      allin: `Mostly go all-in: ${tail}, and settle the hand now.`,
    } as Record<string, string>)[main] ?? "Follow the mix of actions below.";
  }
  if (facing) return ({
    call: "基本はコール：この手は払って先を見る価値があります。",
    fold: "基本はフォールド：払い続けるだけの強さがありません。",
    raise: "基本はレイズ：相手にプレッシャーを返します。",
  } as Record<string, string>)[main] ?? "続けるか、あきらめるかを選びます。";
  if (main === "check") return second
    ? "基本はチェックですが、ときどきベットも混ぜて、相手に手を読まれないようにします。"
    : "チェック：ポットを小さく保って様子を見ます。";
  const tail = role === "value" ? "弱い手からもチップを取ります" : role === "semi-bluff" ? "今勝つか、あとで逆転します" : role === "bluff" ? "強い手を降ろします" : role === "protection" ? "追いつかれそうな手を守ります" : "ポットを管理します";
  return ({
    bet33: `基本は小さくベット：${tail}。ポットも大きくなりすぎません。`,
    bet75: `基本は中くらいのベット：${tail}。`,
    bet125: `基本は大きくベット：${tail}。相手に難しい判断をさせます。`,
    allin: `基本はオールイン：${tail}。ここで勝負を決めます。`,
  } as Record<string, string>)[main] ?? "下の行動の組み合わせで進めます。";
}

export function buildBeginnerExplanation(input: BeginnerInput): BeginnerExplanation {
  const english = input.locale === "en";
  const facing = !!input.explain?.defence || Object.keys(input.actionMix).some(a => a === "fold" || a === "call");
  const entries = Object.entries(input.actionMix).filter(([, f]) => finite(f) && f! > 0)
    .sort((a, b) => b[1]! - a[1]!) as [string, number][];
  const material = entries.filter(([, f]) => f >= MATERIAL);
  const played = material.length ? material : entries.slice(0, 1);
  const equity = finite(input.explain?.betting?.equity_vs_defender) ? input.explain.betting.equity_vs_defender : (finite(input.explain?.equity) ? input.explain.equity : 0);
  const mainAggressive = played.find(([a]) => aggressive(a))?.[0] ?? played[0]?.[0] ?? "check";
  const role = handRole(equity, input.tiers, mainAggressive);
  const gl = new Glossary(english);
  const ordered = [...played].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
  const names = played.map(([a]) => a);
  const blocks: BeginnerBlock[] = [];
  let betSeen = 0;
  for (const [action, frequency] of ordered) {
    let text: string;
    if (action === "check") text = checkText(input, names, role, english, gl);
    else if (facing) text = facingText(action, input, role, gl, false);
    else text = betText(action, input, role, betSeen > 0, betSeen === 0, gl);
    if (!facing && (action.startsWith("bet") || action === "allin")) betSeen++;
    blocks.push({ action, label: LABELS[input.locale][action] ?? action, frequency, text });
  }
  // Mixed sizes: say why in plain words without repeating the per-action sentences.
  const sizes = blocks.filter(b => b.action.startsWith("bet") || b.action === "allin");
  if (!facing && sizes.length > 1) {
    const last = sizes[sizes.length - 1];
    last.text += english
      ? " Mixing sizes keeps the opponent guessing: smaller bets keep more weaker hands in the pot, while larger ones win more folds."
      : "サイズを混ぜるのは読まれないためです。小さい賭けは弱い手を多く残し、大きい賭けはより多く降ろします。";
  }
  // One clear candidate that is not used.
  const d = input.explain?.defence;
  if (facing && d && (input.actionMix.call ?? 0) === 0 && (input.actionMix.fold ?? 0) >= 0.95 && finite(d.realized_equity) && finite(d.required_equity) && d.realized_equity >= d.required_equity) {
    blocks.push({ action: "call", label: LABELS[input.locale].call, frequency: 0, text: facingText("call", input, role, gl, true) });
  } else if (!facing && !names.some(aggressive) && mainTier(input.tiers) === "monster" && (input.tiers?.monster ?? 0) >= 0.8 && Object.keys(input.actionMix).some(aggressive)) {
    blocks.push({ action: "bet75", label: LABELS[input.locale].bet75, frequency: 0, text: english
      ? "A bet is not used with this very strong hand: checking lets weaker hands stay in and keep putting chips in later."
      : "とても強い手ですが、ここでは賭けません。チェックして弱い手を残し、あとで多くのチップを入れてもらいます。" });
  }
  const texture = textureClause(input.texture, english);
  return { headline: headline(input, played, role, facing), blocks, ...(texture ? { texture } : {}) };
}

export function renderBeginnerPlainText(e: BeginnerExplanation): string {
  return [e.headline, ...e.blocks.map(b => `${b.label}: ${b.text}`), ...(e.texture ? [e.texture] : [])].join("\n");
}
