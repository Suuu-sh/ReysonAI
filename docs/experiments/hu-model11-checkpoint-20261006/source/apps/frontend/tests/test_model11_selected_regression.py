"""Source/contract checks only. Node execution is separately admitted."""
import hashlib
import importlib.util
import json
import re
import subprocess
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[3]
PREFIX = 'apps/frontend/scripts/postflop-ai/'
BASE = '58570ffce3419d8973e08f0dee344be095f33f03'
spec = importlib.util.spec_from_file_location('selected_inventory', ROOT / (PREFIX + 'perf/verify-model11-selected-regression.py'))
INVENTORY = importlib.util.module_from_spec(spec)
spec.loader.exec_module(INVENTORY)
class SelectedRegressionTests(unittest.TestCase):
    def test_closed_graphs_and_all_twelve_inputs(self):
        result = INVENTORY.verify(ROOT)
        self.assertEqual(result['sourceFiles'], 58)
        self.assertEqual(result['closedImplementation']['strict']['rawInputFiles'], 12)
        self.assertEqual(result['closedImplementation']['strict']['rawInputBytes'], 33091509)

    def test_ordinary_full_and_legacy_contracts_remain_byte_identical(self):
        for name in ['evaluate-model11-completion-representative.mjs', 'model11-completion-representative.mjs',
                     'model11-completion-representative-contract.mjs', 'model11-completion-representative-store.mjs',
                     'model11-gate-contract.mjs', 'model11-gate-drivers.mjs', 'simulation-model11.mjs',
                     'evaluate-model11-dual-source-audit.mjs', 'model11-dual-source-contract.mjs', 'model11-dual-source-quality.mjs']:
            path = PREFIX + name
            self.assertEqual((ROOT / path).read_bytes(), subprocess.check_output(['git', 'show', f'{BASE}:{path}'], cwd=ROOT), name)

    def test_exact_authorized_selection_and_assembly_pins(self):
        path = ROOT / 'apps/frontend/tests/fixtures/model11-selected-regression-selection-v2.json'
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), '062706986a35fb5dc106468fab155373b3db40ebdf874f8f22df18488e31d58f')
        selection = json.loads(path.read_bytes())
        self.assertEqual(sum(row['selected'] for row in selection['rows']), 4999)
        self.assertEqual(selection['originalTrials'], 720000)
        runtime = (ROOT / (PREFIX + 'model11-selected-regression-runtime.mjs')).read_text()
        pins = runtime[runtime.index('const patchPins ='):runtime.index('const additions =')]
        for name, digest in re.findall(r"'([^']+\.mjs)': '([a-f0-9]{64})'", pins):
            self.assertEqual(hashlib.sha256((ROOT / (PREFIX + name)).read_bytes()).hexdigest(), digest)

    def test_full_rng_stream_and_exact_before_draw_reset_order(self):
        text = (ROOT / (PREFIX + 'model11-selected-regression.mjs')).read_text()
        draw = text[text.index('export function* originalDealStream'):text.index('function selectedStorageCell')]
        self.assertLess(draw.index('beforeIndex(index)'), draw.index('const hands = samplePair'))
        self.assertIn('dealRunout(hands, board.cards, random)', draw)
        self.assertIn('Array.from({ length: 24 }, () => random())', draw)
        producer = text[text.index('export function produceSelectedCell'):text.index('export function* selectedTrials')]
        self.assertLess(producer.index('if (!selected.has(draw.index)) continue'), producer.index('const baseline = playHand'))
        self.assertIn('resetIndices.push(index)', producer)
        self.assertNotIn('originalStore', producer)

    def test_original_validation_precedes_readiness_and_fresh_has_no_old_numeric_read(self):
        text = (ROOT / (PREFIX + 'evaluate-model11-selected-regression.mjs')).read_text()
        old = text[text.index('async function validateOriginal'):text.index('function provenance')]
        self.assertIn('requireExisting: true', old)
        self.assertIn('exact original boundary/completion union', old)
        self.assertLess(old.index('original-validation.json'), old.index('prepared.json'))
        fresh = text[text.index('async function selectedLane'):text.index('function candidateControls')]
        self.assertIn('checkReady(spec, specRecord)', fresh)
        for forbidden in ['spec.original.report', 'originalStore', 'saved.cellRecords', 'saved.results']:
            self.assertNotIn(forbidden, fresh)
        self.assertIn('receipt unchanged at result boundary', text)
        self.assertIn('fullReplayPassed: false', text)

if __name__ == '__main__': unittest.main()
