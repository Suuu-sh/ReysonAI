"""Only static integrity assertions; focused runtime and full gates are separate."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
ROOT = Path(__file__).resolve().parents[3]
BASE = '85a44ec419b9d449c4715bab3ad7f328b54499fd'
PREFIX = 'apps/frontend/scripts/postflop-ai/'
SPEC = importlib.util.spec_from_file_location('completion_inventory', ROOT / (PREFIX + 'perf/verify-model11-completion-representative-source.py'))
INVENTORY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INVENTORY)
class CompletionRepresentativeSourceTests(unittest.TestCase):
    def test_all85a_tracked_bytes_preserved(self):
        names = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', BASE], cwd=ROOT, text=True).splitlines()
        for name in names:
            self.assertEqual((ROOT / name).read_bytes(), subprocess.check_output(['git', 'show', f'{BASE}:{name}'], cwd=ROOT), name)
    def test_new_graph_and_exact_existing_strict_graph_raw12(self):
        report = INVENTORY.verify(ROOT)
        self.assertEqual(report['rawInputFiles'], 12)
        self.assertEqual(report['rawInputBytes'], 33091509)
        new_graph = {row['path'] for row in INVENTORY.expected(ROOT)['sources']}
        strict_graph = {row['path'] for row in INVENTORY.STRICT.graph(ROOT)}
        self.assertIn(PREFIX + 'offpath-behavior-model11.mjs', new_graph)
        self.assertNotIn(PREFIX + 'model11-completion-representative.mjs', strict_graph)
    def test_exact_full_plan_and_no_default_or_typed_import(self):
        plan = json.loads((ROOT / 'apps/frontend/tests/fixtures/model11-representative-full-plan.json').read_bytes())
        self.assertEqual(plan, {'kind': 'representative', 'scope': 'full', 'cacheBatchSize': 512})
        graph = INVENTORY.expected(ROOT)['sources']
        self.assertFalse(any('/src/trainer/' in row['path'] or '/src/estimated/postflop/' in row['path'] for row in graph))
    def test_fixed_cell_rng_cache_and_all_ev_quality_calls(self):
        text = (ROOT / (PREFIX + 'model11-completion-representative.mjs')).read_text()
        for exact in ['seededRandom(seedFor(`${inputs.config.seed}|${board.id}|${cell.opponent}|${cell.hero}`))',
                      'trialIndex % cell.cacheBatchSize === 0', 'Array.from({ length: 24 }, () => random())',
                      'baselineReturn: baseline.returns[cell.hero]', 'candidateReturn: result.returns[cell.hero]',
                      'expandedModel11Legality(inputs, flop, later, plan.boardList)', 'validateModel11Balance(balancePlan, strictBinding, balance)',
                      'computedDefence: false', 'requireExisting: true', 'fresh: true']:
            self.assertIn(exact, text)
        contract = (ROOT / (PREFIX + 'model11-completion-representative-contract.mjs')).read_text()
        self.assertIn('execution.complete(decision.request, decision.ownCombo, proof)', contract)
        self.assertIn('sampleEffectiveAction(verifiedLaw, decision.random)', contract)
        self.assertNotIn('skip', contract)
        self.assertIn('[...(binding.plan.boardList.find(board => board.id === cell.board)?.cards ?? [])].sort((a, b) => b - a)', contract)
        paired = (ROOT / 'apps/frontend/tests/helpers/model11-completion-paired-boards.mjs').read_text()
        self.assertIn("['KcKd4h', '8c8d2h']", paired)
        self.assertIn('originalPlanOrderPreserved: true', paired)
        cli = (ROOT / (PREFIX + 'evaluate-model11-completion-representative.mjs')).read_text()
        self.assertLess(cli.index('if (reportInput.bytes > 16 * 1024 * 1024)'), cli.index("validateCompletionRepresentativeReceipt(json(options['--report'])"))
if __name__ == '__main__':
    unittest.main()
