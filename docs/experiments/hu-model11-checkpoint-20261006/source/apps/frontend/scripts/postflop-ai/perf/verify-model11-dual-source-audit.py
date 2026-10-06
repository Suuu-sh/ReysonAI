#!/usr/bin/env python3
"""Static admission only. Explicitly closes the single reviewed dynamic import."""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
PREFIX = 'apps/frontend/scripts/postflop-ai/'
ROOTS = [PREFIX + 'evaluate-model11-dual-source-audit.mjs', PREFIX + 'evaluate-model11-completion-representative.mjs']
MANIFEST = 'apps/frontend/tests/fixtures/model11-dual-source-audit-source-graph.json'
spec = importlib.util.spec_from_file_location('strict_graph', ROOT / (PREFIX + 'perf/verify-model11-gate-driver-source.py'))
STRICT = importlib.util.module_from_spec(spec)
spec.loader.exec_module(STRICT)
BASE_DEPENDENCIES = STRICT.dependencies
DYNAMIC = "import(pathToFileURL(join(root, `${PREFIX}${name}.mjs`)))"
APIS = ['inputs', 'model11-gate-source', 'model11-gate-contract', 'effective-law-identity',
        'all-board-checkpoints', 'model11-completion-representative-source', 'model11-completion-representative-contract',
        'model11-completion-representative-store', 'model11-completion-representative', 'evaluate-model11-completion-representative']

def dependencies(text):
    if DYNAMIC in text:
        if text.count(DYNAMIC) != 1 or 'DYNAMIC_API_FILES.map(name => ' + DYNAMIC not in text:
            raise ValueError('Unreviewed dynamic import surface')
        text = text.replace(DYNAMIC, 'undefined')
    return BASE_DEPENDENCIES(text)

def expected(root):
    old_roots, old_dependencies = STRICT.ROOTS, STRICT.dependencies
    try:
        STRICT.ROOTS, STRICT.dependencies = ROOTS, dependencies
        graph = STRICT.graph(root)
    finally:
        STRICT.ROOTS, STRICT.dependencies = old_roots, old_dependencies
    paths = {row['path'] for row in graph}
    if any(PREFIX + name + '.mjs' not in paths for name in APIS):
        raise ValueError('A dynamic API is absent from the closed roots')
    return {'kind': 'model11-dual-source-audit-closed-source-inventory', 'version': 1, 'roots': ROOTS, 'sources': graph}

def verify(root):
    current = expected(root)
    if json.loads((root / MANIFEST).read_bytes()) != current:
        raise ValueError('Dual-source reviewed inventory differs')
    strict = STRICT.verify(root)
    completion_spec = importlib.util.spec_from_file_location('completion_graph', root / (PREFIX + 'perf/verify-model11-completion-representative-source.py'))
    completion = importlib.util.module_from_spec(completion_spec)
    completion_spec.loader.exec_module(completion)
    completion_result = completion.verify(root)
    return {'kind': 'model11-dual-source-static-source-check', 'sourceFiles': len(current['sources']),
            'inventory': STRICT.record(root, MANIFEST), 'strict': strict, 'completion': completion_result, 'runtime': 'not run'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true', help='Author a new inventory; independent review is still required')
    args = parser.parse_args()
    if args.write:
        (ROOT / MANIFEST).write_text(json.dumps(expected(ROOT), indent=2) + '\n')
    print(json.dumps(verify(ROOT), indent=2))
