#!/usr/bin/env python3
"""Pilot1755 mechanical/source/partition checks only. Never invokes Node."""
import argparse
import ast
import hashlib
import importlib.util
import itertools
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
PREFIX = 'apps/frontend/scripts/postflop-ai/'
BASE = 'c8d2c8bab4eb1db886f5055e8e6396a70921dc69'
CODEC = '47a1394a59829934d00d25e6673c9f4877980e64'
FIXTURES = 'apps/frontend/tests/fixtures/'
MANIFEST = FIXTURES + 'model11-allboard-lanes-source-graph.json'
INTEGRATION = FIXTURES + 'model11-allboard-lanes-integration.json'
ROOTS = [PREFIX + 'evaluate-model11-allboard-lanes.mjs']
COPIED = [PREFIX + name for name in ['model11-allboard-partitioned-output.mjs', 'evaluate-model11-allboard-partitioned.mjs', 'perf/verify-model11-allboard-partitioned-source.py']]
CONTROLLER = PREFIX + 'perf/run-model11-pilot1755-lanes.py'
ADDED = COPIED + [PREFIX + name for name in ['model11-allboard-lane-proof.mjs', 'model11-allboard-lanes.mjs', 'evaluate-model11-allboard-lanes.mjs', 'perf/verify-model11-pilot1755-lanes.py']] + [CONTROLLER, MANIFEST, INTEGRATION, FIXTURES + 'model11-allboard-partitioned-source-graph.json', 'docs/model11-pilot1755-fixed-lanes.md', 'apps/frontend/tests/postflop-model11-pilot1755-lanes.test.mjs']
REFRESH = [FIXTURES + 'model11-gate-source-graph.json']

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

STRICT = load('pilot_strict', PREFIX + 'perf/verify-model11-gate-driver-source.py')
OUTPUT = load('pilot_output', PREFIX + 'perf/verify-model11-allboard-partitioned-source.py')

def record(path):
    return STRICT.record(ROOT, path)

def expected_wrapper():
    before = STRICT.ROOTS
    try:
        STRICT.ROOTS = ROOTS
        return {'kind': 'model11-pilot1755-closed-wrapper-inventory', 'version': 1, 'roots': ROOTS, 'sources': STRICT.graph(ROOT)}
    finally:
        STRICT.ROOTS = before

def frozen_core():
    # Bind the entire existing numerical/helper .mjs layer plus every strict graph
    # dependency, not only the functions mentioned in the worker wrapper.
    tracked = git('ls-tree', '-r', '--name-only', BASE, '--', PREFIX).decode().splitlines()
    names = {name for name in tracked if name.endswith('.mjs')}
    names.update(row['path'] for row in STRICT.graph(ROOT))
    return [record(name) for name in sorted(names)]

def expected_integration():
    return {'kind': 'model11-pilot1755-integration', 'version': 1,
            'baseCommit': BASE, 'baseTree': git('rev-parse', BASE + '^{tree}').decode().strip(),
            'codecCommit': CODEC, 'core': frozen_core(), 'copied47': [record(name) for name in COPIED],
            'controller': [record(CONTROLLER)],
            'declaredAdditions': sorted(ADDED), 'allowedInventoryRefreshes': REFRESH,
            'numericalCoreChanged': False, 'oldRepresentativeReplayPassClaimed': False}

def check_correspondence():
    original = git('show', BASE + ':' + PREFIX + 'model11-gate-drivers.mjs').decode()
    proof = (ROOT / (PREFIX + 'model11-allboard-lane-proof.mjs')).read_text()
    start = original.index('  const readProof = ref => {', original.index('export function runModel11AllBoards'))
    end = original.index('  try {\n  for (const board of boardList)', start)
    copied = proof.split('// BEGIN FROZEN PROOF BLOCK\n')[1].split('// END FROZEN PROOF BLOCK')[0]
    if copied != original[start:end]:
        raise ValueError('Frozen proof read/semantic block changed')
    start = original.index('      assertUnchanged();\n      const row = model11BoardRow', end)
    end = original.index('\n    }\n    proofExecution?.releaseBoardCaches();', start)
    copied = proof.split('// BEGIN FROZEN PERSIST BLOCK\n')[1].split('\n// END FROZEN PERSIST BLOCK')[0]
    if copied != original[start:end]:
        raise ValueError('Frozen proof-first/checkpoint-last persist block changed')
    return {'proofBlockSha256': hashlib.sha256(original[original.index('  const readProof = ref => {', original.index('export function runModel11AllBoards')):original.index('  try {\n  for (const board of boardList)', original.index('export function runModel11AllBoards'))].encode()).hexdigest(),
            'persistBlockSha256': hashlib.sha256(copied.encode()).hexdigest()}

def static_catalog():
    # Read-only independent transcription of frozen flop-isomorphism.mjs.
    # Keys compare only rank-to-rank or suit-to-suit, so ordinary ordering gives
    # the inherited ASCII alphabet/digit order at each key position.
    permutations = list(itertools.permutations(range(4)))
    keys = set()
    ranks, suits = '23456789TJQKA', 'cdhs'
    for cards in itertools.combinations(range(52), 3):
        best = min(tuple(sorted(((card & ~3) + perm[card & 3] for card in cards), key=lambda card: (-(card >> 2), card & 3))) for perm in permutations)
        keys.add(''.join(ranks[card >> 2] + suits[card & 3] for card in best))
    catalog = sorted(keys)
    assert len(catalog) == 1755
    return catalog


def check_controller_completion_flag(catalog):
    controller = load('pilot_controller_control', CONTROLLER)
    with tempfile.TemporaryDirectory(prefix='pilot1755-complete-flag-') as temporary:
        run = Path(temporary)
        prepared = {'source': {'identityHash': 'a' * 64}, 'files': {}, 'bindingHash': 'b' * 64,
                    'checkpointIdentityHash': 'c' * 64, 'boardIds': catalog}
        spec = {'runRoot': str(run), 'inputs': {'spot': controller.SPOT}}
        directory = run / 'lane-0' / 'checkpoints' / prepared['checkpointIdentityHash']
        directory.mkdir(parents=True)
        identity = {'source': prepared['source'], 'files': prepared['files'], 'spot': controller.SPOT,
                    'plan': {'kind': 'all-boards', 'scope': 'full', 'street': 'all', 'boardList': [{'id': board} for board in catalog]}}
        (directory / 'identity.json').write_text(json.dumps(identity))
        def marker(index, complete):
            row = {'board': catalog[index], 'bindingHash': prepared['bindingHash'], 'complete': complete,
                   'findings': [{'severity': 'error', 'check': 'synthetic-quality-finding'}]}
            body = json.dumps(row, separators=(',', ':'))
            envelope = {'key': prepared['checkpointIdentityHash'], 'row': row, 'sha256': hashlib.sha256(body.encode()).hexdigest()}
            path = directory / (catalog[index] + '.json')
            path.write_text(json.dumps(envelope))
            return path, path.read_bytes()
        good, good_bytes = marker(0, True)
        child = {'index': 0}
        controller.check_committed_rows(child, spec, prepared)
        assert child['nextCheckpointIndex'] == 4 and 'incompleteCheckpoint' not in child
        controller.check_committed_rows(child, spec, prepared)
        assert child['nextCheckpointIndex'] == 4  # No committed next marker: no progress or reread.
        bad, bad_bytes = marker(4, False)
        for owner in [child, {'index': 0}]:  # Existing false rows also fail after contiguous reuse.
            try:
                controller.check_committed_rows(owner, spec, prepared)
            except ValueError as error:
                assert 'committed incomplete board' in str(error)
            else:
                raise AssertionError('A committed complete=false checkpoint must stop the owned loop')
            assert owner['incompleteCheckpoint']['path'] == str(bad)
            assert owner['incompleteCheckpoint']['complete'] is False
        assert good.read_bytes() == good_bytes and bad.read_bytes() == bad_bytes
    return {'completeTrueWithQualityErrorContinues': True, 'completeFalseStops': True,
            'reusedCompleteFalseStops': True, 'checkpointBytesPreserved': True, 'nodeRun': False}


def verify():
    # No c8d2 tracked file may change except the declared strict inventory.
    changes = git('diff', '--name-status', BASE, '--').decode().splitlines()
    for line in changes:
        status, path = line.split('\t')
        if not (status == 'A' and path in ADDED or status == 'M' and path in REFRESH):
            raise ValueError('Undeclared integration change: ' + line)
    for path in git('ls-files', '--others', '--exclude-standard').decode().splitlines():
        if path not in ADDED:
            raise ValueError('Undeclared untracked integration file: ' + path)
    for row in frozen_core():
        if git('show', BASE + ':' + row['path']) != (ROOT / row['path']).read_bytes():
            raise ValueError('Frozen numerical source changed: ' + row['path'])
    for name in COPIED:
        if git('show', CODEC + ':' + name) != (ROOT / name).read_bytes():
            raise ValueError('Reviewed47 output file changed: ' + name)
    strict = STRICT.verify(ROOT)
    output = OUTPUT.verify(ROOT)
    wrapper = expected_wrapper()
    if json.loads((ROOT / MANIFEST).read_text()) != wrapper:
        raise ValueError('Closed wrapper inventory differs')
    integration = expected_integration()
    if json.loads((ROOT / INTEGRATION).read_text()) != integration:
        raise ValueError('Explicit integration inventory differs')
    mechanical = check_correspondence()
    catalog = static_catalog()
    completion_control = check_controller_completion_flag(catalog)
    assignments = [list(range(lane, 1755, 4)) for lane in range(4)]
    assert [len(row) for row in assignments] == [439, 439, 439, 438]
    assert sorted(index for row in assignments for index in row) == list(range(1755))
    assert all(set(assignments[a]).isdisjoint(assignments[b]) for a in range(4) for b in range(a))
    ast.parse((ROOT / CONTROLLER).read_text(), filename=CONTROLLER)
    ast.parse(Path(__file__).read_text(), filename=__file__)
    worker = (ROOT / (PREFIX + 'model11-allboard-lanes.mjs')).read_text()
    producer = worker.split('function requireTerminalProducers(', 1)[1].split('function verifyLaneCompletion(', 1)[0]
    assert 'readFileSync(`/proc/' not in producer and "readdirSync('/proc')" not in producer
    assert 'child.pid !== term.pid' in producer and 'child.startTicks !== term.startTicks' in producer
    assert 'terminal.allCreatedChildrenReaped !== true' in producer and 'terminal.allOwnedGroupsGone !== true' in producer
    final = worker[worker.index('export function finalizePilot1755'):]
    assert final.index('requireExistingUnchanged();') < final.index('const result = runModel11AllBoards(')
    assert 'assertUnchanged: requireExistingUnchanged' in final
    guard = final.split('  const requireExistingUnchanged = () => {', 1)[1].split('\n  };', 1)[0]
    assert 'c.assertUnchanged();' in guard and 'c.boardIds.map(' in guard and 'lstatSync(' in guard
    assert 'pilotFile(' not in guard and 'assertProducersUnchanged(' not in guard and 'mergedPins' not in guard
    assert final.count('  assertEvidenceUnchanged();') == 2
    assert final.index('  assertEvidenceUnchanged();') < final.index('const result = runModel11AllBoards(')
    assert final.rindex('  assertEvidenceUnchanged();') > final.index('consumeModel11AllBoardReceipt(saved')
    assert 'onBoard() { gateFail(' in final
    assert 'consumeModel11AllBoardReceipt(saved' in final
    assert 'model11BoardRow(' not in worker
    assert 'resolveModel11GatePlan(inputs' in worker and "plan.boardList.length !== 1755" in worker
    return {'kind': 'model11-pilot1755-static-verification', 'status': 'PASS-STATIC-ONLY',
            'baseCommit': BASE, 'coreFilesByteIdentical': len(integration['core']), 'codecFilesByteIdentical': len(COPIED),
            'strictSourceFiles': strict['sourceFiles'], 'outputSourceFiles': output['outputSourceFiles'],
            'wrapperSourceFiles': len(wrapper['sources']), 'rawInputFiles': strict['rawInputFiles'], 'rawInputBytes': strict['rawInputBytes'],
            'laneCounts': [len(row) for row in assignments], 'disjointExact1755Indices': True,
            'staticCatalogIdsSha256': hashlib.sha256(('\n'.join(catalog) + '\n').encode()).hexdigest(), 'staticCatalogCount': len(catalog),
            'mechanicalCorrespondence': mechanical, 'controllerCompleteFlagControl': completion_control, 'pythonSyntax': 'PASS', 'javascriptSyntaxExecution': 'NOT RUN',
            'serialLaneParity': 'NOT RUN', 'semanticTamperTests': 'NOT RUN', 'numericGeneration': 'NOT RUN',
            'inventories': [record(name) for name in [MANIFEST, INTEGRATION]],
            'caveat': 'Static catalog transcription/structure/correspondence is not JavaScript runtime, numerical, producer or acceptance evidence.'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true', help='Author inventories only; subsequent independent review is required')
    args = parser.parse_args()
    if args.write:
        (ROOT / STRICT.MANIFEST).write_text(json.dumps(STRICT.expected(ROOT), indent=2) + '\n')
        (ROOT / OUTPUT.MANIFEST).write_text(json.dumps(OUTPUT.expected(ROOT), indent=2) + '\n')
        (ROOT / MANIFEST).write_text(json.dumps(expected_wrapper(), indent=2) + '\n')
        (ROOT / INTEGRATION).write_text(json.dumps(expected_integration(), indent=2) + '\n')
    print(json.dumps(verify(), indent=2))
