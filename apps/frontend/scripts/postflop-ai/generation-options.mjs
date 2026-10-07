// Shared CLI/batch/audit input selection. Keep the UI's last-aggressor/BB-limp
// default authoritative instead of duplicating poker-history inference here.
import { defaultOpponentSeat, opponentProfiles } from "../../src/estimated/postflop-profile-state.ts";
import { spotById } from "./spots.ts";

export function normalizeGenerationOptions({ profile = "standard", role, force = false, opponentSeat } = {}) {
  if (!opponentProfiles.includes(profile)) throw new Error(`Invalid opponent profile: ${profile}`);
  if (typeof force !== "boolean") throw new Error("force must be boolean");
  if (opponentSeat !== undefined && !["ip", "oop"].includes(opponentSeat)) throw new Error("opponentSeat must be ip or oop");
  if (profile === "standard") {
    if (opponentSeat !== undefined) throw new Error("An opponent seat requires a nonstandard profile");
    if (role !== undefined) throw new Error("A generation role requires a nonstandard profile");
    if (force) throw new Error("--force is only supported for local profile candidates");
  } else if (!["villain", "exploit"].includes(role)) throw new Error("Profile generation requires role villain or exploit");
  return { profile, role, force, ...(opponentSeat !== undefined ? { opponentSeat } : {}) };
}

export function generationInputOptions(spotId, profile = "standard", opponentSeat) {
  if (!opponentProfiles.includes(profile)) throw new Error(`Invalid opponent profile: ${profile}`);
  if (opponentSeat !== undefined && !["ip", "oop"].includes(opponentSeat)) throw new Error("opponentSeat must be ip or oop");
  if (profile === "standard" && opponentSeat !== undefined) throw new Error("An opponent seat requires a nonstandard profile");
  const spot = spotById(spotId); // The UI fallback must not hide an invalid authoring spot.
  return profile === "standard" ? {} : { opponentProfile: profile, opponentSeat: opponentSeat ?? defaultOpponentSeat({ spotId: spot.id }) };
}
