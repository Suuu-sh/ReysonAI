#!/usr/bin/env python3
"""Mandatory 36-contract gate for the current closed-runtime experiment and pinned fixture."""
import argparse
import json
import os
from pathlib import Path
import platform
import re
import resource
import shutil
import subprocess
import sys
import time
import zlib

from low_flop_fixture import DEFAULT_MANIFEST, REPO, file_record, fresh_root, no_symlinks, read_json, require, safe_name, verify_root, write_json
from low_flop_gate import check_tap, run_gate

RUNTIME_FILES = ['apps/frontend/scripts/postflop-ai/experimental-flop-veto-runtime.mjs',
                 'apps/frontend/scripts/postflop-ai/experimental-flop-veto-pins.json',
                 'apps/frontend/tests/postflop-experimental-flop-veto-runtime.test.mjs']
RUNTIME_TEST = 'tests/postflop-experimental-flop-veto-runtime.test.mjs'


def stage_runtime(candidate):
    pins = read_json(REPO / RUNTIME_FILES[1])
    files = [*RUNTIME_FILES, *[item['path'] for item in pins['reviews']]]
    require(len(files) == len(set(files)), 'Duplicate runtime staging source')
    records = []
    for relative in files:
        safe_name(relative)
        source = no_symlinks(REPO / relative)
        before = file_record(source, relative)
        target = candidate / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        no_symlinks(target)
        with source.open('rb') as origin, target.open('xb') as destination:
            shutil.copyfileobj(origin, destination, 65536)
        require(file_record(target, relative) == before and file_record(source, relative) == before, 'Runtime staging byte drift')
        records.append(before)
    for review in pins['reviews']:
        require(file_record(candidate / review['path'])['sha256'] == review['sha256'], 'Research review identity mismatch')
    return records


def run_runtime_gate(root, output, manifest=DEFAULT_MANIFEST):
    root = no_symlinks(root)
    verify_root(root, manifest)
    prospective = no_symlinks(output)
    require(not prospective.is_relative_to(root) and not root.is_relative_to(prospective), 'Output must be outside immutable fixture')
    output = fresh_root(prospective)
    summary = {'schema_version': 3, 'status': 'running', 'production_eligible': False, 'approval': 'none',
               'required_contracts': 36, 'required_runtime_contracts': 9,
               'environment': {'python': platform.python_version(), 'python_implementation': platform.python_implementation(),
                               'zlib_compile': zlib.ZLIB_VERSION, 'zlib_runtime': zlib.ZLIB_RUNTIME_VERSION},
               'fixture_manifest_sha256': file_record(manifest)['sha256']}

    def save():
        temporary = output / 'summary.next.json'
        write_json(temporary, summary)
        temporary.replace(output / 'summary.json')

    save()
    try:
        # Historical 27-contract acceptance stays intact. Its own private staging is
        # extended only after that mandatory gate has completed without skips.
        core = run_gate(root, output / 'core', manifest)
        require(core['contracts_passed'] == 27 and core['skipped'] == 0 and core['replays_passed'] == 7, 'Incomplete core gate')
        candidate = output / 'core/candidate'
        records = stage_runtime(candidate)
        write_json(output / 'runtime-sources.json', records)
        command = ['node', '--max-old-space-size=384', '--test-reporter=tap', RUNTIME_TEST]
        environment = {**os.environ, 'REQUIRE_LOW_FLOP_RESEARCH': '1', 'LOW_FLOP_RESEARCH_ROOT': str(root),
                       'NODE_OPTIONS': '', 'TMPDIR': str(output / 'core/tmp'), 'TMP': str(output / 'core/tmp'), 'TEMP': str(output / 'core/tmp')}
        start = time.monotonic()
        with (output / 'runtime.stdout').open('x') as stdout, (output / 'runtime.stderr').open('x') as stderr:
            try:
                result = subprocess.run(command, cwd=candidate / 'apps/frontend', env=environment,
                                        stdout=stdout, stderr=stderr, timeout=90)
                code = result.returncode
            except subprocess.TimeoutExpired:
                code = 124
            except OSError as error:
                stderr.write(str(error) + '\n')
                code = 127
        summary['runtime_process'] = {'command': command, 'exit_code': code, 'elapsed_s': time.monotonic() - start,
                                      'cumulative_child_max_rss_kib': resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss}
        save()
        require(code == 0, 'Runtime contracts failed; exclusive logs retained')
        stdout_text = (output / 'runtime.stdout').read_text()
        check_tap(stdout_text, 9)
        environments = re.findall(r'^\s*# runtime-environment (.+)$', stdout_text, re.MULTILINE)
        require(len(environments) == 1, 'Missing or duplicate runtime environment diagnostic')
        summary['environment']['node_process'] = json.loads(environments[0])
        require(isinstance(summary['environment']['node_process'].get('node'), str), 'Missing Node version')
        for record in [*read_json(output / 'core/candidate-inputs.json'), *records]:
            require(file_record(candidate / record['path'], record['path']) == record, 'Staged code/policy bytes changed')
        for record in records:
            require(file_record(REPO / record['path'], record['path']) == record, 'Checkout runtime source changed during gate')
        verify_root(root, manifest)
        summary.update(status='closed-runtime-research-gate-passed-not-approved', contracts_passed=36,
                       runtime_contracts_passed=9, skipped=0, core_summary_sha256=file_record(output / 'core/summary.json')['sha256'],
                       runtime_sources_sha256=file_record(output / 'runtime-sources.json')['sha256'],
                       runtime_stdout_sha256=file_record(output / 'runtime.stdout')['sha256'])
    except BaseException as error:
        summary.update(status='failed', error=str(error))
        save()
        raise
    save()
    print(json.dumps({'status': summary['status'], 'output': str(output), 'production_eligible': False}))
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()
    try:
        run_runtime_gate(args.root, args.output, args.manifest)
    except (ValueError, OSError, KeyError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
