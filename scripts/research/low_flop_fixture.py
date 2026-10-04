#!/usr/bin/env python3
"""Pinned, unapproved low-flop evidence: deterministic packaging and fresh-only restore."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tarfile

REPO = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = REPO / 'artifacts/postflop/low-flop-research-v1.manifest.json'
DEFAULT_ARCHIVE = REPO / 'artifacts/postflop/low-flop-research-v1.tar.gz'
RECEIPT = '.low-flop-restore.json'
CHECKPOINT = '96bb46b76a98e64e6c2498f6d056d1b41e243dfc'
MAX_FILE = 128 * 1024 * 1024
MAX_TOTAL = 512 * 1024 * 1024
MAX_MEMBERS = 10000
LFS_HEADER = b'version https://git-lfs.github.com/spec/v1'
TESTS = [('postflop-low-flop-diagnostics', 4), ('postflop-flop-promotion-veto', 11),
         ('postflop-rollout-contract', 7), ('postflop-veto-builder', 5)]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_name(name):
    require(isinstance(name, str) and bool(re.fullmatch(r'[A-Za-z0-9_./-]+', name))
            and all(p not in ('', '.', '..') for p in name.split('/')),
            f'Unsafe member path: {name!r}')
    return name


def no_symlinks(path):
    path = Path(os.path.abspath(path))
    for part in [*reversed(path.parents), path]:
        require(not part.is_symlink(), f'Symlink path refused: {part}')
    return path


def file_record(path, name=None):
    path = no_symlinks(path)
    before = path.stat()
    require(stat.S_ISREG(before.st_mode) and before.st_size <= MAX_FILE, f'Invalid file: {path}')
    digest = hashlib.sha256()
    size = 0
    with path.open('rb') as source:
        first = source.read(65536)
        require(not first.startswith(LFS_HEADER), f'Git LFS pointer is not materialized: {path}')
        chunk = first
        while chunk:
            digest.update(chunk)
            size += len(chunk)
            chunk = source.read(65536)
    after = path.stat()
    require((before.st_size, before.st_mtime_ns, before.st_ino) ==
            (after.st_size, after.st_mtime_ns, after.st_ino) and size == before.st_size,
            f'File changed while hashing: {path}')
    return {'path': name or path.name, 'bytes': size, 'sha256': digest.hexdigest()}


def read_json(path):
    file_record(path)
    return json.loads(Path(path).read_text())


def write_json(path, value):
    with Path(path).open('x') as stream:
        stream.write(json.dumps(value, indent=2) + '\n')


def load_manifest(path):
    data = read_json(path)
    require(data.get('schema_version') == 1 and data.get('kind') == 'low-flop-research-fixture', 'Wrong manifest kind/version')
    require(data.get('approval') == 'unapproved-research' and data.get('production_eligible') is False, 'Fixture cannot grant approval')
    records = data.get('files')
    require(isinstance(records, list) and 0 < len(records) <= MAX_MEMBERS, 'Missing/excess fixture members')
    names = set()
    for row in records:
        name = safe_name(row['path'])
        require(name != RECEIPT and name not in names, f'Duplicate/reserved member: {name}')
        require(type(row['bytes']) is int and 0 <= row['bytes'] <= MAX_FILE, f'Invalid member size: {name}')
        require(bool(re.fullmatch('[0-9a-f]{64}', row['sha256'])), f'Invalid member hash: {name}')
        names.add(name)
    require(sum(r['bytes'] for r in records) <= MAX_TOTAL, 'Fixture exceeds total size limit')
    require(data.get('member_count') == len(records), 'Manifest member count drift')
    for name in names:
        require(not any(str(p) in names for p in Path(name).parents if str(p) != '.'), 'File/directory collision')
    return data


def read_archive(archive, manifest, destination=None):
    """Strict USTAR only: inspect each 512-byte header before reading its payload.

    tarfile's normal reader auto-expands PAX/GNU extended headers before callers can
    reject them. Reading fixed headers ourselves keeps hostile metadata bounded.
    """
    expected = {row['path']: row for row in manifest['files']}
    seen = set()
    with gzip.open(archive, 'rb') as stream:
        while True:
            header = stream.read(512)
            require(len(header) == 512, 'Truncated archive header')
            if header == bytes(512):
                padding = stream.read(10241)
                require(512 <= len(padding) <= 10240 and not any(padding), 'Invalid/excess trailing archive data')
                require(not stream.read(1), 'Excess archive padding')
                break
            member = tarfile.TarInfo.frombuf(header, 'utf-8', 'strict')
            name = safe_name(member.name)
            require(member.type == tarfile.REGTYPE and header[257:263] == b'ustar\x00', f'Non-regular/USTAR archive member: {name}')
            require(name not in seen and name in expected, f'Duplicate/unexpected archive member: {name}')
            row = expected[name]
            require(member.size == row['bytes'], f'Member size mismatch: {name}')
            digest = hashlib.sha256()
            output = None
            if destination is not None:
                target = destination / name
                target.parent.mkdir(parents=True, exist_ok=True)
                no_symlinks(target)
                output = target.open('xb')
            try:
                remaining = member.size
                first = True
                while remaining:
                    chunk = stream.read(min(65536, remaining))
                    require(chunk, f'Truncated member: {name}')
                    require(not (first and chunk.startswith(LFS_HEADER)), f'LFS pointer member: {name}')
                    first = False
                    digest.update(chunk)
                    if output is not None:
                        output.write(chunk)
                    remaining -= len(chunk)
            finally:
                if output is not None:
                    output.close()
            padding = (-member.size) % 512
            require(stream.read(padding) == bytes(padding), f'Invalid member padding: {name}')
            require(digest.hexdigest() == row['sha256'], f'Member hash mismatch: {name}')
            seen.add(name)
    require(seen == set(expected), 'Missing archive members')


def verify_archive(archive, manifest):
    actual = file_record(archive)
    require(actual['bytes'] == manifest['archive']['bytes'] and actual['sha256'] == manifest['archive']['sha256'],
            'Archive hash/size mismatch')
    read_archive(archive, manifest)
    return actual


def fresh_root(path):
    path = no_symlinks(path)
    require(path.parent.is_dir(), 'Fresh root parent must already exist')
    require(not path.exists(), f'Refusing existing destination: {path}')
    # Never restore into tracked source, build, or production artifact directories.
    if path.is_relative_to(REPO):
        require(path.is_relative_to(REPO / '.local'), 'In-checkout outputs must be inside .local/')
    path.mkdir(mode=0o700)
    return path


def verify_root(root, manifest_path=DEFAULT_MANIFEST, receipt_required=True):
    root = no_symlinks(root)
    require(root.is_dir(), f'Missing fixture root: {root}')
    manifest = load_manifest(manifest_path)
    expected = {row['path']: row for row in manifest['files']}
    found = set()
    for path in root.rglob('*'):
        require(not path.is_symlink(), f'Symlink in restored fixture: {path}')
        if path.is_dir():
            continue
        name = path.relative_to(root).as_posix()
        if name == RECEIPT:
            continue
        require(name in expected, f'Unexpected restored member: {name}')
        require(file_record(path, name) == expected[name], f'Restored hash/size mismatch: {name}')
        found.add(name)
    require(found == set(expected), 'Missing restored fixture members')
    if receipt_required:
        receipt = read_json(root / RECEIPT)
        require(receipt.get('manifest_sha256') == file_record(manifest_path)['sha256']
                and receipt.get('archive_sha256') == manifest['archive']['sha256']
                and receipt.get('production_eligible') is False, 'Restore receipt mismatch')
    return manifest


def restore(archive, manifest_path, destination):
    manifest = load_manifest(manifest_path)
    verify_archive(archive, manifest)
    root = fresh_root(destination)
    # No extract/extractall: only checked regular files, inside an exclusively created root.
    # A failed restore is deliberately retained without a receipt for diagnosis.
    read_archive(archive, manifest, root)
    verify_root(root, manifest_path, receipt_required=False)
    write_json(root / RECEIPT, {'schema_version': 1, 'manifest_sha256': file_record(manifest_path)['sha256'],
                              'archive_sha256': manifest['archive']['sha256'], 'production_eligible': False})
    return root


def collect_sources(research):
    """All bounded investigation evidence, plus exact checkpoint code and tracked reports."""
    research = no_symlinks(research)
    sources = {}
    for source in sorted(research.rglob('*')):
        require(not source.is_symlink(), f'Symlink research source: {source}')
        if source.is_file():
            name = source.relative_to(research).as_posix()
            require(name != RECEIPT, 'Do not package a restored/generated root')
            sources[safe_name(name)] = source
    # A compact runnable checkpoint uses the established v2 dependency closure.
    baseline = research / 'main-contract-v2'
    for source in sorted(baseline.rglob('*')):
        if source.is_file() and '/.local/' not in '/' + source.relative_to(baseline).as_posix():
            relative = source.relative_to(baseline)
            sources['candidate-source/' + relative.as_posix()] = REPO / relative
    for name in ['flop-promotion-veto', 'build-flop-promotion-veto']:
        relative = f'apps/frontend/scripts/postflop-ai/{name}.mjs'
        sources['candidate-source/' + relative] = REPO / relative
    for name, _ in TESTS:
        relative = f'apps/frontend/tests/{name}.test.mjs'
        sources['candidate-source/' + relative] = REPO / relative
    for source in sorted((REPO / 'apps/frontend/docs/specs').glob('low-flop-overcall*')):
        # A new packaging document must not recursively become historical evidence.
        if source.name.startswith('low-flop-overcall.fixture'):
            continue
        sources['reports/' + source.name] = source
    relative = 'apps/frontend/docs/specs/low-flop-overcall.baseline.json'
    sources['candidate-source/' + relative] = REPO / relative
    return sources


def write_archive(sources, records, archive):
    with Path(archive).open('xb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0, compresslevel=9) as gz:
        with tarfile.open(fileobj=gz, mode='w|', format=tarfile.USTAR_FORMAT) as tar:
            for row in records:
                info = tarfile.TarInfo(row['path'])
                info.size = row['bytes']; info.mode = 0o644; info.mtime = 0
                with sources[row['path']].open('rb') as source:
                    tar.addfile(info, source)


def repack(root, archive, manifest_path):
    """Rebuild the existing immutable artifact's exact member set, never today's glob."""
    root = no_symlinks(root); archive = no_symlinks(archive)
    manifest = verify_root(root, manifest_path)
    require(not archive.is_relative_to(root), 'Repack output must be outside immutable root')
    require(not archive.exists(), 'Repack output must be fresh')
    sources = {row['path']: root / row['path'] for row in manifest['files']}
    write_archive(sources, manifest['files'], archive)
    verify_root(root, manifest_path)
    # Includes the compressed byte identity; a different compression implementation
    # may fail here rather than falsely claim bit-for-bit reproduction.
    return verify_archive(archive, manifest)


def package(research, archive, manifest_path):
    no_symlinks(archive); no_symlinks(manifest_path)
    require(not Path(archive).exists() and not Path(manifest_path).exists(), 'Package outputs must be fresh')
    sources = collect_sources(research)
    records = [file_record(sources[name], name) for name in sorted(sources)]
    for name, source in sources.items():
        if name.startswith('candidate-source/'):
            relative = name[len('candidate-source/'):]
            expected = subprocess.check_output(['git', 'rev-parse', f'{CHECKPOINT}:{relative}'], cwd=REPO, text=True).strip()
            actual = subprocess.check_output(['git', 'hash-object', '--no-filters', str(source)], cwd=REPO, text=True).strip()
            require(actual == expected, f'Candidate differs from declared checkpoint: {relative}')
    require(len(records) <= MAX_MEMBERS and sum(r['bytes'] for r in records) <= MAX_TOTAL, 'Fixture exceeds limits')
    write_archive(sources, records, archive)
    manifest = {'schema_version': 1, 'kind': 'low-flop-research-fixture', 'approval': 'unapproved-research',
                'production_eligible': False, 'baseline_main_commit': '2064a41011f0e91685e592c6e5f4c07f07ba7570',
                'candidate_checkpoint': CHECKPOINT,
                'original_policy_archive_sha256': '5f5dd88540c00ce7426146b91b1fd9c0cc10974b146ba02a175cc067395e7b0a',
                'scope': 'Exact immutable bytes for offline research; no approval receipts or production integration.',
                'limits': ['Only four exact preview contexts among 21546 archived rows; no automatic new-case approval.',
                           'Original seven and additional eight families spend nominal .02 together, not .01.',
                           'Independent delivery review and all-combo integrated runtime audit remain required.'],
                'archive': file_record(archive), 'member_count': len(records),
                'uncompressed_bytes': sum(r['bytes'] for r in records), 'files': records}
    verify_archive(archive, manifest)
    write_json(manifest_path, manifest)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['pack', 'repack', 'verify-archive', 'restore', 'verify-root'])
    parser.add_argument('--archive', type=Path, default=DEFAULT_ARCHIVE)
    parser.add_argument('--manifest', type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument('--root', type=Path)
    args = parser.parse_args()
    require(args.root is not None or args.command == 'verify-archive', '--root is required')
    if args.command == 'pack':
        result = package(args.root, args.archive, args.manifest)
        print(json.dumps({'archive': result['archive'], 'member_count': result['member_count']}))
    elif args.command == 'repack':
        print(json.dumps(repack(args.root, args.archive, args.manifest)))
    elif args.command == 'verify-archive':
        print(json.dumps(verify_archive(args.archive, load_manifest(args.manifest))))
    elif args.command == 'restore':
        print(restore(args.archive, args.manifest, args.root))
    else:
        result = verify_root(args.root, args.manifest)
        print(json.dumps({'verified_members': result['member_count'], 'production_eligible': False}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, tarfile.TarError, KeyError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
