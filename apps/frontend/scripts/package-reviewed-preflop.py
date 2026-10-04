#!/usr/bin/env python3
"""LOCAL authoring utility: package saved candidates, never generate or approve data.

Run after local verification/review and before recording the exact archive hash.
CI never invokes this command. Its review receipt is maintained separately.
"""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile


def main():
    root = Path(__file__).resolve().parents[3]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="artifacts/preflop/stage2-reviewed.tar.gz")
    args = parser.parse_args()
    source = root / "apps/frontend/src/estimated"
    names = ["continuation-responses.json", "continuation-call-equities.json", "continuation-audit-report.json"]
    strategy = json.loads((source / names[0]).read_text())
    reasons = {source / "reasons" / (spot["id"] + ".json") for spot in strategy["spots"]}
    present = {f for f in (source / "reasons").glob("*.json") if f.name.startswith(("sq_", "sq2_", "cc_", "c4_"))}
    if reasons != present:
        raise ValueError("Incomplete or obsolete continuation reason files")
    files = sorted([*(source / name for name in names), *reasons], key=lambda f: f.relative_to(root).as_posix())
    output = root / args.out
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("wb") as target:
        with gzip.GzipFile(filename="", fileobj=target, mode="wb", mtime=0, compresslevel=9) as compressed:
            with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as tar:
                for path in files:
                    data = path.read_bytes()
                    entry = tarfile.TarInfo(path.relative_to(root).as_posix())
                    entry.size, entry.mode, entry.mtime = len(data), 0o644, 0
                    entry.uid = entry.gid = 0
                    entry.uname = entry.gname = ""
                    tar.addfile(entry, io.BytesIO(data))
    data = output.read_bytes()
    print(json.dumps({"path": str(output.relative_to(root)), "files": len(files), "bytes": len(data),
                      "sha256": hashlib.sha256(data).hexdigest(), "review_approved": False}))


if __name__ == "__main__":
    main()
