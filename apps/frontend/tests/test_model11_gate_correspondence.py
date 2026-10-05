"""Only static source/fixture integrity. No Node or poker numerical work."""
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
ROOT = Path(__file__).resolve().parents[3]
PATH = ROOT / 'apps/frontend/scripts/postflop-ai/perf/verify-model11-balance-kernel.py'
spec = importlib.util.spec_from_file_location('correspondence', PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CorrespondenceTests(unittest.TestCase):
    def test_exact_kernel_and_source(self):
        self.assertEqual(module.verify(ROOT)['substitutions'], 5)

    def test_threshold_mutation_is_not_allowed(self):
        contract = json.loads((ROOT / 'apps/frontend/tests/fixtures/model11-balance-kernel-correspondence.json').read_text())
        source = (ROOT / contract['source']).read_bytes()
        expected = module.reconstruct(source, contract)
        self.assertNotEqual(expected, expected.replace(b'monsterCheck < 0.08', b'monsterCheck < 0.07'))
        with self.assertRaises(ValueError):
            module.reconstruct(source.replace(b'monsterCheck < 0.08', b'monsterCheck < 0.07'), contract)

    def test_original_default_transitive_identity_unchanged(self):
        path = ROOT / 'apps/frontend/scripts/postflop-ai/perf/run-model11-bounded.py'
        spec = importlib.util.spec_from_file_location('original_graph', path)
        graph_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(graph_module)
        graph = graph_module.source_graph(ROOT, [
            'apps/frontend/scripts/postflop-ai/cli.mjs',
            'apps/frontend/scripts/postflop-ai/board-worker.mjs',
            'apps/frontend/scripts/postflop-ai/audit-all-boards.mjs'])
        for path in graph:
            original = subprocess.check_output(['git', 'show', f'e51db8e8e478665a6b00e5e4eebdf3a16846a640:{path}'], cwd=ROOT)
            self.assertEqual((ROOT / path).read_bytes(), original, path)
        self.assertNotIn('apps/frontend/scripts/postflop-ai/effective-reach.mjs', graph)


if __name__ == '__main__':
    unittest.main()
