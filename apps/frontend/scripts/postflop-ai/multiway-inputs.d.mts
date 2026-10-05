import type { MultiwaySpot } from './spots.ts';
import type { FrequencyRow, SourceDataset, SourceSpot } from './types.ts';
export function multiwayInputData(spot: MultiwaySpot, read: (file: string) => SourceDataset | null | undefined): {
  sources: { dataset: string; spot: SourceSpot }[]; seatRows: Record<string, FrequencyRow[]>;
};
