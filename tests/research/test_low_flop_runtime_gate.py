"""Python-only contracts for the mandatory closed-runtime gate; subprocesses are mocked."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/research'))
import low_flop_runtime_gate as runtime


class RuntimeGateTest(unittest.TestCase):
    def test_missing_fixture_fails_before_any_process_or_output(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(runtime.subprocess, 'run') as process:
            root = Path(directory)
            with self.assertRaises(ValueError): runtime.run_runtime_gate(root / 'missing', root / 'out')
            process.assert_not_called()
            self.assertFalse((root / 'out').exists())

    def test_staging_copies_exact_current_runtime_and_review_bytes_without_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            records = runtime.stage_runtime(root)
            self.assertEqual(len(records), 5)
            for record in records: self.assertEqual(runtime.file_record(root / record['path'], record['path']), record)
            with self.assertRaises(FileExistsError): runtime.stage_runtime(root)
            for record in records: self.assertEqual(runtime.file_record(root / record['path'], record['path']), record)

    def simulated(self, fail=None):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); fixture = base / 'fixture'; fixture.mkdir(); manifest = base / 'manifest'; manifest.write_text('{}')
            def core(root, output, _manifest):
                output.mkdir(); (output / 'candidate/apps/frontend').mkdir(parents=True); (output / 'tmp').mkdir()
                (output / 'candidate-inputs.json').write_text('[]'); (output / 'summary.json').write_text('{}')
                return {'contracts_passed': 27, 'skipped': int(fail == 'core-skip'), 'replays_passed': 7}
            def process(command, **kwargs):
                self.assertEqual(command, ['node', '--max-old-space-size=384', '--test-reporter=tap', runtime.RUNTIME_TEST])
                self.assertEqual(kwargs['timeout'], 90); self.assertEqual(kwargs['env']['REQUIRE_LOW_FLOP_RESEARCH'], '1')
                self.assertEqual(kwargs['env']['LOW_FLOP_RESEARCH_ROOT'], str(fixture)); self.assertEqual(kwargs['env']['NODE_OPTIONS'], '')
                if fail == 'timeout': raise subprocess.TimeoutExpired(command, 90)
                text = '\n'.join(f'# {key} {value}' for key, value in [('tests',9),('pass',9),('fail',0),('cancelled',0),('skipped',int(fail == 'runtime-skip')),('todo',0)]) + '\n'
                kwargs['stdout'].write(text + '# runtime-environment {"node":"v-test","versions":{}}\n')
                return subprocess.CompletedProcess(command, int(fail == 'exit'))
            with patch.object(runtime, 'verify_root', return_value={}), patch.object(runtime, 'run_gate', side_effect=core), patch.object(runtime.subprocess, 'run', side_effect=process) as run:
                if fail:
                    with self.assertRaises(ValueError): runtime.run_runtime_gate(fixture, base / 'out', manifest)
                else:
                    result = runtime.run_runtime_gate(fixture, base / 'out', manifest)
                    self.assertEqual(result['contracts_passed'], 36); self.assertEqual(result['runtime_contracts_passed'], 9); self.assertEqual(result['skipped'], 0)
                self.assertEqual(run.call_count, 0 if fail == 'core-skip' else 1)
            summary = json.loads((base / 'out/summary.json').read_text())
            self.assertEqual(summary['status'], 'failed' if fail else 'closed-runtime-research-gate-passed-not-approved')
            self.assertIs(summary['production_eligible'], False)
            if fail != 'core-skip': self.assertTrue((base / 'out/runtime.stdout').exists())

    def test_both_mandatory_suites_are_required(self): self.simulated()
    def test_core_skips_cannot_be_hidden_by_runtime_results(self): self.simulated('core-skip')
    def test_runtime_skips_cannot_be_hidden_by_exit_zero(self): self.simulated('runtime-skip')
    def test_failed_runtime_retains_logs_and_fails_overall(self): self.simulated('exit')
    def test_runtime_timeout_retains_failed_checkpoint(self): self.simulated('timeout')


if __name__ == '__main__': unittest.main()
