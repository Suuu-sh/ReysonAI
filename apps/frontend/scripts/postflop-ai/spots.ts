// Legacy browser/script interface. Server replay imports the scoped core directly.
import { dataset } from "../../src/estimated/datasets.ts";
import type { SourceDataset } from "./types.ts";
import { createPostflopSpots } from "./spots-core.ts";
export { DEFAULT_SPOT_ID, MULTIWAY_POSTFLOP_CATALOG, type Spot, type MultiwaySpot, type PreflopHistoryStep, type SelectionEvent } from "./spots-core.ts";
export const { POSTFLOP_SPOTS, describeSpot, describeThreeBetSpot, describeFourBetSpot, describeLimpSpot,
  spotById, spotFor, threeBetSpotFor, fourBetSpotFor, limpSpotFor, multiwaySpotFor } = createPostflopSpots(Object.fromEntries(
    ["preflop-ranges", "three-bet-responses", "opening-ranges", "limp-responses"].map(name => [name, dataset<SourceDataset>(name)])));
