import { hands } from "../data.js";

export const positions = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

export const rangeTypes = [
  { value: "response", label: "オープンへの応答", available: true },
  { value: "open", label: "オープンレンジ", available: false },
  { value: "three_bet", label: "3bet後の応答", available: false },
  { value: "four_bet", label: "4bet後の応答", available: false },
];

export const stackOptions = [
  { value: 50, label: "50BB", available: false },
  { value: 100, label: "100BB", available: true },
  { value: 200, label: "200BB", available: false },
];

export const openSizeOptions = [
  { value: 2, label: "2BB", available: false },
  { value: 2.5, label: "2.5BB", available: true },
  { value: 3, label: "3BB", available: false },
];

export function validateDataset(data) {
  const expectedIds = positions.flatMap((opener, i) => positions.slice(i + 1).map(hero => `${hero}_vs_${opener}`));
  if (data?.metadata?.strategy_type !== "general_knowledge_estimate_not_gto" ||
      data?.metadata?.effective_stack_bb !== 100 || data?.metadata?.open_size_bb !== 2.5 ||
      data?.entry_count !== 2535 || !Array.isArray(data.spots) || data.spots.length !== 15 ||
      new Set(data.spots.map(spot => spot.id)).size !== 15 ||
      !expectedIds.every(id => data.spots.some(spot => spot.id === id))) {
    throw new Error("推定レンジの条件または局面数が一致しません。");
  }
  for (const spot of data.spots) {
    if (spot.id !== `${spot.hero}_vs_${spot.opener}` ||
        spot.open_size_bb !== 2.5 || spot.effective_stack_bb !== 100 ||
        !Array.isArray(spot.hands) || spot.hands.length !== 169 ||
        new Set(spot.hands.map(row => row.hand)).size !== 169) {
      throw new Error(`局面データが不正です: ${spot.id}`);
    }
    for (const row of spot.hands) {
      const frequencies = [row.fold, row.call, row.three_bet];
      if (!hands.includes(row.hand) || !frequencies.every(n => Number.isFinite(n) && n >= 0 && n <= 100) ||
          Math.abs(frequencies.reduce((a, b) => a + b, 0) - 100) > 1e-6 ||
          typeof row.reason !== "string" || !row.reason.trim() ||
          (row.three_bet === 0 ? row.three_bet_size_bb !== null :
            !Number.isFinite(row.three_bet_size_bb) || row.three_bet_size_bb < 4 || row.three_bet_size_bb > 100)) {
        throw new Error(`ハンドデータが不正です: ${spot.id} / ${row.hand}`);
      }
    }
  }
  return data;
}

export function availableHeroes(opener) {
  const index = positions.indexOf(opener);
  return index < 0 ? [] : positions.slice(index + 1);
}

export function hasSpot(data, opener, hero) {
  return Boolean(data?.spots?.some(spot => spot.opener === opener && spot.hero === hero));
}

export function availableOpeners(data) {
  return positions.filter(opener => data?.spots?.some(spot => spot.opener === opener));
}

export function findSpot(data, opener, hero) {
  const spot = data.spots.find(item => item.opener === opener && item.hero === hero);
  if (!spot) throw new Error("この組み合わせの対オープンレンジはありません。");
  return spot;
}

export function matrixModel(spot) {
  const actions = ["raise_ai", "call", "fold"];
  const aggregates = new Map(spot.hands.map(row => [row.hand, {
    hand: row.hand,
    comboCount: row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12,
    actions: { raise_ai: row.three_bet / 100, call: row.call / 100, fold: row.fold / 100 },
  }]));
  return { actions, aggregates };
}
