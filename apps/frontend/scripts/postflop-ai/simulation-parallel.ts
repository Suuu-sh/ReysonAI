import { hasPostflopDeal } from "./range-support.ts";
import { computeBoardBatch } from "./board-batch.ts";
import { config, boards } from "./inputs.ts";
import { simulationReport } from "./simulation.ts";

export async function simulateParallel(inputs?: any, policy?: any, samples: any = config.samples_per_board_profile_seat, laterCandidate: any = null, options: any = {}) : Promise<any> {
  const boardList = (options.boardList ?? boards()).filter((board: any) : any => !inputs.spot.history || hasPostflopDeal(inputs, board.cards));
  const results = await computeBoardBatch({ ...options, boardList, kind: "simulate", inputs, policy, laterCandidate, samples });
  return simulationReport(inputs, policy, samples, laterCandidate, Object.values<any>(results).flat());
}
