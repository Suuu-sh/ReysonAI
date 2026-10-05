import { parentPort, workerData } from "node:worker_threads";
import { boards, config, loadInputs } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "./generate.mjs";
import { validatePolicy } from "./policy.ts";
import { validateLaterPolicy } from "./later-policy.ts";
import { laterHandEvForBoard } from "./later-hand-ev.mjs";

try {
  const inputs = loadInputs(workerData.spotId);
  const candidate = loadCandidate(inputs);
  const laterCandidate = loadLaterCandidate(inputs, candidate);
  if (!laterCandidate) throw new Error("ターン・リバーのAI方針がありません。");
  const flopPolicy = validatePolicy(candidate.policy, inputs.spot.tree);
  const laterPolicy = validateLaterPolicy(laterCandidate.policy);
  const allBoards = boards();
  for (const boardId of workerData.boardIds) {
    const board = allBoards.find(item => item.id === boardId);
    if (!board) throw new Error(`Unknown representative board: ${boardId}`);
    const entries = laterHandEvForBoard(board, inputs, flopPolicy, laterPolicy, workerData.samples);
    parentPort.postMessage({ boardId, boards: entries });
  }
} catch (error) {
  parentPort.postMessage({ error: error.message });
  process.exitCode = 1;
}
