import { useEffect, useState } from "react";

import { expandContinuationReasons } from "./continuation-reason-format.ts";
import { hasDataset, loadDataset } from "./datasets.ts";

// Each spot's detailed reasons are a separate dataset, fetched only when a hand's details open.
const cache = new Map();

export function hasDetailedReasons(spotId) {
  return Boolean(spotId && hasDataset(`reasons/${spotId}`));
}

export function loadDetailedReasons(spotId) {
  if (!hasDetailedReasons(spotId)) return Promise.resolve(null);
  if (!cache.has(spotId)) cache.set(spotId, loadDataset(`reasons/${spotId}`).then(expandContinuationReasons).catch(error => { cache.delete(spotId); throw error; }));
  return cache.get(spotId);
}

export function useDetailedReasons(spotId) {
  const [state, setState] = useState({ spotId: null, data: null, error: null });
  useEffect(() => {
    if (!hasDetailedReasons(spotId)) return undefined;
    let cancelled = false;
    loadDetailedReasons(spotId)
      .then(data => { if (!cancelled) setState({ spotId, data, error: null }); })
      .catch(error => { if (!cancelled) setState({ spotId, data: null, error }); });
    return () => { cancelled = true; };
  }, [spotId]);
  const current = state.spotId === spotId ? state : { data: null, error: null };
  return { ...current, loading: hasDetailedReasons(spotId) && !current.data && !current.error };
}
