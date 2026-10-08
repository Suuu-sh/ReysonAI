// Immutable reviewed HU-after-multiway descriptors; no eager dataset-registry reads.
import type { Position, RangeFactor, SourceAction } from "./types.ts";
import type { FlopTree } from "./tree.ts";
import multiwayCatalog from "../data/hu-after-multiway-spots.json" with { type: "json" };
export type PreflopHistoryStep = { seat: Position; action: SourceAction; to_size_bb: number | null };
export type MultiwaySpot = {
  id: string; kind: "sqp" | "ccp" | "c4bp"; opener: Position; caller: Position; aggressor: Position;
  ip: Position; oop: Position; tree: FlopTree; openingId: string; responseId: string; openBb: number;
  potBb: number; stackBb: number; slug: string; reachable: boolean; stage: string; terminalId: string;
  history: PreflopHistoryStep[]; contributionsBb: Record<Position, number>; ranges: Record<string, RangeFactor[]>;
  reach: { probability: number; samples: number; compatible_samples: number; method: string };
};
export const MULTIWAY_POSTFLOP_SPOTS = Object.freeze((multiwayCatalog.spots as unknown as MultiwaySpot[]).map(spot => Object.freeze(spot)));
export const multiwaySpotById = (id: string) => MULTIWAY_POSTFLOP_SPOTS.find(spot => spot.id === id) ?? null;
export type SelectionEvent = { seat?: string; pos?: string; action?: string; key?: string; to_size_bb?: number | null; to?: number | null };

// Match every voluntary action AND observed participant fold. Outside forced
// folds may be omitted by UI selectors, but never an involved player's fold.
export function multiwaySpotFor(events: readonly SelectionEvent[]) {
  const involved = new Set(events.filter(e => !["fold", "check"].includes((e.action ?? e.key)!)).map(e => e.seat ?? e.pos));
  const normalized = events.filter(e => involved.has(e.seat ?? e.pos)).map(e => ({
    seat: e.seat ?? e.pos, action: e.action ?? e.key, size: e.to_size_bb ?? e.to,
  }));
  return MULTIWAY_POSTFLOP_SPOTS.find(spot => spot.history && spot.history.length === normalized.length && spot.history.every((step, i) =>
    step.seat === normalized[i].seat && step.action === normalized[i].action &&
    (normalized[i].size === undefined || step.action === "fold" || step.to_size_bb === normalized[i].size))) ?? null;
}
export const MULTIWAY_POSTFLOP_CATALOG = multiwayCatalog;
