"""Static source/integrity tests only. They do not substitute for Node/numerical runs."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
ROOT = Path(__file__).resolve().parents[3]
PATH = ROOT / 'apps/frontend/scripts/postflop-ai/perf/verify-model11-gate-driver-source.py'
spec = importlib.util.spec_from_file_location('driver_source', PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DriverSourceTests(unittest.TestCase):
    def test_closed_inventory_and_raw_twelve(self):
        report = module.verify(ROOT)
        self.assertEqual(report['rawInputFiles'], 12)
        self.assertEqual(report['rawInputBytes'], 33091509)
        self.assertGreater(report['sourceFiles'], 40)

    def test_unresolved_loads_and_package_imports_fail_closed(self):
        for text in ['const x = import(path);', 'const x = require(name);', 'import x from "untracked-package";', 'eval(code);', 'new Function(code);']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                module.dependencies(text)
        self.assertEqual(module.dependencies('import x from "./a.mjs"; import { readFileSync } from "node:fs";'), ['./a.mjs'])

    def test_changed_source_differs_from_inventory(self):
        expected = module.expected(ROOT)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for row in expected['sources']:
                target = root / row['path']
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / row['path']).read_bytes())
            target = root / 'apps/frontend/scripts/postflop-ai/model11-gate-contract.mjs'
            target.write_text(target.read_text() + '\n// Deliberate mutation must change the recorded graph.\n')
            self.assertNotEqual(module.expected(root), expected)
            target.write_text(target.read_text() + '\nimport(unresolvedSource);\n')
            with self.assertRaises(ValueError):
                module.expected(root)

    def test_original_graph_has_no_changes(self):
        path = ROOT / 'apps/frontend/scripts/postflop-ai/perf/run-model11-bounded.py'
        spec = importlib.util.spec_from_file_location('original_graph', path)
        legacy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(legacy)
        graph = legacy.source_graph(ROOT, [
            'apps/frontend/scripts/postflop-ai/cli.mjs',
            'apps/frontend/scripts/postflop-ai/board-worker.mjs',
            'apps/frontend/scripts/postflop-ai/audit-all-boards.mjs'])
        for path in graph:
            original = subprocess.check_output(['git', 'show', f'6cedea87b9f9fa92fcf8b911d46166fbd2ec5204:{path}'], cwd=ROOT)
            self.assertEqual((ROOT / path).read_bytes(), original, path)
        self.assertNotIn('apps/frontend/scripts/postflop-ai/model11-zero-proof.mjs', graph)

    def test_plans_require_explicit_full_and_small_diagnostic(self):
        for kind in ['representative', 'all-board']:
            diagnostic = json.loads((ROOT / f'apps/frontend/tests/fixtures/model11-{kind}-diagnostic-plan.json').read_bytes())
            full = json.loads((ROOT / f'apps/frontend/tests/fixtures/model11-{kind}-full-plan.json').read_bytes())
            self.assertEqual(diagnostic['scope'], 'diagnostic')
            self.assertEqual(len(diagnostic['boardIds']), 1)
            self.assertEqual(full['scope'], 'full')
            self.assertNotIn('samples', full)
            self.assertNotIn('boardIds', full)

if __name__ == '__main__':
    unittest.main()
