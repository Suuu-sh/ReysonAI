"""Mock the process boundary: never run Node, simulations, models or audits."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import tempfile
import unittest
from unittest.mock import patch

FRONTEND = Path(__file__).absolute().parents[1]
spec = importlib.util.spec_from_file_location("serial_validation", FRONTEND / "scripts/postflop-ai/serial-validation.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class FakeBoundary:
    def __init__(self, failure=None):
        self.calls, self.failure, self.interrupted = [], failure, None

    def run(self, command, cwd, repository, prefix, request=None, guard=None):
        self.calls.append((command, request))
        if guard:
            guard.check(full=True)
        id = request["id"] if request and "id" in request else command[command.index("--spot") + 1]
        is_helper = runner.HELPER in command
        operation = command[-1] if is_helper else ("all-boards" if "scripts/postflop-ai/audit-all-boards.mjs" in command else "simulate" if "simulate" in command else "replay")
        report_path = f"apps/frontend/.local/postflop-ai/{id.lower()}-hu-v1-report.json"
        proof_path = f"apps/frontend/.local/postflop-ai/audit-evidence/{id}-replay-123.json"
        if not is_helper and operation == "simulate":
            runner.exclusive(repository, report_path, b'{"results":[]}\n')
        if not is_helper and operation == "replay":
            runner.exclusive(repository, proof_path, b'{"fixed_seed_replay_pass":true}\n')
        evidence = None
        if is_helper:
            report = runner.file_record(repository, report_path)
            if operation == "report":
                evidence = {"report": report, "comparisons": 72, "samples": 10000}
            elif operation == "replay":
                evidence = {"proof": runner.file_record(repository, proof_path), "report": report, "comparisons": 72, "warnings": 3}
            elif operation == "all-boards":
                paths = {"proof": request["proof_path"], "summary": f"apps/frontend/.local/postflop-ai/all-boards-audit/{id}--{'a' * 64}.json",
                         "companion": f"apps/frontend/.local/postflop-ai/all-boards-audit/{id}--{'a' * 64}.checkpoints.json"}
                for path in paths.values():
                    if not runner.safe(repository, path, missing=True).exists():
                        runner.exclusive(repository, path, b'{"mock":true}\n')
                evidence = {**{key: runner.file_record(repository, value) for key, value in paths.items()}, "boards": 1755,
                            "evaluated_boards": 1700, "unreachable": 55, "errors": 0, "warnings": 2}
        log = b"mock actual command log\n" if evidence is None else b"SERIAL_RESULT " + runner.body(evidence)
        runner.exclusive(repository, prefix + ".log", log)
        receipt = {"schema_version": 1, "command": command, "command_sha256": runner.command_hash(command), "started_at": runner.now(),
                   "completed_at": runner.now(), "exit_code": 1 if self.failure == operation else 0, "error": None,
                   "log": runner.file_record(repository, prefix + ".log")}
        runner.exclusive(repository, prefix + ".receipt.json", runner.body(receipt))
        if self.failure == operation:
            raise runner.Refusal("mock failed phase")
        return receipt, runner.file_record(repository, prefix + ".receipt.json"), log


class SerialValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.repo = self.root / "repository"
        self.repo.mkdir()
        self.frontend = self.repo / "apps/frontend"
        self.frontend.mkdir(parents=True)
        self.id = "A_spot_0"
        rows = [{"id": f"{stage}_spot_{index}", "slug": f"{stage.lower()}-spot-{index}-hu-v1", "stage": stage,
                 "reachable": True, "history": [{"seat": "BTN", "action": "open"}], "reach": (index + 1) / 10000}
                for stage, count in (("A", 137), ("B", 270)) for index in range(count)]
        rows.append({"id": "BTN_open_BB_call", "reachable": True, "history": None})
        runner.exclusive(self.frontend, runner.CATALOG, runner.body({"spots": rows}))
        self.pin = {"schema_version": 1, "kind": "local-serial-validation-pin", "sources": [], "inputs": [],
                    "spots": [{"id": self.id, "slug": self.id.lower() + "-hu-v1", "stage": "A", "artifacts": {},
                               "report_path": f"apps/frontend/.local/postflop-ai/{self.id.lower()}-hu-v1-report.json",
                               "all_board_identity_hash": "a" * 64}]}
        self.guard = runner.Guard([])
        self.token = "run-20261004T120000Z-" + "b" * 32

    def tearDown(self):
        self.temp.cleanup()

    def test_unknown_legacy_unreachable_and_duplicate_ids_rejected(self):
        for ids in (["unknown"], ["BTN_open_BB_call"], [self.id, self.id], ["../A_spot_0"], ["A_spot_0/child"], ["A_spot_0"] * 5):
            with self.subTest(ids=ids), self.assertRaises(runner.Refusal):
                runner.selections(self.frontend, ids)

    def test_four_id_bound_and_stage_b_frequency_order(self):
        ids, _ = runner.selections(self.frontend, ["B_spot_0", "A_spot_4", "B_spot_269", "A_spot_0"])
        self.assertEqual(ids, ["A_spot_0", "A_spot_4", "B_spot_269", "B_spot_0"])

    def test_manifest_is_exact_bounded_and_disjoint(self):
        runner.exclusive(self.frontend, "batch.json", runner.body({"schema_version": 1, "spot_ids": [self.id]}))
        self.assertEqual(runner.selections(self.frontend, [], "batch.json")[0], [self.id])
        with self.assertRaises(runner.Refusal):
            runner.selections(self.frontend, [self.id], "batch.json")
        runner.exclusive(self.frontend, "bad.json", runner.body({"schema_version": 1, "spot_ids": [self.id], "command": "generate"}))
        with self.assertRaises(runner.Refusal):
            runner.selections(self.frontend, [], "bad.json")

    def test_paths_symlinks_and_traversal_rejected(self):
        runner.exclusive(self.repo, "good/file.json", b"{}")
        (self.repo / "alias").symlink_to(self.repo / "good", target_is_directory=True)
        (self.repo / "dangling").symlink_to(self.repo / "missing")
        for path in ("../outside", "/tmp/outside", "good/../file.json", "alias/file.json", "dangling/child", "good//file.json"):
            with self.subTest(path=path), self.assertRaises(runner.Refusal):
                runner.safe(self.repo, path, missing=True)

    def test_symlink_root_rejected(self):
        alias = self.root / "alias-root"
        alias.symlink_to(self.repo, target_is_directory=True)
        with self.assertRaises(runner.Refusal):
            runner.safe(alias, "anything", missing=True)

    def test_exclusive_write_never_overwrites(self):
        runner.exclusive(self.repo, "data.json", b"prior")
        with self.assertRaises(FileExistsError):
            runner.exclusive(self.repo, "data.json", b"next")
        self.assertEqual(runner.read(self.repo, "data.json"), b"prior")

    def test_single_owner_lock_and_clean_release(self):
        with runner.OwnerLock(self.frontend):
            with self.assertRaises(runner.Refusal):
                with runner.OwnerLock(self.frontend):
                    self.fail("two owners")
        with runner.OwnerLock(self.frontend):
            pass

    def test_guard_detects_source_or_policy_change(self):
        runner.exclusive(self.repo, "source.mjs", b"source")
        record = runner.file_record(self.repo, "source.mjs")
        guard = runner.Guard([(self.repo, [record])])
        (self.repo / "source.mjs").write_bytes(b"changed")
        with self.assertRaises(runner.Refusal):
            guard.check()

    def test_guard_detects_replacement_and_symlink(self):
        runner.exclusive(self.repo, "policy.json", b"same")
        guard = runner.Guard([(self.repo, [runner.file_record(self.repo, "policy.json")])])
        (self.repo / "policy.json").unlink()
        (self.repo / "policy.json").symlink_to(self.frontend / runner.CATALOG)
        with self.assertRaises(runner.Refusal):
            guard.check()

    def test_storage_budget_stops_without_numerical_acceptance(self):
        runner.exclusive(self.repo, "large.log", b"12345")
        with self.assertRaises(runner.Refusal):
            runner.Guard([], storage=self.repo, budget=4).check(full=True)

    def test_snapshot_is_byte_copy_not_hard_link(self):
        live = self.root / "live"
        live.mkdir()
        runner.exclusive(live, "apps/frontend/source.mjs", b"fixed")
        pin = {"sources": [runner.file_record(live, "apps/frontend/source.mjs")], "inputs": [], "spots": []}
        target = self.root / "isolated"
        copied = runner.clone_snapshot(live, target, pin)
        self.assertEqual(copied, 5)
        self.assertNotEqual((live / "apps/frontend/source.mjs").stat().st_ino, (target / "apps/frontend/source.mjs").stat().st_ino)
        (target / "apps/frontend/source.mjs").write_bytes(b"new")
        self.assertEqual((live / "apps/frontend/source.mjs").read_bytes(), b"fixed")

    def test_exact_official_commands_and_fresh_replay(self):
        boundary = FakeBoundary()
        result = runner.run_phases(self.repo, self.id, self.pin, self.token, boundary, self.guard)
        heavy = [command for command, request in boundary.calls if request is None]
        self.assertEqual(heavy, [runner.phase_command(phase, self.id) for phase in runner.PHASES])
        self.assertEqual(result["status"], "numerical-complete-unapproved")
        self.assertFalse(result["review_approved"])
        self.assertEqual(result["phases"]["simulate"]["evidence"]["samples"], 10000)
        self.assertEqual(result["phases"]["all-boards"]["evidence"]["boards"], 1755)
        self.assertIn("audit", heavy[1])
        self.assertNotIn("simulate", heavy[1])

    def test_resume_reverifies_actual_saved_proofs_without_heavy_recompute(self):
        first = FakeBoundary()
        runner.run_phases(self.repo, self.id, self.pin, self.token, first, self.guard)
        resumed = FakeBoundary()
        runner.run_phases(self.repo, self.id, self.pin, self.token, resumed, self.guard)
        self.assertEqual(len(resumed.calls), 3)
        self.assertTrue(all(runner.HELPER in command for command, _ in resumed.calls))

    def test_resume_rejects_missing_proof(self):
        complete = runner.run_phases(self.repo, self.id, self.pin, self.token, FakeBoundary(), self.guard)
        (self.repo / complete["phases"]["replay"]["evidence"]["proof"]["path"]).unlink()
        with self.assertRaises(runner.Refusal):
            runner.run_phases(self.repo, self.id, self.pin, self.token, FakeBoundary(), self.guard)

    def test_resume_rejects_missing_original_helper_log(self):
        completed = runner.run_phases(self.repo, self.id, self.pin, self.token, FakeBoundary(), self.guard)
        receipt = runner.read_json(self.repo, completed["phases"]["simulate"]["verification_receipt"]["path"])
        (self.repo / receipt["log"]["path"]).unlink()
        with self.assertRaises(runner.Refusal):
            runner.run_phases(self.repo, self.id, self.pin, self.token, FakeBoundary(), self.guard)

    def test_original_preflight_result_pins_resume_identity(self):
        prefix = "apps/frontend/" + runner.BASE + "/runs/" + self.token + "/preflight"
        log = b"SERIAL_RESULT " + runner.body(self.pin)
        runner.exclusive(self.repo, prefix + ".log", log)
        command = runner.node_command(runner.HELPER, "snapshot")
        receipt = {"exit_code": 0, "error": None, "command": command, "command_sha256": runner.command_hash(command),
                   "request_sha256": runner.digest(runner.body({"ids": [self.id]})), "log": runner.file_record(self.repo, prefix + ".log")}
        runner.exclusive(self.repo, prefix + ".receipt.json", runner.body(receipt))
        runner.verify_preflight(self.repo, self.token, [self.id], self.pin)
        with self.assertRaises(runner.Refusal):
            runner.verify_preflight(self.repo, self.token, [self.id], {**self.pin, "kind": "tampered"})

    def test_verify_only_never_starts_a_missing_numerical_phase(self):
        boundary = FakeBoundary()
        with self.assertRaisesRegex(runner.Refusal, "Verify-only"):
            runner.run_phases(self.repo, self.id, self.pin, self.token, boundary, self.guard, verify_only=True)
        self.assertEqual(boundary.calls, [])

    def test_all_board_interrupt_after_proof_uses_new_immutable_attempt_path(self):
        class InterruptedAfterProof(FakeBoundary):
            def run(inner, command, *args, **kwargs):
                result = super(InterruptedAfterProof, inner).run(command, *args, **kwargs)
                if runner.HELPER in command and command[-1] == "all-boards":
                    raise runner.Refusal("mock interrupt after proof before phase complete")
                return result
        with self.assertRaises(runner.Refusal):
            runner.run_phases(self.repo, self.id, self.pin, self.token, InterruptedAfterProof(), self.guard)
        directory = self.repo / "apps/frontend/.local/postflop-ai/audit-evidence"
        old = list(directory.glob("*-all-boards.json"))
        self.assertEqual(len(old), 1)
        completed = runner.run_phases(self.repo, self.id, self.pin, self.token, FakeBoundary(), self.guard)
        self.assertEqual(len(list(directory.glob("*-all-boards.json"))), 2)
        self.assertNotEqual(str(old[0].relative_to(self.repo)), completed["phases"]["all-boards"]["evidence"]["proof"]["path"])

    def prerequisite_fixture(self):
        _, catalog = runner.selections(self.frontend, ["B_spot_269"])
        runs = self.frontend / runner.BASE / "runs"
        runs.mkdir(parents=True)
        run = runs / self.token
        run.mkdir()
        repository = run / "repository"
        repository.mkdir()
        source_path = "apps/frontend/prerequisite-policy.json"
        runner.exclusive(self.repo, source_path, b"unchanged prerequisite")
        record = runner.file_record(self.repo, source_path)
        runner.exclusive(repository, source_path, b"unchanged prerequisite")
        pin = {"sources": [record], "inputs": [], "spots": [{"id": id, "artifacts": {}} for id, row in catalog.items() if row["stage"] == "A"]}
        runner.exclusive(run, "pin.json", runner.body(pin))
        runner.exclusive(repository, "saved/log", b"original log")
        actual = {"log": runner.file_record(repository, "saved/log")}
        runner.exclusive(repository, "saved/receipt.json", runner.body(actual))
        receipt = runner.file_record(repository, "saved/receipt.json")
        value = {"receipt": receipt, "verification_receipt": receipt, "evidence": {}}
        for spot in pin["spots"]:
            completion = {"status": "numerical-complete-unapproved", "pin_sha256": runner.digest(runner.body(pin)),
                          "phases": {phase: value for phase in runner.PHASES}}
            runner.exclusive(repository, f"apps/frontend/.local/postflop-ai/serial-control/{spot['id']}/numerical-complete.json", runner.body(completion))
        return catalog, runs, run, source_path

    def test_stage_b_keeps_admitted_prerequisites_guarded(self):
        catalog, _, _, source = self.prerequisite_fixture()
        with patch.object(runner, "validate_checkpoint") as verify:
            guard = runner.stage_b_gate(self.frontend, ["B_spot_269"], catalog, FakeBoundary())
        self.assertEqual(verify.call_count, 137 * 3)
        (self.repo / source).write_bytes(b"revised after admission")
        with self.assertRaises(runner.Refusal):
            guard.check(full=True)

    def test_stage_b_rechecks_policy_changed_during_prerequisite_scan(self):
        catalog, _, _, source = self.prerequisite_fixture()
        calls = 0
        def mutate(*args):
            nonlocal calls
            calls += 1
            if calls == 137 * 3:
                (self.repo / source).write_bytes(b"changed while prerequisites checked")
        with patch.object(runner, "validate_checkpoint", side_effect=mutate):
            with self.assertRaises(runner.Refusal):
                runner.stage_b_gate(self.frontend, ["B_spot_269"], catalog, FakeBoundary())

    def test_stage_b_prerequisite_rechecks_reserve_storage_before_writes(self):
        catalog, runs, _, _ = self.prerequisite_fixture()
        def reserve(_repository, _completed, _phase, _id, _pin, _boundary, guard, _control):
            guard.reserve(runner.MAX_LOG + 65536)
        current = runner.tree_bytes(runs)
        with patch.object(runner, "validate_checkpoint", side_effect=reserve):
            with self.assertRaises(runner.BudgetRefusal):
                runner.stage_b_gate(self.frontend, ["B_spot_269"], catalog, FakeBoundary(), storage_budget=current + 16)
        self.assertEqual(runner.tree_bytes(runs), current)

    def test_export_manifest_pins_only_verified_no_overwrite_destinations(self):
        completed = runner.run_phases(self.repo, self.id, self.pin, self.token, FakeBoundary(), self.guard)
        manifest = runner.export_manifest(self.repo, self.pin, self.token, [completed])
        self.assertEqual(manifest["status"], "numerical-complete-unapproved")
        self.assertFalse(manifest["review_approved"])
        self.assertEqual(len(manifest["files"]), 5)
        self.assertEqual(len(manifest["execution_evidence"]), 12)
        for record in manifest["files"]:
            self.assertEqual(record["destination_path"], record["path"])
        proof = next(record for record in manifest["files"] if record["kind"] == "replay-proof")
        (self.repo / proof["path"]).write_bytes(b"bad")
        with self.assertRaises(runner.Refusal):
            runner.export_manifest(self.repo, self.pin, self.token, [completed])

    def test_storage_root_symlink_rejected(self):
        alias = self.root / "storage-link"
        alias.symlink_to(self.repo, target_is_directory=True)
        with self.assertRaises(runner.Refusal):
            runner.tree_bytes(alias)

    def test_resume_rejects_tampered_report_and_pin(self):
        runner.run_phases(self.repo, self.id, self.pin, self.token, FakeBoundary(), self.guard)
        changed = {**self.pin, "kind": "changed"}
        with self.assertRaises(runner.Refusal):
            runner.run_phases(self.repo, self.id, changed, self.token, FakeBoundary(), self.guard)
        (self.repo / self.pin["spots"][0]["report_path"]).write_bytes(b"tampered")
        with self.assertRaises(runner.Refusal):
            runner.run_phases(self.repo, self.id, self.pin, self.token, FakeBoundary(), self.guard)

    def test_failed_phase_stops_batch_before_later_commands(self):
        boundary = FakeBoundary(failure="replay")
        with self.assertRaises(runner.Refusal):
            runner.run_phases(self.repo, self.id, self.pin, self.token, boundary, self.guard)
        self.assertFalse(any("scripts/postflop-ai/audit-all-boards.mjs" in command for command, _ in boundary.calls))
        self.assertFalse((self.repo / f"apps/frontend/.local/postflop-ai/serial-control/{self.id}/numerical-complete.json").exists())

    def test_unproven_existing_report_is_never_overwritten(self):
        report = self.pin["spots"][0]["report_path"]
        runner.exclusive(self.repo, report, b"preserved")
        boundary = FakeBoundary()
        with self.assertRaises(runner.Refusal):
            runner.run_phases(self.repo, self.id, self.pin, self.token, boundary, self.guard)
        self.assertEqual(boundary.calls, [])
        self.assertEqual(runner.read(self.repo, report), b"preserved")

    def test_stage_b_requires_all_137_stage_a_saved_proofs(self):
        ids, catalog = runner.selections(self.frontend, ["B_spot_269"])
        boundary = FakeBoundary()
        with self.assertRaisesRegex(runner.Refusal, "137"):
            runner.stage_b_gate(self.frontend, ids, catalog, boundary)
        self.assertEqual(boundary.calls, [])

    def test_plan_mode_has_no_child_process(self):
        prior = Path.cwd()
        try:
            os.chdir(self.frontend)
            with patch.object(runner.subprocess, "Popen", side_effect=AssertionError("No process in plan mode")):
                self.assertEqual(runner.main(["--spot", self.id]), 0)
        finally:
            os.chdir(prior)

    def test_interrupt_before_child_is_recorded_and_never_starts_child(self):
        boundary = runner.Boundary()
        boundary.interrupt(signal.SIGINT, None)
        with patch.object(runner.subprocess, "Popen", side_effect=AssertionError("Interrupted child must not start")):
            with self.assertRaises(runner.Refusal):
                boundary.run(runner.phase_command("simulate", self.id), self.frontend, self.repo, "interrupt/attempt")
        receipt = runner.read_json(self.repo, "interrupt/attempt.receipt.json")
        self.assertIsNone(receipt["exit_code"])
        self.assertIn("Interrupted", receipt["error"])

    def test_receipts_are_exclusive_and_command_hash_matches_js(self):
        command = runner.phase_command("replay", self.id)
        self.assertEqual(runner.command_hash(command), runner.digest(json.dumps(command, separators=(",", ":")).encode()))
        with self.assertRaises(runner.Refusal):
            runner.phase_command("generate", self.id)

    def test_helper_uses_hardened_official_gates_and_explicit_astra_pair(self):
        # This is a static boundary assertion, not a replacement for Node tests.
        code = (FRONTEND / runner.HELPER).read_text()
        self.assertIn("assertAuditEvidence(proof, context.spot, 'representative'", code)
        self.assertIn("assertAuditEvidence(proof, context.spot, 'all-boards'", code)
        self.assertIn("packageAllBoardCompanion(request.id)", code)
        self.assertIn("candidate.metadata?.model !== 'gpt-6-astra'", code)
        self.assertIn("candidate.metadata.config_version !== config.version", code)
        self.assertNotIn("await generate(", code)
        self.assertNotIn("await generateLater(", code)


if __name__ == "__main__":
    unittest.main()
