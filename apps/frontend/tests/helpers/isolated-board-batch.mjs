import { fork } from "node:child_process";

// A fresh process keeps completed worker heaps out of the next batch's RSS.
// Clearing the parent's global heap override also lets board-batch's per-worker
// resourceLimits take effect. Advanced IPC preserves exact numeric values.
export function isolatedBoardBatch(options) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  return new Promise((resolve, reject) => {
    const child = fork(new URL(import.meta.url), ["--run-board-batch"], {
      execArgv: [], env, serialization: "advanced", stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let result, received = false, error = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", chunk => { error += chunk; });
    child.once("error", reject);
    child.on("message", message => {
      if (message.error) { error += message.error; return; }
      result = message.result; received = true;
    });
    child.once("close", (code, signal) => {
      if (code === 0 && received) resolve(result);
      else reject(new Error(`Isolated board batch exited (${signal ?? code}): ${error}`));
    });
    child.send(options);
  });
}

if (process.argv[2] === "--run-board-batch") {
  process.once("message", async options => {
    try {
      const { computeBoardBatch } = await import("../../scripts/postflop-ai/board-batch.mjs");
      const result = await computeBoardBatch(options);
      process.send({ result }, error => {
        if (error) process.exitCode = 1;
        process.disconnect();
      });
    } catch (error) {
      process.exitCode = 1;
      process.send({ error: error.stack ?? error.message }, () => process.disconnect());
    }
  });
}
