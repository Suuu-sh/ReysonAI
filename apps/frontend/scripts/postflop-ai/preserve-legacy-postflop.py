"""Preserve the authorized HU45 source ZIP; never generate or update a policy.

python3 scripts/postflop-ai/preserve-legacy-postflop.py --source <received.zip>
python3 scripts/postflop-ai/preserve-legacy-postflop.py --verify
The separate immutable LFS object is historical evidence, not publication approval.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[4]
ARCHIVE = "artifacts/postflop/legacy-hu45-source.zip"
MANIFEST = "artifacts/postflop/legacy-hu45-source.manifest.json"
EXPECTED_SHA = "5f5dd88540c00ce7426146b91b1fd9c0cc10974b146ba02a175cc067395e7b0a"
PREFIX = "ReysonAI-HU45-readonly-2026-10-04/"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_read(path):
    path = Path(path).absolute()
    if any(item.is_symlink() for item in [path, *path.parents]):
        raise ValueError("Symbolic links are not accepted")
    if not path.is_file() or not 0 < path.stat().st_size <= 16 * 1024 * 1024:
        raise ValueError("Missing or oversized regular file")
    return path.read_bytes()


def inspect_archive(data):
    if sha(data) != EXPECTED_SHA:
        raise ValueError("Received legacy ZIP differs from the authorized transfer hash")
    fingerprints = json.loads(safe_read(ROOT / "apps/frontend/tests/fixtures/postflop-legacy-fingerprints.json"))
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        infos = archive.infolist()
        if len(infos) != 137 or len({item.filename for item in infos}) != len(infos):
            raise ValueError("Unexpected or duplicate ZIP entries")
        if any(item.flag_bits & 1 or item.is_dir() or item.file_size > 16 * 1024 * 1024 for item in infos):
            raise ValueError("Encrypted, directory or oversized entry")
        if sum(item.file_size for item in infos) > 256 * 1024 * 1024:
            raise ValueError("Legacy ZIP is too large")
        source = json.loads(archive.read(PREFIX + "manifest.json"))
        records = source.get("records", [])
        if len(records) != 45 or source.get("files_count") != 135:
            raise ValueError("Legacy source must contain exactly 45 complete sets")
        files, ids, expected = [], set(), {PREFIX + "manifest.json", PREFIX + "SHA256SUMS.txt"}
        for record in records:
            spot = record["spot_id"]
            if spot in ids or record["input_hash"] != fingerprints.get(spot):
                raise ValueError("Duplicate spot or changed baseline input fingerprint")
            ids.add(spot)
            payload = {}
            for kind in ("candidate", "later_candidate", "report"):
                item = record[kind]
                name = item["file"]
                if not re.fullmatch(r"[a-z0-9-]+\.json", name):
                    raise ValueError("Unsafe legacy payload name")
                member = PREFIX + "payload/" + name
                if member in expected:
                    raise ValueError("Duplicate legacy payload destination")
                expected.add(member)
                body = archive.read(member)
                if len(body) != item["bytes"] or sha(body) != item["sha256"]:
                    raise ValueError("Legacy payload byte identity differs")
                payload[kind] = json.loads(body)
                files.append({"spot": spot, "kind": kind, "member": member, "bytes": len(body), "sha256": sha(body)})
            candidate, later, report = (payload[key] for key in ("candidate", "later_candidate", "report"))
            if not (candidate["metadata"]["source_hash"] == later["metadata"]["source_hash"] == report["source_hash"] == record["input_hash"]):
                raise ValueError("Legacy source/report input identities differ")
            if candidate["metadata"]["policy_hash"] != record["policy_hash"] or report["policy_hash"] != record["policy_hash"]:
                raise ValueError("Legacy flop policy/report identities differ")
            if later["metadata"]["policy_hash"] != record["later_policy_hash"] or report["later_policy_hash"] != record["later_policy_hash"]:
                raise ValueError("Legacy later policy/report identities differ")
            if report["defence_version"] != 5 or record["defence_version"] != 5:
                raise ValueError("Historical reports must retain defence version 5")
        if set(fingerprints) != ids or set(archive.namelist()) != expected:
            raise ValueError("Incomplete legacy coverage or unexpected ZIP contents")
    return {"schema_version": 1, "kind": "preserved-legacy-postflop-source", "status": "historical-not-current-audit-approval",
            "source": {"method": "user-authorized read-only legacy source transfer",
                       "filename": "ReysonAI-HU45-readonly-2026-10-04.zip",
                       "baseline_commit": "33574ad6bf08f5e99e73b46eacd4a874a639e1c9"},
            "archive": {"path": ARCHIVE, "bytes": len(data), "sha256": EXPECTED_SHA},
            "spots": sorted(ids), "report_defence_version": 5,
            "note": "Exact recovered bytes. Current baseline defence version is 6; this archive does not claim current audit PASS or authorize publication.",
            "files": sorted(files, key=lambda item: item["member"])}


def preserve(source=None, verify=False):
    data = safe_read(ROOT / ARCHIVE if verify else source)
    manifest = inspect_archive(data)
    encoded = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    for name, body in ((ARCHIVE, data), (MANIFEST, encoded)):
        target = ROOT / name
        if target.exists():
            if safe_read(target) != body:
                raise ValueError("Refusing to overwrite different preserved legacy bytes: " + name)
        elif verify:
            raise ValueError("Preserved legacy artifact is missing: " + name)
        else:
            # Both destinations are fixed repository paths, never ZIP member paths.
            if any(item.is_symlink() for item in target.parents):
                raise ValueError("Symbolic link destination is not accepted")
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("xb") as stream:
                stream.write(body)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    args = parser.add_mutually_exclusive_group(required=True)
    args.add_argument("--source")
    args.add_argument("--verify", action="store_true")
    options = parser.parse_args()
    result = preserve(options.source, options.verify)
    print(f"Verified {len(result['spots'])} legacy sets / {len(result['files'])} exact payloads; historical defence 5 retained.")
