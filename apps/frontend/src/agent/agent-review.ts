import { cardIds } from "../../scripts/postflop-ai/flop-isomorphism.ts";
import type { LogEntry } from "./hand.ts";
import { applyPreflop, handClass, preflopOptions, startPreflop, type DatasetLookup, type Position } from "./preflop.ts";

export type AgentReviewDecision = { logIndex: number; street: string; action: string; policy: Record<string, number>; source?: string };

// Reconstruct only preflop nodes from the exact saved action sequence and the human's dealt cards.
// The engine's own fallback/no-data rules remain explicit: they never become a fabricated policy.
export function exactPreflopReview(log: LogEntry[], holeCards: Record<string, string[]>, human: Position,
  supportsThreePlayer?: (spotId: string) => boolean, datasets?: DatasetLookup): AgentReviewDecision[] {
  const cards = holeCards[human];
  if (!cards || cards.length !== 2) return [];
  const hand = handClass(cardIds(cards.join(""), 2));
  const state = startPreflop(), decisions: AgentReviewDecision[] = [];
  for (let logIndex = 0; logIndex < log.length; logIndex++) {
    const entry = log[logIndex];
    if (entry.street !== "preflop") continue;
    if (entry.pos === human) {
      const offered = preflopOptions(state, human, hand, { allowThreePlayer: supportsThreePlayer, datasets });
      if (offered.tableRule !== "no_data") decisions.push({ logIndex, street: "preflop", action: entry.action,
        policy: Object.fromEntries(offered.choices.map(choice => [choice.action.key, choice.freq / 100])), ...(offered.source ? { source: offered.source } : {}) });
    }
    const type = entry.action === "fold" || entry.action === "check" ? entry.action
      : entry.action === "call" || entry.action === "limp" ? "call" : "raise";
    applyPreflop(state, entry.pos as Position, { type, key: entry.action, to: entry.to });
  }
  return decisions;
}
