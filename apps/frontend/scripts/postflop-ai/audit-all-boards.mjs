// Offline all-1,755-canonical-flop audit. Reads saved policies; never generates them.
import { availableParallelism } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { join, resolve } from "node:path";
import { loadInputs } from "./inputs.mjs";
import { loadCandidate, loadLaterCandidate } from "./generate.mjs";
import { checkFlopBalance, checkLaterBalance, checkProfileBalance } from "./balance.mjs";
import { canonicalFlops } from "./flop-isomorphism.ts";
import { POSTFLOP_SPOTS } from "./spots.ts";
import { generationInputOptions } from "./generation-options.mjs";
import { isDefaultProfile, normalizeProfile, profileKey } from "../../src/estimated/table-profile.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const baseOutDir = join(root, ".local/postflop-ai/all-boards-audit");
const profiles = ["standard", "nit", "station", "lag", "maniac"];
const usage = "Usage: audit-all-boards.mjs [--spot <id> ...] [--street flop|later|all] [--workers N] [--profile standard|nit|station|lag|maniac] [--opponent-seat ip|oop] [--table-profile <call>,<three_bet> (low|normal|high; standard aliases normal)]";
const defaults = { loadInputs, loadCandidate, loadLaterCandidate, checkFlopBalance, checkLaterBalance, checkProfileBalance, canonicalFlops };

export function parseAuditArgs(args = [], spots = POSTFLOP_SPOTS) {
  const options = { spots: [], street: "all", workers: Math.max(1, availableParallelism() - 1), profile: "standard" };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i], value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(usage);
    if (flag === "--spot") options.spots.push(value);
    else if (flag === "--street") options.street = value;
    else if (flag === "--workers") options.workers = Number(value);
    else if (flag === "--profile") options.profile = value;
    else if (flag === "--opponent-seat") options.opponentSeat = value;
    else if (flag === "--table-profile") {
      const levels = value.split(",").map(level => level === "standard" ? "normal" : level);
      if (levels.length !== 2) throw new Error(usage);
      options.tableProfile = normalizeProfile({ call: levels[0], three_bet: levels[1] });
    } else throw new Error(usage);
  }
  if (!["flop", "later", "all"].includes(options.street) || !profiles.includes(options.profile) ||
      !Number.isSafeInteger(options.workers) || options.workers < 1 || options.workers > 1755 ||
      (options.opponentSeat !== undefined && (options.profile === "standard" || !["ip", "oop"].includes(options.opponentSeat))) ||
      options.spots.some(id => !spots.some(spot => spot.id === id))) throw new Error(usage);
  options.spots = [...new Set(options.spots)];
  return options;
}

export function auditInputOptions(spotId, options) {
  return { ...generationInputOptions(spotId, options.profile ?? "standard", options.opponentSeat),
    ...(options.tableProfile ? { tableProfile: normalizeProfile(options.tableProfile) } : {}) };
}

export function auditOutputDir(options, base = baseOutDir) {
  const profile = options.profile ?? "standard";
  return profile === "standard" && isDefaultProfile(options.tableProfile)
    ? base : join(base, "profiles", profile, profileKey(options.tableProfile ?? {}), ...(options.opponentSeat ? [`opponent_${options.opponentSeat}`] : []));
}

export function selectAuditSpotIds(options, spots = POSTFLOP_SPOTS) {
  if (options.spots?.length) return options.spots;
  // Nonstandard ranges can unlock SB flats; let loadInputs establish actual reach.
  const adjusted = (options.profile ?? "standard") !== "standard" || !isDefaultProfile(options.tableProfile);
  return spots.filter(spot => adjusted || spot.reachable).map(spot => spot.id);
}

function describeError(error, stage) {
  const message = String(error?.message ?? error);
  const role = message.match(/-(villain|exploit)-(?:later-)?policy\b/)?.[1];
  return { message, ...(error?.code ? { code: error.code } : {}), ...(stage ? { stage } : {}), ...(role ? { role } : {}) };
}

export function prepareAuditSpot(spotId, street, inputOptions = {}, dependencies = {}) {
  const deps = { ...defaults, ...dependencies };
  let stage = "input";
  try {
    const inputs = deps.loadInputs(spotId, inputOptions);
    stage = "flop";
    const flop = deps.loadCandidate(inputs);
    stage = "later";
    const later = street === "flop" ? null : deps.loadLaterCandidate(inputs, flop);
    if (street !== "flop" && !later) throw new Error("Saved later policy is missing");
    return { status: "ready", inputs, flop, later };
  } catch (error) {
    const detail = describeError(error, stage);
    // Only the input loader's precise reach states are skippable. Missing/malformed
    // range files, stale identities, and policy-structure errors remain failures.
    const unreachable = stage === "input" && /(?:saved history is unreachable after range adjustment|is unreachable: (?:the saved .+ range never calls|a saved range never reaches the flop))/.test(detail.message);
    return { status: unreachable ? "unreachable" : stage !== "input" && error?.code === "PROFILE_POLICY_MISSING" ? "not_generated" : "failed", error: detail };
  }
}

export function auditBoards(spotId, street, boardIds, inputOptions = {}, dependencies = {}) {
  const deps = { ...defaults, ...dependencies };
  const prepared = prepareAuditSpot(spotId, street, inputOptions, deps);
  if (prepared.status !== "ready") throw Object.assign(new Error(prepared.error.message), prepared.error);
  const { inputs, flop, later } = prepared;
  const profile = (inputs.opponentProfile ?? "standard") !== "standard";
  const byId = new Map(deps.canonicalFlops().map(board => [board.id, board]));
  return boardIds.map(id => {
    const board = byId.get(id);
    if (!board) throw new Error(`Unknown canonical flop: ${id}`);
    const boardList = [{ ...board, cards: [...board.cards] }];
    let findings = [];
    if (profile) {
      // Rule advisories are board-independent, but root reach is checked on each
      // board with real card removal. Do not require arbitrary zero-mix branches.
      findings = deps.checkProfileBalance(inputs, flop.policy, later?.policy ?? null, {
        boardList, requestedPaths: [{ board: [...board.cards], path: { flop: [] } }],
      }).findings;
      const blocked = findings.filter(f => f.check === "unreachable-branch" && /No compatible positive-weight holecard assignment/.test(f.detail ?? ""));
      if (blocked.length && findings.every(f => f.severity !== "error" || blocked.includes(f))) {
        return { board: id, status: "unreachable", findings: [] };
      }
      findings = findings.map(f => ({ ...f, street: /^(turn|river)_/.test(f.node) ? "later" : "flop" }))
        .filter(f => street !== "later" || f.street === "later" || f.severity === "error");
    } else {
      if (street !== "later") findings.push(...deps.checkFlopBalance(inputs, flop.policy, { boardList }).findings.map(f => ({ ...f, street: "flop" })));
      if (street !== "flop") findings.push(...deps.checkLaterBalance(inputs, flop.policy, later.policy, { boardList }).findings
        .filter(f => f.check !== "no-overrides" && f.check !== "role-copy").map(f => ({ ...f, street: "later" })));
    }
    return { board: id, findings: findings.map(({ check, severity, node, street: s, direction, ...detail }) =>
      ({ check, severity, node, street: s, direction, ...(profile ? detail : {}) })) };
  });
}

export function makeAuditWorkerData(spotId, options, boardIds) {
  return { spotId, street: options.street, boardIds, inputOptions: auditInputOptions(spotId, options) };
}

function runWorker(data) {
  return new Promise((resolveRows, reject) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: data });
    let received = false;
    worker.once("message", message => {
      received = true;
      if (message.auditError) reject(Object.assign(new Error(message.auditError.message), message.auditError));
      else resolveRows(message);
    });
    worker.once("error", reject);
    worker.once("exit", code => { if (!received) reject(new Error(`Audit worker exited without a report (${code})`)); });
  });
}

export function summarizeAuditRows(spotId, street, rows) {
  const counts = new Map();
  for (const row of rows) for (const f of row.findings) {
    const context = f.tier ? ` ${[f.tier, f.line, f.texture].filter(Boolean).join("/")}` : "";
    const key = `${f.street} ${f.severity} ${f.check}${f.direction ? `(${f.direction})` : ""} ${f.node}${context}`;
    const entry = counts.get(key) ?? { key, boards: 0, examples: [] };
    entry.boards++; if (entry.examples.length < 5) entry.examples.push(row.board);
    counts.set(key, entry);
  }
  const ranked = [...counts.values()].sort((a, b) => b.boards - a.boards);
  const errors = ranked.filter(entry => entry.key.includes(" error ")).reduce((sum, entry) => sum + entry.boards, 0);
  const checked = rows.filter(row => row.status !== "unreachable");
  return { spot: spotId, street, boards: rows.length, clean: checked.filter(row => !row.findings.length).length, errors, findings: ranked };
}

export async function runAllBoardsAudit(options, dependencies = {}) {
  const deps = { ...defaults, runWorker, writeFileSync, mkdirSync, log: console.log, ...dependencies };
  const boardIds = deps.canonicalFlops().map(board => board.id);
  const outDir = auditOutputDir(options, deps.baseOutDir);
  deps.mkdirSync(outDir, { recursive: true });
  const reports = [];
  const profile = options.profile !== "standard";
  const extended = profile || !isDefaultProfile(options.tableProfile);
  for (const spotId of selectAuditSpotIds(options, deps.spots ?? POSTFLOP_SPOTS)) {
    const started = Date.now(), inputOptions = auditInputOptions(spotId, options);
    const prepared = prepareAuditSpot(spotId, options.street, inputOptions, deps);
    let report, status = prepared.status;
    if (status === "ready") {
      try {
        const count = Math.min(options.workers, boardIds.length);
        const chunks = Array.from({ length: count }, (_, w) => boardIds.filter((_, i) => i % count === w));
        // Wait for every sibling before advancing to another spot, including when
        // one fails. Never leak a previous spot's workers into the next batch.
        const results = await Promise.allSettled(chunks.map(chunk => deps.runWorker(makeAuditWorkerData(spotId, options, chunk))));
        const failure = results.find(result => result.status === "rejected");
        if (failure) throw failure.reason;
        const rows = results.flatMap(result => result.value);
        report = summarizeAuditRows(spotId, options.street, rows);
        status = report.errors ? "failed" : "passed";
        if (extended) Object.assign(report, { status, profile: options.profile, opponentSeat: prepared.inputs.opponentSeat ?? null, tableProfile: normalizeProfile(options.tableProfile),
          visitedBoards: rows.length, checkedBoards: rows.filter(row => row.status !== "unreachable").length,
          unreachableBoards: rows.filter(row => row.status === "unreachable").length,
          unreachableBoardExamples: rows.filter(row => row.status === "unreachable").slice(0, 5).map(row => row.board),
          warnings: rows.reduce((n, row) => n + row.findings.filter(f => f.severity === "warn").length, 0),
          ...(profile ? { rule_advisory_scope: "board-independent policy rules; counts repeat on compatible boards",
            board_check_scope: "flop root compatible positive-weight reach; no exhaustive later runout/branch scan" } : {}) });
      } catch (error) {
        status = error?.code === "PROFILE_POLICY_MISSING" ? "not_generated" : "failed";
        report = { error: describeError(error) };
      }
    } else report = { error: prepared.error };
    if (!report.spot) report = { spot: spotId, street: options.street, profile: options.profile,
      opponentSeat: options.opponentSeat ?? "auto", tableProfile: normalizeProfile(options.tableProfile), status, boards: 0, clean: 0,
      errors: status === "failed" ? 1 : 0, findings: [], ...report };
    deps.writeFileSync(join(outDir, `${spotId}.json`), `${JSON.stringify(report, null, 2)}\n`);
    reports.push({ ...report, status });
    if (status === "passed" || (status === "failed" && report.boards)) {
      deps.log(`${spotId}: ${report.boards} boards, ${report.clean} clean, ${report.errors} error findings, ${Math.round((Date.now() - started) / 1000)}s`);
      for (const entry of report.findings.slice(0, 5)) deps.log(`  ${entry.boards}/${report.boards} ${entry.key}`);
    } else deps.log(`${spotId}: ${status === "not_generated" ? "NOT GENERATED (未生成)" : status.toUpperCase()} — ${report.error.message}`);
  }
  const counters = { passed: 0, failed: 0, missing: 0, unreachable: 0, errors: 0, warnings: 0 };
  for (const report of reports) {
    counters[report.status === "not_generated" ? "missing" : report.status]++;
    counters.errors += report.errors;
    counters.warnings += report.warnings ?? report.findings.filter(f => f.key.includes(" warn ")).reduce((sum, f) => sum + f.boards, 0);
  }
  const hasFailure = counters.failed || counters.missing;
  // Successful unadjusted reports preserve the original filenames/JSON/table.
  const detailed = extended || reports.some(report => report.status !== "passed");
  const md = ["# All-board balance audit (1,755 canonical flops; AI estimate, not GTO)", "",
    ...(detailed ? [`Profile: ${options.profile}; opponent seat: ${options.opponentSeat ?? "auto"}; table: ${profileKey(options.tableProfile ?? {})}.`,
      `Status: ${hasFailure ? "INCOMPLETE / FAILED" : "PASS"}. Passed: ${counters.passed}; failed: ${counters.failed}; NOT GENERATED (未生成): ${counters.missing}; unreachable spots: ${counters.unreachable}; error findings: ${counters.errors}; warnings: ${counters.warnings}.`,
      ...(profile ? ["Profile advisories are rule-level, not range-weighted board-quality measurements. Each compatible canonical flop receives a root-reach check; later policies receive structural checks, not an exhaustive turn/river runout scan."] : []), ""] : []),
    detailed ? "| spot | status | boards visited | boards checked | unreachable boards | clean | error findings | most common finding / reason |" : "| spot | boards | clean | error findings | most common finding |",
    detailed ? "|---|---|---:|---:|---:|---:|---:|---|" : "|---|---:|---:|---:|---|",
    ...reports.map(s => {
      const note = s.error?.message ?? (s.findings[0] ? `${s.findings[0].key} (${s.findings[0].boards})` : "—");
      return detailed ? `| ${s.spot} | ${s.status === "not_generated" ? "NOT GENERATED (未生成)" : s.status} | ${s.boards} | ${s.checkedBoards ?? s.boards} | ${s.unreachableBoards ?? 0} | ${s.clean} | ${s.errors} | ${note} |`
        : `| ${s.spot} | ${s.boards} | ${s.clean} | ${s.errors} | ${note} |`;
    })];
  deps.writeFileSync(join(outDir, "summary.md"), `${md.join("\n")}\n`);
  if (detailed) deps.writeFileSync(join(outDir, "summary.json"), `${JSON.stringify({ profile: options.profile,
    opponentSeat: options.opponentSeat ?? "auto", tableProfile: normalizeProfile(options.tableProfile), street: options.street, canonicalBoards: boardIds.length,
    status: hasFailure ? "incomplete" : "passed", counters }, null, 2)}\n`);
  return { outDir, reports, counters, exitCode: hasFailure ? 1 : 0 };
}

if (!isMainThread) {
  try { parentPort.postMessage(auditBoards(workerData.spotId, workerData.street, workerData.boardIds, workerData.inputOptions)); }
  catch (error) { parentPort.postMessage({ auditError: describeError(error, error.stage) }); }
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = (await runAllBoardsAudit(parseAuditArgs(process.argv.slice(2)))).exitCode; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
