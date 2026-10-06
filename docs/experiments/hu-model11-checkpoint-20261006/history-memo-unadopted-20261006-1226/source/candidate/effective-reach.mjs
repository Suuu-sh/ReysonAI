// EXPERIMENT ONLY. No production consumer is dispatched here by defenceFor().
import { Defence, comboId, tierArray, replayDecision, isFacingNode } from './defence.mjs';
import { makeRange, equitiesVersus, equityVersus, releaseRangeTables } from './range-equity.mjs';
import pilotConfig from '../data/postflop-ai-pilot.json' with { type: 'json' };
import { createDecisionPrefix, requestBeforeEntry, EffectiveReachError, MAX_PREFIX_DECISIONS } from './decision-prefix.mjs';
import { contentHash, freezeSnapshot, canonicalJson, assertJsonCompatible } from './effective-law-identity.mjs';
import { balancedBeliefContract, compileDeclaredPolicyLaw, NEW_HU_EFFECTIVE_MODEL_VERSION,
  NUMERIC_SCHEDULE_VERSION, DECLARED_POLICY_LAW_VERSION, SAMPLER_CONTRACT_VERSION } from './effective-action-law.mjs';

import { validateEffectiveArtifacts } from './effective-artifact-contract.mjs';
import { makeZeroLikelihoodProof, ZERO_LIKELIHOOD_PROOF_VERSION } from './model11-zero-proof.mjs';

const NUM_IDS = 52 * 52, NONE = 255;
const comboOf = id => [Math.floor(id / 52), id % 52];
const error = (status, message) => { throw new EffectiveReachError(status, message); };
export function multiplyDeclaredMass(weight, mass, context = '') {
  if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(mass) || mass < 0 || mass > 100) error('invalid-numeric-contract', 'Invalid realization weight or declared percentage');
  const factor = mass / 100;
  if (mass > 0 && factor === 0) error('numerical-underflow', `Positive declared percentage underflowed during probability conversion ${context}`);
  const product = weight * factor;
  if (weight > 0 && mass > 0 && product === 0) error('numerical-underflow', `Positive historical realization product underflowed ${context}`);
  return product;
}
export const LAW_CACHE_DEFAULTS = Object.freeze({ numericBytes: 64 * 1024 * 1024, metadataBytes: 8 * 1024 * 1024, entries: 128 });
const EQUITY_STATUS = Object.freeze({ 'not-facing': 0, known: 1, 'positive-support-equity-unavailable': 2, 'exact-incompatibility': 3, 'opponent-empty': 4 });
const STATUS_NAME = Object.fromEntries(Object.entries(EQUITY_STATUS).map(([name,id]) => [id,name]));

// Eviction changes work only. Active ancestors are held separately and cannot be evicted.
export class CompletedLawCache {
  constructor(limits = LAW_CACHE_DEFAULTS) {
    this.limits = { ...LAW_CACHE_DEFAULTS, ...limits };
    for (const [key, value] of Object.entries(this.limits)) if (!Number.isSafeInteger(value) || value < 0) error('invalid-cache-budget', `Invalid cache ${key}`);
    this.items = new Map(); this.numericBytes = 0; this.metadataBytes = 0; this.evictions = 0;
  }
  get(key) { const value = this.items.get(key); if (value) { this.items.delete(key); this.items.set(key,value); } return value; }
  set(key, value) {
    if (this.items.has(key)) this.drop(key);
    if (value.numericBytes > this.limits.numericBytes || value.metadataBytes > this.limits.metadataBytes || !this.limits.entries) return;
    while (this.items.size >= this.limits.entries || this.numericBytes + value.numericBytes > this.limits.numericBytes || this.metadataBytes + value.metadataBytes > this.limits.metadataBytes) {
      this.drop(this.items.keys().next().value); this.evictions++;
    }
    this.items.set(key,value); this.numericBytes += value.numericBytes; this.metadataBytes += value.metadataBytes;
  }
  drop(key) { const value = this.items.get(key); if (!value) return; this.numericBytes -= value.numericBytes; this.metadataBytes -= value.metadataBytes; this.items.delete(key); }
  clear() { this.items.clear(); this.numericBytes = 0; this.metadataBytes = 0; }
  stats() { return { entries: this.items.size, numericBytes: this.numericBytes, metadataBytes: this.metadataBytes, evictions: this.evictions, limits: { ...this.limits } }; }
}

// Private key for locally generated numeric mixes only. Other shapes take the
// original compiler path; this is not an untrusted-input validation shortcut.
function numericLawMemoKey(mix, actions) {
  if (!mix || typeof mix !== 'object' || Object.getPrototypeOf(mix) !== Object.prototype ||
      Object.getOwnPropertySymbols(mix).length || Object.getOwnPropertyNames(mix).length !== actions.length) return null;
  const values = [];
  for (const action of actions) {
    const descriptor = Object.getOwnPropertyDescriptor(mix, action);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || !Number.isFinite(descriptor.value)) return null;
    values.push(Object.is(descriptor.value, -0) ? '-0' : String(descriptor.value));
  }
  return values.join('|');
}

class EffectiveDefence extends Defence {
  #lastPrefixKey = null;
  #historicalPrefixes = new Map();
  constructor(inputs, flopPolicy, laterPolicy, options) {
    super(inputs, flopPolicy, laterPolicy, options.bluffCap);
    this.belief = options.belief;
    this.artifactProvenance = options.artifactProvenance;
    this.lawCache = new CompletedLawCache(options.cache);
    this.active = new Map(); this.stack = []; this.requestDepth = 0; this.maxActive = 0; this.builds = 0;
    this.identity = freezeSnapshot({ model: NEW_HU_EFFECTIVE_MODEL_VERSION, reachLawVersion: DECLARED_POLICY_LAW_VERSION,
      numericScheduleVersion: NUMERIC_SCHEDULE_VERSION, samplerVersion: SAMPLER_CONTRACT_VERSION,
      legacyDefenceVersion: 6, physicalActionModelVersion: 10, flopRunouts: 300, zeroLikelihoodProofVersion: ZERO_LIKELIHOOD_PROOF_VERSION,
      numericKernel: 'pinned-JS-canonical-ascending-base-support; first-three-scan-then-indexed',
      inputFingerprint: inputs.fingerprint, inputContentHash: contentHash({ spot: inputs.spot, seatRows: inputs.seatRows }),
      configHash: contentHash(this.config), flopPolicyContentHash: contentHash(flopPolicy), laterPolicyContentHash: contentHash(laterPolicy),
      artifactProvenanceIdentity: contentHash(this.artifactProvenance), flopArtifactContentHash: this.artifactProvenance.flop.artifactContentHash, laterArtifactContentHash: this.artifactProvenance.later.artifactContentHash,
      beliefIdentity: this.belief.identity, bluffCap: this.bluffCap,
      evaluationProvenance: 'model10-authored-policy-bytes-evaluated-under-experimental-model11; not re-authored or accepted' });
  }
  withRequest(callback) {
    this.requestDepth++;
    try { return callback(); } finally {
      if (--this.requestDepth === 0) {
        // Completed numeric cache has no contexts, table closures, exact-sign graphs or rank tables.
        super.releaseBoardCaches(); this.active.clear(); this.stack.length = 0; this.#historicalPrefixes.clear();
      }
    }
  }
  queryEquity(range, id, tables) { return equityVersus(range, id, tables, { wasm: false }); }
  queryEquities(range, ids, tables) { return equitiesVersus(range, ids, tables, { wasm: false }); }
  // Every context is primed before any caller can select its first three arithmetic paths.
  context(table, board, node) {
    const context = super.context(table, board, node);
    if (context) this.prime(context);
    return context;
  }
  prime(context) {
    if (context.canonicalComplete) return;
    const base = this.baseWeights(context.defender), tiers = tierArray(context.board), ids = [];
    for (let id = 0; id < NUM_IDS; id++) if (base[id] > 0 && tiers[id] !== NONE) ids.push(id);
    if (context.bettorRange.queries !== 0 || context.equities.size !== 0) error('numeric-schedule-violation', 'Facing stage was queried before canonical completion');
    const values = this.queryEquities(context.bettorRange, ids, this.tablesOf(context));
    for (let i = 0; i < ids.length; i++) context.equities.set(ids[i], values[i]);
    context.canonicalComplete = true; releaseRangeTables(context.bettorRange);
  }
  // Historical cap reconstruction must replay its own board with the exact declared config.
  entryBetting(table, board, entry) {
    if (!this.bluffCap) return null;
    if (entry === table.log.at(-1)) return this.betting(table, board, entry.node);
    const request = requestBeforeEntry(table, board, entry);
    const before = replayDecision(this.inputs, request.board, request.path, this.config);
    return this.betting(before, request.board, entry.node);
  }
  // Own realization products, never a public marginal. Only the actor gets its observed factor.
  reach(seat, entries, board, table = null) {
    if (!table) error('missing-public-prefix', 'Effective reach requires the full public table prefix');
    let weights = this.baseWeights(seat);
    for (const entry of entries) {
      if (entry.action === null) error('invalid-public-prefix', 'Pending actions cannot condition reach');
      const stageBoard = board.slice(0, entry.boardLen), tiers = tierArray(stageBoard);
      // These requests come only from our private replay tables and revealed boards.
      // Retain frozen prefixes within this one request; numeric prepare still runs every time.
      const request = requestBeforeEntry(table, board, entry);
      const retain = this.requestDepth > 0 && this.lawCache.limits.entries > 0 &&
        this.lawCache.limits.numericBytes > 0 && this.lawCache.limits.metadataBytes > 0;
      const prefixKey = retain ? JSON.stringify([request.board, request.path.flop, request.path.turn, request.path.river]) : null;
      let prefix = prefixKey === null ? undefined : this.#historicalPrefixes.get(prefixKey);
      if (!prefix) {
        prefix = createDecisionPrefix(this.inputs, request, this.config);
        if (prefixKey !== null && this.#historicalPrefixes.size < MAX_PREFIX_DECISIONS) this.#historicalPrefixes.set(prefixKey, prefix);
      }
      const vector = this.prepare(prefix), action = vector.physicalActions.indexOf(entry.action);
      if (action < 0) error('invalid-public-prefix', 'Observed action is not a physical class of its own prefix');
      const next = new Float64Array(NUM_IDS);
      let beforeTotal = 0, afterTotal = 0;
      for (let id = 0; id < NUM_IDS; id++) if (weights[id] > 0 && tiers[id] !== NONE) {
        const mass = vector.physical[action][id], weight = weights[id];
        beforeTotal += weight;
        const product = multiplyDeclaredMass(weight, mass, `at combo ${id}`);
        if (mass > 0) { next[id] = product; afterTotal += product; }
      }
      if (beforeTotal > 0 && afterTotal === 0) {
        const beforeWeights = Float64Array.from(weights, (weight, id) => tiers[id] !== NONE ? weight : 0);
        const failure = new EffectiveReachError('off-model-observed-action', `Observed ${entry.action} has zero declared model likelihood`);
        failure.zeroLikelihoodProof = makeZeroLikelihoodProof({ modelIdentity: this.identity, belief: this.belief,
          artifactProvenance: this.artifactProvenance, request: requestBeforeEntry(table, board, entry), prefix,
          actor: seat, action: entry.action, vector, beforeWeights, beforeTotal, statusNames: STATUS_NAME });
        throw failure;
      }
      weights = next;
    }
    const tiers = tierArray(board), out = new Float64Array(NUM_IDS);
    for (let id = 0; id < NUM_IDS; id++) if (weights[id] > 0 && tiers[id] !== NONE) out[id] = weights[id];
    return out;
  }
  prepare(prefix) {
    // Every caller supplies an owned, deeply frozen createDecisionPrefix snapshot.
    // Reuse only that exact object; newly created historical prefixes still miss.
    const memo = this.#lastPrefixKey;
    const key = memo?.prefix === prefix ? memo.key
      : canonicalJson({ board: prefix.board, path: prefix.path, pending: prefix.pending, geometry: prefix.geometry });
    if (memo?.prefix !== prefix && this.lawCache.limits.entries > 0 &&
        this.lawCache.limits.numericBytes > 0 && this.lawCache.limits.metadataBytes > 0) {
      this.#lastPrefixKey = { prefix, key };
    }
    const complete = this.lawCache.get(key) ?? this.active.get(key);
    if (complete?.state === 'complete') return complete;
    if (complete?.state === 'building') error('cyclic-prefix-dependency', 'Attempted recursive lookup of a building law');
    const parent = this.stack.at(-1);
    if (parent && prefix.decisionCount >= parent.decisionCount) error('nondecreasing-prefix-dependency', 'Historical law dependency did not strictly decrease');
    if (this.stack.length >= MAX_PREFIX_DECISIONS) error('invalid-public-prefix', 'Prefix DAG exceeds validated decision bound');
    this.active.set(key, { state: 'building' }); this.stack.push(prefix); this.maxActive = Math.max(this.maxActive, this.stack.length);
    try {
      const table = replayDecision(this.inputs, prefix.board, prefix.path, this.config), target = table.log.at(-1);
      const actions = this.belief.seats[target.seat === this.inputs.spot.ip ? 'ip' : 'oop'].executor.nodeOrders[target.node];
      const own = this.reach(target.seat, table.log.filter(entry => entry.seat === target.seat && entry !== target), prefix.board, table);
      const other = table.other(target.seat), opposing = this.reach(other, table.log.filter(entry => entry.seat === other), prefix.board, table);
      const ownRange = makeRange(own), opposingRange = makeRange(opposing);
      const base = this.baseWeights(target.seat), tiers = tierArray(prefix.board), ids = [];
      for (let id = 0; id < NUM_IDS; id++) if (base[id] > 0 && tiers[id] !== NONE) ids.push(id);
      const physicalActions = target.observation.classes.map(group => group.action);
      const raw = actions.map(() => new Float64Array(NUM_IDS));
      const label = actions.map(() => new Float64Array(NUM_IDS));
      const physical = physicalActions.map(() => new Float64Array(NUM_IDS));
      const equityStatus = new Uint8Array(NUM_IDS), realization = new Uint8Array(NUM_IDS), exactSign = new Int8Array(NUM_IDS).fill(2);
      const context = isFacingNode(target.node) ? this.context(table, prefix.board, target.node) : null;
      // Replay created this observation privately; baseMix/mix only read it.
      // The action order is deeply frozen in the belief. Reuse only a fully
      // compiled, frozen empty-provenance law within this one prefix loop.
      const prefixLaws = new Map();
      for (const id of ids) {
        const combo = comboOf(id), saved = super.baseMix(table, prefix.board, target.node, combo);
        const mix = super.mix(table, prefix.board, target.node, combo, saved);
        const memoKey = numericLawMemoKey(mix, actions);
        let law = memoKey === null ? undefined : prefixLaws.get(memoKey);
        if (!law) {
          law = compileDeclaredPolicyLaw(mix, actions, target.observation);
          if (memoKey !== null && prefixLaws.size < 256) prefixLaws.set(memoKey, law);
        }
        for (let i = 0; i < actions.length; i++) { raw[i][id] = law.rawMix[actions[i]]; label[i][id] = law.labelMass[actions[i]]; }
        for (let i = 0; i < physicalActions.length; i++) physical[i][id] = law.physicalMass[physicalActions[i]];
        realization[id] = own[id] > 0 ? 1 : 0;
        if (isFacingNode(target.node)) {
          const compatible = [...opposingRange.ids].some(otherId => { const cards = comboOf(otherId); return !cards.includes(combo[0]) && !cards.includes(combo[1]); });
          equityStatus[id] = !opposingRange.ids.length ? EQUITY_STATUS['opponent-empty'] : !compatible ? EQUITY_STATUS['exact-incompatibility']
            : context?.equities.get(id) === null || !context ? EQUITY_STATUS['positive-support-equity-unavailable'] : EQUITY_STATUS.known;
          const sign = context?.exactRiverCallEv?.signs.get(id);
          if (sign !== undefined) exactSign[id] = sign === null ? 3 : sign;
        }
      }
      const arrays = [...raw, ...label, ...physical, equityStatus, realization, exactSign];
      const vector = { state: 'complete', prefix, actorRole: target.seat === this.inputs.spot.ip ? 'ip' : 'oop', actions, physicalActions, raw, label, physical, equityStatus, realization, exactSign,
        ids: Int16Array.from(ids), ownTotal: ownRange.total, opposingTotal: opposingRange.total,
        numericBytes: arrays.reduce((sum, array) => sum + array.byteLength, 0) + ids.length * 2,
        // UTF-16 string storage upper-bound estimate plus conservative per-entry object allowance.
        metadataBytes: 2 * (key.length + canonicalJson(prefix).length) + 4096 };
      this.builds++; this.active.set(key, vector); this.lawCache.set(key, vector); return vector;
    } catch (failure) {
      this.active.delete(key);
      if (failure instanceof EffectiveReachError) throw failure;
      throw new EffectiveReachError('invalid-executor-contract', failure.message);
    }
    finally { this.stack.pop(); }
  }
  law(request, combo) {
    return this.withRequest(() => this.lawAtPrefix(createDecisionPrefix(this.inputs, request, this.config), combo));
  }
  // Only internally created, deeply frozen prefixes reach this helper. Public
  // law(request, combo) still revalidates and replays every caller request.
  lawAtPrefix(prefix, combo) {
    if (!Array.isArray(combo) || combo.length !== 2 || new Set([...combo,...prefix.board]).size !== prefix.board.length + 2 || combo.some(card => !Number.isInteger(card) || card < 0 || card >= 52)) error('invalid-private-combo', 'Invalid actor own combo');
    const vector = this.prepare(prefix), id = comboId(combo[0], combo[1]);
    if (!(this.baseWeights(prefix.pending.seat)[id] > 0)) error('outside-base-support', 'Counterfactual combos outside the frozen base require a separate adapter');
    const raw = Object.fromEntries(vector.actions.map((action,i) => [action,vector.raw[i][id]]));
    return compileDeclaredPolicyLaw(raw, vector.actions, prefix.pending.observation, {
      modelIdentity: this.identity, beliefIdentity: this.belief.identity, executorIdentity: this.belief.seats[prefix.pending.seat === this.inputs.spot.ip ? 'ip' : 'oop'].executor.identity,
      ownRealization: vector.realization[id] ? 'positive' : 'zero-model-reach',
      equity: STATUS_NAME[vector.equityStatus[id]], fallback: [2,3,4].includes(vector.equityStatus[id]) ? 'saved-capped' : null,
      exactRiverSign: vector.exactSign[id] === 2 ? 'not-requested' : vector.exactSign[id] === 3 ? 'unknown' : vector.exactSign[id],
      prefix, aggregation: 'own-action-realization; not public marginal' });
  }
  // Gate-only projection of the compiler-owned numeric vector. Never return or
  // retain that vector: the public law/proof path keeps its complete provenance.
  gateObservationAtPrefix(prefix, combo) {
    if (!Array.isArray(combo) || combo.length !== 2 || new Set([...combo,...prefix.board]).size !== prefix.board.length + 2 || combo.some(card => !Number.isInteger(card) || card < 0 || card >= 52)) error('invalid-private-combo', 'Invalid actor own combo');
    const vector = this.prepare(prefix), id = comboId(combo[0], combo[1]);
    if (!(this.baseWeights(prefix.pending.seat)[id] > 0)) error('outside-base-support', 'Counterfactual combos outside the frozen base require a separate adapter');
    return freezeSnapshot({
      physicalMass: Object.fromEntries(vector.physicalActions.map((action, i) => [action, vector.physical[i][id]])),
      equity: STATUS_NAME[vector.equityStatus[id]],
    });
  }
  rangeState(request, seat) {
    return this.withRequest(() => {
      const prefix = createDecisionPrefix(this.inputs, request, this.config);
      if (![this.inputs.spot.ip,this.inputs.spot.oop].includes(seat)) error('invalid-seat', 'Unknown live seat');
      const table = replayDecision(this.inputs, prefix.board, prefix.path, this.config), pending = table.log.at(-1);
      const weights = this.reach(seat, table.log.filter(entry => entry.seat === seat && entry !== pending), prefix.board, table);
      const other = table.other(seat), opposing = this.reach(other, table.log.filter(entry => entry.seat === other && entry !== pending), prefix.board, table);
      const a = makeRange(weights), b = makeRange(opposing);
      const compatible = [...a.ids].some(id => [...b.ids].some(j => { const left=comboOf(id),right=comboOf(j); return left.every(card => !right.includes(card)); }));
      return { weights, status: compatible ? 'positive-compatible-support' : 'exact-incompatibility', identity: this.identity,
        prefix, semantics: 'unnormalized-own-action-realization', total: a.total };
    });
  }
  requirementState(request) {
    return this.withRequest(() => {
      const prefix = createDecisionPrefix(this.inputs, request, this.config);
      const table = replayDecision(this.inputs, prefix.board, prefix.path, this.config);
      // Build the real effective context, with canonical equity priming. No null sentinel is
      // fabricated, and historical off-model observations propagate as typed failures.
      const requirement = super.requirement(table, prefix.board, prefix.pending.node);
      const own = this.rangeState(request, prefix.pending.seat);
      const other = this.rangeState(request, table.other(prefix.pending.seat));
      return freezeSnapshot({ prefix, requirement, contextStatus: !isFacingNode(prefix.pending.node) ? 'not-facing' : requirement ? 'effective-facing-context' : 'opponent-empty',
        support: { status: own.status, ownTotal: own.total, opponentTotal: other.total } });
    });
  }
  releaseBoardCaches() { super.releaseBoardCaches(); this.lawCache.clear(); this.active.clear(); this.#lastPrefixKey = null; this.#historicalPrefixes.clear(); }
  stats() { return { ...this.lawCache.stats(), builds: this.builds, maximumActiveAncestors: this.maxActive, active: this.active.size }; }
}

export function createEffectiveDefence(inputs, flopArtifact, laterArtifact, { bluffCap = true, belief = balancedBeliefContract(), cache } = {}) {
  try { assertJsonCompatible(inputs, 'inputs'); }
  catch (failure) { error('invalid-source-contract', failure.message); }
  if (!inputs?.spot?.history) error('unsupported-model-scope', 'Model11 never changes legacy45');
  const { flopPolicy, laterPolicy, provenance } = validateEffectiveArtifacts(inputs, flopArtifact, laterArtifact);
  try { assertJsonCompatible(belief, 'belief'); if (cache !== undefined) assertJsonCompatible(cache, 'cache'); }
  catch (failure) { error('invalid-source-contract', failure.message); }
  if (belief.identity !== balancedBeliefContract().identity || canonicalJson(belief) !== canonicalJson(balancedBeliefContract())) error('unsupported-belief-contract', 'Phase1 supports only immutable balanced-vs-balanced belief; actual references remain separate');
  if (typeof bluffCap !== 'boolean') error('invalid-executor-contract', 'Bluff cap mode must be a boolean');
  // Existing geometry helpers close over pilotConfig in several places. Phase1 is honest about that
  // adapter limit rather than silently mixing arbitrary custom config with those defaults.
  if (canonicalJson(inputs.config ?? pilotConfig) !== canonicalJson(pilotConfig)) error('unsupported-config-adapter', 'Phase1 requires the exact frozen pilot config');
  const core = new EffectiveDefence(freezeSnapshot(inputs), freezeSnapshot(flopPolicy), freezeSnapshot(laterPolicy),
    { bluffCap, belief: freezeSnapshot(belief), cache, artifactProvenance: provenance });
  return Object.freeze({ identity: core.identity, belief: core.belief, artifactProvenance: core.artifactProvenance,
    prefix: request => createDecisionPrefix(core.inputs, request, core.config),
    // Additive gate adapter: validate once, then close over the owned snapshot.
    // No caller-supplied prefix/token is accepted, and no vector is retained.
    prepareRequest: request => {
      const prefix = createDecisionPrefix(core.inputs, request, core.config);
      return Object.freeze({ prefix, law: combo => core.withRequest(() => core.lawAtPrefix(prefix, combo)),
        gateObservation: combo => core.withRequest(() => core.gateObservationAtPrefix(prefix, combo)) });
    },
    law: (request, combo) => core.law(request, combo),
    rangeState: (request, seat) => core.rangeState(request, seat),
    requirementState: request => core.requirementState(request),
    releaseBoardCaches: () => core.releaseBoardCaches(), cacheStats: () => core.stats() });
}
