#!/usr/bin/env python3
"""Independently compare complete structured JSONL, one record at a time; no Node."""
import argparse
import itertools
import json
import pathlib
import re
from model11_preservation_receipt import (capture, checked_path, expected_ids, file_record,
                                         load_json, match_record, records, validate_stream, contained_path, exclusive_file)


def verify_receipt(path, frontend, side):
    runs = frontend / '.local/hu-model11/preservation-restored-v2/runs'
    path = contained_path(runs, path, must_exist=True)
    if path.name != 'receipt.json' or path.parent.parent != runs.resolve() or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,80}', path.parent.name):
        raise ValueError('Receipt must have exclusive runs/name/receipt.json layout')
    expected_hash = checked_path(path.parent, 'receipt.sha256').read_text().strip()
    if file_record(path)['sha256'] != expected_hash:
        raise ValueError('Receipt hash mismatch')
    receipt = load_json(path)
    if receipt['kind'] != 'bounded-hu-preservation-v3-not-adoption' or receipt['side'] != side or receipt['status'] != 'emitted-not-compared':
        raise ValueError('Receipt is not a completed emitter on the required side')
    if not 1 <= receipt['timeout_seconds'] <= 180 or not 128 <= receipt['heap_mib'] <= 512 or receipt['exit_code'] != 0 or receipt['timed_out'] or receipt['interrupted'] or receipt['launch_error']:
        raise ValueError('Resource, execution or bounds failure')
    if receipt['node_before'] != receipt['node_after'] or receipt.get('node_after_error') or receipt.get('git_after_error'):
        raise ValueError('Node/Git identity drift or unavailable after run')
    match_record(pathlib.Path(receipt['node_before']['path']), receipt['node_before'])
    if not receipt['source_unchanged'] or receipt['source_before'] != receipt['source_after'] or receipt['git_before'] != receipt['git_after']:
        raise ValueError('Source/Git drift during emission')
    if receipt['source_after'] != capture(frontend, side):
        raise ValueError('Receipt sources differ from currently reviewed exact pins/harness')
    if set(receipt['files']) != {'before.json', 'output.jsonl', 'stderr.txt'}:
        raise ValueError('All before/artifact/log pins required')
    for relative, record in receipt['files'].items():
        match_record(checked_path(path.parent, relative), record)
    initial = load_json(path.parent / 'before.json')
    for key in ['source_before', 'git_before', 'command', 'side', 'mode', 'group', 'ids', 'timeout_seconds', 'heap_mib', 'node_before']:
        if initial[key] != receipt[key]:
            raise ValueError(f'Before receipt differs: {key}')
    if initial.get('status') != 'started-not-complete' or initial.get('kind') != receipt['kind']:
        raise ValueError('Invalid before receipt status/kind')
    repository = frontend.parents[1]
    root = repository / receipt['source_before']['materialization']['root']
    design_name = 'legacy45-explicit-case-design.json' if receipt['mode'] == 'legacy45' else 'all407-explicit-catalog-design.json'
    expected_command = [receipt['node_before']['path'], f"--max-old-space-size={receipt['heap_mib']}",
                        str(frontend / 'scripts/postflop-ai/perf/emit-model11-preservation.mjs'),
                        str(root), receipt['mode'], str(receipt['group'] or 0),
                        str(frontend / '.local/hu-model11/preservation-design' / design_name)]
    if receipt['command'] != expected_command:
        raise ValueError('Receipt command differs from the bounded pinned emitter')
    ids = expected_ids(frontend, receipt['mode'], receipt['group'])
    if receipt['ids'] != ids:
        raise ValueError('Receipt case set differs')
    validation = validate_stream(path.parent / 'output.jsonl', receipt['mode'], receipt['group'], ids, frontend=frontend)
    if receipt['validation'] != validation or receipt['validation_error'] is not None:
        raise ValueError('Independent structural completion disagrees')
    return receipt


def first_difference(left, right, path='$'):
    if type(left) is not type(right):
        # JSON integer and decimal spellings denote the same JS number; compare exact numeric value.
        if type(left) in [int, float] and type(right) in [int, float] and left == right:
            return None
        return {'path': path, 'reason': 'type', 'baseline': type(left).__name__, 'current': type(right).__name__}
    if isinstance(left, dict):
        if left.keys() != right.keys():
            return {'path': path, 'reason': 'keys', 'baseline': sorted(left), 'current': sorted(right)}
        for key in left:
            found = first_difference(left[key], right[key], f'{path}.{key}')
            if found:
                return found
    elif isinstance(left, list):
        if len(left) != len(right):
            return {'path': path, 'reason': 'length', 'baseline': len(left), 'current': len(right)}
        for index, (a, b) in enumerate(zip(left, right)):
            found = first_difference(a, b, f'{path}[{index}]')
            if found:
                return found
    elif left != right:
        return {'path': path, 'reason': 'value', 'baseline': left, 'current': right}
    return None


def compare_streams(left, right):
    missing = object(); count = 0; gaps = []
    for count, (a, b) in enumerate(itertools.zip_longest(records(left), records(right), fillvalue=missing), 1):
        if a is missing or b is missing:
            return {'equal': False, 'records_compared': count, 'difference': {'line': count, 'reason': 'record-count'}, 'gaps': gaps}
        difference = first_difference(a, b)
        if difference:
            return {'equal': False, 'records_compared': count, 'difference': {'line': count, 'kind': a.get('kind'), 'id': a.get('id'), **difference}, 'gaps': gaps}
        if a.get('kind') == 'case-complete':
            gaps.append({'id': a['id'], 'coverage': a['coverage']})
    return {'equal': True, 'records_compared': count, 'difference': None, 'gaps': gaps}



def verify_pair_identity(baseline, current):
    if any(baseline[key] != current[key] for key in ['mode', 'group', 'ids']):
        raise ValueError('Sides target different declared workloads')
    if baseline['source_before']['materialization']['root'] == current['source_before']['materialization']['root']:
        raise ValueError('Same-source side pair is forbidden')
    if baseline['node_before'] != current['node_before']:
        raise ValueError('Different Node executable across sides')
    if baseline['source_before']['harness'] != current['source_before']['harness']:
        raise ValueError('Different emitter/runner/auditor bytes across sides')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', required=True)
    parser.add_argument('--current', required=True)
    parser.add_argument('--output', required=True, help='New exclusive audit JSON; existing evidence is never replaced')
    args = parser.parse_args()
    frontend = pathlib.Path(__file__).resolve().parents[3]
    directory = frontend / '.local/hu-model11/preservation-restored-v2'
    output = contained_path(directory, args.output)
    with exclusive_file(directory, output) as stream:
        result = {'kind': 'hu-preservation-pair-audit-v3-not-adoption', 'status': 'failed', 'equal': False,
                  'auditor': file_record(pathlib.Path(__file__)), 'common': file_record(pathlib.Path(__file__).with_name('model11_preservation_receipt.py'))}
        try:
            baseline = verify_receipt(args.baseline, frontend, 'baseline')
            current = verify_receipt(args.current, frontend, 'current')
            verify_pair_identity(baseline, current)
            result.update({'mode': baseline['mode'], 'group': baseline['group'], 'ids': baseline['ids'],
                           'receipts': {side: {'path': str(path), **file_record(path)} for side, path in [('baseline', args.baseline), ('current', args.current)]}})
            result.update(compare_streams(pathlib.Path(args.baseline).parent / 'output.jsonl', pathlib.Path(args.current).parent / 'output.jsonl'))
            unavailable = baseline['validation']['unavailable_controls_requiring_review'] + current['validation']['unavailable_controls_requiring_review']
            result['unavailable_controls_requiring_review'] = unavailable
            result['status'] = ('matched-requires-unavailable-review' if unavailable else 'scoped-equality') if result['equal'] else 'mismatch'
            result['scope'] = 'Full emitted structured outputs only; representative laws, not full-law coverage; no adoption or policy-quality claim'
        except Exception as error:
            result['error'] = repr(error)
        stream.write(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'output': str(output), **file_record(output), 'status': result['status'], 'error': result.get('error'), 'difference': result.get('difference')}))
    return 0 if result['status'] == 'scoped-equality' else 1


if __name__ == '__main__':
    raise SystemExit(main())
