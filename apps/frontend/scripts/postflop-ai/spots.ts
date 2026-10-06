// Legacy browser/script interface. Server replay imports the scoped core directly.
import { dataset } from "../../src/estimated/datasets.ts";
import multiwayCatalog from "../data/hu-after-multiway-spots.json" with { type: "json" };
import type { MultiwayCatalog, SourceDataset } from "./types.ts";
import { createPostflopSpots } from "./spots-core.ts";
export { DEFAULT_SPOT_ID, type Spot } from "./spots-core.ts";
export const MULTIWAY_POSTFLOP_CATALOG = multiwayCatalog as unknown as MultiwayCatalog;
export const { multiwaySpotFor, POSTFLOP_SPOTS, describeSpot, describeThreeBetSpot, describeFourBetSpot, describeLimpSpot,
  spotById, spotFor, threeBetSpotFor, fourBetSpotFor, limpSpotFor } = createPostflopSpots({ ...Object.fromEntries(
    ["preflop-ranges", "three-bet-responses", "opening-ranges", "limp-responses"].map(name => [name, dataset<SourceDataset>(name)])), "hu-after-multiway-spots": MULTIWAY_POSTFLOP_CATALOG });
