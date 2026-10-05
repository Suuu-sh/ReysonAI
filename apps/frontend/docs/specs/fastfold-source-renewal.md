# FastFold: narrow source/configuration review renewal (2026-10-05)

## Scope and attribution

This is a **source/configuration-only** renewal for FastFold integration at commit `9ff924b`. Independent reviewer: **Codex compact_styles** (approved after independent audit of the five-source diff and both equivalence proof logs). It is not a renewed strategy-quality review, not an Astra re-review, and not a new policy-generation run. The original independent data review, its findings/advisories, baseline, full-suite limitations and archive remain authoritative.

The mandatory restore gate correctly rejected changed bound source bytes. No source/configuration was removed from that gate, no checker was weakened, and the review receipt has not been changed while gathering this proof. Reverting only shared geometry cannot resolve the identity change: both the reviewed deployment workflow and backend production configuration necessarily change as well.

## Exact source delta

- Previous source records: **102**; current: **103**.
- **4 modified:** `.github/workflows/deploy-worker.yml`, `apps/backend/wrangler.jsonc`, `apps/frontend/scripts/postflop-ai/browser-inputs.ts`, `apps/frontend/scripts/postflop-ai/spots.ts`.
- **1 added:** `apps/frontend/scripts/postflop-ai/spots-core.ts`.
- **0 removed**, **98 unchanged**.
- Previous content identity: `3e667462988e02435186f07b5c662e28423931db6e0fba30e0ebac0094d46fe0`.
- Current source-bound content identity: `629744558b22f89494785b0c6fa8980f7e1cbc7d9dbfd7fd1201613de66c764e`.

The workflow adds the exact additive `0010_fastfold.sql` migration before the API, mandatory pinned-Wrangler local authentication/DO checks, and live FastFold readiness before the compatible client. Backend configuration adds a SQLite-backed DO binding/migration and approved experimental-beta flag, without a paid upgrade. The scoped typed spot/input factory replaces eager shared registry reads; the legacy wrapper remains compatible. No authored frequencies, ranges, equity samples or candidate policies were edited.

## Read-only equivalence evidence

1. `reviewedFiles()` and strict deep equality prove **all 1,888 delivered artifact path/byte/SHA256 records unchanged**, plus the archive record unchanged. Materialized archive: **1,747,857 bytes**, SHA256 `b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a`.
2. Recomputed `continuationReasonFingerprint()` is unchanged: `b3538b0c44f04016e57d6eb76802665cf405d65f87e856b9860ed8a479065e53`. Counts remain catalog **3,115**, saved **1,611**, unreachable **1,504**, hands **272,259**.
3. The original typed `spots.ts` and `browser-inputs.ts` from baseline `e0644c2` were loaded in a disposable local directory against the unchanged saved datasets. Strict deep equality confirms **all 49 spot geometries** unchanged and **all 45 reachable buildInputs outputs/fingerprints** JSON-identical. The other four spots remain unreachable. No generation, sampling or policy rewriting occurred.
4. Previously completed scoped checks: authenticated backend safety **9 passed**; local actual SQLite DO+D1 binding **2 passed, zero skipped** (including cross-shard idempotency, expiry, restart/resume and full saved-policy showdown); release/probe checks **2 passed**; strict TypeScript checks passed. Independent read-only DO/helper/configuration review found no P1/P2 issues. These are local implementation checks, not a production-play or production-CPU claim.

The temporary proof logs are `/tmp/fastfold-review-identity-proof.json` and `/tmp/fastfold-scoped-source-parity.log`; exact hashes/counts above are retained here. The comparison inspected current bytes and the original Git baseline, not a generated version label or a mutable cached registry.

## Required follow-through and limitations

Following Codex compact_styles' independent source-only approval, a narrowly attributed `review.source_renewals` entry was appended and the exact current sources/content identity bound. A strict structural comparison confirmed that every other original receipt field remains unchanged. The unchanged strict LFS restore passed (1,614 archive files, 43,276,102 decoded bytes), then the unchanged delivery verifier passed (1,888 datasets; SQL 68,705,643 bytes, SHA256 `b0bb41c1bf47106654ebadf30f0eba40de4252aca195e73fcbcd9236c6e6e77c`; `generated_strategies:false`). Final-head mandatory CI remains required. A receipt hash refresh alone is not an approval.

No strategy correctness, calibrated GTO/EV, all-street opponent-type fidelity, production CPU percentile, remote D1 rollback or renewed full-suite success is claimed. Rating remains experimental/provisional; AI-adjusted penalty remains zero. Original strategy-review and full-suite limitations continue to apply. No remote storage, migration or deployment was performed as part of this source-equivalence check.
