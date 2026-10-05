"""Static checks, no Node/strategy execution and no numerical gate claim."""
import importlib.util
import json
import subprocess
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[3]
PREFIX = 'apps/frontend/scripts/postflop-ai/'
ORIGINAL = '1e417d24cd123d85039545eecebe0154e5ecf8c4'
MEMO = '7911d9a54acd2c3d67db0e3d48b2aad08bb339fc'
spec = importlib.util.spec_from_file_location('dual_inventory', ROOT / (PREFIX + 'perf/verify-model11-dual-source-audit.py'))
INVENTORY = importlib.util.module_from_spec(spec)
spec.loader.exec_module(INVENTORY)

class DualSourceAuditTests(unittest.TestCase):
    def test_admitted_closed_sources_and_raw12(self):
        result = INVENTORY.verify(ROOT)
        self.assertEqual(result['strict']['rawInputFiles'], 12)
        self.assertEqual(result['strict']['rawInputBytes'], 33091509)

    def test_every_memo_baseline_file_preserved_except_two_exact_inventory_refreshes(self):
        names = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', MEMO], cwd=ROOT, text=True).splitlines()
        allowed = {'apps/frontend/tests/fixtures/model11-gate-source-graph.json', 'apps/frontend/tests/fixtures/model11-completion-representative-source-graph.json'}
        for name in names:
            if name not in allowed:
                self.assertEqual((ROOT / name).read_bytes(), subprocess.check_output(['git', 'show', f'{MEMO}:{name}'], cwd=ROOT), name)

    def test_original_same_source_validator_store_and_numerical_logic_are_unchanged(self):
        for name in ['model11-completion-representative.mjs', 'model11-completion-representative-contract.mjs',
                     'model11-completion-representative-store.mjs', 'evaluate-model11-completion-representative.mjs',
                     'model11-gate-contract.mjs', 'model11-gate-drivers.mjs', 'gate-model11.mjs', 'simulation-model11.mjs']:
            self.assertEqual((ROOT / (PREFIX + name)).read_bytes(), subprocess.check_output(['git', 'show', f'{ORIGINAL}:{PREFIX}{name}'], cwd=ROOT), name)

    def test_all_postreplay_checks_are_exactly_preserved(self):
        text = (ROOT / (PREFIX + 'model11-completion-representative.mjs')).read_text()
        old = text[text.index('  const plan = binding.plan, strictBinding = binding.strictBalance;', text.index('export function audit')):text.rfind('\n}')]
        old = old.replace("kind: 'model11-strict-balance-composite-behavior-representative-gate-result'", "kind: 'model11-dual-source-strict-balance-composite-behavior-representative-gate-result'")
        old = old.replace("replay: { pass: true, savedNumericalHash: saved.numericalHash, freshNumericalHash: replay.numericalHash,\n      comparison: 'every cell, every paired trial return and every completion event/law/proof; independently sampled baseline and candidate, no checkpoint replay' }", 'replay: equivalence')
        new = (ROOT / (PREFIX + 'model11-dual-source-quality.mjs')).read_text()
        self.assertEqual(new[new.index('  const plan ='):new.rfind('\n}')], old)

    def test_fresh_lane_cannot_read_old_numeric_results(self):
        text = (ROOT / (PREFIX + 'evaluate-model11-dual-source-audit.mjs')).read_text()
        lane = text[text.index('async function freshLane('):text.index('function importFreshCell(')]
        for forbidden in ['spec.original.report', 'spec.original.evidence', 'original-validation.json', 'saved.cellRecords', 'saved.results']:
            self.assertNotIn(forbidden, lane)
        self.assertIn('produceCompletionRepresentativeCell(inputs, flop, later, binding, store, index, cells[index])', lane)
        self.assertIn('beginFreshCellAttempt(ctx, laneRoot, index, provenance)', lane)
        self.assertIn('{ fresh: true }', text[text.index('export function beginFreshCellAttempt'):text.index('async function freshLane')])
        self.assertIn('index % 4 === lane', text)
        self.assertIn('completions.length !== 72', text)
        self.assertNotIn('spawn(', text)

    def test_preserved96_fixture_is_nonvacuous_and_not_a_gate_receipt(self):
        fixture = json.loads((ROOT / 'apps/frontend/tests/fixtures/model11-dual-source-full-proof96.json').read_bytes())
        self.assertIn('not-gate-evidence', fixture['kind'])
        a, b = fixture['sides']['original'], fixture['sides']['memo7911']
        self.assertNotEqual(a['bindingHash'], b['bindingHash'])
        self.assertEqual(a['resultPayloadSha256'], b['resultPayloadSha256'])
        for side in [a, b]:
            self.assertEqual(sum(len(value.get('trials', [])) for value in side['files'].values()), 96)
            proofs = [value['proof'] for value in side['files'].values() if 'proof' in value]
            self.assertEqual(len(proofs), 1)
            self.assertEqual(len(proofs[0]['rows']), 84)

    def test_original_ignored_raw12_and_graph_are_rechecked_without_an_old_engine(self):
        text = (ROOT / (PREFIX + 'evaluate-model11-dual-source-audit.mjs')).read_text()
        check = text[text.index('  const assertOriginalFiles ='):text.index('  assertOriginalFiles();')]
        self.assertIn('assertCapturedSourceRecords(spec.original.root, saved.binding.source)', check)
        runtime = (ROOT / (PREFIX + 'model11-dual-source-runtime.mjs')).read_text()
        pins = runtime[runtime.index('export function assertCapturedSourceRecords'):runtime.index('export function loadDualSourceSpec')]
        for source in ['source.strictBalance.inventory', 'source.strictBalance.sources', 'source.strictBalance.inputs',
                       'source.compositeBehavior.inventory', 'source.compositeBehavior.sources', 'source.inputs']:
            self.assertIn(source, pins)
        self.assertIn('auditFileRecord(root, expected.path)', pins)
        self.assertEqual(text.count('assertOriginalFiles();'), 2)
        self.assertNotIn('loadDualSourceContext', check)

    def test_narrow_recovery_requires_completed_attempt_receipt_and_never_generates_during_finish(self):
        text = (ROOT / (PREFIX + 'evaluate-model11-dual-source-audit.mjs')).read_text()
        resume = text[text.index('export function readCompletedFreshCell'):text.index('export function beginFreshCellAttempt')]
        self.assertIn('if (!exists(receiptPath)) return null', resume)
        self.assertIn('validateFreshStore(ctx, root, index, completion, provenance)', resume)
        self.assertIn('`attempt-${randomUUID()}`', text)
        self.assertIn('laneProvenanceHash: contentHash(provenance)', text)
        finish = text[text.index('async function finish'):text.index("if (process.argv[1]")]
        self.assertNotIn('produceCompletionRepresentativeCell', finish)
        self.assertIn('requireExisting: true', finish)
        self.assertIn('validateFullFreshCoverage([...actualFreshReceipts.values()])', finish)
        self.assertIn('if (exists(receiptPath))', finish)

if __name__ == '__main__':
    unittest.main()
