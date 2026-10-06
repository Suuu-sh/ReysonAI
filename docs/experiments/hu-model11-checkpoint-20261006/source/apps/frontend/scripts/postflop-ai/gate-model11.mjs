// Separate gate bridge: inherited balance logic, exact model11 execution and explicit blockers.
import { checkFlopBalance, checkLaterBalance } from './balance-model11-kernel.mjs';
import { createModel11Execution } from './execution-model11.mjs';
import { EffectiveReachError, requestBeforeEntry } from './decision-prefix.mjs';
import { canonicalJson, contentHash, freezeSnapshot } from './effective-law-identity.mjs';
import { comboRange } from './browser-inputs.mjs';
import { comboId } from './defence.mjs';
import { verifyZeroLikelihoodProof } from './model11-zero-proof.mjs';
const fail = message => { throw new EffectiveReachError('invalid-gate-adapter', message); };
export const MODEL11_BALANCE_GATE_ADAPTER_VERSION = 2;

// A conservative key for the fresh request derived from the live gate table.
// Unusual array shapes bypass reuse and retain the original prefix validation.
// Read data descriptors rather than invoking getters while deciding reuse.
function gateRequestKey(request) {
  const values = (array, valid) => {
    if (!Array.isArray(array) || Object.getPrototypeOf(array) !== Array.prototype ||
        Object.getOwnPropertySymbols(array).length || Object.getOwnPropertyNames(array).length !== array.length + 1) return null;
    const out = [];
    for (let index = 0; index < array.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(array, index);
      if (!descriptor?.enumerable || !('value' in descriptor) || !valid(descriptor.value)) return null;
      out.push(descriptor.value);
    }
    return out;
  };
  const board = values(request.board, card => Number.isInteger(card) && card >= 0 && card < 52);
  if (!board || ![3, 4, 5].includes(board.length) || new Set(board).size !== board.length) return null;
  const paths = ['flop', 'turn', 'river'].map(street => values(request.path[street], action => typeof action === 'string'));
  if (paths.some(path => path === null)) return null;
  return JSON.stringify([board, ...paths]);
}

export function createModel11BalanceFacade(inputs, flopArtifact, laterArtifact) {
  const execution = createModel11Execution(inputs, flopArtifact, laterArtifact);
  const seatRows = freezeSnapshot(inputs.seatRows), observed = new Map();
  // One last-request slot, bounded independently of the coverage report. Table
  // identity is never a cache key: every call derives the current public input.
  let last = null;
  const releaseBoardCaches = () => { last = null; execution.releaseBoardCaches(); };
  const inspect = (table, board, node = table?.log?.at(-1)?.node) => {
    const pending = table?.log?.at(-1);
    if (!pending || pending.action !== null || pending.boardLen !== board.length) fail('A genuine pending public decision is required');
    const request = requestBeforeEntry(table, board, pending), requestKey = gateRequestKey(request);
    const previous = requestKey !== null && last?.requestKey === requestKey ? last : null;
    const prepared = requestKey === null ? null : previous?.prepared ?? execution.prepareRequest(request);
    const prefix = prepared?.prefix ?? execution.prefix(request);
    if (prefix.pending.node !== node || prefix.pending.seat !== pending.seat ||
        canonicalJson(prefix.geometry) !== canonicalJson({ pot: table.pot, stacks: table.stacks, invested: table.invested })) fail('Replayed public prefix does not match gate table geometry');
    const key = previous?.prefixIdentity ?? contentHash(prefix);
    if (!observed.has(key)) observed.set(key, { prefixIdentity: key, prefix, state: 'visited', methods: new Set(), lawStatuses: new Map() });
    last = requestKey === null ? null : { requestKey, prepared, prefixIdentity: key };
    return { request, prefix, prepared, row: observed.get(key) };
  };
  const call = (method, table, board, node, body) => {
    const inspected = inspect(table, board, node); inspected.row.methods.add(method);
    try { return body(inspected); }
    catch (error) {
      if (error instanceof EffectiveReachError && error.status === 'off-model-observed-action' && error.zeroLikelihoodProof &&
          ['context', 'requirement', 'rangeItems'].includes(method)) {
        const verification = verifyZeroLikelihoodProof(execution, error.zeroLikelihoodProof, inspected.request);
        inspected.row.zeroLikelihoodVerification = verification;
        if (verification.eligible) {
          inspected.row.state = 'proved-model-unreachable';
          inspected.row.zeroLikelihoodProof = error.zeroLikelihoodProof;
          return method === 'rangeItems' ? [] : null;
        }
      }
      if (error instanceof EffectiveReachError) {
        inspected.row.state = error.status; inspected.row.error = error.message;
        error.gatePrefix = { prefixIdentity: inspected.row.prefixIdentity, request: inspected.request, node: inspected.prefix.pending.node, seat: inspected.prefix.pending.seat, method };
      }
      throw error; // Unproved off-model/numerical failures never become null/continue.
    }
  };
  const context = (method, table, board, node) => call(method, table, board, node, ({ request, row }) => {
    const state = execution.requirementState(request);
    row.support = state.support; row.requirement = state.requirement;
    row.state = state.contextStatus;
    return state.requirement;
  });
  const facade = Object.freeze({
    context: (table, board, node) => context('context', table, board, node),
    requirement: (table, board, node) => context('requirement', table, board, node),
    rangeItems: (table, board, seat) => call('rangeItems', table, board, undefined, ({ request, row }) => {
      const state = execution.rangeState(request, seat);
      row.rangeTotals ??= {}; row.rangeTotals[seat] = state.total; row.rangeStatus = state.status;
      // Preserve the inherited kernel's saved-range aggregation order, not a new sorted order.
      return comboRange(seatRows[seat], 'freq', board).map(item => ({ combo: item.combo,
        weight: state.weights[comboId(...item.combo)] })).filter(item => item.weight > 0);
    }),
    observableMix: (table, board, node, combo, _savedMix) => call('observableMix', table, board, node, ({ request, prepared, row }) => {
      const law = prepared ? prepared.gateObservation(combo) : execution.law(request, combo);
      row.lawStatuses.set(comboId(...combo), prepared ? law.equity : law.provenance.equity);
      return law.physicalMass; // The inherited kernel pads hidden label slots with zero.
    }),
    releaseBoardCaches,
  });
  return Object.freeze({ facade, execution,
    coverage: () => [...observed.values()].map(row => ({ ...row, methods: [...row.methods],
      lawStatuses: Object.fromEntries([...new Set(row.lawStatuses.values())].map(status => [status, [...row.lawStatuses.values()].filter(value => value === status).length])) })) });
}

// Explicit selected-board bridge only. This preserves the inherited heuristic thresholds and
// complete representative path/runout selection on those boards; it is not full acceptance.
export function checkModel11Balance(inputs, flopArtifact, laterArtifact, { boardList, street = 'all', authored = true } = {}) {
  if (!Array.isArray(boardList) || !boardList.length || !['flop', 'later', 'all'].includes(street) || typeof authored !== 'boolean') fail('Explicit boards, street scope and boolean authored flag required');
  const plan = freezeSnapshot(boardList), bridge = createModel11BalanceFacade(inputs, flopArtifact, laterArtifact);
  const results = [], started = performance.now();
  if (new Set(plan.map(board => board.id)).size !== plan.length) fail('Duplicate board IDs');
  for (const board of plan) {
    if (typeof board.id !== 'string' || !board.id || board.cards?.length !== 3) fail('Every gate board requires a unique ID and three cards');
    bridge.execution.prefix({ board: board.cards, path: { flop: [] } });
  }
  try {
    for (const stage of street === 'all' ? ['flop', 'later'] : [street]) {
      bridge.facade.releaseBoardCaches();
      try {
        const result = stage === 'flop' ? checkFlopBalance(inputs, flopArtifact.policy, { boardList: plan, defenceFactory: () => bridge.facade })
          : checkLaterBalance(inputs, flopArtifact.policy, laterArtifact.policy, { boardList: plan, authored, defenceFactory: () => bridge.facade });
        results.push({ street: stage, complete: true, ...result });
      } catch (error) {
        if (!(error instanceof EffectiveReachError) || error.status !== 'off-model-observed-action') throw error;
        results.push({ street: stage, complete: false, status: error.status, stoppedAt: error.gatePrefix,
          findings: [{ check: 'model11-off-model-coverage', severity: 'error', node: error.gatePrefix?.node ?? null,
            detail: error.message }], coverage: { status: 'incomplete; stopped at the first unsupported public prefix' } });
      }
    }
    const findings = results.flatMap(result => result.findings.map(finding => ({ ...finding, street: result.street })));
    const complete = results.every(result => result.complete), blockers = findings.filter(finding => finding.severity === 'error');
    return { kind: 'model11-selected-board-balance-gate-bridge', version: MODEL11_BALANCE_GATE_ADAPTER_VERSION,
      execution: bridge.execution.identity, belief: bridge.execution.belief, artifactProvenance: bridge.execution.artifactProvenance,
      planIdentity: contentHash({ boardList: plan, street, authored }),
      status: !complete ? 'blocked-off-model-coverage' : blockers.length ? 'completed-with-quality-errors' : 'completed-selected-scope',
      acceptance: 'not-evaluated; representative simulation/replay and complete all-board gates remain required',
      selectedBoards: plan.length, complete, findings, results, prefixCoverage: bridge.coverage(),
      diagnostics: { elapsedMs: performance.now() - started, cache: bridge.execution.cacheStats() } };
  } finally { bridge.facade.releaseBoardCaches(); }
}
