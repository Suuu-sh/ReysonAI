#!/usr/bin/env python3
"""Copy only closed, validated cells from the fixed sixth-case MC attempt."""
from pathlib import Path
import argparse
import datetime
import hashlib
import io
import json
import re
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('label')
args = parser.parse_args()
if not re.fullmatch(r'[0-9]{4}', args.label):
    raise SystemExit('Expected a unique four-digit snapshot label')
base = Path('/workspace/scratch/08c72b2d7549')
root = base / 'hu-final-recovery/co-bb-squeeze-btncall-mc720k-five-workers/run'
attempt = root / 'attempts/attempt-c7ac14e7-b296-4965-afcf-63edb8cd905a'
binding = '2171cb322dfb12519d5b635ebffada69109c37bd5bbf2a85c4bf3ac1b7b434a2'
files, cells = {}, []

def add(path, pin=None):
    path = Path(path)
    assert path.is_relative_to(base) and not path.is_symlink()
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if pin:
        assert len(raw) == pin['bytes'] and digest == pin['sha256']
    files[str(path.relative_to(base))] = (raw, path.stat())

for terminal in sorted(attempt.glob('*.terminal.json')):
    row = json.loads(terminal.read_text())
    assert row['exitCode'] == 0
    completed_path = Path(row['completion']['path'])
    add(completed_path, row['completion'])
    completed = json.loads(files[str(completed_path.relative_to(base))][0])
    diagnostic = completed['diagnostic']
    assert diagnostic['bindingHash'] == binding
    assert diagnostic['completed'] == 10000 and diagnostic['unresolved'] == 0
    assert diagnostic['first64Parity']['trialsEqual'] and diagnostic['first64Parity']['proofsEqual']
    native = completed['nativeValidation']
    assert native['completed'] and native['fullCell'] and native['calls'] == 1
    store = Path(diagnostic['rawEvidenceDirectory'])
    assert store.is_relative_to(root)
    marker_path = store / diagnostic['rawCell']['path']
    add(marker_path, diagnostic['rawCell'])
    marker = json.loads(files[str(marker_path.relative_to(base))][0])
    assert marker['bindingHash'] == binding
    add(store / 'identity.json')
    for pin in marker['chunks'] + marker['proofs']:
        path = store / pin['path']
        assert path.resolve().parent == store.resolve()
        add(path, pin)
    add(terminal)
    add(Path(completed['started']['job']['path']), completed['started']['job'])
    cells.append({'index': diagnostic['cellIndex'], 'trials': 10000,
                  'row': diagnostic['rawCell'], 'terminal': str(terminal.relative_to(base)),
                  'seconds': row['seconds'], 'peakRssKiB': row['peakRssKiB']})

assert cells and len({cell['index'] for cell in cells}) == len(cells)
metadata = {'kind': 'partial-mc720k-completed-cells-preservation',
            'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'source': '4b6b39a613afe72a2362f85aa93a305cd61b3586', 'bindingHash': binding,
            'sourcePacketLibraryId': 'libfile_b93836beb3988191bbf329a17a8de766',
            'sourcePacketVersion': 0,
            'sourcePacketSha256': '491c29ad1a3af6cba581322697974a869318db1883e2d7f1622a3ad4ea558728',
            'attempt': attempt.name, 'cells': cells, 'completeCells': len(cells),
            'completeTrials': len(cells) * 10000, 'targetTrials': 720000,
            'wholeRunTerminal': False, 'scopedAuditExecuted': False, 'policyAccepted': False}
metadata_path = base / f'hu-final-recovery/sixth-mc720k-progress-manifest-20261006-{args.label}.json'
with metadata_path.open('x') as stream:
    json.dump(metadata, stream, indent=2)
    stream.write('\n')
add(metadata_path)
output = base / f'hu-final-recovery/hu-model11-sixth-mc720k-progress-20261006-{args.label}.tar.gz'
assert not output.exists()
with tarfile.open(output, 'x:gz', compresslevel=6) as archive:
    for name, (raw, stat) in sorted(files.items()):
        info = tarfile.TarInfo(name)
        info.size, info.mode, info.mtime = len(raw), stat.st_mode & 0o777, stat.st_mtime
        archive.addfile(info, io.BytesIO(raw))
print(json.dumps({'archive': str(output), 'bytes': output.stat().st_size,
                  'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                  'files': len(files), 'completeCells': len(cells), 'completeTrials': len(cells) * 10000}))
