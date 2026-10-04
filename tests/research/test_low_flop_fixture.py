"""Python-only adversarial packaging tests. No Node processes or downloads."""
import hashlib
import gzip
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/research'))
import low_flop_fixture as fixture
import low_flop_gate as gate


class FixtureTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='low-flop-fixture-test-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.archive = self.root / 'fixture.tar.gz'
        self.manifest = self.root / 'manifest.json'
        self.destination = self.root / 'restored'

    def make(self, members=None, records=None):
        members = members if members is not None else [('main-baseline/file.json', b'{"preserved":true}\n', tarfile.REGTYPE)]
        with tarfile.open(self.archive, 'w:gz', format=tarfile.USTAR_FORMAT) as tar:
            for name, data, kind in members:
                info = tarfile.TarInfo(name)
                info.type = kind
                info.size = len(data) if kind == tarfile.REGTYPE else 0
                if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE):
                    info.linkname = '../../outside'
                tar.addfile(info, io.BytesIO(data) if info.size else None)
        records = records if records is not None else [
            {'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            for name, data, _ in members]
        self.data = {'schema_version': 1, 'kind': 'low-flop-research-fixture', 'approval': 'unapproved-research',
                     'production_eligible': False, 'member_count': len(records), 'archive': fixture.file_record(self.archive), 'files': records}
        self.save()
        return self.data

    def save(self):
        self.manifest.write_text(json.dumps(self.data))

    def restore(self):
        return fixture.restore(self.archive, self.manifest, self.destination)

    def test_round_trip_preserves_bytes_and_verifies_receipt(self):
        self.make()
        self.restore()
        self.assertEqual((self.destination / 'main-baseline/file.json').read_bytes(), b'{"preserved":true}\n')
        self.assertEqual(fixture.verify_root(self.destination, self.manifest)['member_count'], 1)

    def test_existing_destination_never_overwritten(self):
        self.make()
        self.destination.mkdir()
        sentinel = self.destination / 'user-data'
        sentinel.write_bytes(b'keep')
        with self.assertRaisesRegex(ValueError, 'existing destination'):
            self.restore()
        self.assertEqual(sentinel.read_bytes(), b'keep')

    def test_repack_uses_only_the_verified_manifest_member_set(self):
        self.make()
        source = self.root / 'source'; source.write_bytes(b'{"preserved":true}\n')
        canonical = self.root / 'canonical.tar.gz'
        fixture.write_archive({'main-baseline/file.json': source}, self.data['files'], canonical)
        self.archive = canonical; self.data['archive'] = fixture.file_record(canonical); self.save()
        self.restore()
        output = self.root / 'repacked.tar.gz'
        result = fixture.repack(self.destination, output, self.manifest)
        self.assertEqual(result['sha256'], self.data['archive']['sha256'])
        self.assertEqual(output.read_bytes(), canonical.read_bytes())
        with self.assertRaisesRegex(ValueError, 'fresh'): fixture.repack(self.destination, output, self.manifest)
        with self.assertRaisesRegex(ValueError, 'outside'): fixture.repack(self.destination, self.destination / 'bad.tar.gz', self.manifest)

    def test_bad_paths_rejected_before_destination_creation(self):
        for name in ['../outside', '/absolute', 'a/../outside', './name', 'a//b', 'a\\b', 'C:/file', 'a/']:
            with self.subTest(name=name):
                self.make([(name, b'x', tarfile.REGTYPE)])
                with self.assertRaises(ValueError):
                    self.restore()
                self.assertFalse(self.destination.exists())

    def test_links_devices_and_directories_rejected(self):
        for kind in [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE, tarfile.DIRTYPE]:
            with self.subTest(kind=kind):
                self.make([('file', b'', kind)])
                with self.assertRaisesRegex(ValueError, 'Non-regular'):
                    self.restore()
                self.assertFalse(self.destination.exists())

    def test_extended_headers_rejected_before_declared_payload_is_read(self):
        for kind in [tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_SPARSE]:
            with self.subTest(kind=kind):
                self.make([('file', b'', tarfile.REGTYPE)])
                header = tarfile.TarInfo('file')
                header.type = kind
                header.size = 1_000_000_000
                # No huge payload exists; rejection must happen at the fixed header.
                self.archive.write_bytes(gzip.compress(header.tobuf(format=tarfile.USTAR_FORMAT) + bytes(1024)))
                self.data['archive'] = fixture.file_record(self.archive)
                self.save()
                with self.assertRaisesRegex(ValueError, 'Non-regular/USTAR'):
                    self.restore()
                self.assertFalse(self.destination.exists())

    def test_duplicate_archive_member_rejected(self):
        self.make([('file', b'x', tarfile.REGTYPE), ('file', b'x', tarfile.REGTYPE)],
                  [{'path': 'file', 'bytes': 1, 'sha256': hashlib.sha256(b'x').hexdigest()}])
        with self.assertRaisesRegex(ValueError, 'Duplicate/unexpected'):
            self.restore()

    def test_duplicate_manifest_and_file_directory_collision_rejected(self):
        self.make()
        self.data['files'] *= 2
        self.data['member_count'] = 2
        self.save()
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.restore()
        self.data['files'][1] = {**self.data['files'][0], 'path': 'main-baseline'}
        self.save()
        with self.assertRaisesRegex(ValueError, 'collision'):
            self.restore()

    def test_missing_and_unexpected_members_rejected(self):
        self.make()
        self.data['files'].append({**self.data['files'][0], 'path': 'missing'})
        self.data['member_count'] = 2
        self.save()
        with self.assertRaisesRegex(ValueError, 'Missing archive'):
            self.restore()
        self.data['files'] = [self.data['files'][1]]
        self.data['member_count'] = 1
        self.save()
        with self.assertRaisesRegex(ValueError, 'unexpected archive'):
            self.restore()

    def test_outer_and_inner_size_hash_drift_rejected(self):
        for target, key, value in [('archive', 'bytes', 1), ('archive', 'sha256', '0' * 64),
                                   ('member', 'bytes', 1), ('member', 'sha256', '0' * 64)]:
            with self.subTest(target=target, key=key):
                self.make()
                (self.data['archive'] if target == 'archive' else self.data['files'][0])[key] = value
                self.save()
                with self.assertRaises(ValueError):
                    self.restore()
                self.assertFalse(self.destination.exists())

    def test_lfs_pointer_file_and_member_rejected(self):
        self.make()
        self.archive.write_bytes(fixture.LFS_HEADER + b'\noid sha256:' + b'0' * 64)
        with self.assertRaisesRegex(ValueError, 'LFS pointer'):
            self.restore()
        self.make([('file', fixture.LFS_HEADER, tarfile.REGTYPE)])
        with self.assertRaisesRegex(ValueError, 'LFS pointer'):
            self.restore()

    def test_symlink_ancestor_and_restored_member_rejected(self):
        self.make()
        link = self.root / 'link'
        link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            fixture.restore(self.archive, self.manifest, link / 'fresh')
        self.restore()
        target = self.destination / 'main-baseline/file.json'
        target.unlink()
        target.symlink_to(self.manifest)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            fixture.verify_root(self.destination, self.manifest)

    def test_post_restore_changes_missing_extra_and_receipt_rejected(self):
        for mutation in ['bytes', 'missing', 'extra', 'receipt']:
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory(dir=self.root) as directory:
                self.make()
                dest = Path(directory) / 'restored'
                fixture.restore(self.archive, self.manifest, dest)
                target = dest / 'main-baseline/file.json'
                if mutation == 'bytes':
                    target.write_bytes(b'changed')
                elif mutation == 'missing':
                    target.unlink()
                elif mutation == 'extra':
                    (dest / 'extra').write_bytes(b'new')
                else:
                    (dest / fixture.RECEIPT).write_text('{}')
                with self.assertRaises(ValueError):
                    fixture.verify_root(dest, self.manifest)

    def test_manifest_cannot_grant_approval_or_exceed_limits(self):
        self.make()
        for field, value in [('production_eligible', True), ('approval', 'approved')]:
            old = self.data[field]
            self.data[field] = value
            self.save()
            with self.assertRaises(ValueError):
                self.restore()
            self.data[field] = old
        self.data['files'][0]['bytes'] = fixture.MAX_FILE + 1
        self.save()
        with self.assertRaisesRegex(ValueError, 'size'):
            self.restore()


class GateTest(unittest.TestCase):
    def tap(self, count):
        return '\n'.join(f'# {key} {value}' for key, value in [
            ('tests', count), ('pass', count), ('fail', 0), ('cancelled', 0), ('skipped', 0), ('todo', 0)]) + '\n'

    def test_tap_counts_are_mandatory_no_skips(self):
        good = self.tap(4)
        gate.check_tap(good, 4)
        for bad in ['', good.replace('# pass 4', '# pass 3'), good.replace('# skipped 0', '# skipped 1'),
                    good + 'ok 1 # SKIP unavailable\n', good + '# pass 4\n']:
            with self.assertRaises(ValueError):
                gate.check_tap(bad, 4)

    def replay(self, case):
        raw, legacy = {'fold': 98, 'call': 0, 'raise': 2}, {'fold': 0, 'call': 98, 'raise': 2}
        return {'status': 'unapproved-counterfactual', 'rawMix': raw, 'legacyMix': legacy,
                'candidate_default': {'applied': False, 'mix': legacy},
                'preview': {'applied': case <= 4, 'production_eligible': False, 'mix': raw if case <= 4 else legacy}}

    def test_default_and_preview_scope_are_fail_closed(self):
        for case in range(1, 8):
            gate.check_replay(self.replay(case), case)
        result = self.replay(5)
        result['preview']['applied'] = True
        with self.assertRaises(ValueError):
            gate.check_replay(result, 5)
        result = self.replay(1)
        result['candidate_default']['applied'] = True
        with self.assertRaises(ValueError):
            gate.check_replay(result, 1)

    def test_absent_fixtures_fail_before_process_or_output(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(gate.subprocess, 'run') as run:
            root = Path(directory)
            with self.assertRaises(ValueError):
                gate.run_gate(root / 'missing', root / 'out')
            run.assert_not_called()
            self.assertFalse((root / 'out').exists())

    def simulated_gate(self, failure=None):
        # Mock every subprocess: these orchestration tests never start Node.
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); restored = base / 'fixture'; restored.mkdir()
            manifest = base / 'manifest.json'; manifest.write_text('{}')
            archive_identity = {'archive': {'sha256': 'a' * 64}}
            parity = {key: {'unchanged': True} for key in gate.PARITY_KEYS}
            parity.update(samples=128, seed=gate.PARITY_SEED, status='complete')
            calls = []

            def candidate(root, output, data, checkpoint):
                path = output / 'candidate'; (path / 'apps/frontend').mkdir(parents=True)
                return path, []

            def process(command, **kwargs):
                calls.append(command)
                self.assertEqual(command[:2], ['node', '--max-old-space-size=384'])
                self.assertEqual(kwargs['env']['REQUIRE_LOW_FLOP_RESEARCH'], '1')
                self.assertEqual(kwargs['env']['LOW_FLOP_RESEARCH_ROOT'], str(restored))
                self.assertEqual(kwargs['env']['NODE_OPTIONS'], '')
                index = len(calls)
                if failure == 'timeout':
                    kwargs['stderr'].write('preserved timeout evidence\n')
                    raise subprocess.TimeoutExpired(command, 90)
                if failure == 'exit':
                    kwargs['stdout'].write('preserved failure evidence\n')
                    return subprocess.CompletedProcess(command, 1)
                if index <= 4:
                    self.assertEqual(command[2], '--test-reporter=tap')
                    self.assertNotIn('--test', command)
                    text = self.tap(gate.TESTS[index - 1][1])
                    if failure == 'skip':
                        text = text.replace('# skipped 0', '# skipped 1')
                    kwargs['stdout'].write(text)
                elif index <= 6:
                    self.assertEqual(command[-3:], ['128', gate.PARITY_SEED, '0.01'])
                    kwargs['stdout'].write(json.dumps(parity))
                else:
                    kwargs['stdout'].write(json.dumps(self.replay(index - 6)))
                return subprocess.CompletedProcess(command, 0)

            with patch.object(gate, 'verify_root', return_value=archive_identity), \
                 patch.object(gate, 'copy_candidate', side_effect=candidate), \
                 patch.object(gate, 'read_json', return_value=parity), \
                 patch.object(gate.subprocess, 'run', side_effect=process):
                if failure:
                    with self.assertRaises(ValueError):
                        gate.run_gate(restored, base / 'output', manifest)
                else:
                    gate.run_gate(restored, base / 'output', manifest)
            summary = json.loads((base / 'output/summary.json').read_text())
            self.assertEqual(summary['status'], 'failed' if failure else 'research-gate-passed-not-approved')
            self.assertIs(summary['production_eligible'], False)
            self.assertEqual(len(calls), 1 if failure else 13)
            self.assertTrue((base / 'output/postflop-low-flop-diagnostics.stdout').exists())
            self.assertTrue((base / 'output/postflop-low-flop-diagnostics.stderr').exists())

    def test_thirteen_sequential_commands_and_parity_no_large_rollout(self):
        self.simulated_gate()

    def test_exit_timeout_and_skip_preserve_failed_logs(self):
        for failure in ['exit', 'timeout', 'skip']:
            with self.subTest(failure=failure):
                self.simulated_gate(failure)


if __name__ == '__main__':
    unittest.main()
