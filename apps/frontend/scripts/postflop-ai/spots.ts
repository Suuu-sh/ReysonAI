// Ordinary browser/script registry: scoped legacy geometry plus unchanged reviewed HU histories.
import { dataset } from "../../src/estimated/datasets.ts";
import type { Position, RangeFactor, SourceDataset } from "./types.ts";
import { DEFAULT_SPOT_ID, createPostflopSpots } from "./spots-core.ts";
import type { Spot as LegacySpot } from "./spots-core.ts";
import { MULTIWAY_POSTFLOP_SPOTS } from "./multiway-spots.ts";
import type { MultiwaySpot, PreflopHistoryStep } from "./multiway-spots.ts";
export { DEFAULT_SPOT_ID };
export { multiwaySpotFor, MULTIWAY_POSTFLOP_CATALOG } from "./multiway-spots.ts";
export type { MultiwaySpot, PreflopHistoryStep, SelectionEvent } from "./multiway-spots.ts";
export type Spot = (LegacySpot | MultiwaySpot) & { history?: PreflopHistoryStep[];
  contributionsBb?: Record<Position, number>; ranges?: Record<string, RangeFactor[]>; threeBettor?: Position; threeBetId?: string; threeBetBb?: number;
  fourBetId?: string; fourBetBb?: number; stage?: string; terminalId?: string };
const legacy = createPostflopSpots(Object.fromEntries(
  ["preflop-ranges", "three-bet-responses", "opening-ranges", "limp-responses"].map(name => [name, dataset<SourceDataset>(name)])));
type LegacyLookup = "spotFor" | "threeBetSpotFor" | "fourBetSpotFor" | "limpSpotFor";
type LegacyFacade = Omit<typeof legacy, LegacyLookup> & {
  [Name in LegacyLookup]: (...args: Parameters<(typeof legacy)[Name]>) => Spot | null;
};
export const { describeSpot, describeThreeBetSpot, describeFourBetSpot, describeLimpSpot,
  spotFor, threeBetSpotFor, fourBetSpotFor, limpSpotFor }: LegacyFacade = legacy;
export const POSTFLOP_SPOTS: readonly Spot[] = Object.freeze([...legacy.POSTFLOP_SPOTS, ...MULTIWAY_POSTFLOP_SPOTS]);
export function spotById(id: string = DEFAULT_SPOT_ID): Spot {
  const spot = POSTFLOP_SPOTS.find(item => item.id === id);
  if (!spot) throw new Error(`Unknown postflop spot: ${id}`);
  return spot;
}
