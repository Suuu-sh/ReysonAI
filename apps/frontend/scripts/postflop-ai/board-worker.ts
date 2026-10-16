import { parentPort, workerData } from "node:worker_threads";
import { handEvForBoard } from "./flop-hand-ev-core.ts";
import { simulate } from "./simulation.ts";
import { referenceLaterPolicy } from "./later-policy.ts";
import { defenceFor } from "./defence.ts";
import { buildFlopBase } from "./flop-base-core.ts";
import { releaseFlopUiFacts } from "./flop-ui-facts.ts";
import { writeFlopBaseFile } from "./flop-base-files.ts";

const { kind, inputs, policy, laterCandidate, samples, taskOptions = {} } = workerData;
const laterPolicy = laterCandidate?.policy ?? laterCandidate ?? referenceLaterPolicy();
(parentPort as any).on("message", (message: any) : any => {
  if (message.done) { (parentPort as any).close(); return; }
  try {
    const board = message.board;
    if (kind === "hand-ev" || kind === "flop-base") {
      defenceFor(inputs, policy, laterPolicy).releaseBoardCaches();
      defenceFor(inputs, policy, null).releaseBoardCaches();
      releaseFlopUiFacts(inputs, policy);
    }
    const started = performance.now();
    let result = kind === "hand-ev" ? handEvForBoard(board, inputs, policy, samples, laterPolicy, taskOptions)
      : kind === "simulate" ? simulate(inputs, policy, samples, laterCandidate, { boardList: [board] }).results
      : kind === "flop-base" ? buildFlopBase({ board: board.cards, inputs,
        candidate: taskOptions.candidate, laterCandidate: taskOptions.laterCandidate })
      : (() : any => { throw new Error(`Unknown board task: ${kind}`); })();
    if (kind === "flop-base") {
      result = writeFlopBaseFile(result, taskOptions.outputDir, performance.now() - started);
    }
    (parentPort as any).postMessage({ boardId: board.id, result });
  } catch (error: any) {
    (parentPort as any).postMessage({ error: error.stack ?? error.message });
    (parentPort as any).close();
    process.exitCode = 1;
  }
});
