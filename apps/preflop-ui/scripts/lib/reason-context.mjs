import { createHash } from "node:crypto";
import { EQR, MULTIWAY_EQR, BB_BEHIND_EQR, CALLER_BEHIND_EQR, OPENER_BEHIND_EQR } from "../../src/estimated/eqr.js";
import { rakeConfig } from "../../src/estimated/rake.js";

// Facts must belong to the exact current strategy, not merely the same spot id.
export function reasonSourceFingerprint(load) {
  const sources = ["opening-ranges", "preflop-ranges", "three-bet-responses", "four-bet-responses", "five-bet-responses", "multiway-responses", "squeeze-responses", "limp-responses", "cold-three-bet-responses", "call-equities"];
  return createHash("sha256").update(JSON.stringify({ version: 1, EQR, MULTIWAY_EQR, BB_BEHIND_EQR, CALLER_BEHIND_EQR, OPENER_BEHIND_EQR, rakeConfig,
    data: sources.map(name => load(name)),
  })).digest("hex");
}
