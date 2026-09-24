import { useEffect, useState } from "react";
import { validateFiveBetDataset } from "./five-bet-dataset.js";

export { validateFiveBetDataset };

// Loaded only when a 5bet all-in is selected; the dataset is not needed for any other path.
const loaders = import.meta.glob("./five-bet-responses.json", { import: "default" });
let pending;

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
