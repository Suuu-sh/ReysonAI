import { parentPort, workerData } from "node:worker_threads";
import { handEvForBoard } from "./flop-hand-ev-core.mjs";
import { simulate } from "./simulation.mjs";
import { referenceLaterPolicy } from "./later-policy.mjs";
import { defenceFor } from "./defence.mjs";
import { buildFlopBase } from "./flop-base-core.mjs";
import { releaseFlopUiFacts } from "./flop-ui-facts.mjs";
import { writeFlopBaseFile } from "./flop-base-files.mjs";

const { kind, inputs, policy, laterCandidate, samples, taskOptions = {} } = workerData;
const laterPolicy = laterCandidate?.policy ?? laterCandidate ?? referenceLaterPolicy();
parentPort.on("message", message => {
  if (message.done) { parentPort.close(); return; }
  try {
    const board = message.board;
    if (kind === "hand-ev" || kind === "flop-base" || kind === "flop-base-probe") {
      defenceFor(inputs, policy, laterPolicy).releaseBoardCaches();
      defenceFor(inputs, policy, null).releaseBoardCaches();
      releaseFlopUiFacts(inputs, policy);
    }
    const started = performance.now();
    let result = kind === "hand-ev" ? handEvForBoard(board, inputs, policy, samples, laterPolicy, taskOptions)
      : kind === "simulate" ? simulate(inputs, policy, samples, laterCandidate, { boardList: [board] }).results
      : kind === "flop-base" || kind === "flop-base-probe" ? buildFlopBase({ board: board.cards, inputs,
        candidate: taskOptions.candidate, laterCandidate: taskOptions.laterCandidate, samples,
        ev: taskOptions.evBoards?.includes(board.id) || kind === "flop-base-probe" && taskOptions.measureEv
          ? handEvForBoard(board, inputs, policy, samples, laterPolicy, { uncertainty: Boolean(taskOptions.uncertainty) }) : null })
      : (() => { throw new Error(`Unknown board task: ${kind}`); })();
    if (kind === "flop-base" || kind === "flop-base-probe") {
      result = writeFlopBaseFile(result, taskOptions.outputDir, performance.now() - started);
    }
    parentPort.postMessage({ boardId: board.id, result });
  } catch (error) {
    parentPort.postMessage({ error: error.stack ?? error.message });
    parentPort.close();
    process.exitCode = 1;
  }
});
