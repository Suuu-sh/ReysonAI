export type StreetCardDialog = "turn" | "river";

// Open only when a new street first becomes pending. Keeping the pending value as the
// previous value after a manual close prevents the effect from reopening that same dialog.
export function nextPendingStreetCardDialog(pending: StreetCardDialog | null, previous: StreetCardDialog | null) {
  return pending && pending !== previous ? pending : null;
}
