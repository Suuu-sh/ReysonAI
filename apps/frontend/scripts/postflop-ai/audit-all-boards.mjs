import { allBoardIdentity, allBoardSummaryName, assertAllBoardRunIdentity, openBoardCheckpoints, writeImmutableAllBoardOutput } from "./all-board-checkpoints.mjs";
import { defenceFor } from "./defence.ts";
import { hasPostflopDeal } from "./range-support.mjs";
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
const defaults = { loadInputs, loadCandidate, loadLaterCandidate, checkFlopBalance, checkLaterBalance, checkProfileBalance, canonicalFlops,
  allBoardIdentity, assertAllBoardRunIdentity, openBoardCheckpoints, writeImmutableAllBoardOutput, defenceFor, hasPostflopDeal };

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
    // Standard runs retain development's flop/later lineage even for a
    // flop-only check. Profile flop checks may legitimately lack later roles.
    const profile = inputs.opponentProfile && inputs.opponentProfile !== "standard";
    const later = street === "flop" && profile ? null : deps.loadLaterCandidate(inputs, flop);
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

export function auditBoards(spotId, street, boardIds, inputOptions = {}, dependencies = {}, { onBoard = () => {}, expectedIdentityHash } = {}) {
  const deps = { ...defaults, ...dependencies };
  const prepared = prepareAuditSpot(spotId, street, inputOptions, deps);
  if (prepared.status !== "ready") throw Object.assign(new Error(prepared.error.message), prepared.error);
  const { inputs, flop, later } = prepared;
  if (expectedIdentityHash !== undefined) deps.assertAllBoardRunIdentity(inputs, flop, later, street, expectedIdentityHash);
  const profile = (inputs.opponentProfile ?? "standard") !== "standard";
  const byId = new Map(deps.canonicalFlops().map(board => [board.id, board]));
  const rows = [];
  const record = row => { rows.push(row); onBoard(row); };
  for (const id of boardIds) {
    deps.defenceFor(inputs, flop.policy, null).releaseBoardCaches();
    if (later) deps.defenceFor(inputs, flop.policy, later.policy).releaseBoardCaches();
    const board = byId.get(id);
    if (!board) throw new Error(`Unknown canonical flop: ${id}`);
    const boardList = [{ ...board, cards: [...board.cards] }];
    if (!profile && inputs.spot.history && !deps.hasPostflopDeal(inputs, board.cards)) {
      record({ board: id, unreachable: true, findings: [] }); continue;
    }
    let findings = [], laterCoverage;
    if (profile) {
      // Rule advisories are board-independent, but root reach is checked on each
      // board with real card removal. Do not require arbitrary zero-mix branches.
      findings = deps.checkProfileBalance(inputs, flop.policy, later?.policy ?? null, {
        boardList, requestedPaths: [{ board: [...board.cards], path: { flop: [] } }],
      }).findings;
      const blocked = findings.filter(f => f.check === "unreachable-branch" && /No compatible positive-weight holecard assignment/.test(f.detail ?? ""));
      if (blocked.length && findings.every(f => f.severity !== "error" || blocked.includes(f))) {
        record({ board: id, status: "unreachable", unreachable: true, findings: [] }); continue;
      }
      findings = findings.map(f => ({ ...f, street: /^(turn|river)_/.test(f.node) ? "later" : "flop" }))
        .filter(f => street !== "later" || f.street === "later" || f.severity === "error");
    } else {
      if (street !== "later") findings.push(...deps.checkFlopBalance(inputs, flop.policy, { boardList }).findings.map(f => ({ ...f, street: "flop" })));
      if (street !== "flop") {
        const audit = deps.checkLaterBalance(inputs, flop.policy, later.policy, { boardList });
        laterCoverage = audit.coverage;
        findings.push(...audit.findings.filter(f => f.check !== "no-overrides" && f.check !== "role-copy").map(f => ({ ...f, street: "later" })));
      }
    }
    record({ board: id, ...(laterCoverage ? { later_coverage: laterCoverage } : {}),
      findings: findings.map(({ check, severity, node, street: s, direction, ...detail }) =>
      ({ check, severity, node, street: s, direction, ...(profile ? detail : {}) })) });
  }
  return rows;
}

export function makeAuditWorkerData(spotId, options, boardIds) {
  return { spotId, street: options.street, boardIds, inputOptions: auditInputOptions(spotId, options) };
}

function runWorker(data, onBoard = () => {}) {
  return new Promise((resolveRows, reject) => {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: data,
      resourceLimits: { maxOldGenerationSizeMb: 384, maxYoungGenerationSizeMb: 64 } });
    const rows = [];
    let complete = false;
    worker.on("message", message => {
      try {
        if (message.auditError) throw Object.assign(new Error(message.auditError.message), message.auditError);
        if (message.type === "checkpoint") {
          if (!data.boardIds.includes(message.row?.board)) throw new Error("Unexpected worker board");
          onBoard(message.row); rows.push(message.row);
        } else if (message.type === "done") {
          complete = true; resolveRows(rows);
        } else throw new Error("Unexpected audit worker message");
      } catch (error) { worker.terminate(); reject(error); }
    });
    worker.once("error", reject);
    worker.once("exit", code => { if (code !== 0 || !complete) reject(new Error(`Audit worker exited (${code}) before completion`)); });
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
  const ranked = [...counts.values()].sort((a, b) => b.boards - a.boards || a.key.localeCompare(b.key));
  const errors = ranked.filter(entry => entry.key.includes(" error ")).reduce((sum, entry) => sum + entry.boards, 0);
  const checked = rows.filter(row => !row.unreachable && row.status !== "unreachable");
  return { spot: spotId, street, boards: rows.length, clean: checked.filter(row => !row.findings.length).length, errors, findings: ranked };
}

export async function runAllBoardsAudit(options, dependencies = {}) {
  const deps = { ...defaults, runWorker, writeFileSync, mkdirSync, log: console.log, ...dependencies };
  const boardIds = deps.canonicalFlops().map(board => board.id);
  const outDir = auditOutputDir(options, deps.baseOutDir);
  deps.mkdirSync(outDir, { recursive: true });
  const reports = [];
  const profile = (options.profile ?? "standard") !== "standard";
  const extended = profile || !isDefaultProfile(options.tableProfile);
  for (const spotId of selectAuditSpotIds(options, deps.spots ?? POSTFLOP_SPOTS)) {
    const started = Date.now(), inputOptions = auditInputOptions(spotId, options);
    const prepared = prepareAuditSpot(spotId, options.street, inputOptions, deps);
    let report, resultName, status = prepared.status;
    if (status === "ready") {
      try {
        const { inputs, flop, later } = prepared;
        const identity = deps.allBoardIdentity(inputs, flop, later, options.street);
        const cache = deps.openBoardCheckpoints(join(outDir, "checkpoints"), identity, boardIds);
        const pending = boardIds.filter(id => !cache.rows.has(id));
        deps.log(`${spotId}: resume ${cache.rows.size}/${boardIds.length} checked boards; identity ${cache.key}`);
        const count = Math.min(options.workers, availableParallelism(), pending.length);
        const chunks = Array.from({ length: count }, (_, w) => pending.filter((_, i) => i % count === w));
        // All siblings must settle before another spot starts, even after a failure.
        const results = await Promise.allSettled(chunks.map(chunk => {
          const data = { ...makeAuditWorkerData(spotId, options, chunk), expectedIdentityHash: cache.key };
          return deps.runWorker(data, row => cache.write(row)).then(rows => {
            // Supports injected workers while enforcing the same checkpoint validation.
            for (const row of rows) cache.write(row);
            return rows;
          });
        }));
        const failure = results.find(result => result.status === "rejected");
        if (failure) throw failure.reason;
        if (cache.rows.size !== boardIds.length) throw new Error("Incomplete all-board audit");
        const final = prepareAuditSpot(spotId, options.street, inputOptions, deps);
        if (final.status !== "ready") throw new Error("All-board inputs/policies changed during execution");
        deps.assertAllBoardRunIdentity(final.inputs, final.flop, final.later, options.street, cache.key);
        const rows = boardIds.map(id => cache.rows.get(id));
        resultName = allBoardSummaryName(spotId, cache.key);
        report = summarizeAuditRows(spotId, options.street, rows);
        Object.assign(report, { identity_hash: cache.key, source_hash: inputs.fingerprint,
          policy_hash: flop.metadata.policy_hash, later_policy_hash: later?.metadata.policy_hash ?? null,
          unreachable: rows.filter(row => row.unreachable || row.status === "unreachable").length,
          evaluated_boards: rows.filter(row => !row.unreachable && row.status !== "unreachable").length,
          later_coverage: rows.reduce((total, row) => {
            for (const [key, value] of Object.entries(row.later_coverage ?? {})) total[key] = (total[key] ?? 0) + value;
            return total;
          }, {}) });
        status = report.errors ? "failed" : "passed";
        if (extended) Object.assign(report, { status, profile: options.profile, opponentSeat: prepared.inputs.opponentSeat ?? null, tableProfile: normalizeProfile(options.tableProfile),
          visitedBoards: rows.length, checkedBoards: rows.filter(row => !row.unreachable && row.status !== "unreachable").length,
          unreachableBoards: rows.filter(row => row.unreachable || row.status === "unreachable").length,
          unreachableBoardExamples: rows.filter(row => row.unreachable || row.status === "unreachable").slice(0, 5).map(row => row.board),
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
    if (resultName && report.identity_hash) deps.writeImmutableAllBoardOutput(join(outDir, resultName), `${JSON.stringify(report, null, 2)}\n`);
    else deps.writeFileSync(join(outDir, `${spotId}-incomplete.json`), `${JSON.stringify(report, null, 2)}\n`);
    reports.push({ ...report, status, ...(resultName ? { resultName } : {}) });
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
  // The mutable summary is only an index; completed reports are identity-specific.
  const detailed = extended || reports.some(report => report.status !== "passed");
  const md = ["# All-board balance audit (1,755 canonical flops; AI estimate, not GTO)", "",
    ...(detailed ? [`Profile: ${options.profile}; opponent seat: ${options.opponentSeat ?? "auto"}; table: ${profileKey(options.tableProfile ?? {})}.`,
      `Status: ${hasFailure ? "INCOMPLETE / FAILED" : "PASS"}. Passed: ${counters.passed}; failed: ${counters.failed}; NOT GENERATED (未生成): ${counters.missing}; unreachable spots: ${counters.unreachable}; error findings: ${counters.errors}; warnings: ${counters.warnings}.`,
      ...(profile ? ["Profile advisories are rule-level, not range-weighted board-quality measurements. Each compatible canonical flop receives a root-reach check; later policies receive structural checks, not an exhaustive turn/river runout scan."] : []), ""] : []),
    detailed ? "| spot | status | boards visited | boards checked | unreachable boards | clean | error findings | most common finding / reason |" : "| spot | boards | unreachable | clean | error findings | most common finding |",
    detailed ? "|---|---|---:|---:|---:|---:|---:|---|" : "|---|---:|---:|---:|---:|---|",
    ...reports.map(s => {
      const label = s.resultName ? `[${s.spot}](${s.resultName})` : s.spot;
      const note = s.error?.message ?? (s.findings[0] ? `${s.findings[0].key} (${s.findings[0].boards})` : "—");
      return detailed ? `| ${label} | ${s.status === "not_generated" ? "NOT GENERATED (未生成)" : s.status} | ${s.boards} | ${s.checkedBoards ?? s.boards} | ${s.unreachableBoards ?? 0} | ${s.clean} | ${s.errors} | ${note} |`
        : `| ${label} | ${s.boards} | ${s.unreachable ?? 0} | ${s.clean} | ${s.errors} | ${note} |`;
    })];
  deps.writeFileSync(join(outDir, "summary.md"), `${md.join("\n")}\n`);
  if (detailed) deps.writeFileSync(join(outDir, "summary.json"), `${JSON.stringify({ profile: options.profile,
    opponentSeat: options.opponentSeat ?? "auto", tableProfile: normalizeProfile(options.tableProfile), street: options.street, canonicalBoards: boardIds.length,
    status: hasFailure ? "incomplete" : "passed", counters }, null, 2)}\n`);
  return { outDir, reports, counters, exitCode: hasFailure ? 1 : 0 };
}

if (!isMainThread) {
  try {
    auditBoards(workerData.spotId, workerData.street, workerData.boardIds, workerData.inputOptions, {}, {
      onBoard: row => parentPort.postMessage({ type: "checkpoint", row }), expectedIdentityHash: workerData.expectedIdentityHash,
    });
    parentPort.postMessage({ type: "done" });
  }
  catch (error) { parentPort.postMessage({ auditError: describeError(error, error.stage) }); }
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = (await runAllBoardsAudit(parseAuditArgs(process.argv.slice(2)))).exitCode; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
