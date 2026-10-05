// Read-only preservation emitter. Run only through run-model11-preservation-bounded.py.
// The selected root supplies EVERY numerical/builder module; no artifact injection.
import assert from 'node:assert/strict';
import { readFileSync, writeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [rootArg, mode, groupArg, designArg] = process.argv.slice(2);
assert(rootArg && ['legacy45', 'all407'].includes(mode) && designArg, 'Runner arguments required');
const root = resolve(rootArg), group = Number(groupArg), design = JSON.parse(readFileSync(designArg, 'utf8'));
const source = name => import(pathToFileURL(join(root, 'apps/frontend/scripts/postflop-ai', name)).href);
// Do not import defence (or call any board/policy code) for the catalog-only workload.
const inputsApi = await source('inputs.mjs');
const spotsApi = await source('spots.mjs');
const engine = await source('engine.mjs');
const gameConfig = (await import(pathToFileURL(join(root, 'apps/frontend/src/estimated/sizing.ts')).href)).gameConfig;

// Retain field presence, typed-array values, non-finite values and signed zero.
// No functions, caches or circular internal objects are accepted as result fields.
function wire(value) {
  if (value === undefined) return { $undefined: true };
  if (typeof value === 'number') return Number.isNaN(value) ? { $number: 'NaN' }
    : !Number.isFinite(value) ? { $number: String(value) } : Object.is(value, -0) ? { $number: '-0' } : value;
  if (typeof value === 'bigint') return { $bigint: String(value) };
  if (ArrayBuffer.isView(value)) return Array.from(value, wire);
  if (Array.isArray(value)) return value.map(wire);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, wire(v)]));
  assert.notEqual(typeof value, 'function', 'Function in a declared result');
  return value;
}
const emit = record => writeSync(1, JSON.stringify(wire(record)) + '\n');
const errorOf = error => ({ name: error.name, subtype: error.constructor.name, message: error.message, code: error.code });
const attempt = fn => { try { return { status: 'ok', value: fn() }; } catch (error) { return { status: 'error', error: errorOf(error) }; } };
const tableOf = table => Object.fromEntries(Object.entries(table).filter(([key]) => !['put', 'other'].includes(key)));
const header = { kind: 'header', schema: 'hu-preservation-v3', mode, group: mode === 'legacy45' ? group : null,
  scope: mode === 'legacy45' ? 'full reach; representative laws; fixed-board seeded trajectories; not full law' : 'full catalog structured source/geometry outputs; no board or policy evaluation' };
emit(header);

if (mode === 'all407') {
  const expected = [...design.expectedUniqueIds].sort();
  const actual = spotsApi.POSTFLOP_SPOTS.filter(spot => spot.history).map(spot => spot.id).sort();
  assert.equal(expected.length, 407); assert.equal(new Set(actual).size, actual.length);
  assert.deepEqual(actual, expected, 'Exact 407-ID catalog required');
  for (const id of expected) {
    // Sources retain folded contributors and all their source factors/frequencies.
    // seatRows contains ONLY the surviving two seats; unknown folded cards are not blockers.
    const result = attempt(() => {
      const inputs = inputsApi.loadInputs(id), spot = inputs.spot, table = engine.createTable(spot);
      return { inputs, gameConfig, initialTable: tableOf(table), roles: { ip: spot.ip, oop: spot.oop },
        contributions: Object.entries(spot.contributionsBb).map(([seat, chips]) => ({ seat, chips,
          live: [spot.ip, spot.oop].includes(seat), factors: spot.ranges[seat] ?? [] })),
        deadChips: Object.entries(spot.contributionsBb).filter(([seat]) => ![spot.ip, spot.oop].includes(seat)).reduce((sum, [, chips]) => sum + chips, 0),
        foldedPrivateCards: 'unknown-not-used-as-blockers' };
    });
    emit({ kind: 'catalog', id, result });
    assert.equal(result.status, 'ok', `Catalog input failure: ${id}`);
  }
  emit({ kind: 'complete', mode, count: expected.length, ids: expected });
} else {
  assert(Number.isInteger(group) && group >= 1 && group <= 9);
  const cases = design.cases.filter(item => item.group === group);
  assert.equal(cases.length, 5);
  const defenceApi = await source('defence.mjs'), model = await source('model.mjs');
  const policyApi = await source('policy.mjs'), laterApi = await source('later-policy.mjs');
  const tree = await source('tree.mjs'), laterTree = await source('later-tree.mjs');
  const equityApi = await import(pathToFileURL(join(root, 'apps/frontend/scripts/lib/equity.mjs')).href);
  const fullBoard = model.parseCards('Jc9d4h2s8c', 5), flop = fullBoard.slice(0, 3);
  const seedStrings = ['hu-preservation-v1/alpha', 'hu-preservation-v1/beta', 'hu-preservation-v1/gamma', 'hu-preservation-v1/delta'];
  const bits = new DataView(new ArrayBuffer(8));
  function neighbor(value, direction) {
    if (value === 0) return direction > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;
    bits.setFloat64(0, value, false);
    bits.setBigUint64(0, bits.getBigUint64(0, false) + BigInt((value > 0 ? 1 : -1) * direction), false);
    return bits.getFloat64(0, false);
  }
  function boundarySamples(mix, actions) {
    let cumulative = 0;
    return actions.map(action => {
      cumulative += mix[action]; const at = cumulative / 100;
      return { afterAction: action, cumulative, boundary: at,
        samples: [-1, 0, 1].map(direction => {
          const random = direction ? neighbor(at, direction) : at;
          return { direction, random, inUnitInterval: random >= 0 && random < 1,
            // Endpoint/out-of-domain behavior retained separately, never called a legal draw.
            result: attempt(() => policyApi.choose(mix, random, actions)) };
        }) };
    });
  }
  function validIds(weights, board) {
    const out = [];
    for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) {
      const id = a * 52 + b;
      if (weights[id] > 0 && !board.includes(a) && !board.includes(b)) out.push(id);
    }
    return out;
  }
  for (const entry of cases) {
    const inputs = inputsApi.loadInputs(entry.spot), spot = inputs.spot;
    assert(!spot.history, 'old45 cannot use the model11 factory');
    const candidate = inputsApi.requireArtifact(spot, 'candidate');
    const laterCandidate = inputsApi.requireArtifact(spot, 'laterCandidate');
    const report = inputsApi.requireArtifact(spot, 'report');
    const policy = policyApi.validatePolicy(candidate.policy, spot.tree), laterPolicy = laterApi.validateLaterPolicy(laterCandidate.policy);
    const defence = defenceApi.defenceFor(inputs, policy, laterPolicy);
    assert.equal(defenceApi.defenceVersionFor(inputs), 6);
    assert.equal(inputs.fingerprint, entry.savedInputFingerprint);
    assert.equal(report.defence_version, 5);
    assert.equal(report.spot, spot.id);
    assert.equal(report.source_hash, inputs.fingerprint);
    assert.equal(candidate.metadata.source_hash, inputs.fingerprint);
    assert.equal(laterCandidate.metadata.source_hash, inputs.fingerprint);
    emit({ kind: 'case', id: spot.id, caseNumber: entry.caseNumber, originalArtifacts: entry.originalArtifacts,
      savedReportDefenceVersion: entry.savedReportDefenceVersion, numericalFactoryVersion: defenceApi.defenceVersionFor(inputs),
      inputs, candidateMetadata: candidate.metadata, laterMetadata: laterCandidate.metadata, savedReport: report,
      corpus: { positive: 'first8 canonical positive-own-reach', zero: 'first2 canonical base-supported zero-own-reach', seeds: seedStrings, dealsPerSeed: 8 } });
    const called = ['bet33', 'call'];
    const prefixes = [
      ['flop-root', 3, { flop: [] }], ['flop-facing33', 3, { flop: ['bet33'] }],
      ['flop-facing-raise', 3, { flop: ['bet33', 'raise'] }],
      ['turn-root', 4, { flop: called, turn: [] }], ['turn-facing33', 4, { flop: called, turn: ['bet33'] }],
      ['river-root', 5, { flop: called, turn: ['check', 'check'], river: [] }],
      ['river-facing33', 5, { flop: called, turn: ['check', 'check'], river: ['bet33'] }],
    ];
    const coverage = { legalRoot: 0, legalFacing: 0, prefixes: 0, legalPrefixes: 0, errors: [], lawRows: 0,
      zeroOwnLawRows: 0, fallbackRows: 0, facingNullContext: 0, nonFacingNullContext: 0, equityNullRows: 0, trajectories: 0,
      boundarySamples: 0, gaps: [] };
    for (const [name, length, path] of prefixes) {
      const board = fullBoard.slice(0, length), replay = attempt(() => defenceApi.replayDecision(inputs, board, path));
      coverage.prefixes++;
      if (replay.status === 'error') {
        assert.equal(replay.error.subtype, 'DefencePathError', 'Unexpected implementation exception, not geometry unavailability');
        assert(['Flop actions do not reach the requested street', 'Flop actions do not reach a pending decision',
          'turn actions do not reach the requested street', 'river actions do not reach the requested street',
          'Actions do not reach a pending decision'].includes(replay.error.message), 'Unreviewed path failure');
        replay.classification = 'geometry-path-unavailable-requires-review';
        coverage.errors.push(name); emit({ kind: 'prefix', id: spot.id, name, board, path, result: replay }); continue;
      }
      const table = replay.value, pending = table.log.at(-1), node = pending.node;
      const actions = tree.NODES[node] ?? laterTree.LATER_NODES[node];
      assert(Object.isFrozen(actions), 'Numerical action order must be immutable');
      const beforeActions = [...actions];
      const ranges = Object.fromEntries([spot.ip, spot.oop].map(seat => [seat, defence.rangeOf(table, board, seat)]));
      const own = ranges[pending.seat], baseWeights = defence.baseWeights(pending.seat);
      const positive = validIds(own, board), baseIds = validIds(baseWeights, board);
      const zeros = baseIds.filter(id => own[id] === 0), selected = [...positive.slice(0, 8), ...zeros.slice(0, 2)];
      assert(positive.length > 0, 'A legal comparison requires positive own support');
      const context = defence.context(table, board, node), isFacing = defenceApi.isFacingNode(node);
      coverage.legalPrefixes++;
      if (name === 'flop-root') coverage.legalRoot++;
      if (name === 'flop-facing33') { assert(isFacing, 'Expected genuine facing prefix'); coverage.legalFacing++; }
      if (context === null) coverage[isFacing ? 'facingNullContext' : 'nonFacingNullContext']++;
      emit({ kind: 'prefix', id: spot.id, name, board, path, result: { status: 'ok', value: {
        table: tableOf(table), actionOrder: beforeActions, ranges, baseWeights,
        contextStatus: context === null ? 'null' : 'available', isFacing,
        requirement: defence.requirement(table, board, node),
        selection: { positiveAvailable: positive.length, zeroOwnAvailable: zeros.length, ids: selected,
          fullLawCoverage: false, bothSeatReachVectorSlots: 2704 } } } });
      for (const id of selected) {
        const combo = [Math.floor(id / 52), id % 52], base = defence.baseMix(table, board, node, combo);
        const mix = defence.mix(table, board, node, combo, base);
        const observableMix = defence.observableMix(table, board, node, combo, base);
        const facts = defence.facts(table, board, node, combo, base);
        const bettingFacts = defence.bettingFacts(table, board, node, combo);
        const equity = context ? defence.equity(context, combo) : null;
        const boundaries = boundarySamples(mix, actions);
        coverage.lawRows++; if (own[id] === 0) coverage.zeroOwnLawRows++;
        if (facts?.fallback === true) coverage.fallbackRows++;
        if (context && equity === null) coverage.equityNullRows++;
        coverage.boundarySamples += boundaries.length * 3;
        emit({ kind: 'law', id: spot.id, prefix: name, comboId: id, combo, ownReach: own[id], baseWeight: baseWeights[id],
          base, mix, observableMix, facts, bettingFacts, equity,
          equityStatus: !context ? 'context-null-not-requested' : equity === null ? 'unavailable' : 'available',
          actionOrder: [...actions], boundaries });
      }
      assert.deepEqual([...actions], beforeActions, 'Action order changed');
    }
    // These are exact parser/replay error probes, not fabricated successful paths.
    for (const [name, fn] of [
      ['duplicate-board', () => model.parseCards('JcJc4h', 3)],
      ['malformed-board', () => model.parseCards('Jx9d4h', 3)],
      ['wrong-board-length', () => model.parseCards('Jc9d', 3)],
      ['malformed-action', () => defenceApi.replayDecision(inputs, flop, { flop: ['not-an-action'] })],
      ['terminal-suffix', () => defenceApi.replayDecision(inputs, flop, { flop: ['bet33', 'fold', 'check'] })],
    ]) {
      const result = attempt(fn); emit({ kind: 'error-probe', id: spot.id, name, result });
      assert.equal(result.status, 'error', `Expected explicit error: ${name}`);
    }
    // Board-compatible saved preflop deal sampling; the board is fixed, not random.
    const ipSampler = inputsApi.makeSampler(inputsApi.seatRange(inputs, spot.ip, fullBoard));
    const oopSampler = inputsApi.makeSampler(inputsApi.seatRange(inputs, spot.oop, fullBoard));
    for (const seed of seedStrings) {
      const seedValue = equityApi.seedFor(`${seed}|${spot.id}`), generator = equityApi.seededRandom(seedValue);
      let seedCallIndex = 0;
      for (let deal = 0; deal < 8; deal++) {
        const randomCalls = [], decisions = []; let purpose = 'deal';
        const random = () => { const value = generator(); randomCalls.push({ index: randomCalls.length, seedCallIndex: seedCallIndex++, purpose, value }); return value; };
        const hands = inputsApi.samplePair(ipSampler, oopSampler, random, spot), table = engine.createTable(spot);
        assert(new Set([...hands[spot.ip], ...hands[spot.oop], ...fullBoard]).size === 9, 'Compatible fixed-board deal required');
        const decide = (seat, node, board) => {
          const base = defence.baseMix(table, board, node, hands[seat]);
          const mix = defence.mix(table, board, node, hands[seat], base);
          const actions = tree.NODES[node] ?? laterTree.LATER_NODES[node];
          purpose = `decision:${decisions.length}:${node}`;
          const draw = random(), action = policyApi.choose(mix, draw, actions);
          decisions.push({ seat, node, board: [...board], table: tableOf(table), base, mix, actionOrder: [...actions], draw, sampledLabel: action });
          // Snapshot now: the engine mutates its table/log immediately after return.
          decisions[decisions.length - 1] = wire(decisions.at(-1));
          return action;
        };
        const result = attempt(() => {
          engine.playFlop(table, spot.tree, (seat, node) => decide(seat, node, flop), inputs.config);
          engine.playLaterStreetsWithPolicy(table, flop, fullBoard.slice(3), (seat, node, board) => decide(seat, node, board), inputs.config);
          const beforeSettlement = wire(tableOf(table)), winner = engine.settle(table, hands, fullBoard);
          return { beforeSettlement, winner, afterSettlement: tableOf(table), rake: engine.rake(table.pot) };
        });
        emit({ kind: 'trajectory', id: spot.id, seed, seedValue, deal, board: fullBoard, hands, randomCalls, decisions, result });
        assert.equal(result.status, 'ok', 'Seeded trajectory failed'); coverage.trajectories++;
      }
    }
    if (!coverage.zeroOwnLawRows) coverage.gaps.push('No base-supported zero-own-reach law in selected prefixes');
    if (!coverage.fallbackRows) coverage.gaps.push('No equity-fallback law observed');
    if (!coverage.facingNullContext) coverage.gaps.push('No facing null-context observed');
    if (!coverage.equityNullRows) coverage.gaps.push('No unavailable ordinary equity observed');
    coverage.gaps.push('Representative laws only; unselected combos, boards, histories and broader fallback/edge regimes unexercised');
    assert.equal(coverage.legalRoot, 1); assert.equal(coverage.legalFacing, 1);
    assert.equal(coverage.trajectories, 32);
    emit({ kind: 'case-complete', id: spot.id, coverage });
    // Only the documented release between completed spots; cache/RSS lifecycle is not a parity claim.
    defence.releaseBoardCaches();
  }
  emit({ kind: 'complete', mode, count: cases.length, ids: cases.map(item => item.spot) });
}
