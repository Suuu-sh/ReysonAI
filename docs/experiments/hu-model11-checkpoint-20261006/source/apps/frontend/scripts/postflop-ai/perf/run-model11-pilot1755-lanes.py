#!/usr/bin/env python3
"""Paused fixed four-lane pilot supervisor; no scheduler or numerical finalizer.

Adapted from the reviewed run-four-fresh-lanes.py ownership/wait4 skeleton.
Default execution performs read-only preflight. A reviewed spec SHA, launcher
SHA, and explicit matching window are required; --run-reviewed alone is not
authority to choose an initial window. This file never launches a fifth Node.
"""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import re
import signal
import stat
import subprocess
import sys
import time
import uuid

MIB = 1024 * 1024
INDIVIDUAL_RSS = 900 * MIB
AGGREGATE_RSS = 3072 * MIB
AVAILABLE_FLOOR = 2048 * MIB
SAMPLE_SECONDS = .05
CHECKPOINT_SECONDS = 1
GRACE_SECONDS = 3
LANES = (0, 1, 2, 3)
BOARD_COUNT = 1755
SPOT = 'BTN_open_SB_3bet_BB_call_BTN_fold'
CLI = 'apps/frontend/scripts/postflop-ai/evaluate-model11-allboard-lanes.mjs'
HASH = re.compile(r'[a-f0-9]{64}\Z')
BOARD = re.compile(r'(?:[2-9TJQKA][cdhs]){3}\Z')
ATTEMPT = re.compile(r'attempt-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\Z')


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def integer(value, minimum=0):
    return type(value) is int and minimum <= value <= 9007199254740991


def hash_value(value):
    return isinstance(value, str) and HASH.fullmatch(value) is not None


def absolute(path):
    if not isinstance(path, str) or not path.startswith('/') or str(pathlib.Path(path)) != path or '..' in pathlib.Path(path).parts:
        raise ValueError('An explicit normalized absolute path is required: ' + str(path))
    return pathlib.Path(path)


def safe_path(path, directory=False):
    path = absolute(str(path))
    for item in reversed((path, *path.parents)):
        try:
            mode = item.lstat().st_mode
        except FileNotFoundError:
            continue
        want_directory = item != path or directory
        if stat.S_ISLNK(mode) or not (stat.S_ISDIR(mode) if want_directory else stat.S_ISREG(mode)):
            raise ValueError('Refuse symlink/nonregular path: ' + str(item))
    return path


def read_bytes(path, maximum=512 * MIB, retain=False):
    path = safe_path(path)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > maximum:
            raise ValueError('Nonregular/oversized pinned file: ' + str(path))
        digest, size, chunks = hashlib.sha256(), 0, []
        while True:
            chunk = os.read(fd, 65536)
            if not chunk:
                break
            size += len(chunk)
            if size > maximum:
                raise ValueError('Pinned file grew beyond bound: ' + str(path))
            digest.update(chunk)
            if retain:
                chunks.append(chunk)
        after = os.fstat(fd)
        fields = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        if size != before.st_size or any(getattr(before, name) != getattr(after, name) for name in fields):
            raise ValueError('Pinned file changed during read: ' + str(path))
        return {'bytes': size, 'sha256': digest.hexdigest()}, b''.join(chunks) if retain else None
    finally:
        os.close(fd)


def record(path, maximum=512 * MIB):
    return read_bytes(path, maximum)[0]


def absolute_record(path, maximum=512 * MIB):
    return {'path': str(absolute(str(path))), **record(path, maximum)}


def object_pairs(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError('Duplicate JSON key: ' + key)
        value[key] = item
    return value


def bounded_json(path, maximum=16 * MIB):
    _, data = read_bytes(path, maximum, retain=True)
    def invalid_constant(value):
        raise ValueError('Nonfinite JSON number: ' + value)
    return json.loads(data, object_pairs_hook=object_pairs, parse_constant=invalid_constant)


def exclusive_json(path, value):
    path = safe_path(path)
    body = (json.dumps(value, indent=2, allow_nan=False) + '\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(body)
        stream.flush()
        os.fsync(stream.fileno())
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def validate_pin(pin):
    if not isinstance(pin, dict) or not integer(pin.get('bytes'), 1) or not hash_value(pin.get('sha256')):
        raise ValueError('Malformed file pin')


def check(path, pin):
    validate_pin(pin)
    actual = record(path, pin['bytes'])
    if actual != {key: pin[key] for key in ('bytes', 'sha256')}:
        raise ValueError('Pin drift: ' + str(path))
    return actual


def relative_file(root, name):
    if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_./-]+', name) or any(part in ('', '.', '..') for part in name.split('/')) or name.startswith('/'):
        raise ValueError('Unsafe repository-relative record: ' + str(name))
    return root / name


def canonical_hash(value):
    # Source captures contain strings, booleans, arrays and exact file-size ints.
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def verify_identity(value, name):
    if not isinstance(value, dict) or not hash_value(value.get('identityHash')) or canonical_hash({key: item for key, item in value.items() if key != 'identityHash'}) != value['identityHash']:
        raise ValueError('Malformed/changed source identity: ' + name)


def source_records(root, source):
    """Verify every declared strict/output/wrapper/integration record set."""
    pins = {}
    def one(row):
        if not isinstance(row, dict) or set(row) != {'path', 'bytes', 'sha256'}:
            raise ValueError('Malformed source record')
        path = relative_file(root, row['path'])
        actual = check(path, row)
        previous = pins.setdefault(str(path), actual)
        if previous != actual:
            raise ValueError('Conflicting source record: ' + str(path))
    def rows(items, name):
        if not isinstance(items, list) or not items or any(not isinstance(item, dict) for item in items):
            raise ValueError('Missing source record set: ' + name)
        paths = [item.get('path') for item in items]
        if any(not isinstance(path, str) for path in paths) or len(set(paths)) != len(paths):
            raise ValueError('Duplicated/malformed source records: ' + name)
        for item in items:
            one(item)
    def graph(value, name):
        if not isinstance(value, dict) or not isinstance(value.get('roots'), list) or not value['roots']:
            raise ValueError('Missing closed source graph: ' + name)
        one(value['inventory'])
        rows(value['sources'], name)
        manifest = bounded_json(relative_file(root, value['inventory']['path']))
        if manifest.get('version') != 1 or manifest.get('roots') != value['roots'] or manifest.get('sources') != value['sources']:
            raise ValueError('Source inventory record set differs: ' + name)
        for entry in value['roots']:
            relative_file(root, entry)
            if entry not in {row['path'] for row in value['sources']}:
                raise ValueError('Uncaptured source root: ' + entry)
    verify_identity(source, 'pilot lanes')
    strict, output, wrapper = source['strict'], source['output'], source['wrapper']
    verify_identity(strict, 'strict')
    graph(strict, 'strict')
    rows(strict['inputs'], 'strict.inputs')
    verify_identity(output, 'output')
    if output['strict'] != strict:
        raise ValueError('Output and pilot strict source identities differ')
    graph(output['output'], 'output.output')
    graph(wrapper, 'wrapper')
    integration = source.get('integration')
    if integration is not None:
        one(integration['inventory'])
        rows(integration['core'], 'integration.core')
        rows(integration['copied47'], 'integration.copied47')
        if 'controller' in integration:
            rows(integration['controller'], 'integration.controller')
        manifest = bounded_json(relative_file(root, integration['inventory']['path']))
        if manifest != {key: value for key, value in integration.items() if key != 'inventory'}:
            raise ValueError('Integration source inventory differs')
    if str(root / CLI) not in pins:
        raise ValueError('The fixed lane entry point is absent from the source capture')
    return pins


def validate_spec(spec, window, own_path):
    if not isinstance(spec, dict) or set(spec) != {'kind', 'version', 'repository', 'inputs', 'runRoot', 'node', 'windowSeconds', 'source'} or spec.get('kind') != 'model11-pilot1755-fixed-lanes-spec' or spec.get('version') != 1:
        raise ValueError('Wrong fixed pilot spec kind/version')
    if not integer(window, 1) or spec.get('windowSeconds') != window or not integer(spec.get('windowSeconds'), 1):
        raise ValueError('Explicit reviewed --window-seconds must equal the pinned positive integer spec window; no initial bound is selected automatically')
    if not isinstance(spec['repository'], dict) or set(spec['repository']) != {'root', 'executionCommit'}:
        raise ValueError('Exact repository root/commit fields are required')
    root = absolute(spec['repository']['root'])
    if root != own_path.parents[5] or not re.fullmatch(r'[a-f0-9]{40}', spec['repository']['executionCommit']):
        raise ValueError('Spec must pin this repository and its full execution commit')
    safe_path(root, directory=True)
    run_root = safe_path(absolute(spec['runRoot']), directory=True)
    if root == run_root or root in run_root.parents or run_root in root.parents:
        raise ValueError('Pilot evidence must be outside the preserved source repository')
    if not isinstance(spec['inputs'], dict) or set(spec['inputs']) != {'spot', 'files'} or spec['inputs']['spot'] != SPOT or set(spec['inputs']['files']) != {'flop', 'later', 'plan'}:
        raise ValueError('Only the explicit pilot spot and exact three input files are supported')
    for pin in spec['inputs']['files'].values():
        if not isinstance(pin, dict) or set(pin) != {'path', 'bytes', 'sha256'}:
            raise ValueError('Exact input file records are required')
        relative_file(root, pin['path'])
        validate_pin(pin)
    node = spec['node']
    if not isinstance(node, dict) or set(node) != {'path', 'version', 'binary', 'execArgv'} or set(node['binary']) != {'bytes', 'sha256'}:
        raise ValueError('Exact Node identity fields are required')
    absolute(node['path'])
    validate_pin(node['binary'])
    if node.get('execArgv') != ['--max-old-space-size=512'] or not re.fullmatch(r'v\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?', node.get('version', '')):
        raise ValueError('Exact Node version and 512 MiB heap are required')
    if not isinstance(spec['source'], dict) or set(spec['source']) != {'identityHash'} or not hash_value(spec['source']['identityHash']):
        raise ValueError('Exact prepared source identity hash is required')
    return root


def source_snapshot(spec, spec_path, spec_sha, own_path, own_pin):
    if record(spec_path, 16 * MIB)['sha256'] != spec_sha or record(own_path) != own_pin:
        raise ValueError('Reviewed spec/launcher changed')
    root = absolute(spec['repository']['root'])
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    changes = subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=root, text=True)
    if head != spec['repository']['executionCommit'] or changes:
        raise ValueError('Exact source commit/tracked worktree changed')
    prepared_path = absolute(spec['runRoot']) / 'prepared.json'
    prepared_pin = absolute_record(prepared_path, 16 * MIB)
    prepared = bounded_json(prepared_path)
    check(prepared_path, prepared_pin)
    if prepared.get('kind') != 'model11-pilot1755-prepared' or prepared.get('version') != 1 or prepared.get('specSha256') != spec_sha:
        raise ValueError('This pinned spec has no matching prepared source capture')
    if prepared['source']['identityHash'] != spec['source']['identityHash'] or not hash_value(prepared.get('bindingHash')) or not hash_value(prepared.get('checkpointIdentityHash')):
        raise ValueError('Prepared source/binding/checkpoint identity mismatch')
    boards = prepared.get('boardIds')
    expected_counts = [len(range(lane, BOARD_COUNT, 4)) for lane in LANES]
    if not isinstance(boards, list) or len(boards) != BOARD_COUNT or any(not isinstance(board, str) or not BOARD.fullmatch(board) for board in boards) or len(set(boards)) != BOARD_COUNT or prepared.get('laneCounts') != expected_counts:
        raise ValueError('Prepared exact ordered 1,755-board/four-lane partition is missing')
    pins = source_records(root, prepared['source'])
    files = prepared['files']
    if not isinstance(files, dict) or set(files) != {'flop', 'later', 'plan'}:
        raise ValueError('Prepared three-file pin set is missing')
    for name, pin in spec['inputs']['files'].items():
        path = relative_file(root, pin['path'])
        actual = check(path, pin)
        if files[name] != pin:
            raise ValueError('Prepared/spec input pin mismatch: ' + name)
        pins[str(path)] = actual
    node_pin = check(spec['node']['path'], spec['node']['binary'])
    return {'executionCommit': head, 'prepared': prepared_pin, 'sourceIdentityHash': prepared['source']['identityHash'], 'pins': pins, 'nodeBinary': {'path': spec['node']['path'], **node_pin}}, prepared


def available_memory():
    rows = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
    host = int(rows['MemAvailable'].split()[0]) * 1024
    effective, limits = host, []
    base = pathlib.Path('/sys/fs/cgroup')
    directories = {base}
    for line in pathlib.Path('/proc/self/cgroup').read_text().splitlines():
        if line.startswith('0::'):
            relative = pathlib.PurePosixPath(line[3:].lstrip('/'))
            if '..' not in relative.parts:
                current = base / relative
                while current != base:
                    directories.add(current)
                    current = current.parent
    for directory in sorted(directories):
        try:
            maximum = (directory / 'memory.max').read_text().strip()
            current = int((directory / 'memory.current').read_text().strip())
        except FileNotFoundError:
            continue
        if maximum != 'max':
            bound = max(0, int(maximum) - current)
            effective = min(effective, bound)
            limits.append({'path': str(directory), 'limitBytes': int(maximum), 'currentBytes': current})
    return {'hostAvailableBytes': host, 'effectiveAvailableBytes': effective, 'cgroup': limits}


def process_stat(pid):
    fields = pathlib.Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
    return {'group': int(fields[2]), 'session': int(fields[3]), 'startTicks': fields[19]}


def group_samples(children):
    groups = {child['pid']: {'rssBytes': 0, 'pids': []} for child in children}
    for child in children:
        try:
            leader = process_stat(child['pid'])
        except FileNotFoundError:
            continue
        if leader['group'] != child['pid'] or leader['session'] != child['pid'] or leader['startTicks'] != child['startTicks']:
            raise RuntimeError('Owned leader PID/session/start ticks changed; refuse group attribution')
    for path in pathlib.Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        try:
            info = process_stat(int(path.name))
            group = info['group']
            if group not in groups or info['session'] != group:
                continue
            rss = next((int(line.split()[1]) * 1024 for line in (path / 'status').read_text().splitlines() if line.startswith('VmRSS:')), 0)
            groups[group]['rssBytes'] += rss
            groups[group]['pids'].append(int(path.name))
        except (FileNotFoundError, ProcessLookupError):
            pass
    return groups


def reap(child, blocking=False):
    if child.get('terminal'):
        return
    pid, status, usage = os.wait4(child['pid'], 0 if blocking else os.WNOHANG)
    if not pid:
        return
    child['process'].returncode = os.waitstatus_to_exitcode(status)
    child.update(terminal=True, exitCode=child['process'].returncode, completedAt=utc(),
                 elapsedSeconds=time.monotonic() - child['monotonicStart'],
                 cpuUserSeconds=usage.ru_utime, cpuSystemSeconds=usage.ru_stime,
                 rusageMaxRssKiB=usage.ru_maxrss)


def signal_owned(child, sig):
    # Only Popen(start_new_session=True) grants ownership. Never signal a
    # discovered owner, stale producer lock, unrelated Node or serial owner.
    try:
        info = process_stat(child['pid'])
        if info['group'] != child['pid'] or info['session'] != child['pid'] or info['startTicks'] != child['startTicks']:
            raise RuntimeError('Owned leader PID/session changed; refuse signal')
    except FileNotFoundError:
        pass  # Exited leader can leave descendants in its still-owned session.
    if child['startTicks'] is None:
        raise RuntimeError('Unpinned owned leader; refuse group signal')
    try:
        os.killpg(child['pid'], sig)
        child.setdefault('signals', []).append({'signal': sig.name, 'at': utc()})
    except ProcessLookupError:
        pass


def cleanup(children, errors):
    for child in children:
        try:
            reap(child)
        except BaseException as error:
            errors.append('Owned child reap failed: ' + str(error))
    try:
        groups = group_samples(children)
        active = [child for child in children if groups[child['pid']]['pids']]
        for child in active:
            try:
                signal_owned(child, signal.SIGTERM)
            except BaseException as error:
                errors.append('Owned-group TERM failed: ' + str(error))
        until = time.monotonic() + GRACE_SECONDS
        while active and time.monotonic() < until:
            time.sleep(SAMPLE_SECONDS)
            for child in children:
                reap(child)
            groups = group_samples(children)
            active = [child for child in children if groups[child['pid']]['pids']]
        kill_failed = set()
        for child in active:
            try:
                signal_owned(child, signal.SIGKILL)
            except BaseException as error:
                kill_failed.add(child['pid'])
                errors.append('Owned-group KILL failed: ' + str(error))
        for child in children:
            # A rejected ownership check is never converted into an indefinite
            # blocking wait or a different signal route.
            reap(child, blocking=child['pid'] not in kill_failed)
        # Descendant exit/reparenting may lag the leader's wait4 by one sample.
        until = time.monotonic() + GRACE_SECONDS
        while True:
            groups = group_samples(children)
            if not any(row['pids'] for row in groups.values()) or time.monotonic() >= until:
                break
            time.sleep(SAMPLE_SECONDS)
        for child in children:
            child['ownedGroupGone'] = not groups[child['pid']]['pids']
    except BaseException as error:
        errors.append('Owned-group cleanup failed: ' + str(error))
    finally:
        for child in children:
            for key in ('stdoutHandle', 'stderrHandle'):
                child[key].close()



def check_committed_rows(child, spec, prepared):
    """Read only contiguous owned markers, once each; never inspect proof files."""
    lane = child['index']
    if lane not in LANES:
        raise ValueError('Unknown fixed checkpoint lane')
    directory = safe_path(absolute(spec['runRoot']) / f'lane-{lane}' / 'checkpoints' / prepared['checkpointIdentityHash'], directory=True)
    if not child.get('checkpointIdentityChecked'):
        identity_path = safe_path(directory / 'identity.json')
        if not identity_path.exists():
            return
        identity = bounded_json(identity_path, 512 * 1024)
        plan = identity.get('plan', {})
        if identity.get('source') != prepared['source'] or identity.get('files') != prepared['files'] or identity.get('spot') != spec['inputs']['spot'] or plan.get('kind') != 'all-boards' or plan.get('scope') != 'full' or plan.get('street') != 'all' or [board.get('id') for board in plan.get('boardList', [])] != prepared['boardIds']:
            raise ValueError('Live checkpoint marker identity differs from the exact prepared source/full catalog')
        child['checkpointIdentityChecked'] = True
    index = child.setdefault('nextCheckpointIndex', lane)
    while index < BOARD_COUNT:
        board = prepared['boardIds'][index]
        path = safe_path(directory / (board + '.json'))
        if not path.exists():
            return
        pin = absolute_record(path, 512 * 1024)
        envelope = bounded_json(path, 512 * 1024)
        check(path, pin)
        row = envelope.get('row', {})
        if set(envelope) != {'key', 'row', 'sha256'} or envelope['key'] != prepared['checkpointIdentityHash'] or not hash_value(envelope['sha256']) or row.get('board') != board or row.get('bindingHash') != prepared['bindingHash'] or type(row.get('complete')) is not bool:
            raise ValueError('Live committed checkpoint has foreign/malformed lane/board/binding/completion')
        if row['complete'] is False:
            child['incompleteCheckpoint'] = {**pin, 'index': index, 'board': board, 'bindingHash': prepared['bindingHash'], 'complete': False}
            raise ValueError(f'Lane {lane} committed incomplete board {board}; preserve evidence and stop owned producers')
        # Quality findings on a complete row do not stop this operational monitor.
        index += 4
        child['nextCheckpointIndex'] = index


def worker_completion(child, spec, spec_sha, prepared):
    lane = child['index']
    root = absolute(spec['runRoot']) / f'lane-{lane}'
    safe_path(root, directory=True)
    matches = []
    for directory in sorted(root.iterdir()):
        if not ATTEMPT.fullmatch(directory.name):
            continue
        safe_path(directory, directory=True)
        started_path = directory / 'started.json'
        if not started_path.exists():
            continue
        provenance = bounded_json(started_path)
        if provenance.get('pid') == child['pid'] and provenance.get('processStartTicks') == child['startTicks']:
            matches.append((directory, provenance, absolute_record(started_path)))
    if len(matches) != 1:
        raise ValueError('Expected one matching immutable attempt by owned PID/start ticks, found ' + str(len(matches)))
    attempt, provenance, started_pin = matches[0]
    indices = list(range(lane, BOARD_COUNT, 4))
    expected = {'specSha256': spec_sha, 'executionCommit': spec['repository']['executionCommit'],
                'sourceIdentityHash': prepared['source']['identityHash'],
                'bindingHash': prepared['bindingHash'], 'lane': lane, 'laneRoot': str(root),
                'indices': indices, 'pid': child['pid'], 'processStartTicks': child['startTicks'],
                'checkpointRoot': str(root / 'checkpoints'), 'checkpointIdentityHash': prepared['checkpointIdentityHash'],
                'attemptRoot': str(attempt)}
    if any(provenance.get(key) != value for key, value in expected.items()):
        raise ValueError('Wrong lane/source/spec/checkpoint/process provenance')
    path = attempt / 'completed.json'
    completion_pin = absolute_record(path, 16 * MIB)
    complete = bounded_json(path)
    if complete.get('kind') != 'model11-pilot1755-lane-completion' or complete.get('version') != 1 or complete.get('provenance') != provenance:
        raise ValueError('Missing/malformed fixed lane completion')
    completions = complete.get('completions')
    if not isinstance(completions, list) or len(completions) != len(indices):
        raise ValueError('Incomplete ordered lane board receipts')
    checkpoint_dir = root / 'checkpoints' / prepared['checkpointIdentityHash']
    identity_pin = absolute_record(checkpoint_dir / 'identity.json', 512 * 1024)
    seen_proofs = {}
    for index, item in zip(indices, completions):
        board = prepared['boardIds'][index]
        if not isinstance(item, dict) or set(item) != {'index', 'board', 'checkpoint', 'proofs'} or item['index'] != index or item['board'] != board:
            raise ValueError('Reordered/foreign lane board completion')
        pin = item['checkpoint']
        if set(pin) != {'path', 'bytes', 'sha256'} or pin.get('path') != board + '.json' or not integer(pin.get('bytes'), 1) or pin['bytes'] > 512 * 1024:
            raise ValueError('Invalid checkpoint path/record')
        check(checkpoint_dir / pin['path'], pin)
        proofs = item['proofs']
        if not isinstance(proofs, list) or any(not isinstance(proof, dict) for proof in proofs):
            raise ValueError('Missing proof reference array')
        names = [proof.get('path') for proof in proofs]
        if any(not isinstance(name, str) or not re.fullmatch(r'[a-f0-9]{64}\.proof\.json', name) for name in names) or len(set(names)) != len(names):
            raise ValueError('Duplicate/unsafe proof references')
        for proof in proofs:
            if set(proof) != {'path', 'bytes', 'sha256'} or not integer(proof.get('bytes'), 1) or proof['bytes'] > 16 * MIB:
                raise ValueError('Malformed/oversized proof pin')
            if proof['path'] in seen_proofs and proof != seen_proofs[proof['path']]:
                raise ValueError('Conflicting shared proof pin')
            check(checkpoint_dir / proof['path'], proof)
            seen_proofs[proof['path']] = proof
    newly, reused = complete.get('newlyComputedBoards'), complete.get('reusedBoards')
    if not integer(newly) or not integer(reused) or newly + reused != len(indices):
        raise ValueError('Incomplete newly-computed/reused board accounting')
    check(path, completion_pin)
    check(started_pin['path'], started_pin)
    child['completion'] = completion_pin
    child['completionAudit'] = {'attemptStarted': started_pin, 'checkpointIdentity': identity_pin,
                                'indices': indices, 'bindingHash': prepared['bindingHash'],
                                'newlyComputedBoards': newly, 'reusedBoards': reused, 'notFinalizedOrAccepted': True}


def public_children(children):
    hidden = {'process', 'stdoutHandle', 'stderrHandle', 'monotonicStart'}
    return [{key: value for key, value in child.items() if key not in hidden} for child in children]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--spec', required=True)
    parser.add_argument('--spec-sha256', required=True)
    parser.add_argument('--launcher-sha256', required=True)
    parser.add_argument('--window-seconds', required=True, type=int, help='Explicit reviewed bound; must match pinned spec.windowSeconds')
    parser.add_argument('--run-reviewed', action='store_true', help='Execute exactly four lanes after every pinned preflight passes')
    args = parser.parse_args()
    if not hasattr(os, 'wait4') or not pathlib.Path('/proc/self/stat').is_file():
        raise ValueError('Linux /proc and wait4 are required; no unguarded fallback')
    own_path = absolute(os.path.abspath(__file__))
    own_pin, own_bytes = read_bytes(own_path, 4 * MIB, retain=True)
    if not hash_value(args.launcher_sha256) or args.launcher_sha256 != own_pin['sha256'] or not hash_value(args.spec_sha256):
        raise ValueError('Exact reviewed launcher/spec SHA256 is required')
    spec_path = absolute(args.spec)
    if record(spec_path, 16 * MIB)['sha256'] != args.spec_sha256:
        raise ValueError('Unreviewed spec bytes')
    spec = bounded_json(spec_path)
    repo = validate_spec(spec, args.window_seconds, own_path)
    source_start, prepared = source_snapshot(spec, spec_path, args.spec_sha256, own_path, own_pin)
    run_root = absolute(spec['runRoot'])
    for lane in LANES:
        lock = run_root / f'lane-{lane}' / 'producer.lock'
        safe_path(lock)
        if lock.exists():
            raise ValueError('Producer lock exists; preserve it pending proven-terminal recovery: ' + str(lock))
    memory = available_memory()
    if memory['effectiveAvailableBytes'] < AVAILABLE_FLOOR:
        raise ValueError('Less than 2 GiB host/effective available memory')
    commands = [[spec['node']['path'], '--max-old-space-size=512', str(repo / CLI), '--operation', 'lane', '--lane', str(lane),
                 '--spec', str(spec_path), '--spec-sha256', args.spec_sha256, '--execute-full', '--spot', SPOT] for lane in LANES]
    limits = {'wallSecondsPerChild': args.window_seconds, 'heapMiB': 512, 'individualRssBytes': INDIVIDUAL_RSS,
              'aggregateOwnedRssBytes': AGGREGATE_RSS, 'availableFloorBytes': AVAILABLE_FLOOR, 'sampleSeconds': SAMPLE_SECONDS}
    if not args.run_reviewed:
        print(json.dumps({'status': 'read-only-preflight-no-node-launch', 'commands': commands, 'limits': limits, 'memory': memory,
                          'launcher': {'path': str(own_path), **own_pin}, 'spec': absolute_record(spec_path), 'sourceStart': source_start,
                          'note': 'No initial execution window is implicitly approved; --run-reviewed requires the supplied reviewed window.'}))
        return
    out = run_root / ('supervision-' + str(uuid.uuid4()))
    safe_path(out, directory=True)
    out.mkdir(exist_ok=False)
    with open(out / 'supervisor.source.py', 'xb') as stream:
        stream.write(own_bytes)
        stream.flush()
        os.fsync(stream.fileno())
    started = {'kind': 'model11-pilot1755-fixed-four-lane-supervisor', 'version': 1, 'startedAt': utc(),
               'launcher': {'path': str(own_path), **own_pin}, 'launcherCommand': sys.argv,
               'spec': absolute_record(spec_path), 'specSha256': args.spec_sha256, 'executionCommit': spec['repository']['executionCommit'],
               'bindingHash': prepared['bindingHash'], 'checkpointIdentityHash': prepared['checkpointIdentityHash'],
               'commands': commands, 'sourceStart': prepared['source'], 'pinsStart': source_start,
               'prepared': source_start['prepared'], 'memoryStart': memory, 'limits': limits,
               'scope': 'Fixed lanes 0–3 only. No prepare, finalizer, consumer or fifth Node. Only owned sessions may be signaled; stale locks are preserved.'}
    exclusive_json(out / 'started.json', started)
    children, errors, signals = [], [], []
    environment = os.environ.copy()
    for key in ('NODE_OPTIONS', 'NODE_PATH'):
        environment.pop(key, None)
    peak_total, min_available, sample_count, source_end = 0, memory['effectiveAvailableBytes'], 0, None
    last_checkpoint_check = 0
    def stop_signal(signum, _frame):
        signals.append(signum)
    old_handlers = {sig: signal.signal(sig, stop_signal) for sig in (signal.SIGTERM, signal.SIGINT)}
    try:
        for lane, command in zip(LANES, commands):
            if signals:
                raise InterruptedError('Supervisor stopped before next owned lane launch')
            if available_memory()['effectiveAvailableBytes'] < AVAILABLE_FLOOR:
                raise RuntimeError('Effective available memory below 2 GiB before next launch')
            stdout = open(out / f'lane-{lane}.stdout.log', 'xb')
            try:
                stderr = open(out / f'lane-{lane}.stderr.log', 'xb')
            except BaseException:
                stdout.close()
                raise
            before = time.monotonic()
            try:
                process = subprocess.Popen(command, cwd=repo, stdout=stdout, stderr=stderr, start_new_session=True, env=environment)
            except BaseException:
                stdout.close()
                stderr.close()
                raise
            child = {'index': lane, 'pid': process.pid, 'process': process, 'command': command, 'startedAt': utc(), 'monotonicStart': before,
                     'stdoutHandle': stdout, 'stderrHandle': stderr, 'sampledPeakRssBytes': 0, 'startTicks': None}
            children.append(child)
            info = process_stat(process.pid)
            child['startTicks'] = info['startTicks']
            if info['group'] != process.pid or info['session'] != process.pid:
                raise RuntimeError('Worker was not created in its own session/process group')
            exclusive_json(out / f'lane-{lane}.started.json', {'pid': process.pid, 'ownedGroup': process.pid, 'startTicks': child['startTicks'], 'command': command})
        while True:
            now = time.monotonic()
            groups = group_samples(children)
            total = sum(row['rssBytes'] for row in groups.values())
            peak_total = max(peak_total, total)
            available = available_memory()
            min_available = min(min_available, available['effectiveAvailableBytes'])
            sample_count += 1
            for child in children:
                child['sampledPeakRssBytes'] = max(child['sampledPeakRssBytes'], groups[child['pid']]['rssBytes'])
                if groups[child['pid']]['rssBytes'] > INDIVIDUAL_RSS:
                    errors.append(f"lane {child['index']} exceeded 900 MiB owned-group RSS")
                reap(child)
                if not child.get('terminal') and now - child['monotonicStart'] >= args.window_seconds:
                    errors.append(f"lane {child['index']} exceeded the explicit {args.window_seconds}s window")
                if child.get('terminal') and child['exitCode'] != 0:
                    errors.append(f"lane {child['index']} exited {child['exitCode']}")
            if now - last_checkpoint_check >= CHECKPOINT_SECONDS or all(child.get('terminal') for child in children):
                for child in children:
                    check_committed_rows(child, spec, prepared)
                last_checkpoint_check = now
            if total > AGGREGATE_RSS:
                errors.append('Aggregate owned-lane RSS exceeded 3072 MiB')
            if available['effectiveAvailableBytes'] < AVAILABLE_FLOOR:
                errors.append('Host/effective available memory below 2 GiB')
            if signals:
                errors.append('Supervisor interrupted: ' + str(signals))
            if errors or all(child.get('terminal') for child in children):
                break
            time.sleep(SAMPLE_SECONDS)
    except BaseException as error:
        errors.append(type(error).__name__ + ': ' + str(error))
    finally:
        cleanup(children, errors)
        terminal = {'kind': 'model11-pilot1755-process-terminal-before-postflight', 'version': 1, 'completedAt': utc(),
                    'children': public_children(children), 'executionErrors': list(errors), 'allFourCreated': len(children) == 4,
                    'allCreatedChildrenReaped': all(child.get('terminal', False) for child in children),
                    'allOwnedGroupsGone': all(child.get('ownedGroupGone', False) for child in children),
                    'sampleCount': sample_count, 'sampledAggregatePeakRssBytes': peak_total, 'minimumAvailableBytes': min_available,
                    'specSha256': args.spec_sha256, 'supervisor': started['launcher']}
        # This immutable, fsynced terminal record precedes every postflight hash,
        # attempt/completion lookup, proof read, and receipt construction.
        exclusive_json(out / 'terminal.json', terminal)
        print(json.dumps({'terminal': str(out / 'terminal.json'), 'executionErrors': errors}), flush=True)
    terminal_pin = absolute_record(out / 'terminal.json')
    try:
        source_end, prepared_end = source_snapshot(spec, spec_path, args.spec_sha256, own_path, own_pin)
        if source_end != source_start or prepared_end != prepared:
            errors.append('Source/prepared/launcher/spec changed during run')
    except BaseException as error:
        errors.append('Postflight pins failed; terminal preserved: ' + str(error))
    for child in children:
        if child.get('exitCode') == 0 and child.get('ownedGroupGone'):
            try:
                worker_completion(child, spec, args.spec_sha256, prepared)
            except BaseException as error:
                errors.append(f"lane {child['index']} completion check failed: {error}")
        if not child.get('terminal') or not child.get('ownedGroupGone'):
            errors.append('Owned lane not fully reaped/gone: ' + str(child['pid']))
    if len(children) != 4:
        errors.append('Not all four fixed lanes started')
    newly = sum(child.get('completionAudit', {}).get('newlyComputedBoards', 0) for child in children)
    reused = sum(child.get('completionAudit', {}).get('reusedBoards', 0) for child in children)
    if newly + reused != BOARD_COUNT:
        errors.append('Full 1,755-board lane partition is incomplete')
    if signals and not any(error.startswith('Supervisor interrupted:') for error in errors):
        errors.append('Supervisor interrupted: ' + str(signals))
    check(terminal_pin['path'], terminal_pin)
    report = {**started, 'kind': 'model11-pilot1755-supervision-receipt', 'completedAt': utc(),
              'sourceEnd': prepared_end['source'] if source_end is not None else None, 'pinsEnd': source_end,
              'terminal': terminal_pin, 'children': public_children(children), 'errors': errors,
              'sampleCount': sample_count, 'sampledAggregatePeakRssBytes': peak_total, 'minimumAvailableBytes': min_available,
              'status': 'all-lanes-produced-not-finalized' if not errors else 'blocked-or-incomplete-not-finalized',
              'newlyComputedBoards': newly, 'reusedBoards': reused, 'numericalAcceptance': False,
              'rssMeasurementCaveat': '50 ms samples can miss shorter peaks; wait4 child lifetime maxRSS is separately reported. Heap is not an RSS cap. No visibility into unrelated owners is claimed.'}
    exclusive_json(out / 'receipt.json', report)
    print(json.dumps({'status': report['status'], 'receipt': str(out / 'receipt.json'), 'errors': errors}), flush=True)
    for sig, previous in old_handlers.items():
        signal.signal(sig, previous)
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
