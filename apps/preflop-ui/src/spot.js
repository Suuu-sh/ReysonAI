import { fourBetToSize, openSizeBb, threeBetToSize } from "./estimated/sizing.js";

export const positions = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
export const OPEN_SIZE_BB = openSizeBb;
export const STACK_OPTIONS = [20, 40, 50, 75, 100, 150, 200];

export function solutionStackBb(solution) {
  const stackBb = Number(solution?.stackBb);
  if (Number.isFinite(stackBb) && stackBb > 0) return stackBb;

  // Keep the UI compatible with v0.1 API deployments that predate the
  // explicit stackBb field in SolutionSummary.
  const match = String(solution?.solutionId ?? "").match(/-(\d+(?:\.\d+)?)bb(?:-v\d+)?$/i);
  return match ? Number(match[1]) : null;
}

export function solutionForStack(solutions, stackBb) {
  const requested = Number(stackBb);
  return solutions.find(solution => {
    const available = solutionStackBb(solution);
    return available !== null && Math.abs(available - requested) < 0.0001;
  });
}

export const spotModes = [
  { id: "open", label: "Open対応", description: "オープンに対応する" },
  { id: "three_bet", label: "3bet pot", description: "3bet後のオープン側" },
  { id: "four_bet", label: "4bet pot", description: "4bet後の3bet側" },
];

export const presets = [
  { mode: "open", opener: "BTN", actor: "BB" },
  { mode: "three_bet", opener: "BTN", actor: "BB" },
  { mode: "four_bet", opener: "BTN", actor: "BB" },
  { mode: "three_bet", opener: "CO", actor: "BTN" },
  { mode: "four_bet", opener: "CO", actor: "BTN" },
];

export function responders(opener) {
  const index = positions.indexOf(opener);
  return index < 0 ? [] : positions.slice(index + 1);
}

export function threeBetSize(opener, threeBettor) {
  return threeBetToSize(opener, threeBettor);
}

export function fourBetSize(opener, threeBettor) {
  return fourBetToSize(opener, threeBettor);
}

// Omitted seats fold, matching the read-only resolve API contract.
export function spotRequest(solutionId, spot) {
  const laterSeats = responders(spot.opener);
  if (!laterSeats.includes(spot.actor)) {
    throw new Error("オープン位置より後の位置を選択してください。");
  }
  const open = { position: spot.opener, action: "raise", sizeBb: OPEN_SIZE_BB };
  if (spot.mode === "open") {
    return { solutionId, heroPosition: spot.actor, actions: [open] };
  }
  const threeBet = { position: spot.actor, action: "raise", sizeBb: threeBetSize(spot.opener, spot.actor) };
  if (spot.mode === "three_bet") {
    return { solutionId, heroPosition: spot.opener, actions: [open, threeBet] };
  }
  if (spot.mode === "four_bet") {
    return {
      solutionId,
      heroPosition: spot.actor,
      actions: [open, threeBet, {
        position: spot.opener,
        action: "raise",
        sizeBb: fourBetSize(spot.opener, spot.actor),
      }],
    };
  }
  throw new Error("未対応の局面タイプです。");
}

export function spotTitle(spot) {
  const threeBet = threeBetSize(spot.opener, spot.actor);
  const fourBet = fourBetSize(spot.opener, spot.actor);
  if (spot.mode === "three_bet") return `${spot.opener} open → ${spot.actor} 3bet ${threeBet} BB`;
  if (spot.mode === "four_bet") return `${spot.opener} open → ${spot.actor} 3bet → ${spot.opener} 4bet ${fourBet} BB`;
  return `${spot.opener} vs ${spot.actor} · Open ${OPEN_SIZE_BB} BB`;
}
