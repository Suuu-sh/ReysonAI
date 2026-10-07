import type { FrequencyRow, MultiwaySpot, SourceDataset, SourceSpot } from "./types.ts";
export function multiwayInputData(spot: MultiwaySpot, read: (name: string) => SourceDataset | null | undefined): {
  sources: { dataset: string; spot: SourceSpot }[];
  seatRows: Record<string, FrequencyRow[]>;
};
