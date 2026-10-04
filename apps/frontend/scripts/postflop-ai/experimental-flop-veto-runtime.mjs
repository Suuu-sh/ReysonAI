// Node-only, explicitly unapproved experiment. No product consumer imports this module.
// The underlying legacy source, policies, classifier and reach rules are never patched.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';
import pins from './experimental-flop-veto-pins.json' with { type: 'json' };
import { AUDIT_REPOSITORY, auditFileRecord, captureSourceGraph, identityHash } from './audit-identity.mjs';
import { buildResearchVeto } from './build-flop-promotion-veto.mjs';
import { previewFlopPromotionVeto, vetoHash } from './flop-promotion-veto.mjs';
import { postCapRawMix } from './rollout-diagnostic-contract.mjs';

export const EXPERIMENTAL_FLOP_VETO_VERSION = 3;
const bytesHash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashFile = file => bytesHash(readFileSync(file));
const equal = (a, b) => vetoHash(a) === vetoHash(b);
const snapshotRoots = ['apps/frontend/scripts/postflop-ai/rollout-low-flop-defence.mjs'];
const candidateRoots = ['apps/frontend/scripts/postflop-ai/experimental-flop-veto-runtime.mjs'];
const builderRoots = ['apps/frontend/scripts/postflop-ai/build-flop-promotion-veto.mjs'];
const tableData = table => Object.fromEntries(['spot', 'stacks', 'invested', 'pot', 'winner', 'lastAggressor', 'log', 'path'].map(key => [key, table[key]]));
const keyOf = (board, hero, node, path) => vetoHash({ board, hero: [...hero].sort((a, b) => a - b), node, path });
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function dataOptions(value, allowed) {
  if (!value || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('Only declared data options are accepted; external runtime objects and callbacks are forbidden');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value), copy = Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowed.includes(key) || !('value' in descriptors[key])) throw new Error('Only declared data options are accepted');
    copy[key] = descriptors[key].value;
  }
  return copy;
}
function historyData(value) {
  const invalid = () => { throw new Error('History must be a dense plain data array of strings'); };
  if (utilTypes.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value), length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > 64 || Reflect.ownKeys(descriptors).length !== length + 1) invalid();
  const copy = new Array(length);
  for (let i = 0; i < length; i++) {
    const descriptor = descriptors[String(i)];
    if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string') invalid();
    copy[i] = descriptor.value;
  }
  return Object.freeze(copy);
}

/**
 * The only activation is an explicit unapproved preview. Missing/incompatible artifacts
 * produce no runtime, never a guessed strategy. The caller must retain its ordinary legacy
 * runtime. Returned runtime inputs are privately loaded and frozen, not caller-supplied hashes.
 * This is a research execution adapter, not a production review-receipt authority.
 */
export async function createExperimentalFlopVetoRuntime(options = {}) {
  const unsupported = reason => freeze({ ready: false, status: 'unsupported-research-context', reason,
    production_eligible: false, runtime: null });
  try { options = dataOptions(options, ['researchRoot', 'spot', 'enableUnapprovedPreview']); } catch { return unsupported('invalid-options'); }
  const { researchRoot, spot, enableUnapprovedPreview = false } = options;
  if (typeof researchRoot !== 'string' || typeof spot !== 'string' || typeof enableUnapprovedPreview !== 'boolean') return unsupported('invalid-options');
  const selected = pins.cases.filter(item => item.spot === spot);
  if (!selected.length) return unsupported('spot-has-no-reviewed-exact-context');
  const root = resolve(researchRoot), snapshot = resolve(root, 'main-baseline');
  let graph, contexts, sourceRecords, candidateGraphHash;
  try {
    candidateGraphHash = identityHash(captureSourceGraph({ roots: candidateRoots }));
    if (identityHash(captureSourceGraph({ roots: builderRoots })) !== pins.builder_closure_sha256 ||
        hashFile(resolve(AUDIT_REPOSITORY, 'apps/frontend/scripts/postflop-ai/flop-promotion-veto.mjs')) !== pins.gate_source_sha256) {
      return unsupported('candidate-verifier-version-mismatch');
    }
    if (hashFile(resolve(root, pins.plan_file)) !== pins.plan_sha256) return unsupported('fixed-protocol-mismatch');
    for (const review of pins.reviews) if (hashFile(resolve(AUDIT_REPOSITORY, review.path)) !== review.sha256) return unsupported('research-review-record-mismatch');
    graph = captureSourceGraph({ root: snapshot, roots: snapshotRoots });
    if (identityHash(graph) !== pins.sample_source_graph_sha256) return unsupported('unreviewed-base-runtime');
    if (!equal(pins.saved_input_records, pins.saved_input_records.map(item => auditFileRecord(snapshot, item.path)))) return unsupported('saved-input-byte-mismatch');
    contexts = [];
    for (const item of selected) {
      const reportPath = resolve(root, item.report_file);
      if (hashFile(reportPath) !== item.raw_report_sha256) return unsupported('raw-evidence-mismatch');
      const built = await buildResearchVeto({ snapshotRoot: snapshot, reportPath, planPath: resolve(root, pins.plan_file) });
      if (built.certificate?.binding_sha256 !== item.binding_sha256 || !built.preview.applied || built.candidate_default.applied) {
        return unsupported('replayed-binding-mismatch');
      }
      contexts.push({ built, raw: JSON.parse(readFileSync(reportPath, 'utf8')) });
    }
    sourceRecords = [...graph, ...pins.saved_input_records];
  } catch (error) { return unsupported(`fixture-verification-failed: ${error.message}`); }

  const mod = name => import(pathToFileURL(resolve(snapshot, 'apps/frontend/scripts/postflop-ai', name)).href);
  const inputModule = await mod('inputs.mjs'), policyModule = await mod('generate.mjs');
  const defenceModule = await mod('defence.mjs'), modelModule = await mod('model.mjs');
  const driverModule = await mod('flop-hand-ev-core.mjs');
  const policyActions = await mod('policy.mjs');
  const randomModule = await import(pathToFileURL(resolve(snapshot, 'apps/frontend/scripts/lib/equity.mjs')).href);
  const inputs = inputModule.loadInputs(spot), candidate = policyModule.loadCandidate(inputs);
  const later = policyModule.loadLaterCandidate(inputs, candidate);
  if (inputs.spot.history || !later || defenceModule.DEFENCE_VERSION !== 6) return unsupported('unreviewed-model-family');
  freeze(inputs); freeze(candidate); freeze(later);
  const defence = defenceModule.defenceFor(inputs, candidate.policy, later.policy);
  const files = inputModule.artifactPaths(inputs.spot);
  const policyRecords = [files.candidate, files.laterCandidate].map(path => ({ path, sha256: hashFile(path) }));
  const expected = new Map();
  for (const { built, raw } of contexts) {
    const table = defenceModule.replayDecision(inputs, built.binding.board, built.binding.history);
    if (inputs.fingerprint !== built.binding.identities.input_fingerprint ||
        vetoHash(inputs.seatRows) !== built.binding.identities.saved_support_sha256 ||
        candidate.metadata.policy_hash !== built.binding.identities.flop_policy_sha256 ||
        later.metadata.policy_hash !== built.binding.identities.later_policy_sha256 ||
        policyRecords[0].sha256 !== built.binding.identities.flop_artifact_sha256 ||
        policyRecords[1].sha256 !== built.binding.identities.later_artifact_sha256) return unsupported('loaded-runtime-identity-mismatch');
    const key = keyOf(built.binding.board, built.binding.hero, built.binding.node, built.binding.history);
    expected.set(key, freeze({ built, base: raw.initial.base, table: tableData(table) }));
  }
  const model = freeze({ family: 'experimental-legacy-hu-flop-promotion-preview', base_defence_version: 6,
    intervention_version: 1, experimental_runtime_version: EXPERIMENTAL_FLOP_VETO_VERSION,
    runtime_source_graph_sha256: candidateGraphHash, evidence_pins_sha256: vetoHash(pins),
    base_source_graph_sha256: pins.sample_source_graph_sha256, mode: enableUnapprovedPreview ? 'unapproved-preview' : 'legacy-control',
    family_error_budget_nominal: 0.01, production_eligible: false, approval: 'none' });
  const originalMix = defence.mix.bind(defence);
  let last = null;
  const unchanged = (mix, reason) => { last = { applied: false, reason, removed_call_pp: 0 }; return mix; };
  const currentFilesMatch = () => equal(sourceRecords, sourceRecords.map(item => auditFileRecord(snapshot, item.path))) &&
    policyRecords.every(item => hashFile(item.path) === item.sha256) &&
    hashFile(resolve(root, pins.plan_file)) === pins.plan_sha256 &&
    selected.every(item => hashFile(resolve(root, item.report_file)) === item.raw_report_sha256) &&
    pins.reviews.every(item => hashFile(resolve(AUDIT_REPOSITORY, item.path)) === item.sha256) &&
    identityHash(captureSourceGraph({ roots: candidateRoots })) === candidateGraphHash;

  // An adapter owns its own legacy instance. It does not replace/monkey-patch a shared
  // Defence, and its ordinary control calls go through the unchanged legacy implementation.
  const runtimeDefence = {
    baseMix: (...args) => ({ ...defence.baseMix(...args) }),
    releaseBoardCaches: () => defence.releaseBoardCaches(),
    mix(table, board, node, hero, base) {
      const legacyMix = originalMix(table, board, node, hero, base);
      if (!enableUnapprovedPreview) return unchanged(legacyMix, 'preview-disabled');
      try {
        const item = expected.get(keyOf(board, hero, node, table.path));
        if (!item) return unchanged(legacyMix, 'no-exact-reviewed-context');
        if (!equal(tableData(table), item.table) || !equal(base, item.base) || !currentFilesMatch()) {
          return unchanged(legacyMix, 'current-runtime-context-mismatch');
        }
        const context = defence.context(table, board, node), equity = defence.equity(context, hero);
        const rawMix = postCapRawMix(defence, context, base, equity, hero);
        if (!equal(rawMix, item.built.rawMix) || !equal(legacyMix, item.built.legacyMix)) return unchanged(legacyMix, 'current-mix-mismatch');
        const result = previewFlopPromotionVeto({ ...item.built, rawMix, legacyMix });
        last = { applied: result.applied, reason: result.reason, removed_call_pp: result.removed_call_pp };
        return result.mix;
      } catch { return unchanged(legacyMix, 'invalid-current-runtime-context'); }
    },
  };
  Object.freeze(runtimeDefence);
  const evaluateNormalized = ({ board: boardText, hero: heroText, history }) => {
      if (typeof boardText !== 'string' || typeof heroText !== 'string') throw new Error('Invalid decision data');
      const board = modelModule.parseFlopBoard(boardText).cards, hero = modelModule.parseCards(heroText, 2);
      const table = defenceModule.replayDecision(inputs, board, { flop: history, turn: [], river: [] });
      const node = table.log.at(-1).node, base = defence.baseMix(table, board, node, hero);
      const legacyMix = originalMix(table, board, node, hero, base);
      const mix = runtimeDefence.mix(table, board, node, hero, base);
      return freeze({ node, actor: table.log.at(-1).seat, legacyMix: { ...legacyMix }, mix: { ...mix }, ...last, model });
  };
  const evaluate = options => {
    const data = dataOptions(options, ['board', 'hero', 'history']);
    return evaluateNormalized({ board: data.board, hero: data.hero, history: historyData(data.history) });
  };
  return Object.freeze({ ready: true, status: 'unapproved-research-runtime', production_eligible: false, model,
    // No strategy, Defence, engine or table reference escapes this closed driver.
    evaluate,
    releaseBoardCaches: () => defence.releaseBoardCaches(),
    playFixedDeal(options) {
      const data = dataOptions(options, ['board', 'hero', 'villain', 'runout', 'history', 'seed', 'rootQuantile']);
      const { board: boardText, hero: heroText, villain: villainText, runout: runoutText, seed, rootQuantile = .5 } = data;
      const history = historyData(data.history);
      if ([boardText, heroText, villainText, runoutText].some(value => typeof value !== 'string')) throw new Error('Invalid fixed-deal card data');
      if (typeof seed !== 'string' || !seed.length || !Number.isFinite(rootQuantile) || rootQuantile < 0 || rootQuantile >= 1) throw new Error('Invalid fixed-deal seed or root quantile');
      const board = modelModule.parseFlopBoard(boardText).cards, hero = modelModule.parseCards(heroText, 2);
      const villain = modelModule.parseCards(villainText, 2), runout = modelModule.parseCards(runoutText, 2);
      if (new Set([...board, ...hero, ...villain, ...runout]).size !== 9) throw new Error('Overlapping fixed-deal cards');
      defence.releaseBoardCaches();
      const decision = evaluateNormalized({ board: boardText, hero: heroText, history });
      const forced = policyActions.choose(decision.mix, rootQuantile, policyActions.NODES[decision.node]);
      const other = decision.actor === inputs.spot.ip ? inputs.spot.oop : inputs.spot.ip;
      const random = randomModule.seededRandom(randomModule.seedFor(`${seed}|closed-flop-veto-v${EXPERIMENTAL_FLOP_VETO_VERSION}|${boardText}|${heroText}|${villainText}|${runoutText}|${JSON.stringify(history)}`));
      defence.releaseBoardCaches();
      const terminalNet = driverModule.playFromNode({ hands: { [decision.actor]: hero, [other]: villain },
        flop: board, runout, history, forced, policy: candidate.policy, laterPolicy: later.policy,
        random, spot: inputs.spot, defence: runtimeDefence });
      if (!Number.isFinite(terminalNet)) throw new Error('Pinned driver failed to complete the fixed deal');
      return freeze({ root_action: forced, root_decision: decision, terminal_net_bb: terminalNet,
        interpretation: 'one fixed-deal outcome, not an expected value', continuation_complete: true, model });
    },
  });
}
