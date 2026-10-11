// Presentation-only hand state for the table UI. Keep this outside hand.ts:
// the deterministic hand engine is also a reviewed source for preflop artifacts.
import { evaluate as evaluateHand } from "../../scripts/lib/equity.ts";
import { cardIds } from "../../scripts/postflop-ai/flop-isomorphism.ts";

const handCategory = (score: number) => Math.floor(score / 16 ** 5);

/** Evaluate only the currently visible board, never a future runout. */
export function currentHandCategory(holeCards: string[], boardCards: string[]): number | null {
  if (holeCards.length !== 2 || boardCards.length < 3 || boardCards.length > 5) return null;
  return handCategory(evaluateHand([...cardIds(holeCards.join(""), 2), ...cardIds(boardCards.join(""), boardCards.length)]));
}
