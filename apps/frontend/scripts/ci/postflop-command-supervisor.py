"""Measured LOCAL command lifecycle; never turns a signal into a SQL exit.

The parent launches this script in a new owned session/group. Importer output is
bounded in separate evidence files, so it cannot exhaust the parent's pipe.
Linux subreaping plus parent-side identity-bound cleanup cover owned descendants.
"""
import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import resource
import selectors
import signal
import subprocess
import sys
import time


def process_record(pid):
    try:
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        return {"pid": int(pid), "state": fields[0], "ppid": int(fields[1]),
                "pgid": int(fields[2]), "sid": int(fields[3]), "start_ticks": int(fields[19]),
                "rss_kib": max(0, int(fields[21])) * os.sysconf("SC_PAGE_SIZE") // 1024}
    except (OSError, ValueError, IndexError):
        return None


def signal_name(number):
    try:
        return signal.Signals(number).name
    except ValueError:
        return f"SIGNAL_{number}"


def processes():
    return {int(name): record for name in os.listdir("/proc") if name.isdigit()
            if (record := process_record(int(name))) is not None}


def atomic_json(path, value):
    temporary = path.with_name(path.name + ".next")
    with temporary.open("x") as stream:
        json.dump(value, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def discover_owned(lease, table):
    """Expand only currently birth-matching ancestry in one proc snapshot.

    The supervisor is a discovery anchor for previously unseen adopted children,
    including descendants that detached before their original parent exited. It
    is never an owned-child signal/reap candidate. Saved numeric PIDs alone grant
    no ownership: every parent must still have its saved birth in this snapshot.
    """
    supervisor = lease["supervisor_pid"]
    if supervisor != lease["group_id"] or lease["supervisor_start_ticks"] != lease["group_start_ticks"]:
        raise RuntimeError("Inconsistent supervisor/group birth identity")
    leader = table.get(supervisor)
    if leader and leader["start_ticks"] != lease["supervisor_start_ticks"]:
        raise RuntimeError("Refuse PID-reused process group")
    if leader and (leader["pgid"] != supervisor or leader["sid"] != supervisor):
        raise RuntimeError("Refuse changed supervisor session/group")
    known = {item["pid"]: dict(item) for item in lease.get("owned", []) if item["pid"] != supervisor}
    if leader:
        known[supervisor] = {"pid": supervisor, "start_ticks": lease["supervisor_start_ticks"]}
    conflicts = lease.setdefault("ownership_conflicts", [])
    def remember(record, basis):
        expected = known.get(record["pid"])
        if expected and expected["start_ticks"] != record["start_ticks"]:
            conflict = {"pid": record["pid"], "expected_start_ticks": expected["start_ticks"],
                        "observed_start_ticks": record["start_ticks"], "basis": basis}
            if not any(all(old[key] == conflict[key] for key in
                           ("pid", "expected_start_ticks", "observed_start_ticks")) for old in conflicts):
                conflicts.append(conflict)
            return False  # Never overwrite a saved birth or signal the new birth.
        if not expected:
            known[record["pid"]] = {"pid": record["pid"], "start_ticks": record["start_ticks"]}
            return True
        return False
    for record in table.values():
        if record["pid"] != supervisor and record["pgid"] == supervisor and record["sid"] == supervisor:
            remember(record, "owned-session")
    changed = True
    while changed:
        changed = False
        for record in table.values():
            expected_parent = known.get(record["ppid"])
            current_parent = table.get(record["ppid"])
            if record["pid"] != supervisor and expected_parent and current_parent and \
                    current_parent["start_ticks"] == expected_parent["start_ticks"]:
                changed = remember(record, "verified-ancestry") or changed
    known.pop(supervisor, None)
    live, zombies = [], []
    for pid, expected in known.items():
        actual = table.get(pid)
        if not actual or actual["start_ticks"] != expected["start_ticks"]:
            continue
        (zombies if actual["state"] == "Z" else live).append(actual)
    lease["owned"] = list(known.values())
    return live, zombies


def owned_records(lease):
    return discover_owned(lease, processes())


def signal_owned(lease, number):
    live, _ = owned_records(lease)
    signaled = []
    for record in live:
        current = process_record(record["pid"])
        if current and current["start_ticks"] == record["start_ticks"]:
            try:
                os.kill(record["pid"], number)
                signaled.append(record["pid"])
            except ProcessLookupError:
                pass
    return signaled


def cleanup_identity(lease):
    return {key: lease.get(key) for key in ("command_id", "supervisor_pid", "supervisor_start_ticks",
            "group_id", "group_start_ticks", "child_pid", "child_start_ticks")}


def reap_owned(lease, child):
    live, zombies = owned_records(lease)
    reaped = []
    for item in live + zombies:
        if child is not None and item["pid"] == child.pid:
            continue  # Popen owns the actual command child's wait status.
        current = process_record(item["pid"])
        if not current or current["start_ticks"] != item["start_ticks"]:
            continue
        try:
            pid, status = os.waitpid(item["pid"], os.WNOHANG)
            if pid:
                reaped.append({"pid": pid, "start_ticks": item["start_ticks"],
                               "returncode": os.waitstatus_to_exitcode(status)})
        except ChildProcessError:
            pass
    return reaped


def completed_discovery(lease):
    # Only the live, birth-verified subreaper can discover newly adopted detached
    # descendants. After its loss a parent needs its final anchored cleanup proof;
    # an empty saved PID list cannot establish that an unseen descendant is absent.
    if lease.get("ownership_conflicts"):
        return False  # Historical/current birth ambiguity cannot release ownership.
    current = process_record(lease["supervisor_pid"])
    if current and current["start_ticks"] == lease["supervisor_start_ticks"]:
        return os.getpid() == lease["supervisor_pid"]
    final = lease.get("final_cleanup", {})
    return lease.get("supervision_complete") is True and final.get("complete") is True and \
        final.get("ownership_discovery_complete") is True and all(
            final.get(key) == value for key, value in cleanup_identity(lease).items())


def cleanup_owned(lease, grace_seconds, child=None):
    term = signal_owned(lease, signal.SIGTERM)
    deadline = time.monotonic() + grace_seconds
    reaped = []
    while time.monotonic() < deadline:
        if child is not None:
            child.poll()
        reaped.extend(reap_owned(lease, child))
        live, zombies = owned_records(lease)
        if not live and not zombies:
            break
        # Rescan after reaping: late orphan adoption belongs to our live anchor.
        time.sleep(0.02)
    killed = signal_owned(lease, signal.SIGKILL)
    if child is not None and child.poll() is None:
        try:
            child.wait(timeout=grace_seconds)
        except subprocess.TimeoutExpired:
            pass
    deadline = time.monotonic() + grace_seconds
    while time.monotonic() < deadline:
        reaped.extend(reap_owned(lease, child))
        live, zombies = owned_records(lease)
        if not live and not zombies:
            break
        time.sleep(0.02)
    live, zombies = owned_records(lease)
    discovered = completed_discovery(lease)
    return {**cleanup_identity(lease), "ownership_discovery_complete": discovered,
            "ownership_conflicts": list(lease.get("ownership_conflicts", [])),
            "complete": discovered and not live and not zombies,
            "no_live_owned_processes": not live and not lease.get("ownership_conflicts"),
            "remaining_live": live, "remaining_zombies": zombies, "term_pids": term,
            "kill_pids": killed, "reaped": reaped}


def supervise(options):
    directory = Path(options.directory)
    pid = os.getpid()
    if os.getpgrp() != pid or os.getsid(0) != pid:
        raise RuntimeError("Supervisor requires its own parent-created session/group")
    birth = process_record(pid)
    if not birth:
        raise RuntimeError("Missing supervisor birth identity")
    # Only this temporary supervisor adopts/reaps its own orphaned descendants.
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:  # Linux PR_SET_CHILD_SUBREAPER
        raise OSError(ctypes.get_errno(), "Cannot enable owned-child subreaping")
    lease = {"schema_version": 1, "command_id": options.command_id, "group_id": pid,
             "group_start_ticks": birth["start_ticks"], "supervisor_pid": pid,
             "supervisor_start_ticks": birth["start_ticks"], "supervision_complete": False,
             "ownership_conflicts": [], "owned": []}
    atomic_json(directory / "lease.json", lease)
    interrupted = [None]
    def interrupted_handler(number, _frame):
        interrupted[0] = number
    signal.signal(signal.SIGTERM, interrupted_handler)
    signal.signal(signal.SIGINT, interrupted_handler)
    child = None
    started = time.monotonic()
    reason = None
    timed_out = False
    secondary = []
    max_group_rss = 0
    streams = {"stdout": {"seen_bytes": 0, "retained_bytes": 0}, "stderr": {"seen_bytes": 0, "retained_bytes": 0}}
    selector = selectors.DefaultSelector()
    output = {name: (directory / (name + ".log")).open("xb") for name in streams}
    cleanup = None
    cleanup_history = []
    try:
        # Inherit the owned session/group; no importer is detached behind the parent.
        child = subprocess.Popen(options.command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, bufsize=0)
        record = process_record(child.pid)
        if not record:
            raise RuntimeError("Missing child birth identity")
        lease["child_pid"] = child.pid
        lease["child_start_ticks"] = record["start_ticks"]
        lease["owned"].append({"pid": child.pid, "start_ticks": record["start_ticks"]})
        atomic_json(directory / "lease.json", lease)
        for name, pipe in (("stdout", child.stdout), ("stderr", child.stderr)):
            os.set_blocking(pipe.fileno(), False)
            selector.register(pipe, selectors.EVENT_READ, name)
        exit_observed = None
        while selector.get_map() or child.poll() is None:
            live, _ = owned_records(lease)
            max_group_rss = max(max_group_rss, sum(row["rss_kib"] for row in live))
            atomic_json(directory / "lease.json", lease)
            if interrupted[0] is not None:
                reason = "supervisor-interrupted"
            elif time.monotonic() - started >= options.timeout_ms / 1000:
                reason, timed_out = "timeout", True
            elif max_group_rss > options.rss_limit_kib:
                reason = "resource-limit"
            elif len(live) > 64:
                reason = "owned-process-limit"
            elif lease["ownership_conflicts"]:
                reason = "ownership-birth-conflict"
            if reason:
                cleanup = cleanup_owned(lease, options.cleanup_ms / 1000, child)
                cleanup_history.append(cleanup)
                break
            if child.poll() is not None:
                exit_observed = exit_observed or time.monotonic()
                if live and time.monotonic() - exit_observed > 0.2:
                    reason = "descendant-leak"
                    cleanup = cleanup_owned(lease, options.cleanup_ms / 1000, child)
                    cleanup_history.append(cleanup)
                    break
            for key, _ in selector.select(0.02):
                try:
                    body = os.read(key.fileobj.fileno(), 64 * 1024)
                except BlockingIOError:
                    continue
                if not body:
                    selector.unregister(key.fileobj)
                    continue
                name = key.data
                streams[name]["seen_bytes"] += len(body)
                available = options.output_bytes - streams[name]["retained_bytes"]
                retained = body[:max(0, available)]
                output[name].write(retained)
                streams[name]["retained_bytes"] += len(retained)
                if len(retained) != len(body):
                    reason = "output-limit"
                    cleanup = cleanup_owned(lease, options.cleanup_ms / 1000, child)
                    cleanup_history.append(cleanup)
                    break
            if reason:
                break
        if child.poll() is None:
            child.wait(timeout=options.cleanup_ms / 1000)
        if reason is None:
            reason = "child-signal" if child.returncode < 0 else "normal-exit"
    except BaseException as error:
        reason = "spawn-failure" if child is None else "supervisor-error"
        secondary.append({"type": type(error).__name__, "message": str(error)})
    finally:
        try:
            cleanup = cleanup_owned(lease, options.cleanup_ms / 1000, child)
            cleanup_history.append(cleanup)
        except BaseException as error:
            secondary.append({"type": "cleanup-error", "message": str(error)})
            cleanup = {**cleanup_identity(lease), "complete": False, "ownership_discovery_complete": False,
                       "ownership_conflicts": list(lease.get("ownership_conflicts", [])),
                       "no_live_owned_processes": False, "remaining_live": [], "remaining_zombies": []}
        # Drain bounded remaining pipe data after termination, especially stderr
        # diagnostics printed before a stdout overflow/timeout. Never grow caps.
        deadline = time.monotonic() + 0.5
        while selector.get_map() and time.monotonic() < deadline:
            for key, _ in selector.select(0.02):
                try:
                    body = os.read(key.fileobj.fileno(), 64 * 1024)
                except BlockingIOError:
                    continue
                if not body:
                    selector.unregister(key.fileobj)
                    continue
                name = key.data
                streams[name]["seen_bytes"] += len(body)
                available = options.output_bytes - streams[name]["retained_bytes"]
                retained = body[:max(0, available)]
                output[name].write(retained)
                streams[name]["retained_bytes"] += len(retained)
        for stream in output.values():
            stream.flush()
            os.fsync(stream.fileno())
            stream.close()
        selector.close()
    if reason == "normal-exit" and lease["ownership_conflicts"]:
        reason = "ownership-birth-conflict"
    if reason == "normal-exit" and any(item.get("term_pids") or item.get("kill_pids") or
                                          any(row["returncode"] < 0 for row in item.get("reaped", []))
                                          for item in cleanup_history):
        reason = "owned-descendant-interrupted"
    actual = child.returncode if child is not None else None
    usage = resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
    if max(usage, max_group_rss) > options.rss_limit_kib:
        reason = "resource-limit"
    metric = {"schema_version": 1, "command_id": options.command_id, "supervisor_pid": pid,
              "group_id": pid, "group_start_ticks": birth["start_ticks"],
              "supervisor_start_ticks": birth["start_ticks"], "child_pid": child.pid if child else None,
              "child_start_ticks": lease.get("child_start_ticks"),
              "actual_returncode": actual, "normal_exit": reason == "normal-exit" and actual is not None and actual >= 0,
              "classification": reason, "timed_out": timed_out, "interrupted_signal": interrupted[0],
              "child_signal_number": -actual if actual is not None and actual < 0 else None,
              "child_signal_name": signal_name(-actual) if actual is not None and actual < 0 else None,
              "max_rss_kib": usage, "observed_owned_group_rss_kib": max_group_rss,
              "elapsed_seconds": time.monotonic() - started, "streams": streams,
              "cleanup": cleanup, "cleanup_history": cleanup_history, "secondary_causes": secondary,
              "ownership_conflicts": list(lease["ownership_conflicts"]),
              "complete": actual is not None and cleanup["complete"], "supervisor_exit_status": 0}
    atomic_json(directory / "resource.json", metric)
    lease["final_cleanup"] = cleanup
    # A launch exception is retained as explicit spawn-failure evidence. This
    # conservative contract issues no final parent discovery handoff after any
    # exception, even when live-anchor cleanup locally found no remaining child.
    # Parent uncertainty must retain state; it cannot become SQL failure proof.
    lease["supervision_complete"] = cleanup["complete"] and not secondary
    atomic_json(directory / "lease.json", lease)
    return metric


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True)
    parser.add_argument("--command-id", required=True)
    parser.add_argument("--timeout-ms", type=int, default=600000)
    parser.add_argument("--cleanup-ms", type=int, default=2000)
    parser.add_argument("--output-bytes", type=int, default=32 * 1024 * 1024)
    parser.add_argument("--rss-limit-kib", type=int, default=3 * 1024 * 1024)
    parser.add_argument("--cleanup-pid", type=int)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    options = parser.parse_args()
    if options.cleanup_pid is not None:
        lease = json.loads((Path(options.directory) / "lease.json").read_text())
        if lease["schema_version"] != 1 or lease["command_id"] != options.command_id or \
                lease["group_id"] != options.cleanup_pid or lease["supervisor_pid"] != options.cleanup_pid or \
                lease["supervisor_start_ticks"] != lease["group_start_ticks"] or options.cleanup_pid <= 1:
            raise RuntimeError("Refuse cleanup of another command/group")
        result = cleanup_owned(lease, options.cleanup_ms / 1000)
        atomic_json(Path(options.directory) / "parent-cleanup.json", result)
        print(json.dumps(result))
    else:
        if options.command and options.command[0] == "--":
            options.command = options.command[1:]
        supervise(options)


if __name__ == "__main__":
    main()
