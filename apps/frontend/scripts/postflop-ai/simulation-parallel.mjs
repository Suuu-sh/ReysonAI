import { hasPostflopDeal } from "./range-support.mjs";
import { computeBoardBatch } from "./board-batch.mjs";
import { config, boards } from "./inputs.mjs";
import { simulationReport } from "./simulation.mjs";

export async function simulateParallel(inputs, policy, samples = config.samples_per_board_profile_seat, laterCandidate = null, options = {}) {
  const boardList = (options.boardList ?? boards()).filter(board => !inputs.spot.history || hasPostflopDeal(inputs, board.cards));
  const results = await computeBoardBatch({ ...options, boardList, kind: "simulate", inputs, policy, laterCandidate, samples });
  return simulationReport(inputs, policy, samples, laterCandidate, Object.values(results).flat());
}
