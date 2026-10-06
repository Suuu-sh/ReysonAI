#!/usr/bin/env python3
"""One sequential, read-only preservation emitter with exclusive before/after receipts."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import re
import resource
import signal
import shutil
import subprocess
import time
from model11_preservation_receipt import (BASELINE, CANONICAL, REPOSITORY_BASE, REVIEWED_ARCHIVE_SOURCE,
    capture, expected_ids, file_record, validate_stream, safe_root, contained_path, exclusive_file, create_run_directory)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def git_identity(repository):
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=repository)
    revision = git('rev-parse', 'HEAD').decode().strip()
    return {'revision': revision, 'archived_baseline_source': BASELINE, 'canonical_baseline': CANONICAL,
            'repository_baseline': REPOSITORY_BASE, 'archived_experiment_source': REVIEWED_ARCHIVE_SOURCE,
            'provenance_scope': 'Git diff against genuine recovered471 repository; historical028/8d6 source identity is bound separately by byte manifests, not Git ancestry',
            'revision_diff_sha256': hashlib.sha256(git('diff', '--binary', REPOSITORY_BASE, revision)).hexdigest(),
            'tracked_working_diff_sha256': hashlib.sha256(git('diff', '--binary', 'HEAD')).hexdigest()}


def save_new(path, data):
    with exclusive_file(path.parent, path) as stream:
        stream.write(json.dumps(data, indent=2) + '\n')


def stop(process):
    if process.poll() is not None:
        return process.returncode
    os.killpg(process.pid, signal.SIGTERM)
    try:
        return process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        return process.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['legacy45', 'all407'], required=True)
    parser.add_argument('--side', choices=['baseline', 'current'], required=True)
    parser.add_argument('--group', type=int)
    parser.add_argument('--seconds', type=int, required=True)
    parser.add_argument('--heap', type=int, required=True)
    parser.add_argument('--name', required=True)
    parser.add_argument('--check-only', action='store_true', help='Static pins/materialization verification only; never starts Node')
    args = parser.parse_args()
    if not 1 <= args.seconds <= 180 or not 128 <= args.heap <= 512:
        parser.error('Maximum 180 seconds / 512 MiB V8 heap; no automatic retry or increase')
    if args.mode == 'legacy45' and args.group not in range(1, 10) or args.mode == 'all407' and args.group is not None:
        parser.error('legacy45 requires group 1..9; all407 cannot take a group')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,80}', args.name):
        parser.error('A safe unique run name is required')
    frontend = pathlib.Path(__file__).resolve().parents[3]
    repository = frontend.parents[1]
    before = capture(frontend, args.side)
    git_before = git_identity(repository)
    ids = expected_ids(frontend, args.mode, args.group)
    if args.check_only:
        print(json.dumps({'status': 'static-only-verified-not-executed', 'side': args.side,
                          'mode': args.mode, 'group': args.group, 'ids': ids,
                          'git_preflight': git_before, 'materialized_files': len(before['materialization']['files']), 'original_fixtures': len(before['original154'])}))
        return 0
    directory = safe_root(frontend / '.local/hu-model11/preservation-restored-v2')
    # Shared between baseline/current and all preservation modes. The outer project compute lane
    # still requires explicit coordination; this lock cannot coordinate other workload families.
    lock_path = contained_path(directory, directory / '.runner.lock')
    lock_fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock_fd, 'a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.error('Another preservation process holds the sequential lane')
        output = create_run_directory(directory, args.name)  # Refuse traversal/symlinks/existing names before writes.
        root = repository / before['materialization']['root']
        design_name = 'legacy45-explicit-case-design.json' if args.mode == 'legacy45' else 'all407-explicit-catalog-design.json'
        design = frontend / '.local/hu-model11/preservation-design' / design_name
        node = pathlib.Path(shutil.which('node') or '/missing-node').resolve()
        node_identity = {'path': str(node), **file_record(node)}
        command = [str(node), f'--max-old-space-size={args.heap}',
                   str(frontend / 'scripts/postflop-ai/perf/emit-model11-preservation.mjs'),
                   str(root), args.mode, str(args.group or 0), str(design)]
        record = {'kind': 'bounded-hu-preservation-v3-not-adoption', 'side': args.side, 'mode': args.mode,
                  'group': args.group, 'ids': ids, 'command': command, 'node_before': node_identity, 'timeout_seconds': args.seconds,
                  'heap_mib': args.heap, 'started_at': now(), 'source_before': before,
                  'git_before': git_before,
                  'resource_scope': 'V8 heap cap only; no RSS cap. RUSAGE_CHILDREN is maximum child RSS, not simultaneous tree RSS. Timings and failures are diagnostic, not workload feasibility proof.'}
        save_new(output / 'before.json', {**record, 'status': 'started-not-complete'})
        start = time.monotonic()
        timed_out, interrupted, launch_error, code = False, False, None, None
        stdout_path, stderr_path = output / 'output.jsonl', output / 'stderr.txt'
        env = dict(os.environ)
        for key in ['NODE_OPTIONS', 'NODE_PATH']:
            env.pop(key, None)
        stop_requested = []
        def request_stop(signum, frame):
            stop_requested.append(signum)  # Do not raise inside Popen: first acquire/reap the child.
        old_handlers = {sig: signal.signal(sig, request_stop) for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]}
        with exclusive_file(output, stdout_path, binary=True) as stdout, exclusive_file(output, stderr_path, binary=True) as stderr:
            process = None
            try:
                if stop_requested:
                    raise KeyboardInterrupt  # Receipt-only cancellation before numerical launch.
                process = subprocess.Popen(command, cwd=root / 'apps/frontend', stdin=subprocess.DEVNULL,
                                           stdout=stdout, stderr=stderr, env=env, start_new_session=True)
                deadline = start + args.seconds
                while True:
                    if stop_requested:
                        interrupted = True; code = stop(process); break
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        timed_out = True; code = stop(process); break
                    try:
                        code = process.wait(timeout=min(0.25, remaining)); break
                    except subprocess.TimeoutExpired:
                        continue
            except subprocess.TimeoutExpired:
                timed_out = True; code = stop(process)
            except KeyboardInterrupt:
                interrupted = True
                if process is not None:
                    code = stop(process)
            except Exception as error:
                launch_error = repr(error)
                if process is not None:
                    code = stop(process)
        after, after_error = None, None
        try:
            after = capture(frontend, args.side)
        except Exception as error:
            after_error = repr(error)
        git_after, git_after_error, node_after, node_after_error = None, None, None, None
        try:
            git_after = git_identity(repository)
        except Exception as error:
            git_after_error = repr(error)
        try:
            node_after = {'path': str(node), **file_record(node)}
        except Exception as error:
            node_after_error = repr(error)
        unchanged = before == after and record['git_before'] == git_after and node_identity == node_after
        validation, validation_error = None, None
        try:
            validation = validate_stream(stdout_path, args.mode, args.group, ids, frontend=frontend)
        except Exception as error:
            validation_error = repr(error)
        interrupted = interrupted or bool(stop_requested)
        resource_failure = timed_out or interrupted or code is not None and code < 0
        with stderr_path.open('rb') as stream:
            # Bounded tail sufficient for an explicit OOM indicator; nonzero exit already fails.
            stream.seek(max(0, stderr_path.stat().st_size - 65536))
            oom = b'heap out of memory' in stream.read().lower()
        status = ('partial-resource-failure' if resource_failure or oom else 'source-changed-failure' if not unchanged
                  else 'emitted-not-compared' if code == 0 and not validation_error and not launch_error else 'failed')
        record.update({'status': status, 'exit_code': code, 'timed_out': timed_out, 'interrupted': interrupted,
                       'launch_error': launch_error, 'termination_signals': stop_requested, 'elapsed_seconds': time.monotonic() - start,
                       'finished_at': now(), 'max_child_rss_kib': resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
                       'source_after': after, 'source_after_error': after_error, 'source_unchanged': unchanged,
                       'git_after': git_after, 'git_after_error': git_after_error,
                       'node_after': node_after, 'node_after_error': node_after_error,
                       'validation': validation, 'validation_error': validation_error,
                       'files': {name: file_record(output / name) for name in ['before.json', 'output.jsonl', 'stderr.txt']}})
        receipt = output / 'receipt.json'; save_new(receipt, record)
        with exclusive_file(output, output / 'receipt.sha256') as stream:
            stream.write(file_record(receipt)['sha256'] + '\n')
        print(json.dumps({'status': status, 'receipt': str(receipt), **file_record(receipt),
                          'elapsed_seconds': record['elapsed_seconds'], 'max_child_rss_kib': record['max_child_rss_kib'],
                          'validation_error': validation_error, 'source_after_error': after_error}))
        for sig, handler in old_handlers.items():
            signal.signal(sig, handler)
        return 0 if status == 'emitted-not-compared' else 124 if timed_out else 1


if __name__ == '__main__':
    raise SystemExit(main())
