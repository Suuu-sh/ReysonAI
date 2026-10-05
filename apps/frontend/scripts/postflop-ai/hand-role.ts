import type { HandFeatures } from "./hand-features.ts";
export type RoleOptions = { action?: string; equity?: number | null; facingBet?: boolean };
// The role of a hand in its action (value, semi-bluff, protection, bluff, pot-control), decided from the hand's
// own features (hand-features.mjs) first and from equity only as a tie-break. Shared by postflop-explanation.ts
// (handRole) and the advanced copy so that every explanation names the same role for the same hand.
import { featuresFromText } from "./hand-features.ts";

const aggressive = (a: unknown) => typeof a === "string" && (a.startsWith("bet") || a === "allin" || a === "raise");
const BOARD_ONLY = new Set(["boardPair", "boardTwoPair", "boardTrips"]);

// "nuts" | "strong" | "medium" | "weak" | "none": how good the made hand is, from its standing against all holdings.
export function madeLevel(f: HandFeatures) {
  const m = f.made;
  if (m.category === "highCard" || BOARD_ONLY.has(m.kind) || m.usesHole === 0) return "none";
  return { nut: "nuts", nearNut: "nuts", strong: "strong", medium: "medium", weak: "weak" }[m.strength!] ?? "none";
}

// "combo" | "strong" | "weak" | "none". Strong draws are combo draws, nut flush draws, open-enders and 8+ outs.
export function drawLevel(f: HandFeatures) {
  const d = f.draws;
  if (!d.any) return "none";
  if (d.combo) return "combo";
  return d.strong ? "strong" : "weak";
}

// -> { role, sub }. `action` is the action being explained, `equity` the optional equity against the opponent.
export function roleFromFeatures(f: HandFeatures, { action, equity = null, facingBet = false }: RoleOptions = {}) {
  if (!aggressive(action)) return { role: "pot-control", sub: "check" };
  const m = madeLevel(f), d = drawLevel(f);
  if (m === "nuts" || m === "strong") return { role: "value", sub: f.made.vulnerable ? "protect" : m === "nuts" ? "nuts" : "plain" };
  if (d === "combo" || d === "strong") return { role: "semi-bluff", sub: m === "none" ? "strongDraw" : "strongDrawPair" };
  if (d === "weak") {
    if (m === "medium" && !(f.overcards.count === 0 && f.draws.straight === null)) return { role: "protection", sub: "thinWithDraw" };
    return { role: "semi-bluff", sub: f.overcards.count > 0 ? "gutshotOvercards" : "gutshot" };
  }
  if (m === "medium") return { role: equity !== null && facingBet && equity < 0.35 ? "bluff" : "protection", sub: "thin" };
  if (m === "weak") return { role: equity !== null && equity >= 0.45 ? "protection" : "bluff", sub: "weakPair" };
  if (f.street === "flop" && f.overcards.count === 2) return { role: "semi-bluff", sub: "overcards" };
  return { role: "bluff", sub: f.aceHighValue ? "aceHigh" : "air" };
}

// The same decision from card text (hole "As4s", board "6h5h2d"); null when the cards are unusable.
export function roleForCards(holeText: string, boardText: string, opts?: RoleOptions) {
  try { return roleFromFeatures(featuresFromText(holeText, boardText), opts); } catch { return null; }
}
