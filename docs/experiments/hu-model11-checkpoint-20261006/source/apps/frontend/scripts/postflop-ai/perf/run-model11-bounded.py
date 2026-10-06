#!/usr/bin/env python3
"""Single authorized bounded experiment; exact graph/fixture/log receipt, never acceptance."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import re
import resource
import signal
import subprocess
import time


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_graph(repository, roots):
    """Equivalent local transitive scan to frozen audit-identity.mjs; explicit roots only."""
    imports = re.compile(r'''(?:\bimport\s+(?:[^;]*?\s+from\s+)?|\bexport\s+[^;]*?\s+from\s+)["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)''')
    found = {}

    def visit(relative):
        path = repository / relative
        resolved = path.resolve()
        if not resolved.is_relative_to(repository) or any(part.is_symlink() for part in [path, *path.parents] if part.is_relative_to(repository)):
            raise ValueError(f'Invalid or symlinked source path: {relative}')
        relative = str(resolved.relative_to(repository))
        if relative in found:
            return
        data = resolved.read_bytes()
        found[relative] = {'bytes': len(data), 'sha256': digest(data)}
        if resolved.suffix not in ['.mjs', '.cjs', '.js', '.ts', '.tsx']:
            return
        for match in imports.finditer(data.decode('utf-8')):
            name = match.group(1) or match.group(2)
            if name.startswith('.'):
                visit(str((resolved.parent / name).relative_to(repository)))

    for root in sorted(roots):
        visit(root)
    return found


FIXTURE_MANIFEST_SHA256 = '8aab931431b1cd75b5c3772684cd40d5c2bb40742975e2fb319867be3d52a5d6'
LEGACY_MANIFEST_SHA256 = '016043d77a0efb0bcf6e2a0d6078c162e4a060a1d1491a3f637bab3af6ac1c9a'
SIX_REAL_MANIFEST_SHA256 = 'd3a5c5ee250c60566f45d81bb064900c9ca175f3aebd8dc537d529c88b7c069d'


def validate_fixture_selection(pattern, fixture_set):
    names = [f'six real support case {number} retains exact fixtures complete laws vectors and explicit numerical states' for number in range(1, 7)]
    if fixture_set == 'six-real-v1':
        if not re.fullmatch(r'six real support case [1-6] ', pattern):
            raise ValueError('Six-real diagnostics require one exact predeclared case selector, not a combined batch')
    elif any(re.search(pattern, name) for name in names):
        raise ValueError('A selected six-real test requires its separately pinned six-real-v1 fixture set')


def immutable_fixtures(frontend, repository, *, expected_manifest_hash=FIXTURE_MANIFEST_SHA256, expected_legacy_hash=LEGACY_MANIFEST_SHA256):
    manifest_path = frontend / '.local/hu-model11/source-copy.json'
    manifest_data = manifest_path.read_bytes()
    if digest(manifest_data) != expected_manifest_hash:
        raise ValueError('Source-copy fixture manifest differs from the independently inspected frozen manifest')
    manifest = json.loads(manifest_data)
    result = {}
    for record in manifest['copied_files']:
        relative = record.get('path') or 'apps/frontend/.local/postflop-ai/' + record['file']
        path = repository / relative
        if not path.resolve().is_relative_to(repository) or path.is_symlink():
            raise ValueError(f'Invalid fixture path: {relative}')
        data = path.read_bytes()
        if len(data) != record['bytes'] or digest(data) != record['sha256']:
            raise ValueError(f'Frozen fixture does not match source-copy manifest: {relative}')
        result[relative] = {'bytes': len(data), 'sha256': digest(data), 'kind': record['kind']}
    for path in [manifest_path, frontend / '.local/postflop-ai/legacy-source/manifest.json']:
        data = path.read_bytes()
        if path != manifest_path and digest(data) != expected_legacy_hash:
            raise ValueError('Legacy fixture manifest differs from its frozen original bytes')
        result[str(path.relative_to(repository))] = {'bytes': len(data), 'sha256': digest(data), 'kind': 'immutable-fixture-manifest'}
    return result


def six_real_fixtures(frontend, repository, *, expected_manifest_hash=SIX_REAL_MANIFEST_SHA256):
    path = frontend / '.local/hu-model11/six-real-fixtures-v1.manifest.json'
    if not path.resolve().is_relative_to(repository) or any(part.is_symlink() for part in [path, *path.parents] if part.is_relative_to(repository)):
        raise ValueError('Invalid or symlinked six-real fixture manifest path')
    data = path.read_bytes()
    if digest(data) != expected_manifest_hash:
        raise ValueError('Six-real fixture manifest differs from its frozen independent-review pin')
    manifest = json.loads(data)
    records = manifest['files']
    kinds = [record['kind'] for record in records]
    if len(records) != 14 or kinds.count('exact-original-model10-policy-envelope') != 8 or kinds.count('pinned-model10-historical-diagnostic') != 5 or kinds.count('pinned-original-six-real-case-locator') != 1:
        raise ValueError('Six-real fixture coverage must include eight policies, five records and one locator')
    result = {}
    prefix = 'apps/frontend/.local/hu-model11/six-real-fixtures-v1/'
    for record in records:
        relative = record['path']
        fixture = repository / relative
        if not relative.startswith(prefix) or relative in result or not fixture.resolve().is_relative_to(repository) or any(part.is_symlink() for part in [fixture, *fixture.parents] if part.is_relative_to(repository)):
            raise ValueError(f'Invalid, duplicate or symlinked six-real fixture path: {relative}')
        blob = fixture.read_bytes()
        if len(blob) != record['bytes'] or digest(blob) != record['sha256']:
            raise ValueError(f'Six-real fixture does not match its frozen manifest: {relative}')
        result[relative] = {'bytes': len(blob), 'sha256': digest(blob), 'kind': record['kind']}
    result[str(path.relative_to(repository))] = {'bytes': len(data), 'sha256': digest(data), 'kind': 'immutable-six-real-fixture-manifest'}
    return result


def capture(frontend, repository, roots, fixture_set='original154'):
    sources = source_graph(repository, roots)
    runner = pathlib.Path(__file__).resolve()
    runner_data = runner.read_bytes()
    sources[str(runner.relative_to(repository))] = {'bytes': len(runner_data), 'sha256': digest(runner_data)}
    fixtures = immutable_fixtures(frontend, repository)
    if fixture_set == 'six-real-v1':
        extra = six_real_fixtures(frontend, repository)
        if fixtures.keys() & extra.keys():
            raise ValueError('Added six-real fixtures overlap original154 coverage')
        fixtures.update(extra)
    elif fixture_set != 'original154':
        raise ValueError('Unknown fixture set')
    return {'roots': roots, 'fixture_set': fixture_set, 'transitive_sources': dict(sorted(sources.items())),
            'immutable_fixtures': dict(sorted(fixtures.items()))}


def git_identity(repository):
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=repository)
    revision = git('rev-parse', 'HEAD').decode().strip()
    baseline = git('rev-list', '--max-parents=0', 'HEAD').decode().strip()
    return {'revision': revision, 'isolated_baseline': baseline,
            'revision_diff_sha256': digest(git('diff', '--binary', baseline, revision)),
            'tracked_working_diff_sha256': digest(git('diff', '--binary', 'HEAD'))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seconds', type=int, required=True)
    parser.add_argument('--heap', type=int, required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--pattern', required=True)
    parser.add_argument('--fixture-set', choices=['original154', 'six-real-v1'], default='original154')
    args = parser.parse_args()
    try:
        validate_fixture_selection(args.pattern, args.fixture_set)
    except (ValueError, re.error) as failure:
        parser.error(str(failure))
    if not (1 <= args.seconds <= 180 and 128 <= args.heap <= 512):
        parser.error('Phase1 maximum is180seconds/512MiBheap')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,80}', args.name):
        parser.error('A safe unique run name is required')
    frontend = pathlib.Path(__file__).resolve().parents[3]
    repository = frontend.parents[1]
    output = frontend / '.local/hu-model11'
    output.mkdir(parents=True, exist_ok=True)
    roots = ['apps/frontend/scripts/postflop-ai/effective-reach.mjs',
             'apps/frontend/tests/postflop-effective-law-model11.test.mjs']
    command = ['node', f'--max-old-space-size={args.heap}', '--test',
               f'--test-name-pattern={args.pattern}', 'tests/postflop-effective-law-model11.test.mjs']
    stdout_path = output / f'{args.name}.stdout.txt'
    stderr_path = output / f'{args.name}.stderr.txt'
    receipt_path = output / f'{args.name}.json'
    if receipt_path.exists():
        parser.error('Run receipt already exists; choose a new name')
    before = capture(frontend, repository, roots, args.fixture_set)
    start = time.monotonic()
    record = {'kind': 'bounded-model11-test-not-acceptance', 'command': command,
              'timeout_seconds': args.seconds, 'heap_mib': args.heap,
              'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'git_before': git_identity(repository), 'source_before': before,
              'resource_scope': 'V8 heap cap; RUSAGE_CHILDREN ru_maxrss maximum includes Node and receipt Git setup children, not simultaneous process-tree RSS sum; no RSS enforcement'}
    timed_out = False
    with stdout_path.open('xb') as stdout, stderr_path.open('xb') as stderr:
        process = subprocess.Popen(command, cwd=frontend, stdout=stdout, stderr=stderr, start_new_session=True)
        try:
            code = process.wait(timeout=args.seconds)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(process.pid, signal.SIGTERM)
            try:
                code = process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                code = process.wait()
    stdout_data, stderr_data = stdout_path.read_bytes(), stderr_path.read_bytes()
    after_error = None
    try:
        after = capture(frontend, repository, roots, args.fixture_set)
    except Exception as failure:
        after = None
        after_error = str(failure)
    unchanged = after == before
    resource_failure = timed_out or code < 0 or b'heap out of memory' in stdout_data.lower() + stderr_data.lower()
    status = 'partial-resource-failure' if resource_failure else 'source-changed-failure' if not unchanged else 'passed' if code == 0 else 'failed'
    record.update({'exit_code': code, 'timed_out': timed_out, 'status': status,
                   'elapsed_seconds': time.monotonic() - start,
                   'finished_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                   'max_child_rss_kib': resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
                   'stdout': str(stdout_path.relative_to(frontend)), 'stdout_bytes': len(stdout_data), 'stdout_sha256': digest(stdout_data),
                   'stderr': str(stderr_path.relative_to(frontend)), 'stderr_bytes': len(stderr_data), 'stderr_sha256': digest(stderr_data),
                   'source_after': after, 'source_after_error': after_error,
                   'source_unchanged': unchanged, 'git_after': git_identity(repository)})
    with receipt_path.open('x') as receipt:
        receipt.write(json.dumps(record, indent=2) + '\n')
    receipt_hash = digest(receipt_path.read_bytes())
    with (output / f'{args.name}.receipt.sha256').open('x') as receipt_hash_file:
        receipt_hash_file.write(receipt_hash + '\n')
    print(json.dumps({key: value for key, value in record.items() if key not in ['source_before', 'source_after']}, indent=2))
    print('receipt_sha256:', receipt_hash)
    print(stdout_data.decode('utf-8', errors='replace'))
    print(stderr_data.decode('utf-8', errors='replace'))
    return 124 if timed_out else 1 if not unchanged and code == 0 else code if code >= 0 else 128 - code


if __name__ == '__main__':
    raise SystemExit(main())
