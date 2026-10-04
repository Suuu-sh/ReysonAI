#!/usr/bin/env python3
"""Mandatory, sequential research gate. Never generates 8192-sample reports or approvals."""
import argparse
import json
import os
from pathlib import Path
import re
import resource
import shutil
import subprocess
import sys
import time

from low_flop_fixture import (DEFAULT_MANIFEST, REPO, TESTS, file_record, fresh_root,
                              no_symlinks, read_json, require, verify_root, write_json)

PARITY_KEYS = ['reach', 'initial', 'rollout', 'source_fingerprint', 'flop_policy_hash', 'later_policy_hash']
PARITY_SEED = 'low-flop-contract-parity-v1'


def check_tap(text, count):
    """A zero exit code alone cannot pass a skipped or empty contract suite."""
    for key, expected in [('tests', count), ('pass', count), ('fail', 0), ('cancelled', 0), ('skipped', 0), ('todo', 0)]:
        matches = re.findall(r'^# ' + key + r' (\d+)\s*$', text, re.MULTILINE)
        require(matches == [str(expected)], f'TAP {key}: expected {expected}, found {matches}')
    require(not re.search(r'^(?:not )?ok\b.*#\s*(?:SKIP|TODO)\b', text, re.MULTILINE | re.IGNORECASE), 'Skipped/todo contract')


def check_replay(result, case):
    require(result['status'] == 'unapproved-counterfactual', 'Replay is not unapproved research')
    require(result['candidate_default']['applied'] is False and result['candidate_default']['mix'] == result['legacyMix'],
            'Default candidate changed legacy mix')
    preview = result['preview']
    require(preview['applied'] is (case <= 4) and preview['production_eligible'] is False, f'Wrong preview scope: case {case}')
    require(preview['mix'] == (result['rawMix'] if case <= 4 else result['legacyMix']), 'Wrong preview mix')
    require(preview['mix']['raise'] == result['legacyMix']['raise'], 'Preview changed raises')


def copy_candidate(root, output, manifest, checkpoint):
    candidate = output / 'candidate'
    candidate.mkdir()
    records = []
    for row in manifest['files']:
        if row['path'].startswith('candidate-source/'):
            relative = row['path'][len('candidate-source/'):]
            source = root / row['path'] if checkpoint else REPO / relative
            before = file_record(source, relative)
            target = candidate / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            require(file_record(target, relative) == before, f'Candidate changed while copying: {relative}')
            records.append(before)
    require(records, 'No candidate source closure')
    for name, _ in TESTS:
        require((candidate / f'apps/frontend/tests/{name}.test.mjs').is_file(), f'Missing required test: {name}')
    # Current tests read this path relative to their module. It is private to this run.
    policy_prefix = 'main-baseline/apps/frontend/.local/postflop-ai/'
    policies = [r for r in manifest['files'] if r['path'].startswith(policy_prefix)]
    require(len(policies) == 90, 'Expected all 90 original policy files')
    for row in policies:
        relative = row['path'][len('main-baseline/'):]
        target = candidate / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / row['path'], target)
        records.append(file_record(target, relative))
    write_json(output / 'candidate-inputs.json', records)
    return candidate, records


def run_gate(root, output, manifest_path=DEFAULT_MANIFEST, checkpoint=False):
    root = no_symlinks(root)
    manifest = verify_root(root, manifest_path)
    prospective = no_symlinks(output)
    require(not prospective.is_relative_to(root) and not root.is_relative_to(prospective), 'Run output must be separate from fixture root')
    output = fresh_root(prospective)
    summary = {'schema_version': 1, 'status': 'running', 'production_eligible': False,
               'fixture_manifest_sha256': file_record(manifest_path)['sha256'],
               'fixture_archive_sha256': manifest['archive']['sha256'],
               'candidate_mode': 'archived-checkpoint' if checkpoint else 'current-checkout-source',
               'processes': [], 'required_contracts': 27, 'required_parity_samples': 128,
               'required_replays': 7, 'remaining': ['independent delivery review', 'all-combo integrated runtime impact audit',
                                                  'candidate-wide statistical budget and trusted approval receipts']}

    def save():
        # Only our new run summary is replaced; evidence logs are exclusive-create.
        temporary = output / 'summary.next.json'
        write_json(temporary, summary)
        temporary.replace(output / 'summary.json')

    def run(name, arguments, cwd):
        command = ['node', '--max-old-space-size=384', *arguments]
        record = {'name': name, 'command': command, 'cwd': str(cwd), 'status': 'running'}
        summary['processes'].append(record)
        save()
        start = time.monotonic()
        with (output / (name + '.stdout')).open('x') as out, (output / (name + '.stderr')).open('x') as err:
            try:
                result = subprocess.run(command, cwd=cwd, env=environment, stdout=out, stderr=err, timeout=90)
                code = result.returncode
            except subprocess.TimeoutExpired:
                code = 124
            except OSError as error:
                err.write(str(error) + '\n')
                code = 127
        record.update(exit_code=code, elapsed_s=time.monotonic() - start,
                      cumulative_child_max_rss_kib=resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
                      status='pass' if code == 0 else 'failed')
        save()
        require(code == 0, f'{name} failed ({code}); logs retained in {output}')
        return (output / (name + '.stdout')).read_text()

    save()
    try:
        candidate, candidate_records = copy_candidate(root, output, manifest, checkpoint)
        temporary = output / 'tmp'
        temporary.mkdir()
        environment = {**os.environ, 'REQUIRE_LOW_FLOP_RESEARCH': '1', 'LOW_FLOP_RESEARCH_ROOT': str(root),
                       'TMPDIR': str(temporary), 'TMP': str(temporary), 'TEMP': str(temporary), 'NODE_OPTIONS': ''}
        frontend = candidate / 'apps/frontend'
        for name, count in TESTS:
            check_tap(run(name, ['--test-reporter=tap', 'tests/' + name + '.test.mjs'], frontend), count)
        reports = []
        for snapshot in ['main-baseline', 'main-contract-v2']:
            report = json.loads(run('parity-' + snapshot,
                ['scripts/postflop-ai/rollout-low-flop-defence.mjs', 'BTN_open_BB_call', '8c8d2h', 'KcQh',
                 'bet75', 'ip', '128', PARITY_SEED, '0.01'], root / snapshot / 'apps/frontend'))
            require(report['samples'] == 128 and report['seed'] == PARITY_SEED and report['status'] == 'complete', 'Incomplete parity')
            original = read_json(root / ('contract-parity-' + snapshot + '.json'))
            for key in PARITY_KEYS:
                require(report[key] == original[key], f'Parity changed from historical result: {snapshot}/{key}')
            reports.append(report)
        for key in PARITY_KEYS:
            require(reports[0][key] == reports[1][key], f'v1/v2 uncapped parity mismatch: {key}')
        summary['parity_matched'] = PARITY_KEYS
        for case in range(1, 8):
            report = json.loads(run(f'veto-replay-case{case}',
                ['scripts/postflop-ai/build-flop-promotion-veto.mjs', str(root / 'main-baseline'),
                 str(root / f'validation-main-case{case}-n8192.json'), str(root / 'validation-plan.json')], frontend))
            check_replay(report, case)
        verify_root(root, manifest_path)
        for row in candidate_records:
            require(file_record(candidate / row['path'], row['path']) == row, 'Candidate or policy bytes changed during gate')
        summary.update(status='research-gate-passed-not-approved', contracts_passed=27, skipped=0,
                       uncapped_parity_passed=True, replays_passed=7)
    except BaseException as error:
        summary.update(status='failed', error=str(error))
        save()
        raise
    save()
    print(json.dumps({'status': summary['status'], 'output': str(output), 'production_eligible': False}))
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True, help='Freshly restored, hash-verified fixture root')
    parser.add_argument('--output', type=Path, required=True, help='Nonexistent isolated output root; parent must exist')
    parser.add_argument('--manifest', type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument('--checkpoint', action='store_true', help='Replay the exact archived candidate instead of current checkout source')
    args = parser.parse_args()
    run_gate(args.root, args.output, args.manifest, args.checkpoint)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
