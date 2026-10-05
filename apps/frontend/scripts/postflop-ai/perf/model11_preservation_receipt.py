"""Static materialization/receipt validation. No Node invocation in this module."""
import hashlib
import json
import pathlib
import os
import math
import re

BASELINE = '028f412a36f0ab352a92240661b703a134c64b8c'
REPOSITORY_BASE = '471f8920fd4ed258ca163dd1daa707b75daf1250'
PACKAGE = {'bytes': 2394, 'sha256': 'e51066c16cbc18b21e5479fe577d84ca998a7a880e0e5f56fc3fd946c3c89d3e'}
MATERIALIZATION_REVIEW_APPROVED = True  # Independent manifest-only review. NOT numerical authorization.
REVIEWED_ARCHIVE_SOURCE = '8d6e2af26f13abd7847e57b44098160990bf0cec'
CANONICAL = '3ab7ad54822d77d2a59821d24878eb47d19e4a76'
PINS = {
    '.local/hu-model11/source-copy.json': '8aab931431b1cd75b5c3772684cd40d5c2bb40742975e2fb319867be3d52a5d6',
    '.local/postflop-ai/legacy-source/manifest.json': '016043d77a0efb0bcf6e2a0d6078c162e4a060a1d1491a3f637bab3af6ac1c9a',
    '.local/hu-model11/preservation-design/all407-explicit-catalog-design.json': '6c41a017a3648d21a49ca7bc6b378943d254207a62ec20890651853d0ea0b2c4',
    '.local/hu-model11/preservation-design/legacy45-explicit-case-design.json': 'e30bf1655e3db5640f583803d0085c96b3cfe6d8da9b88fc67e7ccca4ec6891b',
    '.local/hu-model11/preservation-design/baseline-028-current-source-graphs.json': '97eaf66e8e550f23e9d24c6f189282d1e3c054b94f5150fbeb8192b3d286e98f',
    '.local/hu-model11/preservation-restored-v2/baseline.manifest.json': '426df4bd27b49ec71742e64f8092995c6ce7a4d90bff3066344aa06ea95a065e',
    '.local/hu-model11/preservation-restored-v2/current.manifest.json': '6a6830022e38e6322facd697a6e2834928ea9f36519e1aeae1fe9f07ea0c816b',
}
HARNESS = ['scripts/postflop-ai/perf/' + name for name in [
    'emit-model11-preservation.mjs', 'run-model11-preservation-bounded.py',
    'audit-model11-preservation.py', 'model11_preservation_receipt.py', 'model11_preservation_schema.py']]
HARNESS += ['tests/test_model11_preservation.py', 'docs/experiments/hu-model11-preservation-harness.md']
IMPORTS = re.compile(r'''(?:\bimport\s+(?:[^;]*?\s+from\s+)?|\bexport\s+[^;]*?\s+from\s+)["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)''')


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Duplicate JSON key: {key}')
        result[key] = value
    return result


def parse_float_finite(text):
    value = float(text)
    if not math.isfinite(value):
        raise ValueError('Nonfinite JSON exponent requires explicit wire tag')
    return value


def parse_json(text):
    return json.loads(text, object_pairs_hook=no_duplicates, parse_float=parse_float_finite,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f'Nonstandard JSON: {value}')))


def load_json(path):
    return parse_json(pathlib.Path(path).read_text())


def file_record(path):
    sha, size = hashlib.sha256(), 0
    with pathlib.Path(path).open('rb') as stream:
        for blob in iter(lambda: stream.read(1024 * 1024), b''):
            sha.update(blob)
            size += len(blob)
    return {'bytes': size, 'sha256': sha.hexdigest()}


def safe_root(root):
    root = pathlib.Path(root).absolute()
    if any(item.is_symlink() for item in [root, *root.parents]):
        raise ValueError(f'Symlinked root: {root}')
    return root.resolve()


def checked_path(root, relative):
    root = safe_root(root)
    relative = pathlib.PurePosixPath(relative)
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError(f'Unsafe relative path: {relative}')
    path = root.joinpath(*relative.parts)
    if not path.resolve().is_relative_to(root):
        raise ValueError(f'Escaped root: {relative}')
    if any(item.is_symlink() for item in [path, *path.parents] if item.is_relative_to(root)):
        raise ValueError(f'Symlinked path: {relative}')
    if not path.is_file():
        raise ValueError(f'Missing regular file: {relative}')
    return path


def match_record(path, record):
    actual = file_record(path)
    if actual != {key: record[key] for key in ['bytes', 'sha256']}:
        raise ValueError(f'Pinned bytes changed: {path}')
    return actual


def source_graph(root, roots):
    root = safe_root(root)
    found = {}

    def visit(relative):
        path = checked_path(root, relative)
        relative = path.relative_to(root).as_posix()
        if relative in found:
            return
        found[relative] = file_record(path)
        if path.suffix not in ['.mjs', '.js', '.cjs', '.ts', '.tsx']:
            return
        for match in IMPORTS.finditer(path.read_text()):
            name = match.group(1) or match.group(2)
            if name.startswith('.'):
                raw = path.parent / name
                if any(item.is_symlink() for item in [raw, *raw.parents]):
                    raise ValueError(f'Symlinked import: {relative}: {name}')
                target = pathlib.Path(os.path.normpath(raw))
                if not target.is_relative_to(root):
                    raise ValueError(f'Import escapes source root: {relative}: {name}')
                visit(target.relative_to(root).as_posix())
            elif not name.startswith('node:'):
                raise ValueError(f'Unpinned external import: {relative}: {name}')
    for relative in roots:
        visit(relative)
    return dict(sorted(found.items()))


def expected_membership(graph, original, side, legacy_record):
    expected = {name: {**record, 'kind': 'transitive-source'} for name, record in
                graph['baselineTransitiveSources' if side == 'baseline' else 'currentTransitiveSources'].items()}
    for row in original['copied_files']:
        if row['kind'] == 'frozen-input':
            name, kind = row['path'], 'raw-input'
        elif row['kind'] in ['legacy-candidate', 'legacy-later_candidate', 'legacy-report']:
            name, kind = 'apps/frontend/.local/postflop-ai/' + row['file'], 'legacy-artifact'
        else:
            continue
        if name in expected:
            raise ValueError('Overlapping materialization categories')
        expected[name] = {key: row[key] for key in ['bytes', 'sha256']}; expected[name]['kind'] = kind
    expected['apps/frontend/package.json'] = {**PACKAGE, 'kind': 'package-boundary'}
    expected['apps/frontend/.local/postflop-ai/legacy-source/manifest.json'] = {**legacy_record, 'kind': 'legacy-manifest'}
    return expected


def validate_side(repository, manifest, graph, expected_side, original):
    repository = safe_root(repository)
    side = manifest['side']
    if side != expected_side or side not in ['baseline', 'current']:
        raise ValueError('Requested side differs from manifest side')
    if manifest.get('schema_version') != 2 or manifest.get('kind') != 'restored-preservation-side-materialization-v2-unapproved':
        raise ValueError('Wrong restored materialization schema')
    if (manifest['baselineGit'] != BASELINE or manifest['canonicalGit'] != CANONICAL or
            manifest['recoveredExperimentGit'] != REVIEWED_ARCHIVE_SOURCE or manifest['repositoryBaseGit'] != REPOSITORY_BASE):
        raise ValueError('Wrong independent source/repository provenance')
    expected_root = f'apps/frontend/.local/hu-model11/preservation-restored-v2/{side}'
    if manifest['root'] != expected_root:
        raise ValueError('Wrong side-specific isolated root')
    root = safe_root(repository / expected_root)
    other = safe_root(repository / f'apps/frontend/.local/hu-model11/preservation-restored-v2/{"current" if side == "baseline" else "baseline"}')
    if root == other or root.is_relative_to(other) or other.is_relative_to(root):
        raise ValueError('Side roots are not independent')
    legacy_path = checked_path(repository, 'apps/frontend/.local/postflop-ai/legacy-source/manifest.json')
    legacy = file_record(legacy_path)
    if legacy['sha256'] != PINS['.local/postflop-ai/legacy-source/manifest.json']:
        raise ValueError('Original legacy manifest changed')
    expected = expected_membership(graph, original, side, legacy)
    files = manifest['files']
    if set(files) != set(expected):
        raise ValueError('Materialization exact path/category membership differs')
    categories = {'transitive-source': 24, 'package-boundary': 1, 'raw-input': 12, 'legacy-artifact': 135, 'legacy-manifest': 1}
    actual_counts = {kind: sum(record['kind'] == kind for record in files.values()) for kind in categories}
    if actual_counts != categories or len(files) != 173 or any(record['kind'] not in categories for record in files.values()):
        raise ValueError('Materialization actual category counts differ')
    if manifest['counts'] != {'transitiveSources': 24, 'packageBoundaries': 1, 'rawInputs': 12, 'legacyArtifacts': 135, 'legacyManifests': 1}:
        raise ValueError('Materialization declared counts differ')
    source_expected = graph['baselineTransitiveSources' if side == 'baseline' else 'currentTransitiveSources']
    if sorted(manifest['sourcePaths']) != sorted(source_expected) or manifest['graphRoots'] != graph['roots']:
        raise ValueError('Source closure contract changed')
    for relative, record in files.items():
        if {key: record[key] for key in ['bytes', 'sha256', 'kind']} != expected[relative] or not record.get('origin'):
            raise ValueError(f'Wrong exact record/category/provenance: {relative}')
        path = checked_path(root, relative)
        other_path = checked_path(other, relative)
        if path.stat().st_nlink != 1 or (path.stat().st_dev, path.stat().st_ino) == (other_path.stat().st_dev, other_path.stat().st_ino):
            raise ValueError('Materialization file is shared/hardlinked across sides')
        match_record(path, record)
    actual = source_graph(root, manifest['graphRoots'])
    if actual != source_expected:
        raise ValueError('Transitive source graph differs')
    observed = {path.relative_to(root).as_posix() for path in root.rglob('*') if path.is_file() or path.is_symlink()}
    if observed != set(files):
        raise ValueError('Side root has missing or unpinned files')
    return {'root': manifest['root'], 'side': side, 'source_graph': actual,
            'files': {key: {field: value[field] for field in ['bytes', 'sha256', 'kind', 'origin']} for key, value in sorted(files.items())}}


def validate_original(repository, manifest):
    records = manifest['copied_files']
    if len(records) != 154:
        raise ValueError('Original154 manifest coverage changed')
    result = {}
    for record in records:
        relative = record.get('path') or 'apps/frontend/.local/postflop-ai/' + record['file']
        if relative in result:
            raise ValueError('Duplicate original fixture')
        result[relative] = {**match_record(checked_path(repository, relative), record), 'kind': record['kind']}
    return result


def capture(frontend, side):
    frontend = safe_root(frontend)
    repository = frontend.parents[1]
    controls = {}
    for relative, sha in PINS.items():
        path = checked_path(frontend, relative)
        record = file_record(path)
        if record['sha256'] != sha:
            raise ValueError(f'Control pin changed: {relative}')
        controls[relative] = record
    graph = load_json(frontend / '.local/hu-model11/preservation-design/baseline-028-current-source-graphs.json')
    if graph['canonicalMapping'] != CANONICAL or graph['isolatedBase'] != BASELINE:
        raise ValueError('Graph source mapping changed')
    manifest = load_json(frontend / f'.local/hu-model11/preservation-restored-v2/{side}.manifest.json')
    changed = {name: {'baseline': graph['baselineTransitiveSources'][name], 'current': graph['currentTransitiveSources'][name]}
               for name in graph['baselineTransitiveSources'] if graph['baselineTransitiveSources'][name] != graph['currentTransitiveSources'][name]}
    source_delta = {'kind': 'independently-archived-byte-graph-difference-not-git-ancestry', 'baseline': BASELINE,
                    'current': REVIEWED_ARCHIVE_SOURCE, 'changed': changed}
    source_delta['sha256'] = hashlib.sha256(json.dumps(source_delta, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return {'side': side, 'reviewed_archive_source_revision': REVIEWED_ARCHIVE_SOURCE, 'archived_source_delta': source_delta, 'controls': controls,
            'materialization': validate_side(repository, manifest, graph, side, load_json(frontend / '.local/hu-model11/source-copy.json')),
            'original154': validate_original(repository, load_json(frontend / '.local/hu-model11/source-copy.json')),
            'harness': {relative: file_record(checked_path(frontend, relative)) for relative in HARNESS}}


def expected_ids(frontend, mode, group):
    directory = pathlib.Path(frontend) / '.local/hu-model11/preservation-design'
    if mode == 'all407':
        values = sorted(load_json(directory / 'all407-explicit-catalog-design.json')['expectedUniqueIds'])
        if len(values) != 407 or len(set(values)) != 407:
            raise ValueError('Catalog requires 407 unique IDs')
    else:
        values = [item['spot'] for item in load_json(directory / 'legacy45-explicit-case-design.json')['cases'] if item['group'] == group]
        if len(values) != 5 or len(set(values)) != 5:
            raise ValueError('Legacy group requires five unique cases')
    return values


def records(path):
    with pathlib.Path(path).open() as stream:
        for number, line in enumerate(stream, 1):
            if not line.endswith('\n'):
                raise ValueError(f'Truncated JSONL line {number}')
            yield parse_json(line)


BOARD = [36, 29, 10, 3, 24]  # Jc9d4h2s8c; rank-major, suits c/d/h/s.
SEEDS = [f'hu-preservation-v1/{name}' for name in ['alpha', 'beta', 'gamma', 'delta']]
PREFIXES = {
    'flop-root': (3, {'flop': []}),
    'flop-facing33': (3, {'flop': ['bet33']}),
    'flop-facing-raise': (3, {'flop': ['bet33', 'raise']}),
    'turn-root': (4, {'flop': ['bet33', 'call'], 'turn': []}),
    'turn-facing33': (4, {'flop': ['bet33', 'call'], 'turn': ['bet33']}),
    'river-root': (5, {'flop': ['bet33', 'call'], 'turn': ['check', 'check'], 'river': []}),
    'river-facing33': (5, {'flop': ['bet33', 'call'], 'turn': ['check', 'check'], 'river': ['bet33']}),
}
PROBES = ['duplicate-board', 'malformed-board', 'wrong-board-length', 'malformed-action', 'terminal-suffix']


def require(condition, message):
    if not condition:
        raise ValueError(message)


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def dense(vector):
    require(isinstance(vector, list) and len(vector) == 2704 and all(finite(v) and v >= 0 for v in vector),
            'Full finite nonnegative 2704-slot vector required')


def canonical_ids(vector, board):
    return [a * 52 + b for a in range(52) for b in range(a + 1, 52)
            if vector[a * 52 + b] > 0 and a not in board and b not in board]


def validate_error(result):
    require(result.get('status') == 'error' and isinstance(result.get('error'), dict), 'Explicit structured error required')
    require(isinstance(result['error'].get('name'), str) and isinstance(result['error'].get('message'), str), 'Error name/message missing')


def seed_for(text):
    # Independent Python port of the pinned ASCII FNV1a seed function; no project import.
    require(text.isascii(), 'Seed corpus is ASCII')
    value = 2166136261
    for char in text:
        value = ((value ^ ord(char)) * 16777619) & 0xffffffff
    return value


def seeded_random(seed):
    state = seed & 0xffffffff
    while True:
        state = (state + 0x6d2b79f5) & 0xffffffff
        value = ((state ^ (state >> 15)) * (state | 1)) & 0xffffffff
        value ^= (value + ((value ^ (value >> 7)) * (value | 61) & 0xffffffff)) & 0xffffffff
        yield ((value ^ (value >> 14)) & 0xffffffff) / 4294967296


def chosen(mix, draw, actions):
    target = draw * 100
    for action in actions:
        target -= mix[action]
        if target < 0:
            return action
    return actions[-1]


def validate_mix(mix, actions):
    require(isinstance(actions, list) and actions and len(set(actions)) == len(actions), 'Action order missing/duplicated')
    require(isinstance(mix, dict) and set(mix) == set(actions), 'Mix action coverage differs')
    require(all(finite(v) and 0 <= v <= 100 for v in mix.values()), 'Invalid numerical mix')
    # Do not add a normalization tolerance or change the kernel's rounding behavior.
    # Exact output parity is separate; this validator does not round or repair mixes.


def validate_boundaries(row):
    actions, mix, boundaries = row['actionOrder'], row['mix'], row['boundaries']
    validate_mix(mix, actions)
    require(len(boundaries) == len(actions), 'All action boundaries required')
    cumulative = 0.0
    for action, boundary in zip(actions, boundaries):
        cumulative += mix[action]
        at = cumulative / 100
        require(boundary['afterAction'] == action and boundary['cumulative'] == cumulative and boundary['boundary'] == at,
                'Boundary action/order/cumulative mismatch')
        require(len(boundary['samples']) == 3, 'All adjacent boundary samples required')
        for direction, sample in zip([-1, 0, 1], boundary['samples']):
            draw = at if direction == 0 else math.nextafter(at, -math.inf if direction < 0 else math.inf)
            require(sample['direction'] == direction and sample['random'] == draw and sample['inUnitInterval'] == (0 <= draw < 1),
                    'Representable boundary neighbor mismatch')
            require(sample['result'] == {'status': 'ok', 'value': chosen(mix, draw, actions)}, 'Boundary choice mismatch')


def validate_catalog(row):
    result = row['result']; require(result.get('status') == 'ok', 'Catalog builder error')
    value = result['value']; inputs = value['inputs']; spot = inputs['spot']; roles = value['roles']
    require({'spot', 'sources', 'config', 'fingerprint', 'seatRows'} <= inputs.keys(), 'Catalog full input fields missing')
    require({'id', 'history', 'ranges', 'contributionsBb', 'ip', 'oop', 'potBb', 'stackBb', 'tree'} <= spot.keys(), 'Catalog full spot fields missing')
    require(spot['id'] == row['id'] and roles == {role: spot[role] for role in ['ip', 'oop']}, 'Catalog identity/roles mismatch')
    require(isinstance(spot['history'], list) and spot['history'] and isinstance(spot['ranges'], dict), 'Preflop history/source factors missing')
    require(re.fullmatch('[0-9a-f]{64}', inputs['fingerprint']) is not None, 'Input fingerprint missing')
    require(set(inputs['seatRows']) == set(roles.values()), 'Conditional rows must contain only live seats')
    for rows in inputs['seatRows'].values():
        require(len(rows) == 169 and len({item['hand'] for item in rows}) == 169 and
                all(finite(item['freq']) and 0 <= item['freq'] <= 100 for item in rows), 'Full 169-row conditional frequencies required')
    sources = inputs['sources']; require(isinstance(sources, list) and sources, 'Complete source records required')
    source_keys = []
    for source in sources:
        require({'dataset', 'spot'} <= source.keys() and {'id', 'hands'} <= source['spot'].keys(), 'Malformed full source record')
        require(len(source['spot']['hands']) == 169, 'Truncated source hands')
        source_keys.append((source['dataset'], source['spot']['id']))
    require(len(set(source_keys)) == len(source_keys), 'Duplicate source record')
    factors = {(factor[0], factor[1]) for group in spot['ranges'].values() for factor in group}
    require(set(source_keys) == factors, 'Source records omit/introduce live or folded contributor factors')
    contributions = [{'seat': seat, 'chips': chips, 'live': seat in roles.values(), 'factors': spot['ranges'].get(seat, [])}
                     for seat, chips in spot['contributionsBb'].items()]
    require(value['contributions'] == contributions, 'Contributor chips/factors mismatch')
    require(value['deadChips'] == sum(item['chips'] for item in contributions if not item['live']), 'Dead chips mismatch')
    require(value['foldedPrivateCards'] == 'unknown-not-used-as-blockers', 'Folded private-card contract changed')
    table = value['initialTable']; require(table['spot'] == spot and table['pot'] == spot['potBb'], 'Initial table geometry mismatch')
    require(table['invested'] == {seat: 0 for seat in roles.values()} and table['stacks'] == {seat: spot['stackBb'] for seat in roles.values()}, 'Initial stack/invested mismatch')
    require(table['log'] == [] and table['path'] == {'flop': [], 'turn': [], 'river': []}, 'Catalog must not evaluate postflop paths')
    require(isinstance(value['gameConfig'], dict) and isinstance(inputs['config'], dict), 'Full configs required')


def validate_trajectory(row, case, random_state):
    require(row['board'] == BOARD, 'Trajectory board changed')
    spot = case['inputs']['spot']; seats = [spot['ip'], spot['oop']]; seed = row['seed']
    require(seed in SEEDS and row['seedValue'] == seed_for(f'{seed}|{row["id"]}'), 'Trajectory seed mismatch')
    require(set(row['hands']) == set(seats) and all(len(row['hands'][seat]) == 2 for seat in seats), 'Both private hands required')
    cards = BOARD + row['hands'][seats[0]] + row['hands'][seats[1]]
    require(all(type(card) is int and 0 <= card < 52 for card in cards) and len(set(cards)) == 9, 'Incompatible fixed-board deal')
    calls, decisions = row['randomCalls'], row['decisions']
    require(isinstance(calls, list) and calls and isinstance(decisions, list) and decisions, 'Random-call and decision streams required')
    generator, index = random_state.setdefault(seed, (seeded_random(row['seedValue']), 0))
    for local, call in enumerate(calls):
        require(call['index'] == local and call['seedCallIndex'] == index and call['value'] == next(generator), 'Random-call sequence differs from fixed seed')
        index += 1
    random_state[seed] = (generator, index)
    deal_calls = [call for call in calls if call['purpose'] == 'deal']
    require(len(deal_calls) >= 2 and len(deal_calls) % 2 == 0 and calls[:len(deal_calls)] == deal_calls, 'Invalid compatible-deal rejection stream')
    decision_calls = calls[len(deal_calls):]
    require(len(decision_calls) == len(decisions), 'One random call per recorded decision required')
    for number, (decision, call) in enumerate(zip(decisions, decision_calls)):
        require(call['purpose'] == f'decision:{number}:{decision["node"]}' and call['value'] == decision['draw'], 'Decision random-call mapping mismatch')
        validate_mix(decision['mix'], decision['actionOrder'])
        require(decision['sampledLabel'] == chosen(decision['mix'], decision['draw'], decision['actionOrder']), 'Sampled action label mismatch')
        require(decision['seat'] in seats and decision['board'] == BOARD[:len(decision['board'])], 'Decision seat/board mismatch')
        require({'table', 'base', 'mix', 'actionOrder', 'draw', 'sampledLabel'} <= decision.keys(), 'Full decision output required')
    require(row['result']['status'] == 'ok' and {'beforeSettlement', 'winner', 'afterSettlement', 'rake'} <= row['result']['value'].keys(), 'Full settled trajectory required')


def _validate_stream_v2_core(path, mode, group, ids):
    """Structural/seed verification; exact side comparison remains a separate audit."""
    iterator = iter(records(path)); header = next(iterator, None)
    require(header and header.get('kind') == 'header' and header.get('schema') == 'hu-preservation-v3' and header.get('mode') == mode and
            header.get('group') == (group if mode == 'legacy45' else None), 'Invalid stream header')
    completed, current, line_count, complete = [], None, 1, None
    for row in iterator:
        line_count += 1; require(complete is None, 'Records after completion'); kind = row.get('kind')
        if kind == 'complete':
            complete = row; continue
        if mode == 'all407':
            require(kind == 'catalog' and len(completed) < len(ids) and row.get('id') == ids[len(completed)], 'Wrong/duplicate catalog ID or order')
            validate_catalog(row); completed.append(row['id']); continue
        if kind == 'case':
            require(current is None and len(completed) < len(ids) and row.get('id') == ids[len(completed)], 'Wrong/duplicate legacy case')
            require(row['numericalFactoryVersion'] == 6 and row['savedReportDefenceVersion'] == 5 and row['savedReport']['defence_version'] == 5,
                    'Legacy DEF6 numerical factory and original DEF5 report required')
            require(row['inputs']['spot']['id'] == row['id'] and not row['inputs']['spot'].get('history'), 'Legacy factory cannot use a HU history spot')
            require(row['savedReport']['source_hash'] == row['inputs']['fingerprint'] and row['savedReport']['spot'] == row['id'], 'Saved report identity mismatch')
            require(row['corpus'] == {'positive': 'first8 canonical positive-own-reach', 'zero': 'first2 canonical base-supported zero-own-reach', 'seeds': SEEDS, 'dealsPerSeed': 8}, 'Declared representative corpus changed')
            current, case, prefixes, laws, probes, trajectories, random_state = row['id'], row, {}, {}, [], [], {}
            counters = {key: 0 for key in ['lawRows', 'zeroOwnLawRows', 'fallbackRows', 'equityNullRows', 'boundarySamples']}
            continue
        require(current is not None and row.get('id') == current, 'Case record outside its declared case')
        if kind == 'prefix':
            name = row['name']; require(name in PREFIXES and name not in prefixes, 'Unknown/duplicate prefix')
            require(list(PREFIXES).index(name) == len(prefixes), 'Prefix order changed')
            length, path_expected = PREFIXES[name]
            require(row['board'] == BOARD[:length] and row['path'] == path_expected, 'Declared board/prefix changed')
            result = row['result']; prefixes[name] = row; laws[name] = []
            if result['status'] == 'error':
                validate_error(result); continue
            require(result['status'] == 'ok', 'Unknown prefix result'); value = result['value']; table = value['table']; spot = table['spot']
            seats = [spot['ip'], spot['oop']]; require(set(value['ranges']) == set(seats), 'Both-seat reach vectors required')
            for vector in value['ranges'].values(): dense(vector)
            dense(value['baseWeights']); own = value['ranges'][table['log'][-1]['seat']]
            positive = canonical_ids(own, row['board']); base = canonical_ids(value['baseWeights'], row['board'])
            zeros = [combo for combo in base if own[combo] == 0]; selection = value['selection']
            require(positive and selection == {'positiveAvailable': len(positive), 'zeroOwnAvailable': len(zeros),
                    'ids': positive[:8] + zeros[:2], 'fullLawCoverage': False, 'bothSeatReachVectorSlots': 2704}, 'Representative selection does not match full vectors')
            require(type(value['isFacing']) is bool and value['contextStatus'] in ['null', 'available'], 'Explicit context/facing status required')
            require(isinstance(value['actionOrder'], list) and value['actionOrder'], 'Immutable action order missing')
        elif kind == 'law':
            prefix = row['prefix']; require(prefix in prefixes and prefixes[prefix]['result']['status'] == 'ok', 'Law outside successful prefix')
            value = prefixes[prefix]['result']['value']; combo = row['comboId']; selected = value['selection']['ids']
            require(len(laws[prefix]) < len(selected) and combo == selected[len(laws[prefix])], 'Missing/duplicate/out-of-order law combo')
            require(row['combo'] == [combo // 52, combo % 52] and row['ownReach'] == value['ranges'][value['table']['log'][-1]['seat']][combo] and
                    row['baseWeight'] == value['baseWeights'][combo], 'Law combo/reach/base mismatch')
            require({'base', 'mix', 'observableMix', 'facts', 'bettingFacts', 'equity', 'equityStatus', 'boundaries', 'actionOrder'} <= row.keys(), 'Incomplete law output')
            require(row['actionOrder'] == value['actionOrder'], 'Numerical action order changed'); validate_boundaries(row)
            require(row['equityStatus'] == ('context-null-not-requested' if value['contextStatus'] == 'null' else 'unavailable' if row['equity'] is None else 'available'), 'Equity status mismatch')
            counters['lawRows'] += 1; counters['zeroOwnLawRows'] += row['ownReach'] == 0
            counters['fallbackRows'] += isinstance(row['facts'], dict) and row['facts'].get('fallback') is True
            counters['equityNullRows'] += value['contextStatus'] == 'available' and row['equity'] is None
            counters['boundarySamples'] += len(row['actionOrder']) * 3; laws[prefix].append(combo)
        elif kind == 'error-probe':
            require(len(probes) < len(PROBES) and row['name'] == PROBES[len(probes)], 'Unknown/duplicate/out-of-order error probe')
            validate_error(row['result']); probes.append(row['name'])
        elif kind == 'trajectory':
            expected = [(seed, deal) for seed in SEEDS for deal in range(8)]
            key = (row['seed'], row['deal']); require(len(trajectories) < 32 and key == expected[len(trajectories)], 'Unknown/duplicate/out-of-order trajectory')
            validate_trajectory(row, case, random_state); trajectories.append(key)
        elif kind == 'case-complete':
            require(list(prefixes) == list(PREFIXES) and probes == PROBES and len(trajectories) == 32, 'Incomplete declared case corpus')
            successful = {name: item['result']['value'] for name, item in prefixes.items() if item['result']['status'] == 'ok'}
            require('flop-root' in successful and 'flop-facing33' in successful and successful['flop-facing33']['isFacing'], 'Genuine legal root/facing pair required')
            for name, value in successful.items(): require(laws[name] == value['selection']['ids'], 'Representative laws incomplete')
            expected_counts = {**counters, 'legalRoot': 1, 'legalFacing': 1, 'prefixes': 7, 'legalPrefixes': len(successful),
                'errors': [name for name in PREFIXES if name not in successful], 'trajectories': 32,
                'facingNullContext': sum(v['contextStatus'] == 'null' and v['isFacing'] for v in successful.values()),
                'nonFacingNullContext': sum(v['contextStatus'] == 'null' and not v['isFacing'] for v in successful.values())}
            require(all(row['coverage'][key] == value for key, value in expected_counts.items()), 'Coverage counters not supported by emitted records')
            require(isinstance(row['coverage']['gaps'], list) and row['coverage']['gaps'], 'Unexercised regimes must be explicit')
            completed.append(current); current = None
        else:
            raise ValueError(f'Unexpected record kind: {kind}')
    require(current is None and complete == {'kind': 'complete', 'mode': mode, 'count': len(ids), 'ids': ids} and completed == ids,
            'Incomplete/wrong case set or order')
    return {'records': line_count, 'case_count': len(completed), 'ids': completed}


def contained_path(root, path, *, must_exist=False):
    root = safe_root(root)
    path = pathlib.Path(path)
    if '..' in path.parts:
        raise ValueError('Parent traversal in evidence path')
    path = path.absolute()
    if any(part.is_symlink() for part in [path, *path.parents]):
        raise ValueError('Symlink in evidence path')
    resolved = path.resolve()
    if not resolved.is_relative_to(root) or resolved == root:
        raise ValueError('Evidence path escapes its root')
    if must_exist and not resolved.is_file():
        raise ValueError('Evidence file missing')
    return resolved


def exclusive_file(root, path, *, binary=False):
    path = contained_path(root, path)
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    return os.fdopen(fd, 'wb' if binary else 'w')


def create_run_directory(directory, name):
    directory = safe_root(directory)
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,80}', name):
        raise ValueError('Unsafe run name')
    runs = contained_path(directory, directory / 'runs')
    runs.mkdir(exist_ok=True)
    run = contained_path(runs, runs / name)
    run.mkdir()
    return run


def validate_stream(path, mode, group, ids, frontend=None):
    from model11_preservation_schema import validate_schema_stream, FixtureContracts
    contracts = FixtureContracts(frontend) if frontend is not None else None
    strict = validate_schema_stream(records(path), mode, contracts)
    result = _validate_stream_v2_core(path, mode, group, ids)
    return {**result, **strict}
