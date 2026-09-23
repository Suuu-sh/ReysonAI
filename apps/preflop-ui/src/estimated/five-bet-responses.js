import { useEffect, useState } from "react";
import { hands } from "../data.js";

// Loaded only when a 5bet all-in is selected; the dataset is not needed for any other path.
const loaders = import.meta.glob("./five-bet-responses.json", { import: "default" });
let pending;

export function validateFiveBetDataset(data) {
  if (data?.metadata?.strategy_type !== "ai_estimate_not_gto" || !Array.isArray(data.spots)) throw new Error("5bet応答データの形式が不正です。");
  for (const spot of data.spots) {
    if (spot.all_in_size_bb !== 100 || spot.hero !== spot.opener || spot.hands?.length !== 169) throw new Error(`${spot.id}: 局面の前提が不正です。`);
    spot.hands.forEach((row, index) => {
      if (row.hand !== hands[index] || !Number.isInteger(row.fold) || !Number.isInteger(row.call) || row.fold + row.call !== 100) throw new Error(`${spot.id}/${row.hand}: 頻度が不正です。`);
    });
  }
  return data;
}

export function loadFiveBetDataset() {
  const loader = loaders["./five-bet-responses.json"];
  if (!loader) return Promise.reject(new Error("5bet応答データがありません。"));
  pending ??= loader().then(validateFiveBetDataset).catch(error => { pending = undefined; throw error; });
  return pending;
}

export function useFiveBetSpot(opener, fiveBettor, enabled) {
  const [state, setState] = useState({ key: null, spot: null, error: null });
  const key = enabled ? `${opener}>${fiveBettor}` : null;
  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    loadFiveBetDataset()
      .then(data => { if (!cancelled) setState({ key, spot: data.spots.find(s => s.opener === opener && s.five_bettor === fiveBettor) ?? null, error: null }); })
      .catch(error => { if (!cancelled) setState({ key, spot: null, error }); });
    return () => { cancelled = true; };
  }, [key]);
  if (!key) return { spot: null, error: null, loading: false };
  return state.key === key ? { ...state, loading: false } : { spot: null, error: null, loading: true };
}

export function fiveBetMatrixModel(spot) {
  return {
    actions: ["call", "fold"],
    actionLabels: { call: "コール（オールイン100BB）" },
    aggregates: new Map(spot.hands.map(row => [row.hand, {
      hand: row.hand, comboCount: row.hand.length === 2 ? 6 : row.hand.endsWith("s") ? 4 : 12,
      unreachable: row.equity_vs_shove_pct === null,
      actions: row.equity_vs_shove_pct === null ? {} : { call: row.call / 100, fold: row.fold / 100 },
    }])),
  };
}
