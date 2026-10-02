// node scripts/postflop-ai/audit-all-boards.mjs [--spot <id> ...] [--street flop|later|all] [--workers N]
// Runs the balance checks (balance.mjs) on every one of the 1,755 canonical flops, one board at a
// time, for each heads-up spot, and reports how many boards each finding appears on. The product
// lets users pick any flop, so quality is judged on all boards, not the 12 configured ones.
// Writes .local/postflop-ai/all-boards-audit/<spot>.json and summary.md. AI estimate, not GTO.
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

function auditBoards(spotId, street, boardIds) {
  const inputs = loadInputs(spotId);
  const flop = loadCandidate(inputs), later = loadLaterCandidate(inputs, flop);
  const byId = new Map(canonicalFlops().map(board => [board.id, board]));
  const rows = [];
  for (const id of boardIds) {
    const board = byId.get(id), boardList = [{ ...board, cards: [...board.cards] }];
    const findings = [];
    if (street !== "later") findings.push(...checkFlopBalance(inputs, flop.policy, { boardList }).findings.map(f => ({ ...f, street: "flop" })));
    if (street !== "flop") findings.push(...checkLaterBalance(inputs, flop.policy, later.policy, { boardList }).findings
      .filter(f => f.check !== "no-overrides" && f.check !== "role-copy").map(f => ({ ...f, street: "later" })));
    rows.push({ board: id, findings: findings.map(({ check, severity, node, street: s, direction }) => ({ check, severity, node, street: s, direction })) });
  }
  return rows;
}

if (!isMainThread) {
  parentPort.postMessage(auditBoards(workerData.spotId, workerData.street, workerData.boardIds));
} else {
  const args = process.argv.slice(2), spots = [];
  let street = "all", workers = Math.max(1, availableParallelism() - 1);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--spot") spots.push(args[++i]);
    else if (args[i] === "--street") street = args[++i];
    else if (args[i] === "--workers") workers = Number(args[++i]);
    else throw new Error("Usage: audit-all-boards.mjs [--spot <id> ...] [--street flop|later|all] [--workers N]");
  }
  const spotIds = spots.length ? spots : POSTFLOP_SPOTS.filter(spot => spot.reachable).map(spot => spot.id);
  const boardIds = canonicalFlops().map(board => board.id);
  mkdirSync(outDir, { recursive: true });
  const summary = [];
  for (const spotId of spotIds) {
    const started = Date.now();
    const chunks = Array.from({ length: workers }, (_, w) => boardIds.filter((_, i) => i % workers === w));
    const rows = (await Promise.all(chunks.map(chunk => new Promise((resolve, reject) => {
      const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { spotId, street, boardIds: chunk } });
      worker.once("message", resolve); worker.once("error", reject);
    })))).flat();
    const counts = new Map();
    for (const row of rows) for (const f of row.findings) {
      const key = `${f.street} ${f.severity} ${f.check}${f.direction ? `(${f.direction})` : ""} ${f.node}`;
      const entry = counts.get(key) ?? { key, boards: 0, examples: [] };
      entry.boards++; if (entry.examples.length < 5) entry.examples.push(row.board);
      counts.set(key, entry);
    }
    const ranked = [...counts.values()].sort((a, b) => b.boards - a.boards);
    const errors = ranked.filter(entry => entry.key.includes(" error ")).reduce((sum, entry) => sum + entry.boards, 0);
    const clean = rows.filter(row => !row.findings.length).length;
    writeFileSync(join(outDir, `${spotId}.json`), `${JSON.stringify({ spot: spotId, street, boards: rows.length, clean, errors, findings: ranked }, null, 2)}\n`);
    summary.push({ spotId, boards: rows.length, clean, errors, top: ranked.slice(0, 5) });
    console.log(`${spotId}: ${rows.length} boards, ${clean} clean, ${errors} error findings, ${Math.round((Date.now() - started) / 1000)}s`);
    for (const entry of ranked.slice(0, 5)) console.log(`  ${entry.boards}/${rows.length} ${entry.key}`);
  }
  const md = ["# All-board balance audit (1,755 canonical flops; AI estimate, not GTO)", "",
    "| spot | boards | clean | error findings | most common finding |", "|---|---:|---:|---:|---|",
    ...summary.map(s => `| ${s.spotId} | ${s.boards} | ${s.clean} | ${s.errors} | ${s.top[0] ? `${s.top[0].key} (${s.top[0].boards})` : "—"} |`)];
  writeFileSync(join(outDir, "summary.md"), `${md.join("\n")}\n`);
}
