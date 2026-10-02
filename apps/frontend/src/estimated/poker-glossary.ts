// Poker terms used in the postflop explanations, with short definitions. Explanation text is
// generated at runtime, so terms are found in it here and rendered as tappable chips.
type Entry = { ja: string[]; en: string[]; defJa: string; defEn: string };

const ENTRIES: Entry[] = [
  { ja: ["レンジアドバンテージ"], en: ["range advantage"], defJa: "レンジ全体として相手より強い手を多く持っている状態。小さく高頻度で打ちやすくなる。", defEn: "Your whole range holds more strong hands than the opponent's, which supports frequent, often small bets." },
  { ja: ["ナッツアドバンテージ"], en: ["nut advantage"], defJa: "最も強い手（ナッツ級）を相手より多く持っている状態。大きいベットやオーバーベットを支える。", defEn: "You hold more of the very strongest hands than the opponent, which supports large bets and overbets." },
  { ja: ["ポラライズ"], en: ["polarised", "polarized", "polarisation", "polarization"], defJa: "ベットするレンジが「とても強い手」と「ブラフ」に二極化し、中くらいの手が少ない構成。大きいサイズと相性が良い。", defEn: "A betting range made of very strong hands and bluffs with few medium hands; it pairs with large sizes." },
  { ja: ["マージ", "リニア"], en: ["merged", "linear"], defJa: "強い手から中くらいの手まで上から順に打つ構成。ブラフは少なく、小さいサイズと相性が良い。", defEn: "A range that bets from the top down, strong through medium hands with few bluffs; it pairs with small sizes." },
  { ja: ["キャップ"], en: ["capped"], defJa: "それまでのアクションから、最も強い手をほとんど含まないと読めるレンジ。強い圧力をかけやすい。", defEn: "A range that, given its earlier actions, rarely contains the strongest hands, so it is easier to pressure." },
  { ja: ["シンバリュー"], en: ["thin value"], defJa: "少しだけ勝っている相手の手から取りにいくバリュー。コールされると負けている場合もある。", defEn: "Value from hands only slightly worse than yours; you are sometimes behind when called." },
  { ja: ["プロテクション"], en: ["protection"], defJa: "追いつかれる可能性がある手で、相手に安くカードを見せないために打つこと。", defEn: "Betting so hands that could catch up do not see the next card cheaply." },
  { ja: ["エクイティデニアル"], en: ["equity denial", "denies equity", "deny equity"], defJa: "相手の手が持つ逆転の可能性（エクイティ）を、ベットで降ろして使わせないこと。", defEn: "Making hands with some chance to win fold, so they cannot realise that equity." },
  { ja: ["ブラフキャッチャー"], en: ["bluff-catcher", "bluff-catchers"], defJa: "相手のブラフにしか勝てないが、ブラフには勝てる中くらいの手。コールで相手のブラフを捕まえる役割。", defEn: "A medium hand that beats only bluffs; it calls to catch them." },
  { ja: ["アンブロッカー"], en: ["unblocker", "unblockers"], defJa: "相手のフォールドする手（ブラフや弱い手）を減らさないカード。ブラフする側にとって好ましい。", defEn: "Cards that do not remove the hands the opponent folds; good for bluffing." },
  { ja: ["ブロッカー"], en: ["blocker", "blockers"], defJa: "自分の手札があることで、相手が特定の手を持つ組み合わせが減る効果。", defEn: "Holding a card reduces the number of ways the opponent can have certain hands." },
  { ja: ["SPR"], en: ["SPR"], defJa: "残りスタック÷ポット。小さいほどオールインまでの距離が近く、手の強さそのものが重要になる。", defEn: "Stack-to-pot ratio: remaining stack divided by the pot. Lower means you are closer to all-in." },
  { ja: ["ジオメトリック"], en: ["geometric"], defJa: "残りのストリートで同じ割合ずつ打つと、ちょうどリバーでオールインになるサイズの組み立て。", defEn: "Sizing that grows the pot by the same fraction each street so the stacks go in by the river." },
  { ja: ["オーバーベット"], en: ["overbet", "overbets"], defJa: "ポットより大きいベット。ナッツアドバンテージがあり、ポラライズしたレンジで使う。", defEn: "A bet larger than the pot, used with a polarised range and a nut advantage." },
  { ja: ["ディレイドCベット"], en: ["delayed c-bet"], defJa: "前のストリートでチェックしたプリフロップのアグレッサーが、次のストリートで打つベット。", defEn: "A bet by the preflop aggressor on the next street after checking the previous one." },
  { ja: ["スロープレイ"], en: ["slowplay"], defJa: "強い手であえて弱く見せる（チェックやコールで済ませる）こと。チェックレンジを守る役割もある。", defEn: "Playing a strong hand passively to hide it; it also protects the checking range." },
  { ja: ["セミブラフ"], en: ["semi-bluff"], defJa: "今は負けていても、改善すれば勝てるドローでのベット。降りてもらっても、コールされても利益が見込める。", defEn: "A bet with a draw that is behind now but can improve; it profits from folds and from hitting." },
  { ja: ["バリューベット"], en: ["value bet"], defJa: "勝っている可能性が高い手で、弱い手からコールをもらうためのベット。", defEn: "A bet with a likely best hand, aiming to get called by worse hands." },
  { ja: ["バリューコール"], en: ["value call"], defJa: "相手のベットレンジのバリュー部分にも勝てることがある、十分強い手でのコール。", defEn: "A call with a hand strong enough to beat part of the bettor's value range too." },
  { ja: ["バリューレイズ"], en: ["raises for value"], defJa: "相手のベットより強い手で、より多くのチップを入れてもらうためのレイズ。", defEn: "Raising with a hand ahead of the bettor's range to get more chips in." },
  { ja: ["ブラフレイズ"], en: ["bluff-raise"], defJa: "コールでは採算が合わない手で、相手の強い手を降ろすためのレイズ。", defEn: "A raise with a hand too weak to call, aiming to fold out better hands." },
  { ja: ["チェックレンジ"], en: ["checking range"], defJa: "チェックを選ぶ手全体。弱い手ばかりだとキャップされ、相手に狙われる。", defEn: "All the hands that check; if it holds only weak hands it becomes capped and exploitable." },
  { ja: ["続行レンジ"], en: ["continuing range"], defJa: "相手のベットに対してフォールドせず、コールかレイズで続ける手全体。", defEn: "All the hands that continue (call or raise) against a bet." },
  { ja: ["チェックレイズ"], en: ["check-raise"], defJa: "一度チェックしてから、相手のベットにレイズで返すこと。", defEn: "Checking, then raising after the opponent bets." },
  { ja: ["ドンク"], en: ["donk"], defJa: "前のストリートでコールした側が、先に打つベット。", defEn: "A lead by the player who called the previous street." },
  { ja: ["フリーカード"], en: ["free card"], defJa: "誰もベットせずに次のカードを見られること。", defEn: "Seeing the next card without anyone betting." },
  { ja: ["フラット"], en: ["flatting"], defJa: "レイズせずにコールで受けること。", defEn: "Calling instead of raising." },
  { ja: ["バレル"], en: ["barrel"], defJa: "前のストリートに続けてベットすること。", defEn: "Betting again after betting the previous street." },
  { ja: ["実現エクイティ", "実現できるエクイティ"], en: ["realised equity", "realise"], defJa: "最後まで進んだときに実際に回収できる勝率。ポジションがない側や弱い手ほど低くなる。", defEn: "The share of your equity you actually collect by the end; lower out of position and for weak hands." },
  { ja: ["エクイティ"], en: ["equity"], defJa: "今の時点での勝つ見込み（相手のレンジ全体に対する勝率）。", defEn: "Your current chance to win against the opponent's whole range." },
  { ja: ["ランアウト"], en: ["runout"], defJa: "フロップのあとに落ちるターンとリバーのカード。", defEn: "The turn and river cards that come after the flop." },
  { ja: ["テクスチャ"], en: ["texture"], defJa: "ボードの性質（つながり、スート、ペアなど）。どちらのレンジに有利かを左右する。", defEn: "The board's makeup (connectedness, suits, pairs), which shapes whose range it favours." },
  { ja: ["ドロー"], en: ["draw"], defJa: "あと1枚で強い役（ストレートやフラッシュなど）が完成する形。", defEn: "A hand one card away from a strong holding such as a straight or flush." },
  { ja: ["ナッツ"], en: ["nuts"], defJa: "その時点で最も強い手。", defEn: "The best possible hand at that moment." },
];

const lists = (locale: "ja" | "en") => ENTRIES.flatMap(entry => (locale === "ja" ? entry.ja : entry.en).map(term => ({ term, entry })))
  .sort((a, b) => b.term.length - a.term.length);
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = new Map<string, { regex: RegExp; byTerm: Map<string, Entry> }>();

function patternFor(locale: "ja" | "en") {
  if (!patterns.has(locale)) {
    const items = lists(locale);
    const body = items.map(item => escape(item.term)).join("|");
    const regex = locale === "en" ? new RegExp(`\\b(${body})\\b`, "gi") : new RegExp(`(${body})`, "g");
    patterns.set(locale, { regex, byTerm: new Map(items.map(item => [item.term.toLowerCase(), item.entry])) });
  }
  return patterns.get(locale)!;
}

export type GlossaryPiece = { text: string; term?: string; definition?: string };

// Split text into plain pieces and glossary terms (longest match first).
export function glossaryPieces(text: string, locale: "ja" | "en"): GlossaryPiece[] {
  const { regex, byTerm } = patternFor(locale);
  const pieces: GlossaryPiece[] = [];
  let last = 0;
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > last) pieces.push({ text: text.slice(last, index) });
    const entry = byTerm.get(match[0].toLowerCase()) as Entry | undefined;
    pieces.push({ text: match[0], term: match[0], definition: entry ? (locale === "ja" ? entry.defJa : entry.defEn) : undefined });
    last = index + match[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last) });
  return pieces;
}
