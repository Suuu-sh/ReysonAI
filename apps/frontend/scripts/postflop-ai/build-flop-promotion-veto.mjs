// OFFLINE RESEARCH ONLY: replay a pinned snapshot and construct an UNAPPROVED certificate.
// Never writes policies, receipts, model identities or production data.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { captureSourceGraph, identityHash, auditFileRecord } from './audit-identity.mjs';
import { compatibleOpponentSupport, empiricalBernsteinInterval, postCapRawMix } from './rollout-diagnostic-contract.mjs';
import { vetoHash, validVetoBinding, previewFlopPromotionVeto, applyReviewedFlopPromotionVeto,
  FLOP_PROMOTION_VETO_VERSION, VETO_IMPLEMENTATION_SHA256, VETO_BINDING_BUILDER_SHA256 } from './flop-promotion-veto.mjs';

const snapshotsLoaded = new Map();
const shaBytes = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => vetoHash(a) === vetoHash(b);
const check = (value, message) => { if (!value) throw new Error(message); };
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-10;
const graphRoots = ['apps/frontend/scripts/postflop-ai/rollout-low-flop-defence.mjs'];

export async function buildResearchVeto({ snapshotRoot, reportPath, planPath }) {
  const root = resolve(snapshotRoot), rawBytes = readFileSync(reportPath), raw = JSON.parse(rawBytes);
  const planBytes = readFileSync(planPath), plan = JSON.parse(planBytes);
  check(plan.schema_version === 1 && Array.isArray(plan.cases) && plan.cases.length > 0 && plan.cases.length <= 512 &&
    plan.cases.every((item, i) => item.case === i + 1 && ['spot', 'board', 'hero', 'action', 'bettor_role'].every(key => typeof item[key] === 'string' && item[key].length > 0)) &&
    typeof plan.seed === 'string' && plan.seed.length > 0, 'Incomplete or ambiguous fixed-sample protocol');
  check(raw.status === 'complete' && raw.kind === 'offline_policy_conditional_mc_not_gto' && Number.isSafeInteger(raw.samples) && raw.samples >= 8192 && raw.samples <= 1_000_000,
    'A complete fixed-size continuation report is required');
  check(raw.rollout?.forced_action === 'call' && raw.rollout.fold_incremental_payoff_bb === 0, 'Report does not compare forced call against zero-increment fold');
  const graph = captureSourceGraph({ root, roots: graphRoots }), graphSha = identityHash(graph);
  check(graphSha === raw.source_graph_sha256 && same(graph, raw.source_graph), 'Snapshot differs from sampled source');
  check(!snapshotsLoaded.has(root) || snapshotsLoaded.get(root) === graphSha, 'Snapshot changed; use a fresh Node process');
  snapshotsLoaded.set(root, graphSha);
  const mod = name => import(pathToFileURL(resolve(root, 'apps/frontend/scripts/postflop-ai', name)).href);
  const inputModule = await mod('inputs.mjs'), policyModule = await mod('generate.mjs');
  const defenceModule = await mod('defence.mjs'), modelModule = await mod('model.mjs');
  const inputs = inputModule.loadInputs(raw.spot), candidate = policyModule.loadCandidate(inputs);
  const later = policyModule.loadLaterCandidate(inputs, candidate);
  check(!inputs.spot.history && later, 'Candidate is limited to legacy heads-up with a saved later artifact');
  check(inputs.fingerprint === raw.source_fingerprint && candidate.metadata.policy_hash === raw.flop_policy_hash &&
    later.metadata.policy_hash === raw.later_policy_hash, 'Saved policy/support identity differs from report');
  const board = modelModule.parseFlopBoard(raw.board).cards, hero = modelModule.parseCards(raw.hero, 2);
  const match = plan.cases?.find(item => item.spot === raw.spot &&
    same(modelModule.parseFlopBoard(item.board).cards, board) && same(modelModule.parseCards(item.hero, 2).sort((a,b)=>a-b), [...hero].sort((a,b)=>a-b)) &&
    item.action === raw.history.at(-1));
  const plannedSamples = plan.fixed_samples_per_case ?? plan.samples_per_case;
  check(match && plannedSamples === raw.samples && plan.seed === raw.seed && plan.per_case_delta === raw.delta,
    'Report is not the exact declared case/protocol');
  check(plan.family_error_budget_nominal > 0 && plan.family_error_budget_nominal <= 0.01 &&
    raw.delta * plan.cases.length <= plan.family_error_budget_nominal + 1e-15, 'Invalid family error allocation');
  const path = { flop: raw.history, turn: [], river: [] };
  const table = defenceModule.replayDecision(inputs, board, path), node = table.log.at(-1).node;
  check(node === raw.node && table.log.at(-1).seat === raw.actor, 'Decision differs from sampled node');
  const defence = defenceModule.defenceFor(inputs, candidate.policy, later.policy);
  defence.largeRun = true;
  const context = defence.context(table, board, node);
  check(context && context.street === 'flop' && context.bettor === raw.bettor, 'Missing exact facing context');
  const bettorRole = inputs.spot.ip === context.bettor ? 'ip' : 'oop';
  check(bettorRole === match.bettor_role, 'Bettor role differs from protocol');
  const own = defence.rangeItems(table, board, context.defender).find(item => item.combo.every(card => hero.includes(card)));
  check(own?.weight > 0, 'Hero has no saved support');
  const opponents = compatibleOpponentSupport(defence.rangeItems(table, board, context.bettor), board, hero);
  const total = opponents.reduce((sum, item) => sum + item.weight, 0);
  check(opponents.length === raw.reach.compatible_opponent_combos && close(total, raw.reach.compatible_opponent_weight) &&
    close(own.weight, raw.reach.hero_weight), 'Observed bettor support differs from sampled support');
  const base = defence.baseMix(table, board, node, hero);
  const equity = defence.equity(context, hero);
  check(equity !== null, 'No compatible showdown support');
  const rawMix = postCapRawMix(defence, context, base, equity, hero);
  const legacyMix = defence.mix(table, board, node, hero, base);
  check(same(rawMix, raw.initial.raw) && same(legacyMix, raw.initial.actual), 'Raw/final mix differs from sampled decision');
  check(close(context.call, raw.initial.call_bb) && close(context.potBefore, raw.initial.pot_before_bb), 'Sampled action geometry differs');
  const savedInputRecords = ['opening-ranges', 'preflop-ranges', 'three-bet-responses', 'four-bet-responses',
    'limp-responses', 'limp-deep-responses'].map(name => auditFileRecord(root, `apps/frontend/src/estimated/${name}.json`));
  const files = inputModule.artifactPaths(inputs.spot);
  const artifactHashes = [files.candidate, files.laterCandidate].map(path => shaBytes(readFileSync(path)));
  check(artifactHashes.every((hash, i) => hash === raw.artifacts[i]?.sha256), 'Policy artifact bytes differ from report');
  const selectedGraph = predicate => vetoHash(graph.filter(record => predicate(record.path)));
  const nonResearch = graph.filter(record => !record.path.endsWith('/rollout-low-flop-defence.mjs') &&
    !record.path.endsWith('/rollout-diagnostic-contract.mjs') && !record.path.endsWith('/audit-identity.mjs'));
  const binding = { schema_version: 1, street: 'flop', spot: inputs.spot.id, node, board, hero: [...hero].sort((a,b)=>a-b), history: path,
    model: { family: 'legacy-hu', base_defence_version: defenceModule.defenceVersionFor?.(inputs) ?? defenceModule.DEFENCE_VERSION,
      intervention_version: FLOP_PROMOTION_VETO_VERSION },
    identities: { input_fingerprint: inputs.fingerprint, saved_support_sha256: vetoHash(inputs.seatRows), saved_input_bytes_sha256: vetoHash(savedInputRecords),
      flop_policy_sha256: candidate.metadata.policy_hash, later_policy_sha256: later.metadata.policy_hash,
      flop_artifact_sha256: artifactHashes[0], later_artifact_sha256: artifactHashes[1], base_runtime_sha256: vetoHash(nonResearch),
      fallback_sha256: selectedGraph(path => /\/(?:policy|later-policy|later-tree)\.mjs$/.test(path)),
      classifier_sha256: selectedGraph(path => /\/(?:model|equity)\.mjs$/.test(path)),
      reach_sha256: selectedGraph(path => /\/(?:defence|inputs|browser-inputs|range-equity|spots)\.mjs$/.test(path)),
      intervention_sha256: VETO_IMPLEMENTATION_SHA256, binding_builder_sha256: VETO_BINDING_BUILDER_SHA256 },
    geometry: { bettor: context.bettor, defender: context.defender, pot_before_bb: context.potBefore, wager_bb: context.wager,
      call_bb: context.call, final_pot_bb: context.finalPot, rake_bb: context.rake,
      bettor_remaining_bb: table.stacks[context.bettor], defender_remaining_before_call_bb: table.stacks[context.defender],
      bettor_invested_bb: table.invested[context.bettor], defender_invested_bb: table.invested[context.defender],
      can_raise: context.target.canRaise, capped: context.capped },
    support: { hero_weight: own.weight, opponent_combos: opponents.length, opponent_weight: total, opponent_sha256: vetoHash(opponents) } };
  check(validVetoBinding(binding), 'Context is outside the narrowly supported research candidate');
  const lower = -table.stacks[context.defender], upper = table.pot + table.stacks[context.bettor], range = upper - lower;
  const observed = raw.rollout;
  check([observed.mean_call_bb, observed.sample_variance_bb2, observed.se_bb, observed.min_observed_bb, observed.max_observed_bb].every(Number.isFinite) &&
    observed.min_observed_bb >= lower - 1e-9 && observed.max_observed_bb <= upper + 1e-9 &&
    observed.min_observed_bb <= observed.mean_call_bb && observed.mean_call_bb <= observed.max_observed_bb &&
    observed.sample_variance_bb2 >= 0 && observed.sample_variance_bb2 <= range ** 2 / 4 * raw.samples / (raw.samples - 1) + 1e-8 &&
    close(observed.se_bb, Math.sqrt(observed.sample_variance_bb2 / raw.samples)) &&
    Number.isSafeInteger(observed.positive_payoff_samples) && observed.positive_payoff_samples >= 0 && observed.positive_payoff_samples <= raw.samples &&
    (observed.positive_payoff_samples !== 0 || observed.max_observed_bb <= 0) &&
    (observed.positive_payoff_samples !== raw.samples || observed.min_observed_bb > 0) &&
    (observed.max_observed_bb > 0 || observed.positive_payoff_samples === 0) &&
    (observed.min_observed_bb <= 0 || observed.positive_payoff_samples === raw.samples),
    'Recorded moments or observed extrema violate the bounded sampling contract');
  const interval = empiricalBernsteinInterval({ mean: raw.rollout.mean_call_bb, variance: raw.rollout.sample_variance_bb2,
    samples: raw.samples, payoffRange: range, delta: raw.delta });
  check(same(interval, raw.rollout.empirical_bernstein), 'Recorded interval or payoff range differs');
  const certificate = interval.upper < 0 ? { schema_version: 1, kind: 'negative-continuation-promotion-veto', intervention_version: FLOP_PROMOTION_VETO_VERSION,
    binding_sha256: vetoHash(binding), raw_mix_sha256: vetoHash(rawMix), legacy_mix_sha256: vetoHash(legacyMix),
    proof: { raw_report_sha256: shaBytes(rawBytes), protocol_sha256: shaBytes(planBytes), sampling_source_sha256: graphSha,
      fixed_sample_plan: true, planned_samples: plannedSamples, completed_samples: raw.samples,
      upper_bound_bb: interval.upper, lower_bound_bb: interval.lower, case_delta: raw.delta,
      family_cases: plan.cases.length, family_error_budget: plan.family_error_budget_nominal },
    authoring_status: 'unapproved-research-candidate', continuation_scope: 'legacy-runtime-including-inherited-deep-raise-fallbacks' } : null;
  const args = { rawMix, legacyMix, binding, certificate };
  check(identityHash(captureSourceGraph({ root, roots: graphRoots })) === graphSha, 'Source changed during replay');
  check(same(savedInputRecords, savedInputRecords.map(record => auditFileRecord(root, record.path))), 'Saved input bytes changed during replay');
  check([files.candidate, files.laterCandidate].every((path, i) => shaBytes(readFileSync(path)) === artifactHashes[i]),
    'Policy bytes changed during replay');
  return { schema_version: 1, status: 'unapproved-counterfactual', binding, saved_input_records: savedInputRecords, rawMix, legacyMix, certificate,
    evidence_assessment: { interval, classification: interval.upper < 0 ? 'negative' : interval.lower > 0 ? 'positive' : 'inconclusive' },
    candidate_default: applyReviewedFlopPromotionVeto(args), preview: previewFlopPromotionVeto(args) };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const [snapshotRoot, reportPath, planPath] = process.argv.slice(2);
  if (!snapshotRoot || !reportPath || !planPath) throw new Error('Usage: build-flop-promotion-veto.mjs snapshot-root report.json plan.json');
  process.stdout.write(JSON.stringify(await buildResearchVeto({ snapshotRoot, reportPath, planPath }), null, 2) + '\n');
}
