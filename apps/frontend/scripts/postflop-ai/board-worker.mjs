import { parentPort, workerData } from "node:worker_threads";
import { handEvForBoard } from "./flop-hand-ev-core.mjs";
import { simulate } from "./simulation.mjs";
import { referenceLaterPolicy } from "./later-policy.mjs";
import { defenceFor } from "./defence.mjs";

const { kind, inputs, policy, laterCandidate, samples } = workerData;
const laterPolicy = laterCandidate?.policy ?? laterCandidate ?? referenceLaterPolicy();
parentPort.on("message", message => {
  if (message.done) { parentPort.close(); return; }
  try {
    const board = message.board;
    if (kind === "hand-ev") defenceFor(inputs, policy, laterPolicy).releaseBoardCaches();
    const result = kind === "hand-ev" ? handEvForBoard(board, inputs, policy, samples, laterPolicy)
      : kind === "simulate" ? simulate(inputs, policy, samples, laterCandidate, { boardList: [board] }).results
      : (() => { throw new Error(`Unknown board task: ${kind}`); })();
    parentPort.postMessage({ boardId: board.id, result });
  } catch (error) {
    parentPort.postMessage({ error: error.stack ?? error.message });
    parentPort.close();
    process.exitCode = 1;
  }
});
