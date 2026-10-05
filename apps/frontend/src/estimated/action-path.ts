import type { RangeUrlSelection, ActionBlock } from "./range-url.ts";
import type { FrequencyRow } from "./preflop-types.ts";
import { positions } from "./ranges.ts";

export function nextActorsAfterRaise(aggressor: string, activeSeats: readonly string[]) {
  const aggressorIndex = positions.indexOf(aggressor);
  if (aggressorIndex < 0) return [];

  const active = new Set(activeSeats.filter(position => positions.includes(position) && position !== aggressor));
  const order = [...positions.slice(aggressorIndex + 1), ...positions.slice(0, aggressorIndex)];
  return order.filter(position => active.has(position));
}

// Selecting a later seat is a shortcut: any unselected seats before it have folded.
export function responseActionTransition({ opener, callers = [], position, action }: { opener: string; callers?: string[]; position: string; action: string }): Pick<RangeUrlSelection, "rangeType" | "hero" | "callers" | "foldedHero" | "pendingRaise"> | null {
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

export function limpActionTransition({ rangeType, opener, hero, limpAction = null, limpResponseAction = null, limpReraiseAction = null, position, action }: Pick<RangeUrlSelection, "rangeType" | "opener" | "hero"> & Partial<Pick<RangeUrlSelection, "limpAction" | "limpResponseAction" | "limpReraiseAction">> & { position: string; action: string }): (Partial<RangeUrlSelection> & Pick<RangeUrlSelection, "rangeType" | "opener" | "hero" | "limpAction" | "limpResponseAction">) | null {
  if (rangeType === "open" && opener === "SB" && position === "SB" && action === "call") {
    return { rangeType: "limp", opener: "SB", hero: "BB", limpAction: null, limpResponseAction: null };
  }

  if (rangeType !== "limp" || opener !== "SB") return null;
  // SB facing BB's 4bet after the limp-reraise (saved SB_vs_BB_limp_four_bet).
  if (position === "SB" && limpAction === "raise" && limpResponseAction === "raise" && limpReraiseAction === "raise" && ["fold", "call", "all_in"].includes(action)) {
    return { rangeType: "limp", opener: "SB", hero: "SB", limpAction, limpResponseAction, limpReraiseAction, limpFourBetAction: action };
  }
  // Checked first: BB facing SB's limp-reraise (saved BB_vs_SB_limp_reraise).
  if (position === "BB" && limpAction === "raise" && limpResponseAction === "raise" && ["fold", "call", "raise"].includes(action)) {
    return { rangeType: "limp", opener: "SB", hero: "BB", limpAction, limpResponseAction, limpReraiseAction: action };
  }
  if (position === "BB" && [null, "check", "raise"].includes(limpAction) && ["check", "raise"].includes(action)) {
    return { rangeType: "limp", opener: "SB", hero: action === "raise" ? "SB" : "BB", limpAction: action, limpResponseAction: null };
  }
  if (position === "SB" && limpAction === "raise" && ["fold", "call", "raise"].includes(action)) {
    return { rangeType: "limp", opener: "SB", hero: action === "raise" ? "BB" : "SB", limpAction, limpResponseAction: action };
  }
  return null;
}

// Clicking a seat in the action path returns the selector to that decision,
// removing choices made at that seat and later in the hand.
export function rewindActionBlockTransition({ rangeType, opener, hero, callers = [], squeezeResponse = [], block }: Pick<RangeUrlSelection, "rangeType" | "opener" | "hero"> & Partial<RangeUrlSelection> & { block?: ActionBlock | null }): (Partial<RangeUrlSelection> & Pick<RangeUrlSelection, "rangeType" | "opener" | "hero" | "callers" | "foldedHero" | "pendingRaise" | "continuationAction" | "shoveResponse">) | null {
  if (!block) return null;

  if (block.stage === "limp-opening") {
    return { rangeType: "open", opener: "SB", hero: "BB", callers: [], foldedHero: false, pendingRaise: null, continuationAction: null, shoveResponse: null, limpAction: null, limpResponseAction: null };
  }
  if (block.stage === "limp-bb") {
    return { rangeType: "limp", opener: "SB", hero: "BB", callers: [], foldedHero: false, pendingRaise: null, continuationAction: null, shoveResponse: null, limpAction: null, limpResponseAction: null };
  }
  if (block.stage === "limp-sb-response") {
    return { rangeType: "limp", opener: "SB", hero: "SB", callers: [], foldedHero: false, pendingRaise: null, continuationAction: null, shoveResponse: null, limpAction: "raise", limpResponseAction: null };
  }
  if (block.stage === "limp-bb-reraise") {
    return { rangeType: "limp", opener: "SB", hero: "BB", callers: [], foldedHero: false, pendingRaise: null, continuationAction: null, shoveResponse: null, limpAction: "raise", limpResponseAction: "raise", limpReraiseAction: null };
  }
  if (block.stage === "limp-sb-four-bet") {
    return { rangeType: "limp", opener: "SB", hero: "SB", callers: [], foldedHero: false, pendingRaise: null, continuationAction: null, shoveResponse: null, limpAction: "raise", limpResponseAction: "raise", limpReraiseAction: "raise", limpFourBetAction: null };
  }
  // Responses to a saved squeeze: the opener's block clears both responses,
  // the caller's block keeps the opener's choice.
  if (block.kind === "squeeze-response") {
    return { rangeType: "response", opener, hero, callers, foldedHero: false, pendingRaise: "squeeze", continuationAction: null, shoveResponse: null, squeezeResponse: block.role === "caller" ? squeezeResponse.slice(0, 1) : [] };
  }

  if (block.kind === "cold") {
    return { rangeType: "three_bet", opener, hero, callers: [], foldedHero: false, pendingRaise: null,
      continuationAction: null, shoveResponse: null, coldAction: null, squeezeResponse: [], continuationActions: [] };
  }

  if (block.kind === "seat") {
    const positionIndex = positions.indexOf(block.position);
    const openerIndex = positions.indexOf(opener);
    if (positionIndex < 0 || openerIndex < 0) return null;

    if (positionIndex <= openerIndex) {
      return {
        rangeType: "open",
        opener: block.position,
        hero: positions[positionIndex + 1] ?? block.position,
        callers: [],
        foldedHero: false,
        pendingRaise: null,
        continuationAction: null,
        shoveResponse: null,
      };
    }

    // Keep only calls made before this position; the clicked decision itself
    // and every later choice are removed from the path.
    return {
      rangeType: "response",
      opener,
      hero: block.position,
      callers: callers.filter(caller => positions.indexOf(caller) < positionIndex),
      foldedHero: false,
      pendingRaise: null,
      continuationAction: null,
      shoveResponse: null,
    };
  }

  if (block.kind === "continuation" && block.position === opener) {
    return {
      rangeType: "three_bet",
      opener,
      hero,
      callers,
      foldedHero: false,
      pendingRaise: null,
      continuationAction: null,
      shoveResponse: null,
    };
  }

  if (block.kind === "continuation" && block.position === hero && rangeType === "four_bet") {
    return {
      rangeType: "four_bet",
      opener,
      hero,
      callers,
      foldedHero: false,
      pendingRaise: null,
      continuationAction: null,
      shoveResponse: null,
    };
  }

  if (block.kind === "shove-response" && rangeType === "four_bet") {
    return {
      rangeType: "four_bet",
      opener,
      hero,
      callers,
      foldedHero: false,
      pendingRaise: "all_in",
      continuationAction: null,
      shoveResponse: null,
    };
  }

  return null;
}

export function buildNextActionNode({ rangeType, opener, hero, callers = [], currentHand, foldedHero = false }: Pick<RangeUrlSelection, "rangeType" | "opener" | "hero"> & Partial<Pick<RangeUrlSelection, "callers" | "foldedHero">> & { currentHand?: FrequencyRow | null }) {
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
