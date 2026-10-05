import type { FiveBetDataset, FiveBetSpot } from "./preflop-types.ts";
import type { MatrixModel } from "../data.ts";
import { useEffect, useState } from "react";
import { loadDataset } from "./datasets.ts";
import { validateFiveBetDataset } from "./five-bet-dataset.ts";

export { validateFiveBetDataset };

// Loaded only when a 5bet all-in is selected; the dataset is not needed for any other path.
let pending: Promise<FiveBetDataset> | undefined;

export function loadFiveBetDataset() {
  pending ??= loadDataset("five-bet-responses").then(validateFiveBetDataset).catch(error => { pending = undefined; throw error; });
  return pending;
}

export function useFiveBetSpot(opener: string, fiveBettor: string, enabled: boolean) {
  const [state, setState] = useState<{ key: string | null; spot: FiveBetSpot | null; error: Error | null }>({ key: null, spot: null, error: null });
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

export function fiveBetMatrixModel(spot: FiveBetSpot): MatrixModel {
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
