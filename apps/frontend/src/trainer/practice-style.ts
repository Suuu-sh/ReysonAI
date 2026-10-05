import { STYLES, type StyleId } from "../agent/player-read.ts";

// Reuse the animals, not the Agent table's VPIP/PFR classifier or its baseline.
// These keys come from the exact-question, deduplicated practice analysis.
const ANIMALS: Record<string, StyleId> = {
  pending: "collecting", nit: "nit", tag: "tag", lag: "lag", calling: "station",
  tight: "tight_passive", aggressive: "aggressive", passive: "passive", balanced: "balanced",
};
export function practiceAnimal(analysis: { ready: boolean; style: { key: string } }) {
  return STYLES[analysis.ready ? ANIMALS[analysis.style.key] ?? "collecting" : "collecting"];
}

export const PRACTICE_EXPLANATIONS: Record<string, string> = {
  pending: "Practice both opens and responses across several spots to reveal a tendency.",
  nit: "You fold more often than the estimate for the same questions, without increasing 3bets.",
  tag: "You participate selectively and choose more 3bets in response to opens.",
  lag: "You participate more widely and choose more 3bets in response to opens.",
  calling: "You participate more widely and choose more calls in response to opens.",
  tight: "You fold more often than the estimate for the same questions.",
  aggressive: "You choose more 3bets in response to opens.",
  passive: "You choose fewer 3bets in response to opens.",
  balanced: "Your main action rates are close to the saved estimate for these practice questions.",
};
