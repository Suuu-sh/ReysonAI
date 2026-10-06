#!/usr/bin/env python3
"""Closed selected-regression graph. Static integrity only, never strategy work."""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
PREFIX = 'apps/frontend/scripts/postflop-ai/'
ROOTS = [PREFIX + 'evaluate-model11-selected-regression.mjs', PREFIX + 'evaluate-model11-completion-representative.mjs']
MANIFEST = 'apps/frontend/tests/fixtures/model11-selected-regression-source-graph.json'
spec = importlib.util.spec_from_file_location('dual', ROOT / (PREFIX + 'perf/verify-model11-dual-source-audit.py'))
DUAL = importlib.util.module_from_spec(spec)
spec.loader.exec_module(DUAL)
DYNAMIC = "import(pathToFileURL(join(spec.original.root, `${PREFIX}${name}.mjs`)))"

def dependencies(text):
    if DYNAMIC in text:
        if text.count(DYNAMIC) != 1 or "['offpath-behavior-model11', 'simulation-model11'].map(name => " + DYNAMIC not in text:
            raise ValueError('Unreviewed original-source control API import')
        text = text.replace(DYNAMIC, 'undefined')
    return DUAL.dependencies(text)

def expected(root):
    strict = DUAL.STRICT
    old_roots, old_dependencies = strict.ROOTS, strict.dependencies
    try:
        strict.ROOTS, strict.dependencies = ROOTS, dependencies
        rows = strict.graph(root)
    finally:
        strict.ROOTS, strict.dependencies = old_roots, old_dependencies
    return {'kind': 'model11-selected-regression-closed-source-inventory', 'version': 1, 'roots': ROOTS, 'sources': rows}

def verify(root):
    value = expected(root)
    if json.loads((root / MANIFEST).read_bytes()) != value:
        raise ValueError('Selected source inventory differs')
    prior = DUAL.verify(root)
    return {'kind': 'model11-selected-regression-static-source-check', 'sourceFiles': len(value['sources']),
            'inventory': DUAL.STRICT.record(root, MANIFEST), 'closedImplementation': prior, 'runtime': 'not run'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    if args.write:
        (ROOT / MANIFEST).write_text(json.dumps(expected(ROOT), indent=2) + '\n')
    print(json.dumps(verify(ROOT), indent=2))
