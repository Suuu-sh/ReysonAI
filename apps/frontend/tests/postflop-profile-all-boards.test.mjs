import test, { after } from "node:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { join } from "node:path";
import { openBoardCheckpoints } from "../scripts/postflop-ai/all-board-checkpoints.mjs";
import { sha } from "../scripts/postflop-ai/browser-inputs.ts";
import {
  parseAuditArgs, auditInputOptions, auditOutputDir, selectAuditSpotIds, prepareAuditSpot,
  auditBoards, makeAuditWorkerData, runAllBoardsAudit, summarizeAuditRows,
} from "../scripts/postflop-ai/audit-all-boards.mjs";
import { canonicalFlops } from "../scripts/postflop-ai/flop-isomorphism.ts";
import { POSTFLOP_SPOTS } from "../scripts/postflop-ai/spots.ts";
import { loadInputs } from "../scripts/postflop-ai/inputs.mjs";
import { defaultOpponentSeat } from "../src/estimated/postflop-profile-state.ts";
import { parseCards } from "../scripts/postflop-ai/model.ts";
import { referencePolicyFor } from "../scripts/postflop-ai/policy.ts";

const spotId = "BTN_open_BB_call";
const boards = canonicalFlops().slice(0, 2);
const ids = boards.map(board => board.id);
const base = loadInputs(spotId);
const policy = referencePolicyFor(base.spot.tree);
const options = args => parseAuditArgs(["--workers", "2", ...args]);
const checkpointRoots = [];
after(() => { for (const path of checkpointRoots) rmSync(path, { recursive: true, force: true }); });
const fake = (overrides = {}) => ({
  // Real identity/checkpoint validation remains enabled. Isolate only filesystem
  // location and output collection, rather than bypassing the acceptance gate.
  openBoardCheckpoints: (_path, identity, ids) => {
    const path = mkdtempSync(join(realpathSync(tmpdir()), "reyson-profile-board-checkpoints-"));
    checkpointRoots.push(path);
    return openBoardCheckpoints(path, identity, ids);
  },
  writeImmutableAllBoardOutput: (path, text) => overrides.writeFileSync(path, text),
  loadInputs: (_id, inputOptions) => ({ ...base, ...inputOptions }),
  loadCandidate: () => ({ policy, metadata: { policy_hash: sha(policy) } }),
  loadLaterCandidate: () => ({ policy: { fakeLater: true }, metadata: { policy_hash: sha({ fakeLater: true }) } }),
  canonicalFlops: () => boards, ...overrides,
});
const missing = (stage = "flop", role = "villain") => Object.assign(
  new Error(`profiles/nit/btn-bb-srp-v1-${role}-${stage === "later" ? "later-" : ""}policy: profile policy is not generated`),
  { code: "PROFILE_POLICY_MISSING" });

test("audit module is importable without starting an audit and retains default option identity", () => {
  const parsed = parseAuditArgs([]);
  assert.deepEqual(parsed.spots, []);
  assert.equal(parsed.street, "all");
  assert.equal(parsed.profile, "standard");
  assert.ok(parsed.workers >= 1);
  assert.deepEqual(auditInputOptions(spotId, parsed), {});
  assert.deepEqual(loadInputs(spotId, auditInputOptions(spotId, parsed)).seatRows, base.seatRows);
  assert.equal(loadInputs(spotId, auditInputOptions(spotId, parsed)).fingerprint, base.fingerprint);
  assert.equal(auditOutputDir(parsed, "/audit"), "/audit");
});

test("CLI normalizes actual table-profile levels and standard alias without inventing levels", () => {
  const parsed = options(["--profile", "station", "--street", "flop", "--table-profile", "high,standard", "--spot", spotId, "--spot", spotId]);
  assert.deepEqual(parsed.tableProfile, { call: "high", three_bet: "normal" });
  assert.deepEqual(parsed.spots, [spotId]);
  const inputOptions = auditInputOptions(spotId, parsed);
  assert.deepEqual(inputOptions, { opponentProfile: "station", opponentSeat: "ip", tableProfile: { call: "high", three_bet: "normal" } });
  assert.notDeepEqual(loadInputs(spotId, inputOptions).seatRows, base.seatRows);
  assert.match(auditOutputDir(parsed, "/audit"), /profiles\/station\/call_high__three_bet_normal$/);
  assert.equal(auditOutputDir(options(["--table-profile", "normal,normal"]), "/audit"), "/audit");
});

test("CLI rejects missing/unknown flags, spots, stages, profiles, seats and worker counts", () => {
  for (const args of [["--street", "turn"], ["--workers", "0"], ["--workers", "-1"], ["--workers", "1.5"],
    ["--workers", "NaN"], ["--workers", "Infinity"], ["--workers", "1756"], ["--spot", "unknown"],
    ["--profile", "bad"], ["--profile"], ["--unknown", "x"], ["--street", "--workers"],
    ["--table-profile", "high"], ["--table-profile", "low,normal,high"], ["--table-profile", "medium,normal"],
    ["--table-profile", ",high"], ["--opponent-seat", "ip"], ["--profile", "nit", "--opponent-seat", "SB"]]) {
    assert.throws(() => parseAuditArgs(args), undefined, args.join(" "));
  }
});

test("opponent defaults follow Stage B for every spot, including last aggressor and all limp branches", () => {
  for (const spot of POSTFLOP_SPOTS) {
    assert.equal(auditInputOptions(spot.id, options(["--profile", "lag"])).opponentSeat, defaultOpponentSeat({ spotId: spot.id }));
  }
  assert.equal(auditInputOptions(POSTFLOP_SPOTS.find(spot => spot.kind === "3bp" && spot.opener === "BTN" && spot.threeBettor === "BB").id, options(["--profile", "nit"])).opponentSeat, "oop");
  for (const spot of POSTFLOP_SPOTS.filter(spot => spot.kind === "limp")) {
    assert.equal(spot[auditInputOptions(spot.id, options(["--profile", "nit"])).opponentSeat], "BB");
  }
});

test("explicit profile opponent seat preserves auto default and has isolated output", () => {
  const explicit = options(["--profile", "station", "--opponent-seat", "oop"]);
  assert.equal(auditInputOptions(spotId, explicit).opponentSeat, "oop");
  assert.match(auditOutputDir(explicit, "/audit"), /opponent_oop$/);
  assert.notEqual(auditOutputDir(explicit, "/audit"), auditOutputDir(options(["--profile", "station"]), "/audit"));
});

test("nonstandard selections include registry-unreachable spots and actual reach comes from loadInputs", () => {
  assert.deepEqual(selectAuditSpotIds(parseAuditArgs([])), POSTFLOP_SPOTS.filter(spot => spot.reachable).map(spot => spot.id));
  const parsed = options(["--profile", "station"]);
  assert.ok(selectAuditSpotIds(parsed).includes("BTN_open_SB_call"));
  const flat = options(["--profile", "station", "--opponent-seat", "oop"]);
  const prepared = prepareAuditSpot("BTN_open_SB_call", "flop", auditInputOptions("BTN_open_SB_call", flat), {
    loadCandidate: () => ({ policy }),
  });
  assert.equal(prepared.status, "ready");
  assert.ok(prepared.inputs.seatRows.SB.some(row => row.freq > 0));
  assert.equal(prepareAuditSpot("BTN_open_SB_call", "flop", auditInputOptions("BTN_open_SB_call", parsed)).status, "unreachable");
  assert.ok(selectAuditSpotIds(options(["--table-profile", "normal,low"])).includes("BTN_open_SB_call"));
});

test("flop-only audit does not load or require later policy", () => {
  let laterCalls = 0;
  const deps = fake({ loadLaterCandidate: () => { laterCalls++; throw missing("later"); } });
  assert.equal(prepareAuditSpot(spotId, "flop", { opponentProfile: "nit", opponentSeat: "ip" }, deps).status, "ready");
  assert.equal(laterCalls, 0);
  const later = prepareAuditSpot(spotId, "all", {}, deps);
  assert.equal(later.status, "not_generated");
  assert.equal(later.error.stage, "later");
  assert.equal(later.error.role, "villain");
  assert.equal(laterCalls, 1);
});

test("missing policy is NOT GENERATED; stale, malformed and missing inputs stay failures", () => {
  const noPolicy = prepareAuditSpot(spotId, "flop", {}, fake({ loadCandidate: () => { throw missing("flop", "exploit"); } }));
  assert.equal(noPolicy.status, "not_generated");
  assert.equal(noPolicy.error.role, "exploit");
  assert.equal(noPolicy.error.stage, "flop");
  for (const error of [new Error("AI policy source is stale"), new SyntaxError("malformed JSON"),
    Object.assign(new Error("candidate is missing"), { code: "ENOENT" })]) {
    assert.equal(prepareAuditSpot(spotId, "flop", {}, fake({ loadCandidate: () => { throw error; } })).status, "failed");
  }
  for (const error of [new Error("missing or malformed profile source"), missing(),
    new Error("source geometry changed"), new Error("unreachable malformed data")]) {
    assert.equal(prepareAuditSpot(spotId, "flop", {}, fake({ loadInputs: () => { throw error; } })).status, "failed");
  }
  assert.equal(prepareAuditSpot(spotId, "later", {}, fake({ loadLaterCandidate: () => null })).status, "failed");
});

test("only precise loader adjusted-unreachable states are skipped before policy lookup", () => {
  const prepared = prepareAuditSpot(spotId, "flop", {}, fake({
    loadInputs: () => { throw new Error(`${spotId}: BTN saved history is unreachable after range adjustment`); },
    loadCandidate: () => assert.fail("must not read policy for an unreachable input"),
  }));
  assert.equal(prepared.status, "unreachable");
  assert.equal(prepared.error.stage, "input");
});

test("standard board checks retain both checker semantics and compact finding shape", () => {
  const calls = [];
  const deps = fake({
    checkFlopBalance: (_inputs, _policy, options) => { calls.push(["flop", options.boardList[0].id]); return { findings: [{ check: "overfold", severity: "warn", node: "bb_vs_33", detail: "omit from legacy output" }] }; },
    checkLaterBalance: (_inputs, _policy, _later, options) => { calls.push(["later", options.boardList[0].id]); return { findings: [{ check: "no-overrides", severity: "error", node: "turn_ip_first" }] }; },
    checkProfileBalance: () => assert.fail("standard must not use profile checks"),
  });
  const rows = auditBoards(spotId, "all", ids, {}, deps);
  assert.equal(calls.length, 4);
  assert.deepEqual(rows[0].findings, [{ check: "overfold", severity: "warn", node: "bb_vs_33", street: "flop", direction: undefined }]);
  assert.deepEqual(Object.keys(summarizeAuditRows(spotId, "all", rows)), ["spot", "street", "boards", "clean", "errors", "findings"]);
  assert.throws(() => auditBoards(spotId, "flop", ["unknown"], {}, deps), /Unknown canonical/);
});

test("profile checks visit each canonical identity with real root reach request, not standard MDF checks", () => {
  const calls = [];
  const rows = auditBoards(spotId, "all", ids, { opponentProfile: "nit", opponentSeat: "ip" }, fake({
    checkFlopBalance: () => assert.fail("must not enforce standard MDF"),
    checkLaterBalance: () => assert.fail("must not enforce standard MDF"),
    checkProfileBalance: (_inputs, _flop, later, options) => {
      calls.push(options); assert.deepEqual(later, { fakeLater: true });
      return { findings: [{ check: "profile-contradiction", severity: "warn", node: "btn_first", tier: "air", detail: "advisory" },
        { check: "air-allin", severity: "warn", node: "river_ip_first", tier: "air" }] };
    },
  }));
  assert.deepEqual(calls.map(call => call.boardList[0].id), ids);
  assert.deepEqual(calls.map(call => call.requestedPaths[0]), boards.map(board => ({ board: board.cards, path: { flop: [] } })));
  assert.equal(rows[0].findings[0].street, "flop");
  assert.equal(rows[0].findings[1].street, "later");
  assert.equal(rows[0].findings[0].detail, "advisory");
});

test("board-blocked root support is skipped, but unrelated structural errors stay failures", () => {
  const blocked = { check: "unreachable-branch", severity: "error", node: "requested-path-0", detail: "No compatible positive-weight holecard assignment reaches the requested decision" };
  const opts = { opponentProfile: "station", opponentSeat: "ip" };
  const deps = fake({ checkProfileBalance: () => ({ findings: [blocked] }) });
  const rows = auditBoards(spotId, "flop", ids, opts, deps);
  assert.ok(rows.every(row => row.status === "unreachable" && !row.findings.length));
  assert.equal(summarizeAuditRows(spotId, "flop", rows).clean, 0);
  const errorRows = auditBoards(spotId, "flop", ids, opts, fake({ checkProfileBalance: () => ({ findings: [blocked,
    { check: "profile-structure", severity: "error", node: "policy", detail: "illegal mix" }] }) }));
  assert.equal(summarizeAuditRows(spotId, "flop", errorRows).errors, 4);
});

test("all 1,755 canonical flops have unique identities and complete worker option propagation", () => {
  const all = canonicalFlops();
  assert.equal(all.length, 1755);
  assert.equal(new Set(all.map(board => board.id)).size, 1755);
  const parsed = options(["--profile", "maniac", "--opponent-seat", "oop", "--table-profile", "low,high", "--street", "flop"]);
  const data = makeAuditWorkerData(spotId, parsed, ids);
  assert.deepEqual(data, { spotId, street: "flop", boardIds: ids,
    inputOptions: { opponentProfile: "maniac", opponentSeat: "oop", tableProfile: { call: "low", three_bet: "high" } } });
});

test("audit continues missing/stale/unreachable spots, partitions reports and returns nonzero without real workers", async () => {
  const spotIds = [spotId, "UTG_open_BB_call", "HJ_open_BB_call", "CO_open_BB_call"];
  const parsed = options(["--profile", "nit", "--street", "flop", "--table-profile", "high,normal", ...spotIds.flatMap(id => ["--spot", id])]);
  const writes = new Map(), workerData = [], logs = [];
  const result = await runAllBoardsAudit(parsed, fake({
    baseOutDir: "/audit", mkdirSync: () => {}, writeFileSync: (path, text) => writes.set(path, text), log: text => logs.push(text),
    loadInputs: (id, inputOptions) => {
      if (id === spotIds[2]) throw new Error(`${id}: BB saved history is unreachable after range adjustment`);
      return { ...base, ...inputOptions, spot: { ...base.spot, id } };
    },
    loadCandidate: inputs => {
      if (inputs.spot.id === spotIds[0]) throw missing();
      if (inputs.spot.id === spotIds[1]) throw new Error("AI policy source is stale");
      return { policy, metadata: { policy_hash: sha(policy) } };
    },
    runWorker: async data => { workerData.push(data); return data.boardIds.map(board => ({ board, findings: [] })); },
  }));
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.reports.map(report => report.status), ["not_generated", "failed", "unreachable", "passed"], JSON.stringify(result.reports));
  assert.deepEqual(result.counters, { passed: 1, failed: 1, missing: 1, unreachable: 1, errors: 1, warnings: 0 });
  assert.equal(workerData.length, 2);
  assert.ok(workerData.every(data => data.inputOptions.opponentProfile === "nit" && data.inputOptions.tableProfile.call === "high"));
  assert.deepEqual(workerData.flatMap(data => data.boardIds).sort(), [...ids].sort());
  assert.ok(logs.some(text => text.includes("NOT GENERATED (未生成)")));
  const summary = writes.get(join(result.outDir, "summary.md"));
  assert.match(summary, /NOT GENERATED \(未生成\)/);
  assert.match(summary, /rule-level, not range-weighted/);
  assert.equal(JSON.parse(writes.get(join(result.outDir, "summary.json"))).counters.missing, 1);
  assert.ok([...writes.keys()].every(path => path.startsWith("/audit/profiles/nit/call_high__three_bet_normal/")));
});

test("successful standard reports and summary use immutable full identity with injected workers", async () => {
  const writes = new Map();
  const result = await runAllBoardsAudit(options(["--spot", spotId, "--street", "flop"]), fake({
    baseOutDir: "/audit", mkdirSync: () => {}, log: () => {}, writeFileSync: (path, text) => writes.set(path, text),
    runWorker: async data => data.boardIds.map(board => ({ board, findings: [] })),
  }));
  assert.equal(result.exitCode, 0, JSON.stringify(result.reports));
  const report = result.reports[0];
  assert.match(report.resultName, new RegExp(`^${spotId}--[a-f0-9]{64}\\.json$`));
  assert.equal(report.resultName, `${spotId}--${report.identity_hash}.json`);
  const saved = JSON.parse(writes.get(join(result.outDir, report.resultName)));
  assert.equal(saved.spot, spotId);
  assert.equal(saved.street, "flop");
  assert.equal(saved.boards, 2);
  assert.equal(saved.clean, 2);
  assert.equal(saved.errors, 0);
  assert.equal(saved.identity_hash, report.identity_hash);
  assert.equal(saved.source_hash, base.fingerprint);
  assert.equal(saved.policy_hash, sha(policy));
  assert.equal(saved.later_policy_hash, sha({ fakeLater: true }));
  assert.equal(saved.unreachable, 0);
  assert.equal(saved.evaluated_boards, 2);
  assert.deepEqual(saved.later_coverage, {});
  assert.deepEqual(saved.findings, []);
  assert.equal(writes.has(`/audit/${spotId}.json`), false);
  assert.equal(writes.get("/audit/summary.md"), `# All-board balance audit (1,755 canonical flops; AI estimate, not GTO)\n\n| spot | boards | unreachable | clean | error findings | most common finding |\n|---|---:|---:|---:|---:|---|\n| [${spotId}](${report.resultName}) | 2 | 0 | 2 | 0 | — |\n`);
  assert.equal(writes.size, 2);
});


test("real profile checker verifies compatible root support with board card removal", () => {
  const board = { id: "As7h2d", cards: parseCards("As7h2d", 3) };
  const deps = fake({ canonicalFlops: () => [board], loadInputs: (_id, inputOptions) => ({ ...base, ...inputOptions,
    seatRows: { [base.spot.ip]: [{ hand: "AA", freq: 100 }], [base.spot.oop]: [{ hand: "AA", freq: 100 }] } }) });
  const rows = auditBoards(spotId, "flop", [board.id], { opponentProfile: "nit", opponentSeat: "ip" }, deps);
  assert.equal(rows[0].status, "unreachable");
  deps.loadInputs = (_id, inputOptions) => ({ ...base, ...inputOptions,
    seatRows: { [base.spot.ip]: [{ hand: "AA", freq: 100 }], [base.spot.oop]: [{ hand: "KK", freq: 100 }] } });
  const supported = auditBoards(spotId, "flop", [board.id], { opponentProfile: "nit", opponentSeat: "ip" }, deps);
  assert.equal(supported[0].status, undefined);
  assert.equal(supported[0].findings.filter(f => f.severity === "error").length, 0);
});

test("profile later-only audit keeps root/flop structural errors but not flop advisories", () => {
  const rows = auditBoards(spotId, "later", ids, { opponentProfile: "nit", opponentSeat: "ip" }, fake({
    checkProfileBalance: () => ({ findings: [
      { check: "profile-contradiction", severity: "warn", node: "btn_first" },
      { check: "profile-structure", severity: "error", node: "policy" },
      { check: "air-allin", severity: "warn", node: "river_ip_first" },
    ] }),
  }));
  assert.deepEqual(rows[0].findings.map(f => f.check), ["profile-structure", "air-allin"]);
});

test("failed spot workers settle fully before the next spot starts", async () => {
  const secondId = "UTG_open_BB_call";
  const parsed = options(["--spot", spotId, "--spot", secondId, "--street", "flop"]);
  let siblingFinished = false;
  const result = await runAllBoardsAudit(parsed, fake({
    baseOutDir: "/audit", mkdirSync: () => {}, writeFileSync: () => {}, log: () => {},
    runWorker: data => {
      if (data.spotId === spotId) {
        if (data.boardIds.includes(ids[0])) return Promise.reject(new Error("worker failed"));
        return new Promise(resolve => setTimeout(() => { siblingFinished = true; resolve([]); }, 5));
      }
      assert.equal(siblingFinished, true);
      return Promise.resolve(data.boardIds.map(board => ({ board, findings: [] })));
    },
  }));
  assert.deepEqual(result.reports.map(report => report.status), ["failed", "passed"], JSON.stringify(result.reports));
  assert.equal(result.exitCode, 1);
});
