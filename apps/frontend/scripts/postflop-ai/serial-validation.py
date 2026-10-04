#!/usr/bin/env python3
"""Durable LOCAL-only orchestration of unchanged official numerical commands.

No policy generation, model/API invocation, approval, upload, deployment, or
production operation is available. Run only after the coordinator releases the
shared compute slot. Each bounded batch owns an isolated byte-copy repository.
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import time
import uuid

BASE = ".local/postflop-ai/serial-validation"
HELPER = "scripts/postflop-ai/serial-validation-proof.mjs"
CATALOG = "scripts/data/hu-after-multiway-spots.json"
PHASES = ("simulate", "replay", "all-boards")
MAX_BATCH = 4
MAX_JSON = 8 * 1024 * 1024
MAX_LOG = 32 * 1024 * 1024
MAX_FILE = 256 * 1024 * 1024
RUN_RE = re.compile(r"run-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{32}\Z")


class Refusal(RuntimeError):
    pass


class BudgetRefusal(Refusal):
    pass


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def body(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def command_hash(command):
    # Same JSON representation as the Node proof gate.
    return digest(json.dumps(command, ensure_ascii=False, separators=(",", ":")).encode())


def safe(root, relative, *, missing=False, directory=False):
    if not isinstance(relative, str) or len(relative) > 512 or not re.fullmatch(r"[A-Za-z0-9_./-]+", relative) or any(
            part in ("", ".", "..") for part in relative.split("/")) or relative.startswith("/"):
        raise Refusal(f"Unsafe relative path: {relative}")
    root = Path(root).absolute()
    # Do not resolve away symlinks, including any ancestor of the selected root.
    chain = list(reversed(root.parents)) + [root]
    for item in chain:
        if item.is_symlink() or not item.is_dir():
            raise Refusal(f"Root/ancestor is not a real directory: {item}")
    current = root
    parts = relative.split("/")
    for index, part in enumerate(parts):
        current = current / part
        try:
            info = current.lstat()
        except FileNotFoundError:
            if missing:
                continue
            raise Refusal(f"Missing path: {relative}")
        wanted_directory = index < len(parts) - 1 or directory
        if stat.S_ISLNK(info.st_mode) or not (stat.S_ISDIR(info.st_mode) if wanted_directory else stat.S_ISREG(info.st_mode)):
            raise Refusal(f"Symlink/nonregular path rejected: {relative}")
    return current


def read(root, relative, limit=MAX_JSON):
    path = safe(root, relative)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_size > limit:
            raise Refusal(f"Oversized/nonregular file: {relative}")
        with os.fdopen(fd, "rb", closefd=False) as source:
            data = source.read(limit + 1)
        after = path.lstat()
        if len(data) != before.st_size or (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
            raise Refusal(f"File changed during read: {relative}")
        return data
    finally:
        os.close(fd)


def read_json(root, relative):
    return json.loads(read(root, relative))


def exclusive(root, relative, data):
    path = safe(root, relative, missing=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    safe(root, relative, missing=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as target:
            target.write(data)
            target.flush()
            os.fsync(fd)
    finally:
        os.close(fd)


def file_record(root, relative, limit=MAX_FILE):
    data = read(root, relative, limit)
    return {"path": relative, "bytes": len(data), "sha256": digest(data)}


def assert_record(root, record, limit=MAX_FILE):
    if not isinstance(record, dict) or file_record(root, record.get("path"), limit) != record:
        raise Refusal("Saved file/proof bytes do not match their actual hash/size")


def selections(root, ids, manifest=None):
    catalog = read_json(root, CATALOG)
    rows = catalog.get("spots", [])
    reachable = {row["id"]: row for row in rows if row.get("reachable") and row.get("history") and row.get("stage") in ("A", "B")}
    if len(reachable) != 407 or sum(row["stage"] == "A" for row in reachable.values()) != 137 or sum(row["stage"] == "B" for row in reachable.values()) != 270:
        raise Refusal("Expected exact 137 Stage A / 270 Stage B reachable new-spot catalog")
    if manifest:
        if ids:
            raise Refusal("Use explicit --spot IDs or --manifest, never both")
        value = read_json(root, manifest)
        if set(value) != {"schema_version", "spot_ids"} or value["schema_version"] != 1:
            raise Refusal("Manifest must contain only schema_version=1 and spot_ids")
        ids = value["spot_ids"]
    if not isinstance(ids, list) or not 1 <= len(ids) <= MAX_BATCH or any(not isinstance(id, str) or not re.fullmatch(r"[A-Za-z0-9_]{1,200}", id) for id in ids):
        raise Refusal("A bounded batch requires 1..4 explicit safe spot IDs")
    if len(set(ids)) != len(ids):
        raise Refusal("Duplicate IDs are rejected")
    if any(id not in reachable for id in ids):
        raise Refusal("Unknown, unreachable or legacy IDs are rejected")
    # Deterministic order: all selected A first; B always by saved descending reach.
    order = {row["id"]: index for index, row in enumerate(rows)}
    ids = sorted(ids, key=lambda id: (reachable[id]["stage"], order[id] if reachable[id]["stage"] == "A" else -reachable[id]["reach"], id))
    return ids, reachable


class OwnerLock:
    def __init__(self, frontend):
        self.frontend, self.fd = Path(frontend), None

    def __enter__(self):
        path = safe(self.frontend, f"{BASE}/owner.lock", missing=True)
        path.parent.mkdir(parents=True, exist_ok=True)
        safe(self.frontend, f"{BASE}/owner.lock", missing=True)
        self.fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(self.fd)
            self.fd = None
            raise Refusal("Another serial runner owns the shared compute slot")
        os.ftruncate(self.fd, 0)
        os.write(self.fd, body({"pid": os.getpid(), "started_at": now(), "scope": "cooperative LOCAL serial numerical slot"}))
        os.fsync(self.fd)
        return self

    def __exit__(self, *_):
        if self.fd is not None:
            fcntl.flock(self.fd, fcntl.LOCK_UN)
            os.close(self.fd)


def tree_bytes(root):
    total = 0
    if Path(root).is_symlink():
        raise Refusal("Symlink storage root rejected")
    if not Path(root).exists():
        return total
    safe(Path(root).parent, Path(root).name, directory=True)
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            path = Path(directory) / name
            info = path.lstat()
            if stat.S_ISLNK(info.st_mode) or not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
                raise Refusal(f"Symlink/nonregular run storage rejected: {path}")
            if stat.S_ISREG(info.st_mode):
                total += info.st_size
    return total


class Guard:
    def __init__(self, roots_and_records, *, storage=None, budget=None):
        self.entries = []
        self.storage, self.budget, self.last_budget_check = storage, budget, 0
        for root, records in roots_and_records:
            for item in records:
                assert_record(root, item)
                path = safe(root, item["path"])
                info = path.lstat()
                self.entries.append((root, item, (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)))

    def check(self, full=False):
        for root, item, expected in self.entries:
            info = safe(root, item["path"]).lstat()
            if (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns) != expected:
                raise Refusal("Running source/input/policy changed; stop immediately")
            if full:
                assert_record(root, item)
        if self.storage and (full or time.monotonic() - self.last_budget_check >= 5):
            if tree_bytes(self.storage) > self.budget:
                raise BudgetRefusal("Run-storage budget exceeded; batch stopped without acceptance")
            self.last_budget_check = time.monotonic()

    def reserve(self, additional_bytes):
        if self.storage and tree_bytes(self.storage) + additional_bytes > self.budget:
            raise BudgetRefusal("Insufficient reserved storage for the next bounded command/log")


class MultiGuard:
    def __init__(self, *guards):
        self.guards = [guard for guard in guards if guard is not None]

    def check(self, full=False):
        for guard in self.guards:
            guard.check(full)

    def reserve(self, additional_bytes):
        for guard in self.guards:
            guard.reserve(additional_bytes)


class Boundary:
    """The only child-process boundary; unit tests replace this class."""
    def __init__(self):
        self.interrupted = None

    def interrupt(self, number, _frame):
        self.interrupted = number

    def run(self, command, cwd, repository, prefix, request=None, guard=None):
        log_rel, receipt_rel = prefix + ".log", prefix + ".receipt.json"
        started = now()
        start = {"schema_version": 1, "command": command, "command_sha256": command_hash(command), "cwd": str(cwd),
                 "started_at": started, "request_sha256": digest(body(request)) if request is not None else None}
        if request is not None and len(body(request)) > MAX_JSON:
            raise Refusal("Request exceeds bounded JSON budget")
        if guard:
            guard.check(full=True)
            guard.reserve(len(body(start)) + (len(body(request)) if request is not None else 0) + MAX_LOG + 65536)
        exclusive(repository, prefix + ".start.json", body(start))
        if request is not None:
            exclusive(repository, prefix + ".request.json", body(request))
        log_path = safe(repository, log_rel, missing=True)
        fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        process, error, code = None, None, None
        try:
            if self.interrupted:
                raise Refusal(f"Interrupted by signal {self.interrupted}")
            if guard:
                guard.check(full=True)
            env = {key: value for key, value in os.environ.items() if key not in ("NODE_OPTIONS", "NODE_PATH") and not re.search(r"(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET|PASSWORD)", key)}
            # These fixed official commands never need credentials or a shell.
            process = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.PIPE if request is not None else subprocess.DEVNULL,
                                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
            if request is not None:
                process.stdin.write(body(request))
                process.stdin.close()
            selector = selectors.DefaultSelector()
            selector.register(process.stdout, selectors.EVENT_READ)
            size = 0
            with os.fdopen(fd, "wb", closefd=False) as log:
                while selector.get_map():
                    if self.interrupted:
                        raise Refusal(f"Interrupted by signal {self.interrupted}")
                    if guard:
                        guard.check()
                    for key, _ in selector.select(timeout=0.25):
                        chunk = os.read(key.fileobj.fileno(), 65536)
                        if not chunk:
                            selector.unregister(key.fileobj)
                            continue
                        size += len(chunk)
                        if size > MAX_LOG:
                            raise Refusal("Actual raw command log exceeds bounded log budget")
                        log.write(chunk)
                        log.flush()
                code = process.wait()
                log.flush()
                os.fsync(fd)
            selector.close()
            if guard:
                guard.check(full=True)
        except BaseException as failure:
            error = f"{type(failure).__name__}: {failure}"
            if process and process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
            code = process.returncode if process else None
        finally:
            os.close(fd)
            if process and process.stdout:
                process.stdout.close()
        receipt = {**start, "completed_at": now(), "exit_code": code, "error": error,
                   "log": file_record(repository, log_rel, MAX_LOG)}
        exclusive(repository, receipt_rel, body(receipt))
        if error or code != 0:
            raise Refusal(f"Phase stopped (exit {code}): {error or 'official command failed'}; receipt {receipt_rel}")
        return receipt, file_record(repository, receipt_rel), read(repository, log_rel, MAX_LOG)


def helper_result(log):
    rows = [line.removeprefix(b"SERIAL_RESULT ") for line in log.splitlines() if line.startswith(b"SERIAL_RESULT ")]
    if len(rows) != 1:
        raise Refusal("One bounded official-helper result required")
    return json.loads(rows[0])


def verify_preflight(live_repository, token, ids, pin):
    prefix = "apps/frontend/" + BASE + "/runs/" + token + "/preflight"
    receipt = read_json(live_repository, prefix + ".receipt.json")
    if receipt.get("exit_code") != 0 or receipt.get("error") or receipt.get("command") != node_command(HELPER, "snapshot") or \
            receipt.get("command_sha256") != command_hash(receipt["command"]) or receipt.get("request_sha256") != digest(body({"ids": ids})):
        raise Refusal("Actual successful original snapshot receipt is missing or mismatched")
    assert_record(live_repository, receipt["log"], MAX_LOG)
    if helper_result(read(live_repository, receipt["log"]["path"], MAX_LOG)) != pin or [spot["id"] for spot in pin["spots"]] != ids:
        raise Refusal("Saved pin differs from the actual original snapshot result/selection")


def node_command(script, *args):
    return ["node", "--max-old-space-size=512", script, *args]


def phase_command(phase, id):
    if phase in ("simulate", "replay"):
        return node_command("scripts/postflop-ai/cli.mjs", "simulate" if phase == "simulate" else "audit", "--spot", id)
    if phase == "all-boards":
        return node_command("scripts/postflop-ai/audit-all-boards.mjs", "--spot", id, "--street", "all", "--workers", "1")
    raise Refusal("Unknown phase")


def pin_records(pin):
    return pin["sources"] + pin["inputs"] + [item for spot in pin["spots"] for item in spot["artifacts"].values()]


def clone_snapshot(live_repository, repository, pin):
    records = pin_records(pin) + pin.get("handoff_files", [])
    paths = [item["path"] for item in records]
    if len(paths) != len(set(paths)):
        raise Refusal("Duplicate pinned paths")
    size = sum(item["bytes"] for item in records)
    if size > MAX_FILE:
        raise Refusal("Snapshot exceeds bounded 256MiB copy budget")
    if shutil.disk_usage(repository.parent).free < size + 512 * 1024 * 1024:
        raise Refusal("Insufficient free storage for snapshot and bounded numerical output")
    repository.mkdir()
    for item in records:
        data = read(live_repository, item["path"], MAX_FILE)
        if digest(data) != item["sha256"] or len(data) != item["bytes"]:
            raise Refusal("Live bytes changed before snapshot copy")
        exclusive(repository, item["path"], data)  # Byte copies only: no symlinks/hard links.
    return size


def next_attempt(repository, phase_root):
    directory = safe(repository, phase_root, missing=True, directory=True)
    directory.mkdir(parents=True, exist_ok=True)
    numbers = []
    for path in directory.iterdir():
        if path.is_symlink():
            raise Refusal("Symlink attempt rejected")
        match = re.fullmatch(r"attempt-([0-9]{6})\.(?:start\.json|request\.json|log|receipt\.json|verify.*)", path.name)
        if match:
            numbers.append(int(match[1]))
    number = max(numbers, default=0) + 1
    if number > 999999:
        raise Refusal("Attempt budget exceeded")
    return f"{phase_root}/attempt-{number:06d}"


def validate_checkpoint(repository, completed, phase, id, pin, boundary, guard, control):
    if completed.get("schema_version") != 1 or completed.get("id") != id or completed.get("phase") != phase or completed.get("pin_sha256") != digest(body(pin)):
        raise Refusal("Completed phase identity differs")
    for record in [completed["receipt"], completed["verification_receipt"], *completed["evidence"].values()]:
        if isinstance(record, dict) and "path" in record:
            assert_record(repository, record, MAX_LOG if record["path"].endswith(".log") else MAX_FILE)
    receipt = read_json(repository, completed["receipt"]["path"])
    assert_record(repository, receipt["log"], MAX_LOG)
    verification = read_json(repository, completed["verification_receipt"]["path"])
    assert_record(repository, verification["log"], MAX_LOG)
    if verification.get("exit_code") != 0 or verification.get("error"):
        raise Refusal("Saved successful verification command/log required")
    if receipt["command"] != phase_command(phase, id):
        raise Refusal("Completed phase command differs from the permitted exact command")
    operation = {"simulate": "report", "replay": "replay", "all-boards": "all-boards"}[phase]
    request = {"id": id, "pin": pin, "receipt": receipt}
    if phase == "all-boards":
        request["proof_path"] = completed["evidence"]["proof"]["path"]
    _, _, log = boundary.run(node_command(HELPER, operation), repository / "apps/frontend", repository,
                             control + f"/recheck-{phase}-{uuid.uuid4().hex}", request, guard)
    if helper_result(log) != completed["evidence"]:
        raise Refusal("Saved proof differs from fresh hardened verification")


def run_phases(repository, id, pin, token, boundary, guard, verify_only=False):
    frontend = repository / "apps/frontend"
    control = f"apps/frontend/.local/postflop-ai/serial-control/{id}"
    results = {}
    for phase in PHASES:
        guard.check(full=True)
        report_path = next(spot for spot in pin["spots"] if spot["id"] == id)["report_path"]
        report_guard = None if phase == "simulate" else Guard([(repository, [file_record(repository, report_path)])])
        phase_guard = MultiGuard(guard, report_guard)
        phase_root = control + "/" + phase
        complete_path = phase_root + "/complete.json"
        path = safe(repository, complete_path, missing=True)
        if path.exists():
            completed = read_json(repository, complete_path)
            validate_checkpoint(repository, completed, phase, id, pin, boundary, phase_guard, control)
            results[phase] = completed
            continue
        if verify_only:
            raise Refusal("Verify-only requires every saved phase; numerical work will not start")
        if phase == "simulate":
            report = next(spot for spot in pin["spots"] if spot["id"] == id)["report_path"]
            if safe(repository, report, missing=True).exists():
                raise Refusal("Unproven report already exists; choose a fresh isolated run, never overwrite it")
        attempt = next_attempt(repository, phase_root)
        receipt, receipt_record, _ = boundary.run(phase_command(phase, id), frontend, repository, attempt, guard=phase_guard)
        request = {"id": id, "pin": pin, "receipt": receipt}
        operation = {"simulate": "report", "replay": "replay", "all-boards": "all-boards"}[phase]
        if phase == "all-boards":
            hash_ = next(spot for spot in pin["spots"] if spot["id"] == id)["all_board_identity_hash"]
            attempt_token = attempt.rsplit("/", 1)[-1]
            request["proof_path"] = f"apps/frontend/.local/postflop-ai/audit-evidence/{id}--{hash_}-serial-{token}-{attempt_token}-all-boards.json"
        _, verification_receipt, log = boundary.run(node_command(HELPER, operation), frontend, repository,
                                                    attempt + ".verify", request, phase_guard)
        evidence = helper_result(log)
        completed = {"schema_version": 1, "id": id, "phase": phase, "pin_sha256": digest(body(pin)),
                     "receipt": receipt_record, "verification_receipt": verification_receipt, "evidence": evidence,
                     "completed_at": now(), "review_approved": False}
        exclusive(repository, complete_path, body(completed))
        results[phase] = completed
        print(json.dumps({"event": "phase-complete", "spot": id, "phase": phase, "proofs": evidence}), flush=True)
    # Numerical completeness is intentionally not independent acceptance.
    completed = {"schema_version": 1, "id": id, "status": "numerical-complete-unapproved", "review_approved": False,
                 "pin_sha256": digest(body(pin)), "phases": results}
    path = control + "/numerical-complete.json"
    if safe(repository, path, missing=True).exists():
        if read_json(repository, path) != completed:
            raise Refusal("Prior numerical completion differs")
    else:
        exclusive(repository, path, body(completed))
    return completed


def export_manifest(repository, pin, token, completions):
    for item in pin.get("handoff_files", []):
        assert_record(repository, item)
    records, receipts = {}, {}
    for completion in completions:
        for phase, value in completion["phases"].items():
            for kind, item in value["evidence"].items():
                if isinstance(item, dict) and "path" in item:
                    assert_record(repository, item)
                    records[item["path"]] = {**item, "spot": completion["id"], "kind": "replay-proof" if phase == "replay" and kind == "proof" else "all-board-proof" if phase == "all-boards" and kind == "proof" else kind,
                                              "destination_path": item["path"]}
            for record in (value["receipt"], value["verification_receipt"]):
                assert_record(repository, record)
                receipts[record["path"]] = record
                actual = read_json(repository, record["path"])
                assert_record(repository, actual["log"], MAX_LOG)
                receipts[actual["log"]["path"]] = actual["log"]
    return {"schema_version": 1, "run": token, "status": "numerical-complete-unapproved", "review_approved": False,
            "pin_sha256": digest(body(pin)), "repository": str(repository),
            "packaging_only_files": pin.get("handoff_files", []),
            "files": [records[path] for path in sorted(records)], "execution_evidence": [receipts[path] for path in sorted(receipts)],
            "promotion_policy": "Explicit coordinator handoff only. Reverify live pin; byte-copy only to exact destination paths; reuse identical bytes; refuse differing existing bytes; retain original run receipts/logs."}


def stage_b_gate(frontend, selected, catalog, boundary, *, storage_budget=8192 * 1024 * 1024, run_budget=1024 * 1024 * 1024):
    if not any(catalog[id]["stage"] == "B" for id in selected):
        return Guard([])
    b_order = sorted([row for row in catalog.values() if row["stage"] == "B"], key=lambda row: (-row["reach"], row["id"]))
    needed = {id for id, row in catalog.items() if row["stage"] == "A"}
    last = max(index for index, row in enumerate(b_order) if row["id"] in selected)
    needed.update(row["id"] for row in b_order[:last] if row["id"] not in selected)
    runs = safe(frontend, BASE + "/runs", missing=True, directory=True)
    candidates = sorted(runs.iterdir()) if runs.exists() else []
    if len(candidates) > 4096:
        raise Refusal("Run-history scan exceeds explicit storage budget")
    admitted = {}
    def retain(root, record):
        key = (str(root), record["path"])
        if key in admitted and admitted[key][1] != record:
            raise Refusal("Conflicting Stage B prerequisite identity")
        admitted[key] = (root, record)
    for run in candidates:
        if run.is_symlink() or not run.is_dir() or not RUN_RE.fullmatch(run.name):
            raise Refusal("Unsafe run-history entry")
        repository = run / "repository"
        if not repository.exists():
            continue
        pin = read_json(run, "pin.json")
        for spot in pin["spots"]:
            id = spot["id"]
            if id not in needed:
                continue
            control = f"apps/frontend/.local/postflop-ai/serial-control/{id}"
            complete_path = control + "/numerical-complete.json"
            if not safe(repository, complete_path, missing=True).exists():
                continue
            # The live source/input/policy hashes must still be exactly those
            # validated in that isolated repository. Never trust a summary flag.
            records = pin["sources"] + pin["inputs"] + list(spot["artifacts"].values())
            try:
                guard = MultiGuard(Guard([(Path(frontend).parents[1], records), (repository, records)]),
                                   Guard([], storage=runs, budget=storage_budget), Guard([], storage=run, budget=run_budget))
                completion = read_json(repository, complete_path)
                if completion.get("status") != "numerical-complete-unapproved" or completion.get("pin_sha256") != digest(body(pin)):
                    continue
                for phase in PHASES:
                    validate_checkpoint(repository, completion["phases"][phase], phase, id, pin, boundary, guard, control)
            except BudgetRefusal:
                raise
            except (Refusal, KeyError):
                if boundary.interrupted:
                    raise Refusal("Interrupted during Stage B prerequisite verification")
                continue
            needed.remove(id)
            for record in records:
                retain(Path(frontend).parents[1], record)
            for phase in PHASES:
                value = completion["phases"][phase]
                for record in (value["receipt"], value["verification_receipt"], *value["evidence"].values()):
                    if isinstance(record, dict) and "path" in record:
                        retain(repository, record)
                for saved in (value["receipt"], value["verification_receipt"]):
                    actual = read_json(repository, saved["path"])
                    retain(repository, actual["log"])
    if needed:
        raise Refusal(f"Stage B blocked: {len(needed)} Stage A / earlier frequency-ordered Stage B spots lack current full saved proofs")
    # Recheck admission as one set and keep it monitored throughout the B batch.
    grouped = {}
    for root, record in admitted.values():
        grouped.setdefault(root, []).append(record)
    return Guard(list(grouped.items()))


def main(argv=None, boundary=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spot", action="append", default=[])
    parser.add_argument("--manifest", help="frontend-relative bounded manifest; schema_version=1, spot_ids=[1..4 IDs]")
    parser.add_argument("--resume", help="exact existing run token, with the original selection")
    parser.add_argument("--execute", action="store_true", help="coordinator has released the shared numerical slot")
    parser.add_argument("--verify-only", action="store_true", help="with --resume, reverify saved phases; refuse any missing phase without numerical work")
    parser.add_argument("--max-run-mib", type=int, default=1024)
    parser.add_argument("--max-storage-mib", type=int, default=8192)
    args = parser.parse_args(argv)
    frontend = Path.cwd().absolute()
    live_repository = frontend.parents[1]
    if not 128 <= args.max_run_mib <= 4096 or not args.max_run_mib <= args.max_storage_mib <= 32768:
        raise Refusal("Explicit bounded storage limits required (run 128..4096MiB; total <=32768MiB)")
    ids, catalog = selections(frontend, args.spot, args.manifest)
    if args.verify_only and not args.resume:
        raise Refusal("Verify-only requires an explicit existing --resume token")
    if not args.execute:
        print(json.dumps({"status": "plan-only", "spot_ids": ids, "phases": list(PHASES), "samples": 10000, "canonical_flops": 1755,
                          "batch_limit": 4, "max_run_mib": args.max_run_mib, "max_storage_mib": args.max_storage_mib,
                          "note": "No Node or numerical child started; execute only with the coordinator's released slot"}))
        return 0
    boundary = boundary or Boundary()
    for number in (signal.SIGINT, signal.SIGTERM):
        signal.signal(number, boundary.interrupt)
    with OwnerLock(frontend):
        storage = safe(frontend, BASE + "/runs", missing=True, directory=True)
        storage.mkdir(parents=True, exist_ok=True)
        if tree_bytes(storage) >= args.max_storage_mib * 1024 * 1024:
            raise Refusal("Existing run storage already exceeds the explicit total budget")
        prerequisite_guard = stage_b_gate(frontend, ids, catalog, boundary,
                                         storage_budget=args.max_storage_mib * 1024 * 1024, run_budget=args.max_run_mib * 1024 * 1024)
        token = args.resume or ("run-" + dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex)
        if not RUN_RE.fullmatch(token):
            raise Refusal("Unsafe resume token")
        run = storage / token
        if args.resume:
            safe(frontend, BASE + "/runs/" + token, directory=True)
            selection = read_json(run, "selection.json")
            if selection["spot_ids"] != ids:
                raise Refusal("Resume selection must match the original disjoint batch exactly")
            pin = read_json(run, "pin.json")
            verify_preflight(live_repository, token, ids, pin)
        else:
            run.mkdir()
            exclusive(run, "selection.json", body({"schema_version": 1, "spot_ids": ids, "created_at": now()}))
            prefix = "apps/frontend/" + BASE + "/runs/" + token + "/preflight"
            preflight_guard = MultiGuard(Guard([], storage=storage, budget=args.max_storage_mib * 1024 * 1024),
                                        Guard([], storage=run, budget=args.max_run_mib * 1024 * 1024))
            _, _, log = boundary.run(node_command(HELPER, "snapshot"), frontend, live_repository, prefix, {"ids": ids}, preflight_guard)
            pin = helper_result(log)
            exclusive(run, "pin.json", body(pin))
            copied = clone_snapshot(live_repository, run / "repository", pin)
            print(json.dumps({"event": "snapshot-created", "run": token, "copied_bytes": copied,
                              "max_run_bytes": args.max_run_mib * 1024 * 1024, "max_total_storage_bytes": args.max_storage_mib * 1024 * 1024}), flush=True)
        repository = run / "repository"
        records = pin_records(pin)
        guard = Guard([(live_repository, records), (repository, records)], storage=storage, budget=args.max_storage_mib * 1024 * 1024)
        run_guard = Guard([], storage=run, budget=args.max_run_mib * 1024 * 1024)
        combined_guard = MultiGuard(guard, run_guard, prerequisite_guard)
        completions = [run_phases(repository, id, pin, token, boundary, combined_guard, args.verify_only) for id in ids]
        exported = export_manifest(repository, pin, token, completions)
        export_path = "export-manifest.json"
        if safe(run, export_path, missing=True).exists():
            if read_json(run, export_path) != exported:
                raise Refusal("Prior verified export manifest differs")
        else:
            exclusive(run, export_path, body(exported))
        print(json.dumps({"status": "numerical-complete-unapproved", "run": token, "spot_ids": ids, "review_approved": False,
                          "repository": str(repository), "export_manifest": str(run / export_path),
                          "promotion": "explicit verified no-overwrite handoff required"}), flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (Refusal, OSError, ValueError, KeyError) as error:
        print(f"STOPPED: {error}", file=sys.stderr, flush=True)
        raise SystemExit(1)
