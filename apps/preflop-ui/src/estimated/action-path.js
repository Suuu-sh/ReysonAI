import { positions } from "./ranges.js";

export function nextActorsAfterRaise(aggressor, activeSeats) {
  const aggressorIndex = positions.indexOf(aggressor);
  if (aggressorIndex < 0) return [];

  const active = new Set(activeSeats.filter(position => positions.includes(position) && position !== aggressor));
  const order = [...positions.slice(aggressorIndex + 1), ...positions.slice(0, aggressorIndex)];
  return order.filter(position => active.has(position));
}

// Selecting a later seat is a shortcut: any unselected seats before it have folded.
export function responseActionTransition({ opener, callers = [], position, action }) {
  const positionIndex = positions.indexOf(position);
  const openerIndex = positions.indexOf(opener);
  if (positionIndex <= openerIndex || !["fold", "call", "raise"].includes(action)) return null;

  const earlierCallers = callers.filter(caller => positions.indexOf(caller) < positionIndex);
  if (action === "raise") {
    const isSqueeze = earlierCallers.length > 0;
    return {
      rangeType: isSqueeze ? "response" : "three_bet",
      hero: position,
      callers: earlierCallers,
      foldedHero: false,
      pendingRaise: isSqueeze ? "squeeze" : null,
    };
  }

  const nextCallers = action === "call" ? [...earlierCallers, position] : earlierCallers;
  const next = positions[positionIndex + 1];
  return {
    rangeType: "response",
    hero: next ?? position,
    callers: nextCallers,
    foldedHero: !next,
    pendingRaise: null,
  };
}

export function buildNextActionNode({ rangeType, opener, hero, callers = [], currentHand, foldedHero = false }) {
  if (foldedHero) return null;

  let aggressor;
  let activeSeats;
  let hasRaiseBranch;
  let branchLabel;
  let title;
  let actions;

  if (rangeType === "response") {
    if (hero !== "BB") return null;
    aggressor = hero;
    activeSeats = [opener, ...callers];
    hasRaiseBranch = callers.length > 0 || Number(currentHand?.three_bet) > 0;
    branchLabel = `${hero}が3betした場合`;
    title = "3bet後の応答";
    actions = ["Fold", "Call", "4bet"];
  } else if (rangeType === "three_bet") {
    aggressor = opener;
    activeSeats = [hero, ...callers];
    hasRaiseBranch = callers.length > 0 || Number(currentHand?.four_bet) > 0;
    branchLabel = `${opener}が4betした場合`;
    title = "4bet後の応答";
    actions = ["Fold", "Call", "All-in"];
  } else {
    return null;
  }

  if (!hasRaiseBranch) return null;

  const actors = nextActorsAfterRaise(aggressor, activeSeats);
  if (!actors.length) return null;

  const activeParticipants = new Set([opener, hero, ...callers]);
  return {
    branchLabel,
    title,
    actions,
    actors,
    multiway: activeParticipants.size > 2,
  };
}
