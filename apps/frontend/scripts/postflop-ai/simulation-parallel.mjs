import { computeBoardBatch } from "./board-batch.mjs";
import { config } from "./inputs.mjs";
import { simulationReport } from "./simulation.mjs";

export async function simulateParallel(inputs, policy, samples = config.samples_per_board_profile_seat, laterCandidate = null, options = {}) {
  const results = await computeBoardBatch({ ...options, kind: "simulate", inputs, policy, laterCandidate, samples });
  return simulationReport(inputs, policy, samples, laterCandidate, Object.values(results).flat());
}
