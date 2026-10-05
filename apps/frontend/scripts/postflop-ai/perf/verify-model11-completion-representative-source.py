#!/usr/bin/env python3
"""Specific static graph author/checker; no Node or strategy-quality claim."""
import argparse
import importlib.util
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[5]
PREFIX = 'apps/frontend/scripts/postflop-ai/'
SPEC = importlib.util.spec_from_file_location('strict_source', ROOT / (PREFIX + 'perf/verify-model11-gate-driver-source.py'))
STRICT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(STRICT)
ROOTS = [PREFIX + 'evaluate-model11-completion-representative.mjs']
MANIFEST = 'apps/frontend/tests/fixtures/model11-completion-representative-source-graph.json'
def expected(root):
    previous = STRICT.ROOTS
    try:
        STRICT.ROOTS = ROOTS
        return {'kind': 'model11-completion-representative-closed-source-inventory', 'version': 1, 'roots': ROOTS, 'sources': STRICT.graph(root)}
    finally:
        STRICT.ROOTS = previous
def verify(root):
    current = expected(root)
    if json.loads((root / MANIFEST).read_bytes()) != current:
        raise ValueError('Composite source differs from the reviewed closed source inventory')
    strict = STRICT.verify(root)
    return {'kind': 'model11-completion-representative-static-source-check', 'sourceFiles': len(current['sources']),
            'sourceInventory': STRICT.record(root, MANIFEST), 'strictBalanceSourceFiles': strict['sourceFiles'],
            'rawInputFiles': strict['rawInputFiles'], 'rawInputBytes': strict['rawInputBytes'], 'runtime': 'not run'}
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true', help='Author inventory; independent review required before execution')
    args = parser.parse_args()
    if args.write:
        (ROOT / MANIFEST).write_text(json.dumps(expected(ROOT), indent=2) + '\n')
    print(json.dumps(verify(ROOT), indent=2))
