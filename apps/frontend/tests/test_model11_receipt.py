"""Future static receipt tests; no Node process is started by these tests."""
import importlib.util
import json
import pathlib
import tempfile
import unittest

FRONTEND = pathlib.Path(__file__).resolve().parents[1]
RUNNER = FRONTEND / 'scripts/postflop-ai/perf/run-model11-bounded.py'
SPEC = importlib.util.spec_from_file_location('model11_receipt', RUNNER)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Model11ReceiptTests(unittest.TestCase):
    def test_transitive_graph_covers_geometry_inputs_and_runner(self):
        repository = FRONTEND.parents[1]
        roots = ['apps/frontend/scripts/postflop-ai/effective-reach.mjs',
                 'apps/frontend/tests/postflop-effective-law-model11.test.mjs']
        capture = MODULE.capture(FRONTEND, repository, roots)
        for path in ['configs/cash-6max-100bb.json', 'configs/multiway-preflop-stage2.json',
                     'apps/frontend/scripts/data/hu-after-multiway-spots.json',
                     'apps/frontend/src/estimated/datasets.ts',
                     'apps/frontend/src/estimated/opponent-profiles.ts',
                     'apps/frontend/scripts/postflop-ai/perf/run-model11-bounded.py']:
            self.assertIn(path, capture['transitive_sources'])
        self.assertEqual(len(capture['immutable_fixtures']), 156)

    def test_changed_transitive_import_and_symlink_are_not_hidden(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory).resolve()
            (root / 'entry.mjs').write_text("import data from './geometry.json' with {type:'json'};")
            (root / 'geometry.json').write_text('{"pot":1}')
            before = MODULE.source_graph(root, ['entry.mjs'])
            (root / 'geometry.json').write_text('{"pot":2}')
            self.assertNotEqual(before, MODULE.source_graph(root, ['entry.mjs']))
            (root / 'alias.json').symlink_to(root / 'geometry.json')
            (root / 'entry.mjs').write_text("import data from './alias.json' with {type:'json'};")
            with self.assertRaises(ValueError):
                MODULE.source_graph(root, ['entry.mjs'])

    def test_changed_frozen_fixture_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = pathlib.Path(directory).resolve()
            frontend = repository / 'apps/frontend'
            receipt_dir = frontend / '.local/hu-model11'
            legacy_dir = frontend / '.local/postflop-ai/legacy-source'
            receipt_dir.mkdir(parents=True)
            legacy_dir.mkdir(parents=True)
            fixture = frontend / 'fixture.json'
            fixture.write_text('{}')
            record = {'path': 'apps/frontend/fixture.json', 'bytes': 2,
                      'sha256': MODULE.digest(b'{}'), 'kind': 'frozen-test-fixture'}
            (receipt_dir / 'source-copy.json').write_text(json.dumps({'copied_files': [record]}))
            (legacy_dir / 'manifest.json').write_text('{}')
            expected = MODULE.digest((receipt_dir / 'source-copy.json').read_bytes())
            MODULE.immutable_fixtures(frontend, repository, expected_manifest_hash=expected, expected_legacy_hash=MODULE.digest(b'{}'))
            fixture.write_text('{"changed":true}')
            with self.assertRaises(ValueError):
                MODULE.immutable_fixtures(frontend, repository, expected_manifest_hash=expected, expected_legacy_hash=MODULE.digest(b'{}'))

    def test_added_six_real_bundle_is_separate_complete_and_pinned(self):
        repository = FRONTEND.parents[1]
        roots = ['apps/frontend/scripts/postflop-ai/effective-reach.mjs',
                 'apps/frontend/tests/postflop-effective-law-model11.test.mjs']
        original = MODULE.capture(FRONTEND, repository, roots)
        added = MODULE.capture(FRONTEND, repository, roots, 'six-real-v1')
        self.assertEqual(len(original['immutable_fixtures']), 156)
        self.assertEqual(len(added['immutable_fixtures']), 171)
        self.assertTrue(all(added['immutable_fixtures'].get(path) == record for path, record in original['immutable_fixtures'].items()))
        self.assertIn('apps/frontend/tests/helpers/model11-six-real-controls.mjs', added['transitive_sources'])
        with self.assertRaises(ValueError):
            MODULE.six_real_fixtures(FRONTEND, repository, expected_manifest_hash='0' * 64)

    def test_six_real_selection_requires_extra_pins_and_one_exact_case(self):
        MODULE.validate_fixture_selection('six real support case 1 ', 'six-real-v1')
        MODULE.validate_fixture_selection('existing-fixture chronological', 'original154')
        for pattern, fixture_set in [('six real support case 1 ', 'original154'),
                                     ('.*', 'original154'), ('six real support case', 'six-real-v1'),
                                     ('six real support case 7 ', 'six-real-v1')]:
            with self.assertRaises(ValueError):
                MODULE.validate_fixture_selection(pattern, fixture_set)

    def test_added_six_real_missing_duplicate_drift_and_symlink_fail_closed(self):
        source_manifest = json.loads((FRONTEND / '.local/hu-model11/six-real-fixtures-v1.manifest.json').read_bytes())
        with tempfile.TemporaryDirectory() as directory:
            repository = pathlib.Path(directory).resolve()
            frontend = repository / 'apps/frontend'
            manifest_path = frontend / '.local/hu-model11/six-real-fixtures-v1.manifest.json'
            manifest_path.parent.mkdir(parents=True)
            for record in source_manifest['files']:
                target = repository / record['path']
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((FRONTEND.parents[1] / record['path']).read_bytes())
            def set_manifest(manifest):
                manifest_path.write_text(json.dumps(manifest))
                return MODULE.digest(manifest_path.read_bytes())
            missing = json.loads(json.dumps(source_manifest))
            missing['files'].pop()
            with self.assertRaises(ValueError):
                MODULE.six_real_fixtures(frontend, repository, expected_manifest_hash=set_manifest(missing))
            duplicate = json.loads(json.dumps(source_manifest))
            policies = [index for index, record in enumerate(duplicate['files']) if record['kind'] == 'exact-original-model10-policy-envelope']
            duplicate['files'][policies[1]] = duplicate['files'][policies[0]]
            with self.assertRaises(ValueError):
                MODULE.six_real_fixtures(frontend, repository, expected_manifest_hash=set_manifest(duplicate))
            expected = set_manifest(source_manifest)
            fixture = repository / source_manifest['files'][0]['path']
            original = fixture.read_bytes()
            fixture.write_bytes(original + b' ')
            with self.assertRaises(ValueError):
                MODULE.six_real_fixtures(frontend, repository, expected_manifest_hash=expected)
            backing = fixture.with_suffix('.backing')
            backing.write_bytes(original)
            fixture.unlink()
            fixture.symlink_to(backing)
            with self.assertRaises(ValueError):
                MODULE.six_real_fixtures(frontend, repository, expected_manifest_hash=expected)


if __name__ == '__main__':
    unittest.main()
