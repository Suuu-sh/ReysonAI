import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, cpSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildResearchVeto } from '../scripts/postflop-ai/build-flop-promotion-veto.mjs';
import { applyReviewedFlopPromotionVeto, vetoHash, VETO_IMPLEMENTATION_SHA256, VETO_BINDING_BUILDER_SHA256 } from '../scripts/postflop-ai/flop-promotion-veto.mjs';

// Requires the explicitly restored, pinned research snapshot. No reference artifact fallback.
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const research = process.env.LOW_FLOP_RESEARCH_ROOT ?? join(repository, '.local/low-flop-research');
const snapshotRoot = join(research, 'main-baseline');
const reportPath = join(research, 'validation-main-case1-n8192.json');
const planPath = join(research, 'validation-plan.json');
const available = existsSync(snapshotRoot) && existsSync(reportPath) && existsSync(planPath);
if (process.env.REQUIRE_LOW_FLOP_RESEARCH === '1' && !available) throw new Error('Pinned low-flop research fixture is required; do not substitute or generate a reference artifact');
const unavailableReason = available ? false : 'Requires the explicitly restored pinned low-flop research fixture';
const realReport = available ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
const realPlan = available ? JSON.parse(readFileSync(planPath, 'utf8')) : null;
function changedCopies(reportPatch = () => {}, planPatch = () => {}) {
  const directory = mkdtempSync(join(tmpdir(), 'low-flop-report-contract-'));
  const report = structuredClone(realReport), plan = structuredClone(realPlan);
  reportPatch(report); planPatch(plan);
  const reportCopy = join(directory, 'report.json'), planCopy = join(directory, 'plan.json');
  writeFileSync(reportCopy, JSON.stringify(report)); writeFileSync(planCopy, JSON.stringify(plan));
  return { snapshotRoot, reportPath: reportCopy, planPath: planCopy };
}

test('real reviewed research builds a matching but unapproved context and only a preview veto', { skip: unavailableReason }, async () => {
  const built = await buildResearchVeto({ snapshotRoot, reportPath, planPath });
  assert.equal(built.status, 'unapproved-counterfactual'); assert.equal(built.certificate.authoring_status, 'unapproved-research-candidate');
  assert.equal(built.candidate_default.applied, false); assert.equal(built.candidate_default.reason, 'candidate-approval-missing');
  assert.equal(built.preview.applied, true); assert.equal(built.preview.removed_call_pp, 98);
  assert.deepEqual(built.preview.mix, realReport.initial.raw); assert.equal(built.preview.production_eligible, false);
  assert.equal(built.saved_input_records.length, 6);
});

test('builder rejects contradictory actions, fold baselines, observed extrema and moments', { skip: unavailableReason }, async () => {
  const mutations = [r => r.rollout.forced_action = 'raise', r => r.rollout.fold_incremental_payoff_bb = 1,
    r => r.rollout.min_observed_bb = -1000, r => r.rollout.max_observed_bb = 1000,
    r => r.rollout.mean_call_bb = 1000, r => r.rollout.positive_payoff_samples = 1.5,
    r => r.rollout.se_bb += 1, r => r.rollout.positive_payoff_samples = 0,
    r => r.samples = 8191, r => r.samples = 1_000_001];
  for (const mutate of mutations) await assert.rejects(buildResearchVeto(changedCopies(mutate)));
});

test('builder rejects incomplete or changed protocols, source identities, policy identities and root mixes', { skip: unavailableReason }, async () => {
  for (const mutate of [p => delete p.schema_version, p => delete p.cases[0].hero, p => p.seed += '-changed',
    p => delete p.per_case_delta, p => p.cases[1].case = 1]) {
    await assert.rejects(buildResearchVeto(changedCopies(undefined, mutate)));
  }
  for (const mutate of [r => r.source_graph_sha256 = vetoHash('changed-source'), r => r.flop_policy_hash = vetoHash('changed-policy'),
    r => { r.initial.actual.call--; r.initial.actual.fold++; }]) {
    await assert.rejects(buildResearchVeto(changedCopies(mutate)));
  }
});

test('mutated snapshot source is rejected before replay rather than rebinding old results', { skip: unavailableReason }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'low-flop-snapshot-source-'));
  for (const record of realReport.source_graph) {
    const destination = join(root, record.path); mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(snapshotRoot, record.path), destination);
  }
  appendFileSync(join(root, 'apps/frontend/scripts/postflop-ai/defence.mjs'), '\n// Deliberate fixture change.\n');
  await assert.rejects(buildResearchVeto({ snapshotRoot: root, reportPath, planPath }), /Snapshot differs/);
});

test('even semantic-equivalent saved-input byte changes cannot reuse the old certificate or receipt', { skip: unavailableReason }, async () => {
  const original = await buildResearchVeto({ snapshotRoot, reportPath, planPath });
  // Synthetic test receipt only, never written or presented as real implementation approval.
  const receipt = { schema_version: 1, status: 'independently-reviewed-for-candidate', scope: 'flop-promotion-veto-v1',
    review_sha256: vetoHash('synthetic-builder-test-approval'), approved_certificate_sha256: vetoHash(original.certificate),
    approved_binding_sha256: vetoHash(original.binding), approved_candidate_source_sha256: VETO_IMPLEMENTATION_SHA256,
    approved_binding_builder_sha256: VETO_BINDING_BUILDER_SHA256 };
  assert.equal(applyReviewedFlopPromotionVeto({ ...original, approvalReceipt: receipt }).applied, true);
  const root = mkdtempSync(join(tmpdir(), 'low-flop-snapshot-input-')); cpSync(snapshotRoot, root, { recursive: true });
  appendFileSync(join(root, 'apps/frontend/src/estimated/opening-ranges.json'), '\n');
  const changed = await buildResearchVeto({ snapshotRoot: root, reportPath, planPath });
  assert.equal(changed.binding.identities.saved_support_sha256, original.binding.identities.saved_support_sha256);
  assert.notEqual(changed.binding.identities.saved_input_bytes_sha256, original.binding.identities.saved_input_bytes_sha256);
  assert.equal(applyReviewedFlopPromotionVeto({ ...changed, certificate: original.certificate, approvalReceipt: receipt }).applied, false);
});
