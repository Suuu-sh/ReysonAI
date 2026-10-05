"""Portable staging contracts: no authoring checkout, Node, or network required."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts/research'))
import low_flop_gate as gate


class CandidateStagingTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='low-flop-staging-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.root = self.base / 'fixture'; self.root.mkdir()
        self.checkout = self.base / 'checkout'; self.checkout.mkdir()
        self.output = self.base / 'output'; self.output.mkdir()
        self.core = 'apps/frontend/scripts/data/hu-after-multiway-spots.json'
        self.research = 'apps/frontend/scripts/postflop-ai/flop-promotion-veto.mjs'
        names = sorted(gate.CURRENT_RESEARCH_FILES | {self.core} |
                       {f'apps/frontend/scripts/core-{i}.mjs' for i in range(31)})
        self.assertEqual(len(names), 43)
        self.rows = []
        for name in names:
            path = self.root / 'candidate-source' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'archived-' + name.encode())
            self.rows.append(gate.file_record(path, 'candidate-source/' + name))
            if name in gate.CURRENT_RESEARCH_FILES:
                target = self.checkout / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(b'current-' + name.encode())
        for i in range(90):
            name = f'main-baseline/apps/frontend/.local/postflop-ai/policy-{i}.json'
            path = self.root / name; path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b'{"exact":true}\n')
            self.rows.append(gate.file_record(path, name))
        self.manifest = {'files': self.rows}

    def stage(self, checkpoint=False):
        with patch.object(gate, 'REPO', self.checkout):
            return gate.copy_candidate(self.root, self.output, self.manifest, checkpoint)

    def test_absent_live_core_uses_pinned_archive_and_current_research_is_exercised(self):
        candidate, records = self.stage()
        self.assertFalse((self.checkout / self.core).exists())
        self.assertEqual((candidate / self.core).read_bytes(), (self.root / 'candidate-source' / self.core).read_bytes())
        self.assertEqual((candidate / self.research).read_bytes(), (self.checkout / self.research).read_bytes())
        origins = json.loads((self.output / 'candidate-source-origins.json').read_text())
        self.assertEqual(sum(r['origin'] == 'current-research-checkout' for r in origins), 11)
        self.assertEqual(sum(r['origin'] == 'verified-candidate-archive' for r in origins), 32)
        self.assertEqual(len(records), 133)

    def test_different_live_core_is_never_substituted_for_archived_core(self):
        live = self.checkout / self.core; live.parent.mkdir(parents=True); live.write_bytes(b'wrong-live-core')
        candidate, _ = self.stage()
        self.assertNotEqual((candidate / self.core).read_bytes(), live.read_bytes())
        self.assertEqual((candidate / self.core).read_bytes(), (self.root / 'candidate-source' / self.core).read_bytes())

    def test_missing_current_research_never_falls_back_to_archived_research(self):
        (self.checkout / self.research).unlink()
        with self.assertRaises(FileNotFoundError): self.stage()
        self.assertFalse((self.output / 'candidate').exists())

    def test_archived_core_drift_fails_even_when_checkout_has_valid_bytes(self):
        archived = self.root / 'candidate-source' / self.core
        live = self.checkout / self.core; live.parent.mkdir(parents=True); live.write_bytes(archived.read_bytes())
        archived.write_bytes(b'drift')
        with self.assertRaisesRegex(ValueError, 'Archived candidate source drift'): self.stage()
        self.assertFalse((self.output / 'candidate').exists())

    def test_incomplete_candidate_closure_fails_before_staging(self):
        self.manifest['files'] = self.rows[1:]
        with self.assertRaisesRegex(ValueError, 'complete 43-file closure'): self.stage()
        self.assertFalse((self.output / 'candidate').exists())

    def test_checkpoint_mode_uses_archived_research_explicitly(self):
        (self.checkout / self.research).unlink()
        candidate, _ = self.stage(checkpoint=True)
        self.assertEqual((candidate / self.research).read_bytes(), (self.root / 'candidate-source' / self.research).read_bytes())
        origins = json.loads((self.output / 'candidate-source-origins.json').read_text())
        self.assertTrue(all(r['origin'] == 'verified-candidate-archive' for r in origins))


if __name__ == '__main__': unittest.main()
