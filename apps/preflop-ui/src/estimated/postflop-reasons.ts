// Plain-language reasons for the AI-estimated flop policy. The policy picks a mix from
// (hand tier × board texture), so reasons are written per node, action and tier.
import { productLocale } from "../i18n.ts";
import { englishPostflopReasons } from "./english-reasons.ts";
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
    bet125: {
      monster: "ポットより大きく打つオーバーベットで、強い手の価値を最大にします。",
      strong: "トップペア程度では大きすぎるので、ほとんど使いません。",
      draw: "強いドローの一部は大きく打ち、相手に降りる圧力をかけます。",
      medium: "弱いペアでオーバーベットする理由はなく、使いません。",
      air: "強い手のオーバーベットと混ぜる少量のブラフです。",
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
  bb_vs_125: {
    fold: {
      monster: "降りません。",
      strong: "オーバーベットに対しては、弱いトップペアの一部を降ります。",
      draw: "必要勝率が高く（約36%）、完成の見込みが薄いドローは降ります。",
      medium: "大きなベットに対して弱いペアで続けるのは難しいため、多くは降ります。",
      air: "続ける理由がありません。",
    },
    call: {
      monster: "コールで相手のブラフを残し、後で取り返します。",
      strong: "強いトップペア以上は、大きなベットでもコールで守ります。",
      draw: "完成すれば大きく取り返せる強いドローは続けます。",
      medium: "ごく一部だけ、相手のブラフを捕まえに続けます。",
      air: "続けません。",
    },
    raise: {
      monster: "オールイン近くまで行けるので、レイズで価値を取り切ります。",
      strong: "レイズはほとんど使いません。",
      draw: "レイズはほとんど使いません。",
      medium: "使いません。",
      air: "使いません。",
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

export function dominantTier(tiers = {}) {
  return Object.entries(tiers).reduce((best, entry) => entry[1] > best[1] ? entry : best, ["air", -1])[0];
}

// Nodes of the tree where the OOP preflop raiser leads reuse the matching reasons; there a
// raise against a lead is a plain raise, not a check-raise.
const aliases = { oop_first: "btn_first", ip_vs_33: "bb_vs_33", ip_vs_75: "bb_vs_75", ip_vs_125: "bb_vs_125", oop_vs_raise: "btn_vs_raise" };

export function actionReason(node, action, tier) {
  if (productLocale() === "en") {
    const reason = englishPostflopReasons[aliases[node] ?? node]?.[action]?.[tier] ?? "This action is part of the saved AI-estimated policy.";
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
