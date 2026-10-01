// Offline, Node-only board scheduler. Shared/browser computation modules never import this.
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { boards } from "./inputs.mjs";

// Longest-first scheduling for the fixed representative-board set, measured on
// the full 2,000-sample BTN job. The two cheapest boards are intentionally last:
// otherwise expensive low-paired boards only start after a worker becomes free.
// This is a work queue, NOT a policy, seed, sample-count or output-order change.
// Unprofiled/custom boards retain their relative order and run before these.
const handEvPriority = new Map([
  "8c8d2h", "5s5d4c", "Th9h8c", "8s7d6c", "6h5h2d", "Js8s5d",
  "QsJd5c", "Ks8d3c", "As7d2c", "9s7s3s", "AhKh4h", "KcKd4h",
].map((id, index) => [id, index]));
export const boardWorkOrder = (kind, boardList) => kind === "hand-ev"
  ? [...boardList].sort((a, b) => (handEvPriority.get(a.id) ?? -1) - (handEvPriority.get(b.id) ?? -1))
  : boardList;

// A worker processes a whole board: every history/hand shares one inputs/policy identity.
// Work completion order never determines output order or any random stream.
export async function computeBoardBatch({ kind, inputs, policy, laterCandidate, samples, onBoard = () => {},
  boardList = boards(), parallelism = availableParallelism() }) {
  if (!Number.isInteger(samples) || samples < 1) throw new Error("samples must be a positive integer");
  if (!Number.isInteger(parallelism) || parallelism < 1) throw new Error("Invalid parallelism");
  if (!boardList.length) return {};
  const workList = boardWorkOrder(kind, boardList);
  const count = Math.min(boardList.length, parallelism), results = new Map(), workers = [];
  let next = 0;
  try {
    await Promise.all(Array.from({ length: count }, () => new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./board-worker.mjs", import.meta.url), {
        workerData: { kind, inputs, policy, laterCandidate, samples },
        // Worker startup must not inherit main-thread-only --test/--input-type flags.
        execArgv: [],
        // Ten board workers must not each grow towards Node's multi-GiB default
        // heap before collecting dead contexts. Typed cache buffers live outside
        // this heap; keep transient JS objects bounded to avoid machine-wide swap.
        resourceLimits: { maxOldGenerationSizeMb: 384, maxYoungGenerationSizeMb: 64 },
      });
      workers.push(worker);
      const dispatch = () => {
        if (next < workList.length) worker.postMessage({ board: workList[next++] });
        else worker.postMessage({ done: true });
      };
      worker.on("message", message => {
        if (message.error) { reject(new Error(message.error)); return; }
        if (!message.boardId || results.has(message.boardId)) { reject(new Error("Invalid board worker result")); return; }
        results.set(message.boardId, message.result);
        try { onBoard(message.boardId); dispatch(); } catch (error) { reject(error); }
      });
      worker.on("error", reject);
      worker.on("exit", code => code === 0 ? resolve() : reject(new Error(`Postflop board worker exited (${code})`)));
      dispatch();
    })));
    if (results.size !== boardList.length) throw new Error("Incomplete board batch");
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
  }
  return Object.fromEntries(boardList.map(board => [board.id, results.get(board.id)]));
}
