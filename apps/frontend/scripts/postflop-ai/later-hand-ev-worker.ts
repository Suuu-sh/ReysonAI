import { parentPort, workerData } from "node:worker_threads";
import { boards, config, loadInputs } from "./inputs.ts";
import { loadCandidate, loadLaterCandidate } from "./generate.ts";
import { validatePolicy } from "./policy.ts";
import { validateLaterPolicy } from "./later-policy.ts";
import { laterHandEvForBoard } from "./later-hand-ev.ts";

try {
  const inputs = loadInputs(workerData.spotId);
  const candidate = loadCandidate(inputs);
  const laterCandidate = loadLaterCandidate(inputs, candidate);
  if (!laterCandidate) throw new Error("ターン・リバーのAI方針がありません。");
  const flopPolicy = validatePolicy(candidate.policy, inputs.spot.tree);
  const laterPolicy = validateLaterPolicy(laterCandidate.policy);
  const allBoards = boards();
  for (const boardId of workerData.boardIds) {
    const board = allBoards.find((item: any) : any => item.id === boardId);
    if (!board) throw new Error(`Unknown representative board: ${boardId}`);
    const entries = laterHandEvForBoard(board, inputs, flopPolicy, laterPolicy, workerData.samples);
    (parentPort as any).postMessage({ boardId, boards: entries });
  }
} catch (error: any) {
  (parentPort as any).postMessage({ error: error.message });
  process.exitCode = 1;
}
