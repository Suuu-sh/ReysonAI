"""Source-isolation checks only; no numerical strategy acceptance or Node runtime claim."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
ROOT = Path(__file__).resolve().parents[3]
BASE = '3dc6a1fc862faa22678a96489263eb677080e0ce'
PREFIX = 'apps/frontend/scripts/postflop-ai/'
SPEC = importlib.util.spec_from_file_location('strict_inventory', ROOT / (PREFIX + 'perf/verify-model11-gate-driver-source.py'))
INVENTORY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INVENTORY)

class CompletionSourceTests(unittest.TestCase):
    def test_every_preexisting_tracked_byte_preserved(self):
        names = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', BASE], cwd=ROOT, text=True).splitlines()
        for name in names:
            expected = subprocess.check_output(['git', 'show', f'{BASE}:{name}'], cwd=ROOT)
            self.assertEqual((ROOT / name).read_bytes(), expected, name)

    def test_strict_closed_graph_raw_inputs_unchanged(self):
        report = INVENTORY.verify(ROOT)
        self.assertEqual(report['rawInputFiles'], 12)
        self.assertEqual(report['rawInputBytes'], 33091509)
        strict = {row['path'] for row in INVENTORY.graph(ROOT)}
        for name in ['offpath-behavior-model11.mjs', 'simulation-model11-completion.mjs', 'evaluate-model11-completion.mjs']:
            self.assertNotIn(PREFIX + name, strict)

    def test_saved_behavior_has_no_inference_surface(self):
        text = (ROOT / (PREFIX + 'offpath-behavior-model11.mjs')).read_text()
        saved = text.split('class SavedBehavior extends Defence {', 1)[1].split('\n}', 1)[0]
        for method in ['reach', 'context', 'betting', 'queryEquity', 'queryEquities', 'mix', 'requirement', 'facts', 'bettingFacts', 'summarize', 'build', 'buildBetting']:
            self.assertIn(method + "() { fail('forbidden-completion-inference'", saved)
        completion = text.split('const complete = (request, combo, certificate) => {', 1)[1].split('const behaviorLaw', 1)[0]
        self.assertLess(completion.index('ownPrefix(request, combo)'), completion.index('verifyZeroLikelihoodProof(strict'))
        self.assertLess(completion.index('verifyZeroLikelihoodProof(strict'), completion.index('saved.baseMix'))
        for forbidden in ['.betting(', '.context(', '.reach(', 'sampleReference', 'profile', 'opponentHole', 'runout']:
            self.assertNotIn(forbidden, completion)
        self.assertIn('prefix.pending.observation.byAction.allin', text)
        self.assertIn('compileDeclaredPolicyLaw(mix, strict.belief.seats[role].executor.nodeOrders[node]', text)
        self.assertIn('behaviorIdentity: identity.behaviorIdentity, compositeExecutionIdentity: identity.identity', text)

    def test_pinned_artifact_historical_evidence_and_fixed96(self):
        for filename in ['model11-execution-artifacts.json', 'model11-completion-historical-evidence.json']:
            manifest = json.loads((ROOT / 'apps/frontend/tests/fixtures' / filename).read_bytes())
            for row in manifest['files']:
                data = (ROOT / row['path']).read_bytes()
                self.assertEqual(len(data), row['bytes']); self.assertEqual(hashlib.sha256(data).hexdigest(), row['sha256'])
        plan = json.loads((ROOT / 'apps/frontend/tests/fixtures/model11-completion96-plan.json').read_bytes())
        self.assertEqual(plan['mode'], 'simulation-completion-v1'); self.assertEqual(plan['samples'], 16)
        self.assertEqual(len(plan['boardList']) * len(plan['profiles']) * len(plan['heroes']) * plan['samples'], 96)

if __name__ == '__main__':
    unittest.main()
