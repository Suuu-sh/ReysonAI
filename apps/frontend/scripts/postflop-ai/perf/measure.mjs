// Explicit real W1 CLI runs, in the required order. Unlike equality.mjs, this writes
// the approved BTN_open_BB_call report/hand-EV artifacts; other spots are never run.
// Usage: node .../measure.mjs /private/tmp/before /private/tmp/after
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactPaths, loadInputs } from "../inputs.mjs";

const [beforeArgument, afterArgument] = process.argv.slice(2);
assert.ok(beforeArgument && afterArgument, "before and after directories are required");
const before = resolve(beforeArgument), after = resolve(afterArgument);
assert.notEqual(before, after, "do not overwrite before goldens");
const readJson = path => JSON.parse(readFileSync(path, "utf8"));
// Read required originals before starting any artifact-writing command.
const reportGolden = readJson(join(before, "simulateDefault.json"));
const handEvGolden = readJson(join(before, "existing-hand-ev.json"));
const spotId = "BTN_open_BB_call", paths = artifactPaths(loadInputs(spotId).spot);
const cwd = fileURLToPath(new URL("../../../", import.meta.url));
mkdirSync(after, { recursive: true });
const timings = {};
const saveTimings = () => writeFileSync(join(after, "full-timings.json"), `${JSON.stringify(timings, null, 2)}\n`);
for (const kind of ["simulate", "audit", "hand-ev"]) {
  console.log(`START ${kind} ${new Date().toISOString()}`);
  const started = performance.now(), log = createWriteStream(join(after, `full-${kind}.log`));
  const code = await new Promise((resolveCode, reject) => {
    const child = spawn("npm", ["run", `postflop-ai:${kind}`, "--", "--spot", spotId], { cwd, env: process.env });
    child.stdout.on("data", data => { log.write(data); process.stdout.write(data); });
    child.stderr.on("data", data => { log.write(data); process.stderr.write(data); });
    child.on("error", reject);
    child.on("exit", resolveCode);
  });
  log.end();
  timings[kind] = { ms: Math.round(performance.now() - started), code };
  saveTimings();
  assert.equal(code, 0, `${kind} failed`);
  if (kind === "simulate") {
    const actual = readJson(paths.report);
    assert.deepEqual(actual, reportGolden, "default simulation golden");
    assert.equal(JSON.stringify(actual), JSON.stringify(reportGolden), "default simulation byte equality");
    timings[kind].goldenEqual = true;
  } else if (kind === "hand-ev") {
    const actual = readJson(paths.handEv);
    // Since W3 the hand-EV is an exact expectation, so the 2,000-sample W1 golden no longer applies.
    assert.equal(actual.method, "exact_expectation", "hand-EV must be the exact expectation");
    timings[kind].method = actual.method;
    timings[kind].boards = Object.keys(actual.boards).length;
  }
  saveTimings();
  console.log(`DONE ${kind} ${JSON.stringify(timings[kind])}`);
}
console.log("ALL FULL MEASUREMENTS PASSED");
