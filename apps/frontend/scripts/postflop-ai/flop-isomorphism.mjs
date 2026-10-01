// Pure card/suit isomorphism. Card IDs are rank * 4 + cdhs suit; no Node dependencies.
export const ISOMORPHISM_VERSION = 1;
const RANKS = "23456789TJQKA", SUITS = "cdhs";
export const cardText = card => RANKS[card >> 2] + SUITS[card & 3];
export const suitPermutations = Object.freeze((function permutations(prefix = [], rest = [0, 1, 2, 3]) {
  return rest.length ? rest.flatMap(suit => permutations([...prefix, suit], rest.filter(value => value !== suit))) : [Object.freeze(prefix)];
})());

export function cardIds(value, count) {
  const cards = typeof value === "string" ? value.match(/../g)?.map(text => {
    if (!/^[2-9TJQKA][cdhs]$/.test(text)) throw new Error("Invalid card string");
    return RANKS.indexOf(text[0]) * 4 + SUITS.indexOf(text[1]);
  }) : value;
  if (!Array.isArray(cards) || cards.length !== count || typeof value === "string" && value.length !== count * 2 ||
      cards.some(card => !Number.isInteger(card) || card < 0 || card >= 52) || new Set(cards).size !== count) throw new Error("Invalid or duplicate cards");
  return [...cards];
}

export const mapCard = (card, permutation) => (card & ~3) + permutation[card & 3];
export const mapCards = (cards, permutation) => cards.map(card => mapCard(card, permutation));
export const invertSuits = permutation => {
  if (!Array.isArray(permutation) || permutation.length !== 4 || new Set(permutation).size !== 4 || permutation.some(suit => ![0, 1, 2, 3].includes(suit))) throw new Error("Invalid suit permutation");
  const inverse = [];
  permutation.forEach((suit, index) => { inverse[suit] = index; });
  return inverse;
};
// Highest rank first, lowest suit first within a pair. The minimal numeric tuple over S4
// is unique even on paired/trips boards. Permutation ties use the fixed S4 order.
const ordered = cards => [...cards].sort((a, b) => (b >> 2) - (a >> 2) || (a & 3) - (b & 3));
export function canonicalFlop(value) {
  const actual = cardIds(value, 3);
  let best = null, toCanonical = null;
  for (const permutation of suitPermutations) {
    const cards = ordered(mapCards(actual, permutation));
    if (!best || cards[0] < best[0] || cards[0] === best[0] && (cards[1] < best[1] || cards[1] === best[1] && cards[2] < best[2])) {
      best = cards; toCanonical = permutation;
    }
  }
  return { key: best.map(cardText).join(""), cards: best, toCanonical, fromCanonical: invertSuits(toCanonical) };
}

// Hole-card keys preserve high-rank-first anatomy and normalise pair ordering.
export function comboKey(value, permutation = [0, 1, 2, 3]) {
  return ordered(mapCards(cardIds(value, 2), permutation)).map(cardText).join("");
}
export function isCanonicalFlopKey(value) {
  try { return canonicalFlop(value).key === value; } catch { return false; }
}

let representatives;
export function canonicalFlops() {
  if (!representatives) {
    const keys = new Map();
    for (let a = 0; a < 50; a++) for (let b = a + 1; b < 51; b++) for (let c = b + 1; c < 52; c++) {
      const flop = canonicalFlop([a, b, c]);
      keys.set(flop.key, flop.cards);
    }
    representatives = [...keys].sort(([a], [b]) => a.localeCompare(b)).map(([key, cards]) => Object.freeze({ id: key, cards: Object.freeze(cards) }));
    if (representatives.length !== 1755) throw new Error(`Expected 1,755 flop classes, got ${representatives.length}`);
    Object.freeze(representatives);
  }
  return representatives;
}

export function remapFlopNode(view, permutation) {
  return { ...view, rows: view.rows.map(row => ({ ...row,
    combos: row.combos.map(combo => ({ ...combo, cards: comboKey(combo.cards, permutation) })) })) };
}
export const remapFlopNodes = (nodes, permutation) => Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, remapFlopNode(node, permutation)]));
