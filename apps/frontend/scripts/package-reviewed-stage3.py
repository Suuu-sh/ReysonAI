#!/usr/bin/env python3
"""LOCAL saved-byte packager. Never author data or approve independent review."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import tarfile


def package(root, output):
    root = root.resolve()
    source = root / "apps/frontend/src/estimated"
    names = ["stage3-responses.json", "stage3-call-equities.json", "stage3-audit-report.json", "stage3-coverage.json"]
    strategy = json.loads((source / names[0]).read_text())
    ids = [spot["id"] for spot in strategy["spots"]]
    del strategy
    if len(set(ids)) != len(ids) or any(not re.fullmatch(r"s3_[A-Za-z0-9_]+", id) for id in ids):
        raise ValueError("Unsafe or duplicate Stage 3 history IDs")
    reasons = {source / "reasons" / (id + ".json") for id in ids}
    present = set((source / "reasons").glob("s3_*.json"))
    if reasons != present:
        raise ValueError("Incomplete or obsolete Stage 3 reason files")
    files = sorted([*(source / name for name in names), *reasons], key=lambda file: file.relative_to(root).as_posix())
    output = root / output
    if not output.absolute().is_relative_to(root) or ".." in output.parts:
        raise ValueError("Stage 3 archive output must stay inside the repository")
    relative = output.relative_to(root).as_posix()
    if not (re.fullmatch(r"artifacts/preflop/stage3[A-Za-z0-9_.-]*\.tar\.gz", relative)
            or re.fullmatch(r"(?:apps/frontend/)?\.local/[A-Za-z0-9_./-]+\.tar\.gz", relative)):
        raise ValueError("Stage 3 archive output must use its isolated archive or local staging namespace")
    for file in [*files, output]:
        for part in [file, *file.parents]:
            if part.is_symlink():
                raise ValueError("Refuse symlink in Stage 3 archive source/output")
            if part == root:
                break
    # USTAR cannot represent a basename longer than100bytes. Store content-
    # addressed objects instead; the independently reviewed receipt maps each
    # object hash back to its exact original path, including long history IDs.
    objects = {}
    for file in files:
        if not file.is_file():
            raise ValueError("Only regular Stage 3 source files may be packaged")
        digest = hashlib.sha256()
        with file.open("rb") as body:
            for chunk in iter(lambda: body.read(1024 * 1024), b""):
                digest.update(chunk)
        key, size = digest.hexdigest(), file.stat().st_size
        if key in objects and objects[key][1] != size:
            raise ValueError("Inconsistent Stage 3 object identity")
        objects.setdefault(key, (file, size))
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + f".tmp-{os.getpid()}")
    created = False
    try:
        with temporary.open("xb") as target:
            created = True
            with gzip.GzipFile(filename="", fileobj=target, mode="wb", mtime=0, compresslevel=9) as compressed:
                with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as tar:
                    for digest, (file, size) in sorted(objects.items()):
                        entry = tarfile.TarInfo("objects/" + digest)
                        entry.size, entry.mode, entry.mtime = size, 0o644, 0
                        entry.uid = entry.gid = 0
                        entry.uname = entry.gname = ""
                        with file.open("rb") as body:
                            tar.addfile(entry, body)
        os.replace(temporary, output)
    finally:
        if created and temporary.exists():
            temporary.unlink()
    data = output.read_bytes()
    return {"path": str(output.relative_to(root)), "files": len(files), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(), "objects": len(objects),
            "format": "ustar+gzip-stage3-content-v1", "review_approved": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument("--out", default="artifacts/preflop/stage3-reviewed.tar.gz")
    args = parser.parse_args()
    print(json.dumps(package(args.root, args.out)))
