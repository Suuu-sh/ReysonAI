// Focused extraction parity only. This never creates numerical acceptance evidence.
// The oracle must be the immutable accepted serial run, not the refactored checkout.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditFileRecord, captureAuditIdentity, captureSourceGraph, identityHash, AUDIT_REPOSITORY } from './audit-identity.mjs';
import { reviewedSourcePaths } from './reviewed-postflop.mjs';

const EXPECTED_PIN_SHA256 = '73b2c961984c23019244c59c7bff2ebb96b6271b748eaba98f9f173ddd8851a2';
const EXPECTED_ORACLE_IDENTITY = '06f17321645b2bc95ec6b378eb033dc3bbe5e12e31ab30ebc8be83b98cfeaa1c';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const runnerSha256 = sha(readFileSync(new URL(import.meta.url)));
const opts = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (key === '--r1-only' && !opts[key]) { opts[key] = true; continue; }
  if (!['--oracle-root', '--instrumented-oracle-root', '--candidate-root', '--pin', '--output'].includes(key) || !process.argv[i + 1] || opts[key]) throw new Error('Use --oracle-root <immutable repository> --pin <accepted pin.json> [--instrumented-oracle-root <exact-prefix private-export copy>] [--candidate-root <frozen candidate>] [--r1-only] [--output <new parity JSON>]');
  opts[key] = process.argv[++i];
}
if (!opts['--oracle-root'] || !opts['--pin']) throw new Error('Immutable oracle root and exact accepted pin are required');
const candidateRoot = resolve(opts['--candidate-root'] ?? AUDIT_REPOSITORY);
const oracleRoot = resolve(opts['--oracle-root']), pinBytes = readFileSync(resolve(opts['--pin']));
assert.equal(sha(pinBytes), EXPECTED_PIN_SHA256, 'Oracle pin bytes must be the independently accepted run');
const pin = JSON.parse(pinBytes);
assert.equal(identityHash(pin.audit_identity), EXPECTED_ORACLE_IDENTITY);
function validateOracle() {
  for (const record of [...pin.sources, ...pin.inputs]) assert.deepEqual(auditFileRecord(oracleRoot, record.path), record, record.path);
  assert.deepEqual(captureAuditIdentity({ root: oracleRoot }), pin.audit_identity, 'Oracle graph must match its immutable pin');
}
validateOracle();
const candidateRoots = ['apps/frontend/src/estimated/postflop-trial.ts', 'apps/frontend/scripts/postflop-ai/street-state.mjs'];
const candidateStart = captureSourceGraph({ root: candidateRoot, roots: candidateRoots }), auditStart = captureAuditIdentity({ root: candidateRoot });
const allBoardRoot = 'apps/frontend/scripts/postflop-ai/audit-all-boards.mjs';
assert.deepEqual(captureSourceGraph({ root: candidateRoot, roots: [allBoardRoot] }), captureSourceGraph({ root: oracleRoot, roots: [allBoardRoot] }), 'Minimal extraction must preserve every all-board source byte');
for (const input of pin.inputs) assert.deepEqual(auditFileRecord(candidateRoot, input.path), input, input.path);
assert.ok(auditStart.sources.some(row => row.path.endsWith('/street-state.mjs')));
assert.ok(!auditStart.sources.some(row => row.path.endsWith('/postflop-trial.ts')));
assert.ok(reviewedSourcePaths(candidateRoot).includes('apps/frontend/src/estimated/postflop-trial.ts'));
const imported = async (root, path) => import(pathToFileURL(resolve(root, path)).href);
const old = await imported(oracleRoot, 'apps/frontend/src/estimated/postflop-trial.ts');
const ui = await imported(candidateRoot, 'apps/frontend/src/estimated/postflop-trial.ts');
const core = await imported(candidateRoot, 'apps/frontend/scripts/postflop-ai/street-state.mjs');
const oldSpots = await imported(oracleRoot, 'apps/frontend/scripts/postflop-ai/spots.mjs');
const nextSpots = await imported(candidateRoot, 'apps/frontend/scripts/postflop-ai/spots.ts');
const oldInputs = await imported(oracleRoot, 'apps/frontend/scripts/postflop-ai/inputs.mjs');
const nextInputs = await imported(candidateRoot, 'apps/frontend/scripts/postflop-ai/inputs.mjs');
assert.deepEqual(nextSpots.POSTFLOP_SPOTS, oldSpots.POSTFLOP_SPOTS);
const spots = oldSpots.POSTFLOP_SPOTS.filter(spot => spot.reachable);
assert.equal(spots.filter(spot => spot.history).length, 407);
assert.equal(spots.filter(spot => !spot.history).length, 45);
const contextFor = spot => ({ spotId: spot.id, ip: spot.ip, oop: spot.oop, potBb: spot.potBb, stackBb: spot.stackBb, tree: spot.tree, pilotAvailable: true });
const counts = { spots: 0, geometries: 0, flop_paths: 0, turn_paths: 0, river_paths: 0, option_decisions: 0, invalid_paths: 0, boundary_paths: 0, later_blocks: 0, raw_alias_cases: 0, r1_cases: 0 };
const oracleDigest = createHash('sha256');
function parity(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  oracleDigest.update(JSON.stringify([label, expected]) + '\n');
}
const optionShape = options => options.map(({ action, amountBb, allIn, aliases }) => ({ action, amountBb, allIn, ...(aliases === undefined ? {} : { aliases }) }));
const decisionShape = ({ history, labels, labelsJa, options, ...rest }) => ({ ...rest, ...(options ? { options: optionShape(options) } : {}) });
function checkOptions(street, replayed, spot) {
  if (!replayed.state.node) return;
  counts.option_decisions++;
  const facts = core.decisionOptionFacts(replayed.chipsNow, replayed.state.node, street);
  for (const locale of ['en', 'ja']) parity(`${street} ${spot.id} option facts ${locale}`, optionShape(facts), optionShape(old.decisionOptions(replayed.chipsNow, replayed.state.node, street, locale)));
}
const r1Spot = spots.find(spot => spot.id === pin.spots[0].id);
const r1Start = { pot: 10, stacks: { ip: 0, oop: 10 }, lastAggressor: 'oop' };
function r1Probe() {
  for (const actions of [[], ['allin']]) {
    const expected = old.laterDecision('river', actions, r1Start, r1Spot);
    parity(`R1 zero-stack river ${actions}`, ui.laterDecision('river', actions, r1Start, r1Spot), expected);
    for (const locale of ['en', 'ja']) {
      const replay = old.replayLater('river', actions, r1Start, r1Spot);
      if (replay.state.node) parity(`R1 zero-stack options ${actions} ${locale}`, ui.decisionOptions(replay.chipsNow, replay.state.node, 'river', locale), old.decisionOptions(replay.chipsNow, replay.state.node, 'river', locale));
    }
    counts.r1_cases++;
  }
}
r1Probe();
if (opts['--r1-only']) {
  validateOracle();
  assert.deepEqual(captureSourceGraph({ root: candidateRoot, roots: candidateRoots }), candidateStart);
  assert.equal(sha(readFileSync(new URL(import.meta.url))), runnerSha256, 'Runner changed during R1 parity');
  const result = { kind: 'focused-r1-immutable-old-module-parity-not-numerical-acceptance', status: 'pass', candidate_root: candidateRoot,
    runner_sha256: runnerSha256, oracle_pin_sha256: EXPECTED_PIN_SHA256, candidate_sources: candidateStart, cases: counts.r1_cases, oracle_projection_sha256: oracleDigest.digest('hex') };
  if (opts['--output']) writeFileSync(resolve(opts['--output']), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(`STREET_STATE_R1 ${JSON.stringify(result)}`);
  process.exit(0);
}
if (!opts['--instrumented-oracle-root']) throw new Error('Full private flop-prefix parity requires the exact-prefix instrumented old oracle');
const instrumentedRoot = resolve(opts['--instrumented-oracle-root']);
const PRIVATE_EXPORT_SUFFIX = Buffer.from('\nexport { replay as __immutableFlopReplay };\n');
const PRIVATE_ORACLE_PATH = 'apps/frontend/src/estimated/postflop-trial.ts';
function validateInstrumentedOracle() {
  for (const record of [...pin.sources, ...pin.inputs]) {
    if (record.path !== PRIVATE_ORACLE_PATH) assert.deepEqual(auditFileRecord(instrumentedRoot, record.path), record);
    else {
      auditFileRecord(instrumentedRoot, record.path); // Reject symlink/missing/escaped provenance.
      const bytes = readFileSync(resolve(instrumentedRoot, record.path));
      assert.equal(bytes.length, record.bytes + PRIVATE_EXPORT_SUFFIX.length);
      assert.equal(sha(bytes.subarray(0, record.bytes)), record.sha256);
      assert.ok(bytes.subarray(record.bytes).equals(PRIVATE_EXPORT_SUFFIX));
    }
  }
}
validateInstrumentedOracle();
const instrumentedOld = await imported(instrumentedRoot, PRIVATE_ORACLE_PATH);
function checkFlopFacts(actions, spot, key) {
  const { trace, ...facts } = core.replayFlop(actions, spot);
  const { history, ...expected } = instrumentedOld.__immutableFlopReplay(actions, spot);
  parity(`${key} full private flop facts`, facts, expected);
}
function outcome(call) {
  try { return { value: call() }; } catch (error) { return { error: error.message }; }
}
function rejectCase(key, oldCall, uiCall, coreCall) {
  const expected = outcome(oldCall);
  assert.ok(expected.error, `Immutable oracle must reject ${key}`);
  parity(`${key} UI rejection`, outcome(uiCall), expected);
  parity(`${key} core rejection`, outcome(coreCall), expected);
  counts.invalid_paths++;
}
const geometryGroups = new Map();
for (const spot of spots) {
  counts.spots++;
  parity(`${spot.id} input`, nextInputs.loadInputs(spot.id), oldInputs.loadInputs(spot.id));
  const context = contextFor(spot);
  parity(`${spot.id} entry`, ui.flopDecision([], context), old.flopDecision([], context));
  parity(`${spot.id} geometry`, core.postflopGeometry(context), { ...context, ...(spot.history ? { history: spot.history } : {}), tree: spot.tree });
  parity(`${spot.id} dispatch`, ui.hasObservablePostflopActions(context), old.hasObservablePostflopActions(context));
  // All452 IDs/input fingerprints/entry dispatch were checked above. Chip replay depends
  // only on these exact fields; identical geometries can share exhaustive local paths.
  const key = JSON.stringify([spot.ip, spot.oop, spot.potBb, spot.stackBb, spot.tree, Boolean(spot.history)]);
  if (!geometryGroups.has(key)) geometryGroups.set(key, spot);
}
function walk(decisionFor, visit) {
  const queue = [[]];
  for (let i = 0; i < queue.length; i++) {
    const actions = queue[i];
    assert.ok(actions.length <= 12 && queue.length < 10000, 'Unexpected unbounded local action tree');
    const decision = decisionFor(actions);
    visit(actions, decision);
    if (decision.node) for (const option of decision.options) queue.push([...actions, option.action]);
  }
}
for (const spot of geometryGroups.values()) {
  counts.geometries++;
  const turnStarts = new Map(), riverStarts = new Map();
  const remember = (map, start, path) => { if (start && !map.has(JSON.stringify(start))) map.set(JSON.stringify(start), { start, ...path }); };
  const compareBlocks = (key, options) => {
    parity(`${key} later blocks`, ui.buildLaterActionBlocks(options, spot), old.buildLaterActionBlocks(options, spot));
    counts.later_blocks++;
  };
  function flopAliasMatrix(actions, decision) {
    if (!decision.node) {
      rejectCase(`${spot.id} flop completed suffix ${actions}`, () => old.flopDecision([...actions, 'check'], spot),
        () => ui.flopDecision([...actions, 'check'], spot), () => core.replayFlop([...actions, 'check'], spot));
      return;
    }
    for (const option of decision.options) for (const alias of option.aliases ?? []) {
      if (alias === option.action) continue;
      const raw = [...actions, alias], key = `${spot.id} flop raw ${raw}`;
      parity(`${key} decision`, outcome(() => ui.flopDecision(raw, spot)), outcome(() => old.flopDecision(raw, spot)));
      parity(`${key} blocks`, outcome(() => ui.buildFlopActionBlocks(raw, spot)), outcome(() => old.buildFlopActionBlocks(raw, spot)));
      checkFlopFacts(raw, spot, key); counts.raw_alias_cases++;
      // The old compatibility path can turn an impossible raise into call;
      // compare both the effective-call path and a forbidden suffix after it.
      for (const suffix of [['raise'], ['raise', 'fold'], ['call', 'check']]) {
        const extended = [...raw, ...suffix], expected = outcome(() => old.flopDecision(extended, spot));
        parity(`${key} suffix ${suffix}`, outcome(() => ui.flopDecision(extended, spot)), expected);
        if (expected.error) {
          parity(`${key} core suffix ${suffix}`, outcome(() => core.replayFlop(extended, spot)), expected);
          counts.invalid_paths++;
        } else checkFlopFacts(extended, spot, `${key} suffix ${suffix}`);
      }
    }
  }
  walk(actions => old.flopDecision(actions, spot), (actions, expected) => {
    counts.flop_paths++;
    const key = `${spot.id} flop ${actions}`;
    parity(key, ui.flopDecision(actions, spot), expected);
    parity(`${key} blocks`, ui.buildFlopActionBlocks(actions, spot), old.buildFlopActionBlocks(actions, spot));
    checkFlopFacts(actions, spot, key);
    const start = old.laterStart(actions, spot);
    parity(`${key} next`, core.laterStart(actions, spot), start);
    const replay = core.replayFlop(actions, spot);
    if (expected.node) checkOptions('flop', replay, spot);
    else compareBlocks(`${key} pending turn/fold/allin`, { flopActions: actions });
    remember(turnStarts, start, { flopActions: actions });
    flopAliasMatrix(actions, expected);
  });
  function checkStreet(street, actions, record, compareAliases = true) {
    const { start, flopActions, turnActions } = record;
    counts[`${street}_paths`]++;
    const key = `${spot.id} ${street} ${JSON.stringify(start)} ${actions}`;
    const expected = old.replayLater(street, actions, start, spot);
    parity(`${key} replay UI`, ui.replayLater(street, actions, start, spot), expected);
    const { trace, ...numeric } = core.replayLater(street, actions, start, spot), { history, ...oldNumeric } = expected;
    parity(`${key} replay facts`, numeric, oldNumeric);
    const decision = old.laterDecision(street, actions, start, spot);
    parity(`${key} decision UI`, ui.laterDecision(street, actions, start, spot), decision);
    parity(`${key} decision facts`, decisionShape(core.laterDecisionState(street, actions, start, spot)), decisionShape(decision));
    const options = street === 'turn' ? { flopActions, turnCard: '9h', turnActions: actions }
      : { flopActions, turnCard: '9h', turnActions, riverCard: 'Jd', riverActions: actions };
    compareBlocks(key, options);
    checkOptions(street, expected, spot);
    if (street === 'turn' && expected.state.end && !expected.state.end.winner && expected.stacks.ip > 0 && expected.stacks.oop > 0) {
      remember(riverStarts, { pot: expected.pot, stacks: expected.stacks, lastAggressor: expected.lastAggressor }, { flopActions, turnActions: actions });
    }
    if (!compareAliases) return;
    if (!decision.node) {
      rejectCase(`${key} completed suffix`, () => old.replayLater(street, [...actions, 'check'], start, spot),
        () => ui.replayLater(street, [...actions, 'check'], start, spot), () => core.replayLater(street, [...actions, 'check'], start, spot));
    } else for (const option of decision.options) for (const alias of option.aliases ?? []) {
      if (alias === option.action) continue;
      const raw = [...actions, alias];
      checkStreet(street, raw, record, false); counts.raw_alias_cases++;
      for (const suffix of [['raise'], ['raise', 'fold'], ['call', 'check']]) {
        const extended = [...raw, ...suffix], expected = outcome(() => old.replayLater(street, extended, start, spot));
        const actual = outcome(() => ui.replayLater(street, extended, start, spot));
        parity(`${key} raw ${alias} suffix ${suffix} UI`, actual, expected);
        if (expected.error) {
          parity(`${key} raw ${alias} suffix ${suffix} core`, outcome(() => core.replayLater(street, extended, start, spot)), expected);
          counts.invalid_paths++;
        } else checkStreet(street, extended, record, false);
      }
    }
  }
  for (const record of turnStarts.values()) {
    compareBlocks(`${spot.id} pending turn ${JSON.stringify(record.start)}`, { flopActions: record.flopActions });
    walk(actions => old.laterDecision('turn', actions, record.start, spot), actions => checkStreet('turn', actions, record));
  }
  for (const record of riverStarts.values()) {
    compareBlocks(`${spot.id} pending river ${JSON.stringify(record.start)}`, { flopActions: record.flopActions, turnCard: '9h', turnActions: record.turnActions });
    walk(actions => old.laterDecision('river', actions, record.start, spot), actions => checkStreet('river', actions, record));
  }
  for (const street of ['turn', 'river']) rejectCase(`${spot.id} ${street} missing start`, () => old.replayLater(street, [], null, spot),
    () => ui.replayLater(street, [], null, spot), () => core.replayLater(street, [], null, spot));
  const invalidStart = { pot: spot.potBb, stacks: { ip: spot.stackBb, oop: spot.stackBb }, lastAggressor: null };
  rejectCase(`${spot.id} invalid street`, () => old.replayLater('preflop', [], invalidStart, spot),
    () => ui.replayLater('preflop', [], invalidStart, spot), () => core.replayLater('preflop', [], invalidStart, spot));
  console.log(`PARITY_GEOMETRY ${counts.geometries}/${geometryGroups.size} ${spot.id} ${JSON.stringify(counts)}`);
}
// Exercise legacy/new-HU rounding and effective caps at ±one cent around the
// 67% merge boundary, unequal stacks, a zero-stack opponent and a one-cent call.
const boundaryStarts = [
  { pot: 20.27, stacks: { ip: 10, oop: 10 }, lastAggressor: null },
  { pot: 20.30, stacks: { ip: 10, oop: 10 }, lastAggressor: 'ip' },
  { pot: 20.34, stacks: { ip: 10, oop: 10 }, lastAggressor: 'oop' },
  { pot: 10.05, stacks: { ip: 90, oop: 89.99 }, lastAggressor: null },
  { pot: 10, stacks: { ip: 10, oop: 0.01 }, lastAggressor: 'ip' },
  { pot: 10, stacks: { ip: 0, oop: 10 }, lastAggressor: 'oop' },
];
for (const spot of [oldSpots.spotById('BTN_open_BB_call'), spots.find(item => item.id === pin.spots[0].id)]) {
  for (const street of ['turn', 'river']) for (const start of boundaryStarts) {
    walk(actions => old.laterDecision(street, actions, start, spot), actions => {
      counts.boundary_paths++;
      const key = `boundary ${spot.id} ${street} ${JSON.stringify(start)} ${actions}`;
      parity(`${key} UI`, ui.laterDecision(street, actions, start, spot), old.laterDecision(street, actions, start, spot));
      const { trace, ...facts } = core.replayLater(street, actions, start, spot), { history, ...expected } = old.replayLater(street, actions, start, spot);
      parity(`${key} facts`, facts, expected);
    });
  }
}
// Existing import aliases and suffix rejection must remain identical.
const representative = spots.find(spot => spot.id === pin.spots[0].id), ctx = contextFor(representative);
const flopStart = old.laterStart(['bet33', 'call'], ctx), turn = old.replayLater('turn', ['bet75', 'call'], flopStart, ctx);
const riverStart = { pot: turn.pot, stacks: turn.stacks, lastAggressor: turn.lastAggressor };
for (const actions of [['check','bet33'],['check','bet75'],['check','bet125'],['check','allin'],['check','bet75','raise']]) {
  parity(`river aliases ${actions}`, ui.laterDecision('river', actions, riverStart, ctx), old.laterDecision('river', actions, riverStart, ctx));
  parity(`river canonical ${actions}`, core.canonicalStreetActions('river', actions, riverStart, ctx), old.canonicalStreetActions('river', actions, riverStart, ctx));
}
for (const actions of [['check','allin','raise'],['check','bet75','raise','fold'],['check','bet75','call','check']]) {
  let expected;
  try { old.replayLater('river', actions, riverStart, ctx); } catch (error) { expected = error; }
  assert.ok(expected, `oracle must reject ${actions}`);
  assert.throws(() => core.replayLater('river', actions, riverStart, ctx), error => error.message === expected.message);
  assert.throws(() => ui.replayLater('river', actions, riverStart, ctx), error => error.message === expected.message);
  counts.invalid_paths++;
}
validateOracle();
validateInstrumentedOracle();
assert.deepEqual(captureSourceGraph({ root: candidateRoot, roots: candidateRoots }), candidateStart, 'Candidate changed during parity');
assert.deepEqual(captureAuditIdentity({ root: candidateRoot }), auditStart, 'Numerical/input graph changed during parity');
assert.equal(sha(readFileSync(new URL(import.meta.url))), runnerSha256, 'Runner changed during parity');
const result = { schema_version: 1, kind: 'focused-chip-path-extraction-parity-not-numerical-acceptance', status: 'pass',
  runner_sha256: runnerSha256, oracle_pin_sha256: EXPECTED_PIN_SHA256, oracle_audit_identity: EXPECTED_ORACLE_IDENTITY,
  instrumented_private_export: { original_path: PRIVATE_ORACLE_PATH, original_sha256: pin.sources.find(row => row.path === PRIVATE_ORACLE_PATH).sha256, suffix_sha256: sha(PRIVATE_EXPORT_SUFFIX), scope: 'Exact original bytes plus export-only suffix; focused parity only.' },
  candidate_audit_identity: identityHash(auditStart), candidate_sources: candidateStart, counts, oracle_projection_sha256: oracleDigest.digest('hex'),
  all_board_sources_unchanged: true, scope: 'Exact immutable-old-module output parity only; full simulation, fresh replay, official all-board gate, independent review and publication approval remain required.' };
if (opts['--output']) writeFileSync(resolve(opts['--output']), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(`STREET_STATE_PARITY ${JSON.stringify(result)}`);
