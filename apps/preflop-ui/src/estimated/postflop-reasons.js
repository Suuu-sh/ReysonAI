// Plain-language reasons for the AI-estimated flop policy. The policy picks a mix from
// (hand tier × board texture), so reasons are written per node, action and tier.
import { productLocale } from "../i18n.js";
export const tierLabels = {
  monster: "2ペア以上の強い役", strong: "トップペア以上", draw: "ドロー",
  medium: "弱いペア", air: "役なし",
};

export const textureLabels = {
  dry: "ドライボード（つながりが少なく、手が変わりにくい）",
  wet: "ウェットボード（ストレート・フラッシュが近い）",
  monotone: "モノトーン（同じスート3枚）",
  paired: "ペアボード",
};

const reasons = {
  btn_first: {
    check: {
      monster: "強すぎる手は一部チェックして、相手にベットさせる余地を残します。",
      strong: "ポットを大きくしすぎず、チェックレンジにも強い手を混ぜて守ります。",
      draw: "無料でターンを見て、完成を待ちます。",
      medium: "ショーダウン価値があるので、無理に打たず勝負を安く済ませます。",
      air: "勝ち目が薄く、打っても降ろせる相手が少ない手はあきらめます。",
    },
    bet33: {
      monster: "小さく打って、相手の弱い手からもコールを集めます。",
      strong: "弱いペアやドローからコールをもらう薄いバリューベットです。",
      draw: "降りてもらえれば勝ち、コールされても完成の見込みがあるセミブラフです。",
      medium: "安く守りつつ、相手のより弱い手を降ろします。",
      air: "相手のレンジに役なしが多いときは、安いコストで降ろしに行きます。",
    },
    bet75: {
      monster: "大きく打ってポットを育て、最大の利益を狙います。",
      strong: "ドローに高い代金を払わせつつ、価値を取りに行きます。",
      draw: "強いドローは大きく打ち、降りる圧力と完成時の見返りを両立します。",
      medium: "大きく打つと強い手にしかコールされないため、ほとんど使いません。",
      air: "大きなブラフはリスクが高いため、少なめに抑えて混ぜます。",
    },
  },
  bb_vs_33: {
    fold: {
      monster: "ほぼ降りません。",
      strong: "ほぼ降りません。",
      draw: "見込みの薄いドローは、小さいベット相手でも一部降ります。",
      medium: "相手のベット頻度が高いボードでは、弱いペアの一部は降ります。",
      air: "勝ち目がほとんどなく、続ける理由がありません。",
    },
    call: {
      monster: "コールで相手のブラフを続けさせ、後のストリートで取り返します。",
      strong: "小さいベットに対しては、コールで十分な価値があります。",
      draw: "必要勝率が低い（約20%）ため、完成を狙って続けます。",
      medium: "ベットが小さく必要勝率が低いので、ショーダウンを目指します。",
      air: "オーバーカードなど、わずかな改善の見込みがある分だけ続けます。",
    },
    raise: {
      monster: "チェックレイズでポットを大きくし、価値を最大化します。",
      strong: "ドローに代金を払わせるため、一部チェックレイズします。",
      draw: "セミブラフのレイズで、相手を今降ろすチャンスを作ります。",
      medium: "レイズすると強い手にしか続けられないため、使いません。",
      air: "ブラフのレイズはごく一部に限ります。",
    },
  },
  bb_vs_75: {
    fold: {
      monster: "ほぼ降りません。",
      strong: "大きいベットには、キッカーの弱いトップペアの一部を降ろします。",
      draw: "必要勝率が上がる（約30%）ため、弱いドローは降ります。",
      medium: "大きいベットには、弱いペアではコールが割に合いません。",
      air: "勝ち目がほとんどなく、続ける理由がありません。",
    },
    call: {
      monster: "コールでポットを保ち、相手のブラフを続けさせます。",
      strong: "相手の強いバリューにも負けにくく、コールで続けます。",
      draw: "強いドローは完成時の見返りが大きく、続ける価値があります。",
      medium: "相手のブラフを捕まえられる分だけ、少し続けます。",
      air: "基本は降ります。バックドアのドローなど、わずかに改善の見込みがある手だけ少し続けます。",
    },
    raise: {
      monster: "すでに大きいポットをさらに大きくし、価値を最大化します。",
      strong: "一部をレイズして、ドローに代金を払わせます。",
      draw: "強いドローの一部はセミブラフでレイズします。",
      medium: "レイズには向きません。",
      air: "ブラフのレイズはごく一部に限ります。",
    },
  },
  btn_vs_raise: {
    fold: {
      monster: "降りません。",
      strong: "チェックレイズは強い手に偏るため、一部のトップペアは降ります。",
      draw: "レイズ額に見合わないドローは降ります。",
      medium: "レイズされた時点で、弱いペアはほぼ負けています。",
      air: "続ける理由がありません。",
    },
    call: {
      monster: "強い手はコールで続け、後のストリートで価値を取ります。",
      strong: "相手のセミブラフも多いため、コールで続けます。",
      draw: "完成時の見返りが大きいドローは続けます。",
      medium: "相手のブラフを捕まえられる分だけ、少し続けます。",
      air: "ほぼ続けません。",
    },
  },
};

// English counterpart of the same tier/action explanations. The opponent-range
// evidence above these notes still leads whenever numeric evidence is present.
const englishReasons = {
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

export function dominantTier(tiers = {}) {
  return Object.entries(tiers).reduce((best, entry) => entry[1] > best[1] ? entry : best, ["air", -1])[0];
}

// Nodes of the tree where the OOP preflop raiser leads reuse the matching reasons; there a
// raise against a lead is a plain raise, not a check-raise.
const aliases = { oop_first: "btn_first", ip_vs_33: "bb_vs_33", ip_vs_75: "bb_vs_75", oop_vs_raise: "btn_vs_raise" };

export function actionReason(node, action, tier) {
  if (productLocale() === "en") {
    const reason = englishReasons[aliases[node] ?? node]?.[action]?.[tier] ?? "This action is part of the saved AI-estimated policy.";
    return aliases[node] ? reason.replaceAll("check-raise", "raise") : reason;
  }
  if (aliases[node]) return (reasons[aliases[node]]?.[action]?.[tier] ?? "").replaceAll("チェックレイズ", "レイズ");
  return reasons[node]?.[action]?.[tier] ?? "";
}

// Data-driven reason for one combo, built from the opponent-range explanation
// (`/local-postflop-explain`), so the headline never contradicts the numbers.
export function evidenceReason(action, detail, equity) {
  if (!detail || !Number.isFinite(equity)) return null;
  const pct = value => `${Math.round(value * 100)}%`;
  const share = key => detail.groups?.find(group => group.key === key)?.share ?? 0;
  if (productLocale() === "en") {
    if (detail.required != null) {
      const relation = equity >= detail.required ? "above" : "below";
      return `Equity against the modeled opponent range is ${pct(equity)}, ${relation} the ${pct(detail.required)} required to call. The saved policy's ${action} frequency is shown above.`;
    }
    if (detail.foldShare != null) return `The model expects the opponent to fold ${pct(detail.foldShare)} of the time; ${pct(share("value"))} of their range calls with hands this combo beats, and ${pct(share("foldBetter"))} of stronger hands fold.`;
    return `Equity against the modeled opponent range is ${pct(equity)}; this combo is ahead of ${pct(share("ahead"))} of that range.`;
  }
  if (detail.required != null) {
    const enough = equity >= detail.required;
    if (action === "call") return enough
      ? `勝率${pct(equity)}が必要勝率${pct(detail.required)}を上回るので、続ける価値があります。`
      : `勝率${pct(equity)}は必要勝率${pct(detail.required)}に届かず、コールは割に合いにくい選択です。`;
    if (action === "fold") return enough
      ? `勝率${pct(equity)}は必要勝率${pct(detail.required)}を上回りますが、方針では一部を降ろしてレンジを整えます。`
      : `勝率${pct(equity)}が必要勝率${pct(detail.required)}に届かないため、降りるのが基本です。`;
  }
  if (detail.foldShare != null) {
    const value = share("value"), foldBetter = share("foldBetter");
    if (value >= foldBetter && value >= 0.15) return `主にバリュー：こちらが有利な手の${pct(value)}がコールしてきます（相手が降りる${pct(detail.foldShare)}）。`;
    if (foldBetter >= 0.1) return `主に降ろし：こちらより強い手の${pct(foldBetter)}を降ろせます（相手が降りる${pct(detail.foldShare)}）。`;
    return `有利な手からのコール${pct(value)}・強い手の降り${pct(foldBetter)}とも少なく、効果は限定的です。`;
  }
  return `相手レンジへの勝率${pct(equity)}（有利な相手${pct(share("ahead"))}）。`;
}
