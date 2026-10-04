import { allBoardIdentity, allBoardSummaryName, assertAllBoardRunIdentity, openBoardCheckpoints, writeImmutableAllBoardOutput } from "./all-board-checkpoints.mjs";
import { defenceFor } from "./defence.mjs";
import { hasPostflopDeal } from "./range-support.mjs";
// node scripts/postflop-ai/audit-all-boards.mjs [--spot <id> ...] [--street flop|later|all] [--workers N]
// Runs the balance checks (balance.mjs) on every one of the 1,755 canonical flops, one board at a
// time, for each heads-up spot, and reports how many boards each finding appears on. The product
// lets users pick any flop, so quality is judged on all boards, not the 12 configured ones.
// Writes immutable all-boards-audit/<spot>--<full-identity-hash>.json and a summary.md index. AI estimate, not GTO.
import { availableParallelism } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { join } from "node:path";
import { loadInputs } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "./generate.mjs";
import { checkFlopBalance, checkLaterBalance } from "./balance.mjs";
import { canonicalFlops } from "./flop-isomorphism.mjs";
import { POSTFLOP_SPOTS } from "./spots.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const outDir = join(root, ".local/postflop-ai/all-boards-audit");

function auditBoards(spotId, street, boardIds, onBoard = () => {}, expectedIdentityHash) {
  const inputs = loadInputs(spotId);
  const flop = loadCandidate(inputs), later = loadLaterCandidate(inputs, flop);
  // Workers must verify the identity of the data/code they actually loaded,
  // before emitting even their first row into the parent's checkpoint set.
  assertAllBoardRunIdentity(inputs, flop, later, street, expectedIdentityHash);
  const byId = new Map(canonicalFlops().map(board => [board.id, board]));
  const rows = [];
  const record = row => { rows.push(row); onBoard(row); };
  for (const id of boardIds) {
    defenceFor(inputs, flop.policy, null).releaseBoardCaches();
    if (later) defenceFor(inputs, flop.policy, later.policy).releaseBoardCaches();
    const board = byId.get(id), boardList = [{ ...board, cards: [...board.cards] }];
    if (inputs.spot.history && !hasPostflopDeal(inputs, board.cards)) {
      record({ board: id, unreachable: true, findings: [] }); continue;
    }
    const findings = [];
    if (street !== "later") findings.push(...checkFlopBalance(inputs, flop.policy, { boardList }).findings.map(f => ({ ...f, street: "flop" })));
    const laterAudit = street !== "flop" ? checkLaterBalance(inputs, flop.policy, later.policy, { boardList }) : null;
    if (laterAudit) findings.push(...laterAudit.findings
      .filter(f => f.check !== "no-overrides" && f.check !== "role-copy").map(f => ({ ...f, street: "later" })));
    record({ board: id, ...(laterAudit?.coverage ? { later_coverage: laterAudit.coverage } : {}), findings: findings.map(({ check, severity, node, street: s, direction }) => ({ check, severity, node, street: s, direction })) });
  }
  return rows;
}

if (!isMainThread) {
  auditBoards(workerData.spotId, workerData.street, workerData.boardIds, row => parentPort.postMessage({ type: "checkpoint", row }), workerData.expectedIdentityHash);
  parentPort.postMessage({ type: "done" });
} else {
  const args = process.argv.slice(2), spots = [];
  let street = "all", workers = 1;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--spot") spots.push(args[++i]);
    else if (args[i] === "--street") street = args[++i];
    else if (args[i] === "--workers") workers = Number(args[++i]);
    else throw new Error("Usage: audit-all-boards.mjs [--spot <id> ...] [--street flop|later|all] [--workers N]");
  }
  if (!["flop", "later", "all"].includes(street) || !Number.isInteger(workers) || workers < 1) throw new Error("Invalid audit street or worker count");
  const spotIds = spots.length ? spots : POSTFLOP_SPOTS.filter(spot => spot.reachable).map(spot => spot.id);
  const boardIds = canonicalFlops().map(board => board.id);
  mkdirSync(outDir, { recursive: true });
  const summary = [];
  for (const spotId of spotIds) {
    const started = Date.now();
    const inputs = loadInputs(spotId), candidate = loadCandidate(inputs), later = loadLaterCandidate(inputs, candidate);
    if (street !== "flop" && !later) throw new Error(`${spotId}: later policy required`);
    const identity = allBoardIdentity(inputs, candidate, later, street);
    const cache = openBoardCheckpoints(join(outDir, "checkpoints"), identity, boardIds);
    const pending = boardIds.filter(id => !cache.rows.has(id)), liveWorkers = [];
    console.log(`${spotId}: resume ${cache.rows.size}/${boardIds.length} checked boards; identity ${cache.key}`);
    const count = Math.min(workers, availableParallelism(), pending.length);
    const chunks = Array.from({ length: count }, (_, w) => pending.filter((_, i) => i % count === w));
    try {
      await Promise.all(chunks.map(chunk => new Promise((resolve, reject) => {
        const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { spotId, street, boardIds: chunk, expectedIdentityHash: cache.key },
          resourceLimits: { maxOldGenerationSizeMb: 384, maxYoungGenerationSizeMb: 64 } });
        liveWorkers.push(worker); let complete = false;
        worker.on("message", message => {
          try {
            if (message.type === "checkpoint") {
              if (!chunk.includes(message.row?.board)) throw new Error("Unexpected worker board");
              cache.write(message.row);
              if (cache.rows.size % 25 === 0 || cache.rows.size === 1) console.log(`${spotId}: ${cache.rows.size}/${boardIds.length} boards checkpointed (${Math.round((Date.now()-started)/1000)}s)`);
            } else if (message.type === "done") { complete = true; resolve(); }
            else throw new Error("Unexpected audit worker message");
          } catch (error) { reject(error); }
        });
        worker.once("error", reject);
        worker.once("exit", code => { if (code !== 0 || !complete) reject(new Error(`Audit worker exited (${code}) before completion`)); });
      })));
    } finally { await Promise.all(liveWorkers.map(worker => worker.terminate())); }
    if (cache.rows.size !== boardIds.length) throw new Error("Incomplete all-board audit");
    const finalInputs = loadInputs(spotId), finalCandidate = loadCandidate(finalInputs), finalLater = loadLaterCandidate(finalInputs, finalCandidate);
    assertAllBoardRunIdentity(finalInputs, finalCandidate, finalLater, street, cache.key);
    // Stable canonical ordering, independent of resume or worker completion order.
    const rows = boardIds.map(id => cache.rows.get(id));
    const counts = new Map();
    for (const row of rows) for (const f of row.findings) {
      const key = `${f.street} ${f.severity} ${f.check}${f.direction ? `(${f.direction})` : ""} ${f.node}`;
      const entry = counts.get(key) ?? { key, boards: 0, examples: [] };
      entry.boards++; if (entry.examples.length < 5) entry.examples.push(row.board);
      counts.set(key, entry);
    }
    const ranked = [...counts.values()].sort((a, b) => b.boards - a.boards || a.key.localeCompare(b.key));
    const errors = ranked.filter(entry => entry.key.includes(" error ")).reduce((sum, entry) => sum + entry.boards, 0);
    const unreachable = rows.filter(row => row.unreachable).length;
    const laterCoverage = rows.reduce((total, row) => {
      for (const [key, value] of Object.entries(row.later_coverage ?? {})) total[key] = (total[key] ?? 0) + value;
      return total;
    }, {});
    const clean = rows.filter(row => !row.unreachable && !row.findings.length).length;
    const resultName = allBoardSummaryName(spotId, cache.key);
    writeImmutableAllBoardOutput(join(outDir, resultName), `${JSON.stringify({ spot: spotId, street, identity_hash: cache.key, source_hash: inputs.fingerprint, policy_hash: candidate.metadata.policy_hash, later_policy_hash: later?.metadata.policy_hash ?? null, boards: rows.length, unreachable, evaluated_boards: rows.length - unreachable, later_coverage: laterCoverage, clean, errors, findings: ranked }, null, 2)}\n`);
    summary.push({ spotId, resultName, boards: rows.length, unreachable, clean, errors, top: ranked.slice(0, 5) });
    console.log(`${spotId}: ${rows.length} boards (${unreachable} proven unreachable), ${clean} clean, ${errors} error findings, ${Math.round((Date.now() - started) / 1000)}s`);
    for (const entry of ranked.slice(0, 5)) console.log(`  ${entry.boards}/${rows.length} ${entry.key}`);
  }
  const md = ["# All-board balance audit (1,755 canonical flops; AI estimate, not GTO)", "",
    "| spot | boards | unreachable | clean | error findings | most common finding |", "|---|---:|---:|---:|---:|---|",
    ...summary.map(s => `| [${s.spotId}](${s.resultName}) | ${s.boards} | ${s.unreachable} | ${s.clean} | ${s.errors} | ${s.top[0] ? `${s.top[0].key} (${s.top[0].boards})` : "—"} |`)];
  writeFileSync(join(outDir, "summary.md"), `${md.join("\n")}\n`);
  if (summary.some(row => row.errors > 0)) process.exitCode = 1;
}
