// Preflop drill: question picking, grading and study notes built on the saved estimated ranges.
import openingSource from "../estimated/opening-ranges.json" with { type: "json" };
import responseSource from "../estimated/preflop-ranges.json" with { type: "json" };
import { hands } from "../data.js";

export const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

// Normalise both datasets into { id, kind, hero, opener, actions, byHand: Map(hand -> {action: 0..1}) }.
function openSpot(spot) {
  return {
    id: spot.id, kind: "open", hero: spot.hero, opener: null, openSize: spot.open_size_bb,
    actions: [{ key: "fold", label: "フォールド" }, { key: "open", label: `レイズ ${spot.open_size_bb}BB` }],
    byHand: new Map(spot.hands.map(row => [row.hand, { fold: row.fold / 100, open: row.open / 100 }])),
  };
}

function responseSpot(spot) {
  return {
    id: spot.id, kind: "response", hero: spot.hero, opener: spot.opener, openSize: spot.open_size_bb,
    actions: [{ key: "fold", label: "フォールド" }, { key: "call", label: `コール ${spot.open_size_bb}BB` },
      { key: "three_bet", label: `3bet ${spot.three_bet_size_bb}BB` }],
    byHand: new Map(spot.hands.map(row => [row.hand, { fold: row.fold / 100, call: row.call / 100, three_bet: row.three_bet / 100 }])),
  };
}

export const SPOTS = [...openingSource.spots.map(openSpot), ...responseSource.spots.map(responseSpot)];
export const spotById = new Map(SPOTS.map(spot => [spot.id, spot]));

export function spotTitle(spot) {
  return spot.kind === "open" ? `${spot.hero} オープン` : `${spot.hero} vs ${spot.opener} オープン`;
}

export function spotPrompt(spot) {
  if (spot.kind === "open") {
    const before = POSITIONS.slice(0, POSITIONS.indexOf(spot.hero));
    return before.length ? `${before.join("・")}がフォールド。あなたは${spot.hero}です。` : `あなたは最初に行動する${spot.hero}です。`;
  }
  return `${spot.opener}が2.5BBでオープン。あなたは${spot.hero}です。`;
}

// --- Hand categories (for study notes and weakness stats) ---
const RANK_ORDER = "23456789TJQKA";
export const CATEGORY_LABELS = {
  pair_high: "ハイペア（TT+）", pair_low: "ミドル・ローペア", suited_ace: "スーテッドA",
  suited_broadway: "スーテッド・ブロードウェイ", suited_connector: "スーテッドコネクター",
  suited_other: "その他のスーテッド", offsuit_broadway: "オフスート・ブロードウェイ",
  offsuit_ace: "オフスートA", offsuit_other: "その他のオフスート",
};

export function handCategory(hand) {
  const [a, b] = [RANK_ORDER.indexOf(hand[0]), RANK_ORDER.indexOf(hand[1])];
  if (hand.length === 2) return a >= RANK_ORDER.indexOf("T") ? "pair_high" : "pair_low";
  const suited = hand[2] === "s";
  const broadway = b >= RANK_ORDER.indexOf("T");
  if (suited) {
    if (hand[0] === "A") return broadway ? "suited_broadway" : "suited_ace";
    if (broadway) return "suited_broadway";
    return a - b <= 2 ? "suited_connector" : "suited_other";
  }
  if (broadway) return "offsuit_broadway";
  return hand[0] === "A" ? "offsuit_ace" : "offsuit_other";
}

// --- Question picking ---
const NEIGHBOR_STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const GRID = [..."AKQJT98765432"];

function primary(mix) {
  return Object.entries(mix).reduce((best, entry) => entry[1] > best[1] ? entry : best)[0];
}

// Borderline and mixed hands teach the most; obvious folds are rarely asked.
function handWeight(spot, hand) {
  const mix = spot.byHand.get(hand);
  if (!mix) return 0;
  const top = Math.max(...Object.values(mix));
  const main = primary(mix);
  const [row, col] = hand.length === 2 ? [GRID.indexOf(hand[0]), GRID.indexOf(hand[0])]
    : hand[2] === "s" ? [GRID.indexOf(hand[0]), GRID.indexOf(hand[1])] : [GRID.indexOf(hand[1]), GRID.indexOf(hand[0])];
  const edge = NEIGHBOR_STEPS.some(([dr, dc]) => {
    const r = row + dr, c = col + dc;
    if (r < 0 || c < 0 || r > 12 || c > 12) return false;
    const other = spot.byHand.get(hands[r * 13 + c]);
    return other && primary(other) !== main;
  });
  if (top < 0.95) return 4;
  if (edge) return 3;
  return main === "fold" ? 0.15 : 0.6;
}

export function filterSpots({ kind = "all", position = "all" } = {}) {
  return SPOTS.filter(spot => (kind === "all" || spot.kind === kind) && (position === "all" || spot.hero === position));
}

export function pickQuestion(spots, random = Math.random, review = [], reviewShare = 0.25) {
  const allowed = new Set(spots.map(spot => spot.id));
  const queued = review.filter(item => allowed.has(item.spotId));
  if (queued.length && random() < reviewShare) {
    const item = queued[Math.floor(random() * queued.length)];
    return { spot: spotById.get(item.spotId), hand: item.hand, review: true };
  }
  const pool = spots.flatMap(spot => hands.map(hand => ({ spot, hand, weight: handWeight(spot, hand) }))).filter(item => item.weight > 0);
  let target = random() * pool.reduce((sum, item) => sum + item.weight, 0);
  for (const item of pool) { target -= item.weight; if (target <= 0) return { spot: item.spot, hand: item.hand, review: false }; }
  const last = pool.at(-1);
  return { spot: last.spot, hand: last.hand, review: false };
}

// --- Grading ---
// best: the most frequent action (or within 5pt of it); mixed: played at least 20% of the time.
export function grade(spot, hand, action, { lenient = false } = {}) {
  const mix = spot.byHand.get(hand);
  const top = Math.max(...Object.values(mix));
  const frequency = mix[action] ?? 0;
  const result = frequency >= top - 0.05 ? "best" : frequency >= (lenient ? 0.15 : 0.2) ? "mixed" : "miss";
  return { result, frequency, best: primary(mix), mix, score: result === "best" ? 1 : result === "mixed" ? 0.5 : 0 };
}

export const RESULT_LABELS = { best: "正解", mixed: "混合で可", miss: "ミス" };

// --- Study notes ---
const ACTION_NOTES = {
  open: {
    pair_high: "強いペアは常にオープン。後ろに大きな手が少ないほど価値が上がります。",
    pair_low: "小さいペアはセットを狙う手。後ろに残る人数が多い前のポジションほど慎重になります。",
    suited_ace: "スーテッドAはナッツフラッシュとホイールの可能性があり、後ろのポジションほど広く開けます。",
    suited_broadway: "高いカード同士のスーテッドは、ペアでも勝ちやすくドローも作れます。",
    suited_connector: "つながったスーテッドはストレート・フラッシュを作りやすく、ポジションがあると扱いやすい手です。",
    suited_other: "形の悪いスーテッドは後ろのポジション限定の手です。",
    offsuit_broadway: "オフスートの高いカードは、キッカー負けしにくい上位だけを開けます。",
    offsuit_ace: "オフスートAはキッカーが弱いと負けやすく、後ろのポジションで一部だけ開けます。",
    offsuit_other: "オフスートの弱い手はBTN・SBでも限られます。",
  },
  fold: {
    pair_high: "", pair_low: "前のポジションでは、セットを作れない時に困るので降ります。",
    suited_ace: "前のポジションでは、Aの弱いキッカーが負けやすいので降ります。",
    suited_broadway: "", suited_connector: "後ろに人が多いと、スクイーズされて参加しにくくなります。",
    suited_other: "形が悪く、ペアになっても勝ちにくい手です。",
    offsuit_broadway: "オフスートはドローが弱く、ドミネートされやすい手は降ります。",
    offsuit_ace: "オフスートAはキッカー負けが多く、降りる方が損が少ない手です。",
    offsuit_other: "勝ちにくく、ポットに参加する価値が低い手です。",
  },
  call: {
    pair_high: "強いペアの一部をコールに混ぜて、コールレンジを弱く見せないようにします。",
    pair_low: "セットを狙って安く参加します。",
    suited_ace: "フラッシュとAのペアの両方があり、コールで続けやすい手です。",
    suited_broadway: "相手のオープンレンジに対して十分強く、コールで続けます。",
    suited_connector: "ポストフロップで伸びる手なので、コールで安く見に行きます。",
    suited_other: "BBはポットオッズが良いので広く守れます。",
    offsuit_broadway: "相手の上位に負けやすいので、主にコールで様子を見ます。",
    offsuit_ace: "BBなど安く参加できる時だけ守ります。",
    offsuit_other: "BBのポットオッズがある時だけ守ります。",
  },
  three_bet: {
    pair_high: "バリューの3bet。弱い手からコールをもらい、ポットを大きくします。",
    pair_low: "小さいペアの3betはまれです。",
    suited_ace: "Aを持っていると相手のAAやAKを減らせるので、ブラフの3betに向いています（ブロッカー）。",
    suited_broadway: "上位はバリューで、下位はブラフ寄りの3betに混ぜます。",
    suited_connector: "コールされても伸びる手なので、ブラフの3betに混ぜます。",
    suited_other: "ブラフの3betとしてごく一部に混ぜます。",
    offsuit_broadway: "AK・AQなどはバリュー、下位は相手を降ろす狙いの3betです。",
    offsuit_ace: "ブロッカーを持つので、SBやBBからのブラフ3betに一部使います。",
    offsuit_other: "",
  },
};

export function studyNote(action, hand) {
  return ACTION_NOTES[action]?.[handCategory(hand)] ?? "";
}

// Same hand across related spots: other positions for opens, other openers for responses.
export function compareAcross(spot, hand) {
  const related = spot.kind === "open"
    ? SPOTS.filter(item => item.kind === "open")
    : SPOTS.filter(item => item.kind === "response" && item.hero === spot.hero);
  return related.map(item => ({ spot: item, mix: item.byHand.get(hand), current: item.id === spot.id }));
}

export function aggregatesFor(spot) {
  return new Map(hands.map(hand => [hand, { hand, comboCount: hand.length === 2 ? 6 : hand.endsWith("s") ? 4 : 12, actions: spot.byHand.get(hand) ?? {} }]));
}

export function randomSuits(hand, random = Math.random) {
  const suits = ["s", "h", "d", "c"];
  const first = suits[Math.floor(random() * 4)];
  if (hand.length === 2) {
    const others = suits.filter(suit => suit !== first);
    return [hand[0] + first, hand[1] + others[Math.floor(random() * 3)]];
  }
  if (hand[2] === "s") return [hand[0] + first, hand[1] + first];
  const others = suits.filter(suit => suit !== first);
  return [hand[0] + first, hand[1] + others[Math.floor(random() * 3)]];
}
