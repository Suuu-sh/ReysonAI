import type { InputOpponentProfile } from "../../scripts/postflop-ai/types.ts";
import type { PlayerRole } from "../../scripts/postflop-ai/tree.ts";
import { spotById } from "../../scripts/postflop-ai/spots.ts";

export type OpponentProfile = InputOpponentProfile;
export type OpponentSeat = PlayerRole;
export type PostflopProfileState = { opponentProfile: OpponentProfile; opponentSeat: OpponentSeat | null };
export const opponentProfiles = ["standard", "nit", "station", "lag", "maniac"] as const;

/** Invalid/missing restored values cannot select an unrecognized policy or seat. */
export function normalizePostflopProfileState(value: unknown): PostflopProfileState {
  const saved = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    opponentProfile: opponentProfiles.includes(saved.opponentProfile as OpponentProfile) ? saved.opponentProfile as OpponentProfile : "standard",
    opponentSeat: saved.opponentSeat === "ip" || saved.opponentSeat === "oop" ? saved.opponentSeat : null,
  };
}

/** Auto follows the last preflop aggressor, except every SB limp branch defaults to BB. */
export function defaultOpponentSeat(context?: { spotId?: string | null; ip?: string | null; oop?: string | null } | null): OpponentSeat {
  if (!context?.spotId) return "ip";
  try {
    const spot = spotById(context.spotId);
    const limped = spot.kind === "limp" || ((spot.kind === "sqp" || spot.kind === "ccp" || spot.kind === "c4bp") && spot.history.some(step => step.action === "limp"));
    const seat = limped ? "BB" : spot.aggressor;
    return seat === spot.oop ? "oop" : "ip";
  } catch {
    // Unsupported/read-only contexts never invent a third role or throw during render.
    return "ip";
  }
}
