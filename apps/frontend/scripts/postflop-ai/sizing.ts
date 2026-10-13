import type { InputOptions, Inputs } from "./types.ts";
import { normalizeProfile } from "../../src/estimated/table-profile.ts";
export const POSTFLOP_SIZINGS = ["multi", "single"] as const;
export type PostflopSizing = typeof POSTFLOP_SIZINGS[number];

export function normalizeSizing(value: unknown): PostflopSizing {
  if (value === undefined || value === null) return "multi";
  if (value === "multi" || value === "single") return value;
  throw new Error("Invalid postflop sizing");
}

export type SizedInputs = Inputs & { sizing: PostflopSizing };
export type SizedInputOptions = InputOptions & { sizing?: PostflopSizing };

// Sizing is a HU policy choice, outside the shared preflop source identity.
export function validateSizingOptions(options: SizedInputOptions = {}): PostflopSizing {
  const sizing = normalizeSizing(options.sizing);
  // Preserve the original shared validator's error precedence before the Single-only gate.
  normalizeProfile(options.tableProfile);
  const opponentProfile = options.opponentProfile ?? "standard";
  if (!["standard", "nit", "station", "lag", "maniac"].includes(opponentProfile)) {
    throw new Error(`Unknown opponent profile: ${opponentProfile}`);
  }
  if (sizing === "single" && opponentProfile !== "standard") {
    throw new Error("Single-size policies support the standard profile only");
  }
  return sizing;
}
