import { cardIds } from "../../scripts/postflop-ai/flop-isomorphism.ts";
import type { LogEntry } from "./hand.ts";
import { createTable, playFlop, playLaterStreetsWithPolicy } from "../../scripts/postflop-ai/engine.ts";
import type { Spot } from "../../scripts/postflop-ai/spots.ts";
import { applyPreflop, alivePositions, handClass, preflopOptions, startPreflop, type DatasetLookup, type Position } from "./preflop.ts";
import { postflopSpotFor } from "./hand.ts";
import type { PostflopKit } from "./policy.ts";

export type AgentReviewDecision = { logIndex: number; street: string; action: string; policy: Record<string, number>; source?: string };

// Reconstruct only preflop nodes from the exact saved action sequence and the human's dealt cards.
// The engine's own fallback/no-data rules remain explicit: they never become a fabricated policy.
export function exactAgentReview(log: LogEntry[], holeCards: Record<string, string[]>, boardCards: string[], human: Position,
  supportsThreePlayer?: (spotId: string) => boolean, datasets?: DatasetLookup, getPostflopKit?: (spotId: string) => PostflopKit | null | undefined): AgentReviewDecision[] {
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
  if (alivePositions(state).length !== 2) return decisions;
  const spot = postflopSpotFor(state.events, datasets as ((name: string) => import("../../scripts/postflop-ai/types.ts").SourceDataset | import("../../scripts/postflop-ai/types.ts").MultiwayCatalog | undefined) | undefined) as Spot | null;
  const kit = spot && getPostflopKit?.(spot.id);
  const postflopLogIndex = log.findIndex(entry => entry.street !== "preflop");
  if (!spot || !kit || postflopLogIndex < 0 || boardCards.length < 3) return decisions;
  const board = cardIds(boardCards.join(""), boardCards.length), hole = cardIds(cards.join(""), 2), table = createTable(spot);
  let cursor = postflopLogIndex;
  const take = (street: string, seat: Position) => {
    while (cursor < log.length) {
      const logIndex = cursor++, entry = log[logIndex];
      if (entry.street === street && entry.pos === seat) return { entry, logIndex };
    }
    throw new Error(`Missing saved ${street} action for ${seat}`);
  };
  const save = (street: string, seat: Position, node: string, cardsAtDecision: number[], saved: ReturnType<typeof take>) => {
    if (seat !== human) return;
    const base = kit.defence.baseMix(table, cardsAtDecision, node, hole);
    const mix = kit.defence.mix(table, cardsAtDecision, node, hole, base);
    decisions.push({ logIndex: saved.logIndex, street, action: saved.entry.action,
      policy: Object.fromEntries(Object.entries(mix).map(([action, frequency]) => [action, frequency / 100])), source: `postflop:${spot.id}:${street}:${node}` });
  };
  try {
    playFlop(table, spot.tree, (seat, node) => {
      const saved = take("flop", seat); save("flop", seat, node, board.slice(0, 3), saved); return saved.entry.action;
    }, kit.inputs.config);
    playLaterStreetsWithPolicy(table, board.slice(0, 3), board.slice(3), (seat, node, streetBoard) => {
      const street = streetBoard.length === 4 ? "turn" : "river", saved = take(street, seat);
      save(street, seat, node, streetBoard, saved); return saved.entry.action;
    }, kit.inputs.config, table.lastAggressor);
  } catch {
    // If this exact saved action line cannot be replayed in the engine table, expose no guessed policy.
    return decisions.filter(decision => decision.street === "preflop");
  }
  return decisions;
}
