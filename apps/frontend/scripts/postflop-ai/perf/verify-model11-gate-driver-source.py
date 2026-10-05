#!/usr/bin/env python3
"""Closed inventory author/checker. Static source/input integrity, never Node or poker work."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOTS = ['apps/frontend/scripts/postflop-ai/evaluate-model11-audit.mjs']
MANIFEST = 'apps/frontend/tests/fixtures/model11-gate-source-graph.json'
IMPORT = re.compile(r'''(?:\bimport\s+(?:[^;]*?\s+from\s+)?|\bexport\s+[^;]*?\s+from\s+)["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)''')

def record(root, name):
    path = root / name
    if any(p.is_symlink() for p in [path, *path.parents] if p.is_relative_to(root)) or not path.resolve().is_relative_to(root) or not path.is_file():
        raise ValueError(f'Unsafe or missing source: {name}')
    data = path.read_bytes()
    return {'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def dependencies(text):
    matches = list(IMPORT.finditer(text))
    remainder = text
    for match in reversed(matches):
        remainder = remainder[:match.start()] + ' ' * (match.end() - match.start()) + remainder[match.end():]
    # This inventory deliberately supports only this repository's static relative
    # ESM and builtin Node imports. Nonliteral loading needs a new reviewed contract.
    if re.search(r'\b(?:import|require)\s*\(', remainder) or re.search(r'\b(?:eval|Function)\s*\(', remainder):
        raise ValueError('Unresolved dynamic module/evaluation surface in closed source graph')
    names = [m.group(1) or m.group(2) for m in matches]
    if any(not name.startswith(('.', 'node:')) for name in names):
        raise ValueError('External package/import specifier outside closed source graph')
    return [name for name in names if name.startswith('.')]

def graph(root):
    found = {}
    def visit(name):
        path = (root / name).resolve()
        if not path.is_relative_to(root):
            raise ValueError('Source edge escapes the repository')
        name = path.relative_to(root).as_posix()
        if name in found:
            return
        found[name] = record(root, name)
        if path.suffix in ['.mjs', '.cjs', '.js', '.ts', '.tsx']:
            for dependency in dependencies(path.read_text()):
                visit((path.parent / dependency).relative_to(root).as_posix())
    for name in ROOTS:
        visit(name)
    return [found[name] for name in sorted(found)]

def expected(root):
    return {'kind': 'model11-gate-closed-source-inventory', 'version': 1, 'roots': ROOTS, 'sources': graph(root)}

def verify(root):
    current = expected(root)
    saved = json.loads((root / MANIFEST).read_bytes())
    if saved != current:
        raise ValueError('Closed source inventory mismatch; no numerical work may run')
    raw = json.loads((root / 'apps/frontend/tests/fixtures/model11-gate-raw-inputs.json').read_bytes())
    if len(raw['files']) != 12 or raw['files'] != [record(root, row['path']) for row in raw['files']]:
        raise ValueError('Exact raw12 input pins differ')
    return {'kind': 'model11-gate-driver-static-source-check', 'sourceFiles': len(current['sources']),
            'sourceInventory': record(root, MANIFEST), 'rawInputFiles': 12,
            'rawInputBytes': sum(row['bytes'] for row in raw['files']), 'runtime': 'not run'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true', help='Author a new inventory after source edits; requires subsequent review')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[5]
    if args.write:
        (root / MANIFEST).write_text(json.dumps(expected(root), indent=2) + '\n')
    print(json.dumps(verify(root), indent=2))
