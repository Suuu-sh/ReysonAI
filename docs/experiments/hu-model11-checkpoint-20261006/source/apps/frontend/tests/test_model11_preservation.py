"""Python-only harness tests. Synthetic rows are NOT poker preservation evidence."""
import copy
import importlib.util
import json
import math
import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

FRONTEND = pathlib.Path(__file__).resolve().parents[1]
PERF = FRONTEND / 'scripts/postflop-ai/perf'
sys.path.insert(0, str(PERF))
import model11_preservation_receipt as receipt
import model11_preservation_schema as schema

spec = importlib.util.spec_from_file_location('preservation_audit', PERF / 'audit-model11-preservation.py')
audit = importlib.util.module_from_spec(spec); spec.loader.exec_module(audit)


def boundaries(mix, actions):
    cumulative, result = 0, []
    for action in actions:
        cumulative += mix[action]; at = cumulative / 100
        samples = []
        for direction in [-1, 0, 1]:
            draw = at if direction == 0 else math.nextafter(at, -math.inf if direction < 0 else math.inf)
            samples.append({'direction': direction, 'random': draw, 'inUnitInterval': 0 <= draw < 1,
                            'result': {'status': 'ok', 'value': receipt.chosen(mix, draw, actions)}})
        result.append({'afterAction': action, 'cumulative': cumulative, 'boundary': at, 'samples': samples})
    return result


def sources():
    hands = sorted(schema.HANDS)
    opening = {'id': 'BTN_open', 'hero': 'BTN', 'effective_stack_bb': 100, 'open_size_bb': 2.5,
               'hands': [{'hand': hand, 'open': 100, 'fold': 0} for hand in hands]}
    response = {'id': 'BB_vs_BTN', 'hero': 'BB', 'opener': 'BTN', 'effective_stack_bb': 100, 'open_size_bb': 2.5,
                'hands': [{'hand': hand, 'call': 100, 'fold': 0, 'three_bet': 0} for hand in hands]}
    return opening, response


def basic_inputs():
    opening, response = sources()
    spot = {'id': 'S', 'kind': 'srp', 'opener': 'BTN', 'caller': 'BB', 'aggressor': 'BTN', 'ip': 'BTN', 'oop': 'BB',
            'tree': 'oop_checks', 'openBb': 2.5, 'potBb': 5.5, 'stackBb': 97.5, 'slug': 'synthetic', 'reachable': True}
    config = {'version': 2, 'flop_bet_fractions': [0.33, 0.75, 1.25], 'max_raises_per_street': 4,
              'later_streets': {'turn': {'bets': [0.33, 0.75, 1.25], 'all_in': False}, 'river': {'bets': [0.33, 0.75, 1.25], 'all_in': True}}}
    rows = [{'hand': row['hand'], 'freq': 100} for row in opening['hands']]
    return {'spot': spot, 'config': config, 'fingerprint': 'f' * 64, 'seatRows': {'BTN': copy.deepcopy(rows), 'BB': copy.deepcopy(rows)}, 'opening': opening, 'response': response}


def initial_table(spot):
    return {'spot': spot, 'pot': spot['potBb'], 'stacks': {seat: spot['stackBb'] for seat in ['BTN', 'BB']},
            'invested': {'BTN': 0, 'BB': 0}, 'winner': None, 'lastAggressor': None,
            'path': {'flop': [], 'turn': [], 'river': []}, 'log': []}


def entry(table, seat, node, street, action=None, line=None):
    value = {'seat': seat, 'node': node, 'street': street, 'boardLen': {'flop': 3, 'turn': 4, 'river': 5}[street],
             'line': line, 'pot': table['pot'], 'index': len(table['path'][street]), 'action': action, 'canRaise': True}
    table['log'].append(value)
    if action is not None: table['path'][street].append(action)
    return value


def put(table, seat, amount):
    table['pot'] = round(table['pot'] + amount, 2); table['invested'][seat] = round(table['invested'][seat] + amount, 2)
    table['stacks'][seat] = round(table['stacks'][seat] - amount, 2)


def prefix_table(spot, name):
    table = initial_table(spot)
    if name == 'flop-root': entry(table, 'BTN', 'btn_first', 'flop'); return table
    entry(table, 'BTN', 'btn_first', 'flop', 'bet33'); put(table, 'BTN', 1.82)
    if name == 'flop-facing33': entry(table, 'BB', 'bb_vs_33', 'flop'); return table
    if name == 'flop-facing-raise':
        entry(table, 'BB', 'bb_vs_33', 'flop', 'raise'); put(table, 'BB', 5.46); entry(table, 'BTN', 'btn_vs_raise', 'flop'); return table
    entry(table, 'BB', 'bb_vs_33', 'flop', 'call'); put(table, 'BB', 1.82); table['lastAggressor'] = 'BTN'
    if name == 'turn-root': entry(table, 'BB', 'turn_oop_first', 'turn', line='defender'); return table
    if name == 'turn-facing33':
        entry(table, 'BB', 'turn_oop_first', 'turn', 'bet33', 'defender'); put(table, 'BB', 3.02)
        entry(table, 'BTN', 'turn_ip_vs_33', 'turn', line='aggressor'); return table
    entry(table, 'BB', 'turn_oop_first', 'turn', 'check', 'defender'); entry(table, 'BTN', 'turn_ip_first', 'turn', 'check', 'aggressor'); table['lastAggressor'] = None
    if name == 'river-root': entry(table, 'BB', 'river_oop_first', 'river', line='checked'); return table
    entry(table, 'BB', 'river_oop_first', 'river', 'bet33', 'checked'); put(table, 'BB', 3.02)
    entry(table, 'BTN', 'river_ip_vs_33', 'river', line='checked'); return table


def betting_facts(node, actions):
    aggressive = [action for action in actions if action.startswith('bet') or action in ['allin', 'raise']]
    return {'node': node, 'combo_class': 'unranked', 'equity_vs_defender': None, 'passive': 'check' if 'check' in actions else 'call',
            'actions': [{'action': action, 'alpha': 0, 'bluffs_per_100_value': 0, 'capped': False, 'factor': 1,
                         **{key: None for key in ['value_before', 'bluff_before', 'bluff_share_before', 'bluff_share_before_pct', 'value_after', 'bluff_after', 'bluff_share_after', 'bluff_share_after_pct']}} for action in aggressive]}


def legacy_rows():
    inputs = basic_inputs(); spot = inputs['spot']; vector = [0] * 2704; vector[1] = 1
    metadata = {'kind': 'ai_estimate_not_gto', 'scope': 'synthetic', 'spot': 'S', 'source_hash': inputs['fingerprint'], 'policy_hash': 'a' * 64, 'config_version': 2}
    report = {'kind': 'ai_estimate_not_gto', 'version': 1, 'simulation_version': 3, 'spot': 'S', 'source_hash': inputs['fingerprint'],
              'later_sizing_hash': 'b' * 64, 'later_policy_hash': 'c' * 64, 'defence_version': 5, 'policy_hash': 'a' * 64,
              'samples_per_board_profile_seat': 10000, 'seed': 'synthetic', 'results': []}
    case = {'kind': 'case', 'id': 'S', 'caseNumber': 1, 'numericalFactoryVersion': 6, 'savedReportDefenceVersion': 5, 'savedReport': report,
            'inputs': inputs, 'candidateMetadata': copy.deepcopy(metadata), 'laterMetadata': copy.deepcopy(metadata),
            'originalArtifacts': {kind: {'file': kind + '.json', 'bytes': 1, 'sha256': 'd' * 64} for kind in ['candidate', 'later_candidate', 'report']},
            'corpus': {'positive': 'first8 canonical positive-own-reach', 'zero': 'first2 canonical base-supported zero-own-reach', 'seeds': receipt.SEEDS, 'dealsPerSeed': 8}}
    rows = [{'kind': 'header', 'schema': 'hu-preservation-v3', 'mode': 'legacy45', 'group': 1}, case]; boundary_count = 0
    for name, (length, path) in receipt.PREFIXES.items():
        table = prefix_table(spot, name); pending = table['log'][-1]; actions = schema.actions_for(pending['node'], inputs['config']); facing = 'call' in actions
        ranges = {'BTN': copy.deepcopy(vector), 'BB': copy.deepcopy(vector)}
        if facing: ranges[table['log'][-2]['seat']] = [0] * 2704
        value = {'table': table, 'actionOrder': actions, 'ranges': ranges, 'baseWeights': vector, 'contextStatus': 'null', 'isFacing': facing, 'requirement': None,
                 'selection': {'positiveAvailable': 1, 'zeroOwnAvailable': 0, 'ids': [1], 'fullLawCoverage': False, 'bothSeatReachVectorSlots': 2704}}
        mix = {action: 100 if i == 0 else 0 for i, action in enumerate(actions)}; boundary_count += len(actions) * 3
        rows += [{'kind': 'prefix', 'id': 'S', 'name': name, 'board': receipt.BOARD[:length], 'path': path, 'result': {'status': 'ok', 'value': value}},
                 {'kind': 'law', 'id': 'S', 'prefix': name, 'comboId': 1, 'combo': [0, 1], 'ownReach': 1, 'baseWeight': 1,
                  'base': mix, 'mix': mix, 'observableMix': mix, 'facts': None, 'bettingFacts': betting_facts(pending['node'], actions),
                  'equity': None, 'equityStatus': 'context-null-not-requested', 'actionOrder': actions, 'boundaries': boundaries(mix, actions)}]
    errors = [('Error', 'Duplicate cards'), ('Error', 'Invalid card: Jx'), ('Error', 'Invalid card string'), ('Error', 'Illegal flop action at btn_first'), ('DefencePathError', 'Flop actions do not reach a pending decision')]
    for name, (subtype, message) in zip(receipt.PROBES, errors):
        rows.append({'kind': 'error-probe', 'id': 'S', 'name': name, 'result': {'status': 'error', 'error': {'name': 'Error', 'subtype': subtype, 'message': message}}})
    for seed in receipt.SEEDS:
        seed_value = receipt.seed_for(f'{seed}|S'); generator = receipt.seeded_random(seed_value); seed_index = 0
        for deal in range(8):
            calls = []
            def draw(purpose):
                nonlocal seed_index
                value = next(generator); calls.append({'index': len(calls), 'seedCallIndex': seed_index, 'purpose': purpose, 'value': value}); seed_index += 1; return value
            while True:
                ip = schema.sampled(inputs['seatRows']['BTN'], draw('deal')); oop = schema.sampled(inputs['seatRows']['BB'], draw('deal'))
                if not set(ip) & set(oop): break
            table = initial_table(spot); decisions = []
            for seat, node, street in [('BTN', 'btn_first', 'flop'), ('BB', 'turn_oop_first', 'turn'), ('BTN', 'turn_ip_first', 'turn'), ('BB', 'river_oop_first', 'river'), ('BTN', 'river_ip_first', 'river')]:
                log = entry(table, seat, node, street, line=None if street == 'flop' else 'checked')
                actions = schema.actions_for(node, inputs['config']); mix = {action: 100 if action == 'check' else 0 for action in actions}
                random = draw(f'decision:{len(decisions)}:{node}')
                decisions.append({'seat': seat, 'node': node, 'board': receipt.BOARD[:log['boardLen']], 'table': copy.deepcopy(table),
                                  'base': mix, 'mix': mix, 'actionOrder': actions, 'draw': random, 'sampledLabel': 'check'})
                log['action'] = 'check'; table['path'][street].append('check')
            before = copy.deepcopy(table); table['winner'] = 'BTN'
            rows.append({'kind': 'trajectory', 'id': 'S', 'seed': seed, 'seedValue': seed_value, 'deal': deal, 'board': receipt.BOARD,
                         'hands': {'BTN': ip, 'BB': oop}, 'randomCalls': calls, 'decisions': decisions,
                         'result': {'status': 'ok', 'value': {'beforeSettlement': before, 'winner': 'BTN', 'afterSettlement': table, 'rake': min(table['pot'] * 0.05, 3)}}})
    rows += [{'kind': 'case-complete', 'id': 'S', 'coverage': {'lawRows': 7, 'zeroOwnLawRows': 0, 'fallbackRows': 0, 'equityNullRows': 0, 'boundarySamples': boundary_count,
              'legalRoot': 1, 'legalFacing': 1, 'prefixes': 7, 'legalPrefixes': 7, 'errors': [], 'trajectories': 32,
              'facingNullContext': 4, 'nonFacingNullContext': 3, 'gaps': ['Synthetic corpus; no numerical proof']}},
             {'kind': 'complete', 'mode': 'legacy45', 'count': 1, 'ids': ['S']}]
    return copy.deepcopy(rows)


def catalog_rows():
    inputs = basic_inputs(); spot = inputs['spot']; spot.update(id='C', kind='ccp', history=[{'seat': 'BTN', 'action': 'open', 'to_size_bb': 2.5}, {'seat': 'BB', 'action': 'call', 'to_size_bb': 2.5}],
        ranges={'BTN': [['opening-ranges', 'BTN_open', 'open']], 'BB': [['preflop-ranges', 'BB_vs_BTN', 'call']]},
        contributionsBb={'UTG': 0, 'HJ': 0, 'CO': 0, 'BTN': 2.5, 'SB': 0.5, 'BB': 2.5})
    inputs['sources'] = [{'dataset': 'opening-ranges', 'spot': inputs.pop('opening')}, {'dataset': 'preflop-ranges', 'spot': inputs.pop('response')}]
    value = {'inputs': inputs, 'gameConfig': {'stack_bb': 100}, 'initialTable': initial_table(spot), 'roles': {'ip': 'BTN', 'oop': 'BB'},
             'contributions': [{'seat': seat, 'chips': chips, 'live': seat in ['BTN', 'BB'], 'factors': spot['ranges'].get(seat, [])} for seat, chips in spot['contributionsBb'].items()],
             'deadChips': 0.5, 'foldedPrivateCards': 'unknown-not-used-as-blockers'}
    return [{'kind': 'header', 'schema': 'hu-preservation-v3', 'mode': 'all407', 'group': None}, {'kind': 'catalog', 'id': 'C', 'result': {'status': 'ok', 'value': value}}, {'kind': 'complete', 'mode': 'all407', 'count': 1, 'ids': ['C']}]


class PreservationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = pathlib.Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def stream(self, rows, name='stream.jsonl'):
        path = self.root / name
        path.write_text(''.join(json.dumps(row) + '\n' for row in rows)); return path

    def validate(self, rows, mode='legacy45'):
        return receipt.validate_stream(self.stream(rows), mode, 1 if mode == 'legacy45' else None, ['S'] if mode == 'legacy45' else ['C'])

    def test_synthetic_complete_legacy(self):
        self.assertEqual(self.validate(legacy_rows())['case_count'], 1)

    def test_synthetic_complete_catalog(self):
        self.assertEqual(self.validate(catalog_rows(), 'all407')['case_count'], 1)

    def test_stream_negative_mutations(self):
        mutations = {
            'missing-header': lambda r: r.pop(0), 'missing-footer': lambda r: r.pop(),
            'duplicate-footer': lambda r: r.append(copy.deepcopy(r[-1])),
            'missing-law': lambda r: r.pop(3), 'duplicate-law': lambda r: r.insert(4, copy.deepcopy(r[3])),
            'wrong-case': lambda r: r[1].update(id='other'),
            'def5-factory': lambda r: r[1].update(numericalFactoryVersion=5),
            'relabeled-report': lambda r: r[1]['savedReport'].update(defence_version=6),
            'wrong-board': lambda r: r[2].update(board=[1, 2, 3]),
            'wrong-path': lambda r: r[2].update(path={'flop': ['check']}),
            'short-vector': lambda r: r[2]['result']['value']['ranges']['BTN'].pop(),
            'missing-seat': lambda r: r[2]['result']['value']['ranges'].pop('BB'),
            'nonfinite-vector': lambda r: r[2]['result']['value']['ranges']['BTN'].__setitem__(1, {'$number': 'NaN'}),
            'full-law-claim': lambda r: r[2]['result']['value']['selection'].update(fullLawCoverage=True),
            'wrong-selection': lambda r: r[2]['result']['value']['selection'].update(ids=[2]),
            'missing-facts': lambda r: r[3].pop('facts'),
            'changed-action-order': lambda r: r[3].update(actionOrder=['fold']),
            'missing-boundary': lambda r: r[3]['boundaries'].pop(),
            'wrong-neighbor': lambda r: r[3]['boundaries'][0]['samples'][0].update(random=0.5),
            'wrong-boundary-choice': lambda r: r[3]['boundaries'][0]['samples'][0]['result'].update(value='fold'),
            'wrong-equity-status': lambda r: r[3].update(equityStatus='available'),
            'wrong-counter': lambda r: r[-2]['coverage'].update(lawRows=6),
            'missing-gap': lambda r: r[-2]['coverage'].update(gaps=[]),
            'error-probe-success': lambda r: next(x for x in r if x['kind'] == 'error-probe')['result'].update(status='ok'),
            'wrong-seed-value': lambda r: next(x for x in r if x['kind'] == 'trajectory').update(seedValue=7),
            'wrong-rng': lambda r: next(x for x in r if x['kind'] == 'trajectory')['randomCalls'][0].update(value=0),
            'wrong-rng-index': lambda r: next(x for x in r if x['kind'] == 'trajectory')['randomCalls'][0].update(seedCallIndex=1),
            'missing-decision-call': lambda r: next(x for x in r if x['kind'] == 'trajectory')['randomCalls'].pop(),
            'blocked-deal': lambda r: next(x for x in r if x['kind'] == 'trajectory')['hands'].update(BTN=[36, 1]),
            'sampled-label': lambda r: next(x for x in r if x['kind'] == 'trajectory')['decisions'][0].update(sampledLabel='fold'),
            'partial-trajectory': lambda r: next(x for x in r if x['kind'] == 'trajectory')['result']['value'].pop('afterSettlement'),
        }
        for name, change in mutations.items():
            with self.subTest(name=name):
                rows = legacy_rows(); change(rows)
                with self.assertRaises((ValueError, KeyError)): self.validate(rows)

    def test_catalog_negative_mutations(self):
        mutations = {
            'missing-history': lambda v: v['inputs']['spot'].pop('history'),
            'missing-source': lambda v: v['inputs'].update(sources=[]),
            'source-truncation': lambda v: v['inputs']['sources'][0]['spot']['hands'].pop(),
            'source-duplicate': lambda v: v['inputs']['sources'].append(copy.deepcopy(v['inputs']['sources'][0])),
            'missing-factor': lambda v: v['inputs']['spot']['ranges']['BTN'].append(['other', 'missing', 'fold']),
            'folded-private-seat': lambda v: v['inputs']['seatRows'].update(SB=[]),
            'short-seat': lambda v: v['inputs']['seatRows']['BTN'].pop(),
            'fingerprint': lambda v: v['inputs'].update(fingerprint='bad'),
            'dead-chips': lambda v: v.update(deadChips=0),
            'contributor': lambda v: v['contributions'].pop(),
            'private-blockers': lambda v: v.update(foldedPrivateCards=[0, 1]),
            'initial-invested': lambda v: v['initialTable']['invested'].update(BTN=2.5),
            'postflop-work': lambda v: v['initialTable']['path']['flop'].append('check'),
        }
        for name, change in mutations.items():
            with self.subTest(name=name):
                rows = catalog_rows(); change(rows[1]['result']['value'])
                with self.assertRaises((ValueError, KeyError)): self.validate(rows, 'all407')

    def test_duplicate_json_and_truncated_stream(self):
        with self.assertRaises(ValueError): receipt.parse_json('{"x":1,"x":2}')
        with self.assertRaises(ValueError): receipt.parse_json('{"x":NaN}')
        path = self.root / 'bad'; path.write_text('{}')
        with self.assertRaises(ValueError): list(receipt.records(path))

    def test_safe_paths_and_source_graph(self):
        (self.root / 'src').mkdir(); (self.root / 'leaf.mjs').write_text('export const v = 1;')
        (self.root / 'src/root.mjs').write_text("import { v } from '../leaf.mjs';")
        self.assertEqual(set(receipt.source_graph(self.root, ['src/root.mjs'])), {'src/root.mjs', 'leaf.mjs'})
        with self.assertRaises(ValueError): receipt.checked_path(self.root, '../escape')
        with self.assertRaises(ValueError): receipt.checked_path(self.root, '/absolute')
        with self.assertRaises(ValueError): receipt.checked_path(self.root, 'missing')
        (self.root / 'alias.mjs').symlink_to(self.root / 'leaf.mjs')
        (self.root / 'src/root.mjs').write_text("import '../alias.mjs';")
        with self.assertRaises(ValueError): receipt.source_graph(self.root, ['src/root.mjs'])
        (self.root / 'src/root.mjs').write_text("import 'unpinned-package';")
        with self.assertRaises(ValueError): receipt.source_graph(self.root, ['src/root.mjs'])
        (self.root / 'linked-dir').symlink_to(self.root / 'src', target_is_directory=True)
        with self.assertRaises(ValueError): receipt.checked_path(self.root / 'linked-dir', 'root.mjs')

    def test_fixture_drift_and_duplicate(self):
        path = self.root / 'fixture'; path.write_bytes(b'old'); record = receipt.file_record(path)
        self.assertEqual(receipt.match_record(path, record), record)
        path.write_bytes(b'new')
        with self.assertRaises(ValueError): receipt.match_record(path, record)
        rec = {**receipt.file_record(path), 'path': 'fixture', 'kind': 'synthetic'}
        with self.assertRaisesRegex(ValueError, 'Duplicate'): receipt.validate_original(self.root, {'copied_files': [rec] * 154})
        with self.assertRaises(ValueError): receipt.validate_original(self.root, {'copied_files': [rec]})

    def test_comparison_keeps_all_values_and_order(self):
        left = self.stream(legacy_rows(), 'left'); right = self.stream(legacy_rows(), 'right')
        self.assertTrue(audit.compare_streams(left, right)['equal'])
        rows = legacy_rows(); rows[3]['facts'] = {'new': 1}; right = self.stream(rows, 'right')
        result = audit.compare_streams(left, right)
        self.assertFalse(result['equal']); self.assertIn('facts', result['difference']['path'])
        self.assertIsNotNone(audit.first_difference({'v': {'$number': '-0'}}, {'v': 0}))
        self.assertIsNotNone(audit.first_difference({'v': False}, {'v': 0}))
        self.assertIsNotNone(audit.first_difference([1, 2], [2, 1]))

    def test_receipt_symlink_rejected_before_resolution(self):
        path = self.root / 'receipt.json'; path.write_text('{}')
        alias = self.root / 'alias'; alias.symlink_to(path)
        with self.assertRaisesRegex(ValueError, 'Symlink'): audit.verify_receipt(alias, self.root, 'baseline')


    def test_receipt_complete_and_negative_mutations(self):
        frontend = self.root / 'repository/apps/frontend'
        output = frontend / '.local/hu-model11/preservation-restored-v2/runs/synthetic'
        output.mkdir(parents=True)
        node = self.root / 'synthetic-node-bytes'; node.write_bytes(b'NOT EXECUTABLE, NEVER RUN')
        node_identity = {'path': str(node), **receipt.file_record(node)}
        snapshot = {'materialization': {'root': '.'}, 'harness': {}, 'side': 'baseline'}
        command = [str(node), '--max-old-space-size=512', str(frontend / 'scripts/postflop-ai/perf/emit-model11-preservation.mjs'),
                   str(frontend.parents[1]), 'legacy45', '1', str(frontend / '.local/hu-model11/preservation-design/legacy45-explicit-case-design.json')]
        base = {'kind': 'bounded-hu-preservation-v3-not-adoption', 'side': 'baseline', 'mode': 'legacy45', 'group': 1,
                'ids': ['S'], 'command': command, 'status': 'emitted-not-compared', 'timeout_seconds': 180, 'heap_mib': 512,
                'exit_code': 0, 'timed_out': False, 'interrupted': False, 'launch_error': None,
                'source_before': snapshot, 'source_after': snapshot, 'source_unchanged': True,
                'git_before': {'revision': 'synthetic'}, 'git_after': {'revision': 'synthetic'},
                'node_before': node_identity, 'node_after': node_identity, 'node_after_error': None, 'git_after_error': None,
                'validation_error': None}
        path = output / 'receipt.json'
        def install(change=lambda value: None):
            value = copy.deepcopy(base)
            (output / 'output.jsonl').write_text(''.join(json.dumps(row) + '\n' for row in legacy_rows()))
            (output / 'stderr.txt').write_text('')
            value['validation'] = receipt.validate_stream(output / 'output.jsonl', 'legacy45', 1, ['S'])
            (output / 'before.json').write_text(json.dumps({**value, 'status': 'started-not-complete'}))
            value['files'] = {name: receipt.file_record(output / name) for name in ['output.jsonl', 'stderr.txt', 'before.json']}
            change(value); path.write_text(json.dumps(value)); (output / 'receipt.sha256').write_text(receipt.file_record(path)['sha256'])
        with mock.patch.object(audit, 'capture', return_value=snapshot), mock.patch.object(audit, 'expected_ids', return_value=['S']), mock.patch.object(schema, 'FixtureContracts', return_value=None):
            install(); self.assertEqual(audit.verify_receipt(path, frontend, 'baseline')['status'], 'emitted-not-compared')
            changes = {
                'partial': lambda v: v.update(status='partial-resource-failure'),
                'timeout': lambda v: v.update(timed_out=True),
                'signal': lambda v: v.update(exit_code=-9),
                'heap': lambda v: v.update(heap_mib=1024),
                'wall': lambda v: v.update(timeout_seconds=181),
                'source-drift': lambda v: v['source_after'].update(other='changed'),
                'git-drift': lambda v: v['git_after'].update(revision='other'),
                'node-drift': lambda v: v['node_after'].update(sha256='0' * 64),
                'missing-log': lambda v: v['files'].pop('stderr.txt'),
                'bad-command': lambda v: v['command'].append('--unreviewed'),
                'wrong-ids': lambda v: v.update(ids=['other']),
                'wrong-coverage': lambda v: v['validation'].update(case_count=2),
            }
            for name, change in changes.items():
                with self.subTest(name=name):
                    install(change)
                    with self.assertRaises(ValueError): audit.verify_receipt(path, frontend, 'baseline')
            install(); (output / 'stderr.txt').write_text('changed log')
            with self.assertRaisesRegex(ValueError, 'Pinned bytes'): audit.verify_receipt(path, frontend, 'baseline')
            install(); (output / 'receipt.sha256').write_text('0' * 64)
            with self.assertRaisesRegex(ValueError, 'Receipt hash'): audit.verify_receipt(path, frontend, 'baseline')

    def test_side_binding_and_wrong_categories(self):
        repository = self.root / 'repo'; repository.mkdir()
        manifest = {'side': 'current'}
        with self.assertRaisesRegex(ValueError, 'Requested side'):
            receipt.validate_side(repository, manifest, {}, 'baseline', {})
        # The v2 arbitrary173-files fixture is no longer a successful materialization.
        manifest = {'side': 'baseline', 'schema_version': 2, 'kind': 'restored-preservation-side-materialization-v2-unapproved',
                    'baselineGit': receipt.BASELINE, 'canonicalGit': receipt.CANONICAL, 'recoveredExperimentGit': receipt.REVIEWED_ARCHIVE_SOURCE,
                    'repositoryBaseGit': receipt.REPOSITORY_BASE, 'root': '.'}
        with self.assertRaisesRegex(ValueError, 'isolated root'):
            receipt.validate_side(repository, manifest, {}, 'baseline', {})

    def test_evidence_containment_before_write(self):
        directory = self.root / 'preservation'; directory.mkdir(); outside = self.root / 'outside'; outside.mkdir()
        with self.assertRaisesRegex(ValueError, 'traversal'):
            receipt.contained_path(directory, directory / 'runs/../../outside/result.json')
        with self.assertRaisesRegex(ValueError, 'traversal'):
            receipt.exclusive_file(directory, directory / '../outside/result.json')
        self.assertFalse((outside / 'result.json').exists())
        (directory / 'runs').symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            receipt.create_run_directory(directory, 'new-run')
        self.assertFalse((outside / 'new-run').exists())
        (directory / '.runner.lock').symlink_to(outside / 'lock')
        with self.assertRaisesRegex(ValueError, 'Symlink'):
            receipt.contained_path(directory, directory / '.runner.lock')
        with self.assertRaises(ValueError): receipt.parse_json('{"value":1e400}')

    def test_independent_review_common_omission_probes(self):
        def first(rows, kind): return next(row for row in rows if row['kind'] == kind)
        mutations = {
            'missing-original-identities': lambda r: r[1].pop('originalArtifacts'),
            'missing-policy-metadata': lambda r: r[1].pop('candidateMetadata'),
            'missing-source-input': lambda r: r[1]['inputs'].pop('opening'),
            'missing-requirement': lambda r: first(r, 'prefix')['result']['value'].pop('requirement'),
            'missing-chip-table': lambda r: first(r, 'prefix')['result']['value'].update(table={'spot': {'ip': 'BTN', 'oop': 'BB'}, 'log': [{'seat': 'BTN'}]}),
            'empty-base-observable': lambda r: first(r, 'law').update(base={}, observableMix={}),
            'empty-settlement': lambda r: first(r, 'trajectory')['result'].update(value={'beforeSettlement': {}, 'winner': None, 'afterSettlement': {}, 'rake': 'bad'}),
            'empty-decision-table': lambda r: first(r, 'trajectory')['decisions'][0].update(table={}),
            'empty-decision-board': lambda r: first(r, 'trajectory')['decisions'][0].update(board=[]),
            'unrelated-deal': lambda r: first(r, 'trajectory')['hands'].update(BTN=[48, 49], BB=[50, 51]),
            'null-gap': lambda r: r[-2]['coverage'].update(gaps=[None]),
            'path-result-disagrees': lambda r: first(r, 'prefix')['result']['value']['table']['path']['flop'].append('check'),
            'unexplained-null-context': lambda r: next(x for x in r if x['kind'] == 'prefix' and x['name'] == 'flop-facing33')['result']['value']['ranges']['BTN'].__setitem__(1, 1),
        }
        for name, mutate in mutations.items():
            with self.subTest(name=name):
                rows = legacy_rows(); mutate(rows)
                with self.assertRaises((ValueError, KeyError)): self.validate(rows)
        for name, mutate in {
            'empty-source-hands': lambda v: v['inputs']['sources'][0]['spot'].update(hands=[{}] * 169),
            'unbound-conditional-row': lambda v: v['inputs']['seatRows']['BTN'][0].update(freq=13),
            'wrong-pot': lambda v: (v['inputs']['spot'].update(potBb=123), v['initialTable'].update(pot=123)),
            'missing-winner': lambda v: v['initialTable'].pop('winner'),
            'missing-last-aggressor': lambda v: v['initialTable'].pop('lastAggressor'),
        }.items():
            with self.subTest(name=name):
                rows = catalog_rows(); mutate(rows[1]['result']['value'])
                with self.assertRaises((ValueError, KeyError)): self.validate(rows, 'all407')

    def test_unavailable_controls_require_exact_error_and_review(self):
        def unavailable(subtype, message, classification):
            rows = legacy_rows(); name = 'flop-facing-raise'
            target = next(row for row in rows if row['kind'] == 'prefix' and row['name'] == name)
            laws = [row for row in rows if row['kind'] == 'law' and row['prefix'] == name]
            target['result'] = {'status': 'error', 'classification': classification, 'error': {'name': 'Error', 'subtype': subtype, 'message': message}}
            rows = [row for row in rows if row not in laws]
            cov = rows[-2]['coverage']; cov.update(lawRows=6, legalPrefixes=6, errors=[name], facingNullContext=3)
            cov['boundarySamples'] -= len(laws[0]['actionOrder']) * 3
            return rows
        with self.assertRaisesRegex(ValueError, 'Unexpected replay'):
            self.validate(unavailable('TypeError', 'synthetic implementation defect', 'geometry-path-unavailable-requires-review'))
        with self.assertRaisesRegex(ValueError, 'Unexpected replay'):
            self.validate(unavailable('DefencePathError', 'Flop actions do not reach a pending decision', 'silently-accepted'))
        result = self.validate(unavailable('DefencePathError', 'Flop actions do not reach a pending decision', 'geometry-path-unavailable-requires-review'))
        self.assertEqual(len(result['unavailable_controls_requiring_review']), 1)

    @unittest.skipUnless(os.environ.get('HU_RESTORED_REPO'), 'Set HU_RESTORED_REPO for exact restored-side checks')
    def test_actual_restored_manifest_membership_and_mutations(self):
        repo = pathlib.Path(os.environ['HU_RESTORED_REPO']); frontend = repo / 'apps/frontend'
        graph = receipt.load_json(frontend / '.local/hu-model11/preservation-design/baseline-028-current-source-graphs.json')
        original = receipt.load_json(frontend / '.local/hu-model11/source-copy.json')
        for side in ['baseline', 'current']:
            path = frontend / f'.local/hu-model11/preservation-restored-v2/{side}.manifest.json'
            self.assertEqual(receipt.file_record(path)['sha256'], receipt.PINS[str(path.relative_to(frontend))])
            manifest = receipt.load_json(path)
            value = receipt.validate_side(repo, manifest, graph, side, original)
            self.assertEqual(len(value['files']), 173)
            mutations = {
                'swapped-side': lambda m: m.update(side='current' if side == 'baseline' else 'baseline'),
                'same-current-root': lambda m: m.update(root='apps/frontend/.local/hu-model11/preservation-restored-v2/current'),
                'wrong-category': lambda m: m['files'][next(iter(m['files']))].update(kind='wrong-category'),
                'missing-file': lambda m: m['files'].pop(next(iter(m['files']))),
                'source-drift': lambda m: m['files']['apps/frontend/scripts/postflop-ai/defence.mjs'].update(sha256='0' * 64),
            }
            for name, mutation in mutations.items():
                if side == 'current' and name == 'same-current-root': continue
                with self.subTest(side=side, name=name):
                    changed = copy.deepcopy(manifest); mutation(changed)
                    with self.assertRaises(ValueError): receipt.validate_side(repo, changed, graph, side, original)

    def test_same_source_pair_rejected(self):
        base = {'mode': 'legacy45', 'group': 1, 'ids': ['S'], 'node_before': {'sha256': 'n'},
                'source_before': {'harness': {'emitter': 'h'}, 'materialization': {'root': 'same'}}}
        with self.assertRaisesRegex(ValueError, 'Same-source'):
            audit.verify_pair_identity(base, copy.deepcopy(base))
        current = copy.deepcopy(base); current['source_before']['materialization']['root'] = 'different'
        audit.verify_pair_identity(base, current)
        current['node_before']['sha256'] = 'other'
        with self.assertRaisesRegex(ValueError, 'Node'): audit.verify_pair_identity(base, current)

    def test_stop_uses_group_term_then_kill_with_mock_only(self):
        spec = importlib.util.spec_from_file_location('bounded_runner_for_mock', PERF / 'run-model11-preservation-bounded.py')
        runner = importlib.util.module_from_spec(spec); spec.loader.exec_module(runner)
        process = mock.Mock(); process.pid = 123; process.poll.return_value = None
        process.wait.side_effect = [runner.subprocess.TimeoutExpired('synthetic', 3), -9]
        with mock.patch.object(runner.os, 'killpg') as kill:
            self.assertEqual(runner.stop(process), -9)
            self.assertEqual(kill.call_args_list, [mock.call(123, runner.signal.SIGTERM), mock.call(123, runner.signal.SIGKILL)])
        # No subprocess, process or actual signal was launched by this mock contract test.

    def test_pinned_ascii_rng_port(self):
        self.assertEqual(receipt.seed_for('a'), 3826002220)
        self.assertEqual(next(receipt.seeded_random(1)), 0.6270739405881613)

    @unittest.skipUnless(os.environ.get('HU_RECOVERY_ARCHIVE'), 'Set HU_RECOVERY_ARCHIVE for optional archived-byte checks')
    def test_archived_current_graph_and_original154_bytes(self):
        archive = pathlib.Path(os.environ['HU_RECOVERY_ARCHIVE'])
        repository = archive / 'logical_files'; frontend = repository / 'apps/frontend'
        graph = receipt.load_json(frontend / '.local/hu-model11/preservation-design/baseline-028-current-source-graphs.json')
        self.assertEqual(receipt.source_graph(repository, graph['roots']), graph['currentTransitiveSources'])
        baseline = archive / 'historical_source_snapshots' / receipt.BASELINE / 'source_records'
        archived_baseline_sources = 0
        for relative, record in graph['baselineTransitiveSources'].items():
            path = baseline / relative
            if path.exists():
                archived_baseline_sources += 1
            else:
                path = repository / relative
            receipt.match_record(path, record)
        self.assertEqual(archived_baseline_sources, 20)
        originals = receipt.validate_original(repository, receipt.load_json(frontend / '.local/hu-model11/source-copy.json'))
        self.assertEqual(len(originals), 154)
        contracts = schema.FixtureContracts(frontend)
        self.assertEqual(len(contracts.cases), 45)
        self.assertEqual(len(contracts.catalog), 407)
        source = receipt.load_json(frontend / 'src/estimated/opening-ranges.json')['spots'][0]
        contracts.source(source, 'opening-ranges')
        source['hands'][0]['open'] = 99
        with self.assertRaisesRegex(ValueError, 'pinned'): contracts.source(source, 'opening-ranges')
        for relative, pin in receipt.PINS.items():
            if 'preservation-restored-v2/' not in relative:
                self.assertEqual(receipt.file_record(frontend / relative)['sha256'], pin)
        cases = receipt.load_json(frontend / '.local/hu-model11/preservation-design/legacy45-explicit-case-design.json')['cases']
        self.assertEqual(len(cases), 45)
        for case in cases:
            for kind, record in case['originalArtifacts'].items():
                path = frontend / '.local/postflop-ai' / record['file']; receipt.match_record(path, record)
                value = receipt.load_json(path)
                if kind == 'report': self.assertEqual(value['defence_version'], 5)
                else: self.assertIn('policy', value)


if __name__ == '__main__':
    unittest.main()
