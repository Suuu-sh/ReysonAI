// Scheduling-only checkpoint. Never changes a sample count or acceptance rule.
import { existsSync } from 'node:fs';
export const STAGE3_PAUSE_CODE = 'STAGE3_CHECKPOINT_PAUSE';
export function stage3PauseCheckpoint({ pauseFile, checkpointLimit = null, computed = 0, equityCheckpoint = false }) {
  if (!(pauseFile && existsSync(pauseFile)) && !(equityCheckpoint && checkpointLimit !== null && computed >= checkpointLimit)) return;
  const error = new Error('Stage3 paused safely; caches retained and no completed artifacts emitted. Repair floors are reconstructed deterministically on resume.');
  error.code = STAGE3_PAUSE_CODE;
  throw error;
}
