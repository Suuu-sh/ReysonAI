"""Restore exact HU45 payload bytes in an empty disposable checkout only.

Historical fixture restoration is neither current freshness nor publication approval.
Requires the existing immutable preservation verifier and the checkout's own catalog.
"""
import argparse
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[4]
DESTINATION = ROOT / "apps/frontend/.local/postflop-ai"


def load_preserver():
    path = Path(__file__).with_name("preserve-legacy-postflop.py")
    spec = importlib.util.spec_from_file_location("preserve_legacy_postflop", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def catalog(node="node"):
    # The module being interpreted belongs to this exact checkout, never a fake
    # root argument to today's modules. No authoring/API/audit is executed.
    program = "import {POSTFLOP_SPOTS} from './apps/frontend/scripts/postflop-ai/spots.mjs'; console.log(JSON.stringify(POSTFLOP_SPOTS.filter(s=>!s.history)));"
    result = subprocess.run([node, "--input-type=module", "-e", program], cwd=ROOT,
                            env={"PATH": os.environ.get("PATH", ""), "LANG": "C.UTF-8", "TZ": "UTC"},
                            check=True, capture_output=True, timeout=120)
    spots = json.loads(result.stdout)
    if len({spot["id"] for spot in spots}) != len(spots):
        raise ValueError("Duplicate catalog IDs")
    return {spot["id"]: spot for spot in spots}


def no_symlinks(path):
    for parent in [path, *path.parents]:
        if parent.is_symlink():
            raise ValueError("Symlink fixture destination is forbidden")
        if parent.exists() and parent != path and not parent.is_dir():
            raise ValueError("Non-directory destination ancestor")


def restore_fixture(disposable=False, node="node"):
    if not disposable:
        raise ValueError("Explicit --disposable-checkout is required; never use an active artifact checkout")
    preserve = load_preserver()
    manifest = preserve.preserve(verify=True)  # unchanged 137-entry/45-ID/135-hash gate
    raw = preserve.safe_read(ROOT / preserve.ARCHIVE)
    spots = catalog(node)
    no_symlinks(DESTINATION)
    if DESTINATION.exists() and (not DESTINATION.is_dir() or any(DESTINATION.iterdir())):
        raise ValueError("Fixture destination must be completely empty")
    suffixes = {"candidate": "-policy.json", "later_candidate": "-later-policy.json", "report": "-report.json"}
    records, paths = [], set()
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for item in manifest["files"]:
            spot = spots.get(item["spot"])
            if not spot or spot.get("history"):
                raise ValueError("Historical ID missing from exact legacy catalog")
            filename = spot["slug"] + suffixes[item["kind"]]
            if filename in paths or "/" in filename or "\\" in filename:
                raise ValueError("Duplicate or unsafe canonical fixture name")
            paths.add(filename)
            target = DESTINATION / filename
            no_symlinks(target)
            if target.exists():
                raise ValueError("Fixture cannot overwrite an existing file")
            records.append((item, target))
        # Every destination preflights before the first directory/file creation.
        DESTINATION.mkdir(parents=True, exist_ok=True)
        for item, target in records:
            no_symlinks(target)
            body = archive.read(item["member"])
            if len(body) != item["bytes"] or hashlib.sha256(body).hexdigest() != item["sha256"]:
                raise ValueError("ZIP bytes changed after preservation verification")
            with target.open("xb") as stream:
                stream.write(body)
        for item, target in records:
            body = preserve.safe_read(target)
            if len(body) != item["bytes"] or hashlib.sha256(body).hexdigest() != item["sha256"]:
                raise ValueError("Restored fixture bytes differ")
    return {"status": "exact-historical-fixture-restored", "spots": 45, "payloads": len(records),
            "archive_sha256": preserve.EXPECTED_SHA, "defence_version": 5,
            "current_publication_approval": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--disposable-checkout", action="store_true", required=True)
    parser.add_argument("--node", default="node")
    options = parser.parse_args()
    print(json.dumps(restore_fixture(options.disposable_checkout, options.node)))
