# FastFold: local preservation fixture renewal (2026-10-05)

## Narrow scope and independent review

Source/configuration-only renewal at baseline `88b7f6af8a416adf2aaaab18ed0c8e701cd0cb9d`. Independent reviewer: **Codex compact_styles** (approved after independent inspection of the five seed INSERTs, strengthened tests and unchanged-data proof). No renewed Astra or strategy-quality review, generation, runtime, migration, policy or delivered-data changes.

Mandatory CI correctly detected that migration `0010_fastfold.sql` introduced five tables without a local preservation sentinel. The unchanged verifier insists on exactly one row in every unrelated table. Its seed now inserts one constraint-valid synthetic row into each of `fastfold_players`, `fastfold_sessions`, `fastfold_results`, `fastfold_actions` and `fastfold_dataset_parts`. Foreign keys remain enabled. The result sentinel supplies zero rating evidence and passes the real aggregate trigger; the paused session has no receipt/update trigger. No real account, credentials or remote resources are used.

The schema-driven regression explicitly requires these five tables in addition to the existing native-auth/ranked tables. The opt-in Wrangler integration's exact preservation table count becomes **21**, reflecting 16 existing plus five new tables. No assertion, exclusion, skip, snapshot, import or rollback check was removed or weakened.

## Evidence and bound identity

- `preflop-local-d1.test.mjs`: **9 passed, 0 failed**, one existing explicit opt-in Wrangler integration skip (not a new skip). Current complete schema, exactly one sentinel per unrelated table and `PRAGMA foreign_key_check` pass.
- Current bound sources: **103 → 103**; **one modified**, `apps/frontend/scripts/verify-preflop-local-d1.mjs`; zero added/removed; **102 unchanged**. Only five INSERT lines changed in the verifier.
- Previous content identity: `629744558b22f89494785b0c6fa8980f7e1cbc7d9dbfd7fd1201613de66c764e`.
- Current identity: `d2cc1e1ebac9e440bee77a5c03cbe8ad61ba604516304bac33e0daaa9f93181f`.
- Strict deep equality rechecked **all 1,888 artifact records** and the original archive: **1,747,857 bytes**, SHA256 `b0fd6d79c56a73b4a3a7663d954f0d50c9fb82fcc1866b6870534a4b51d69e0a`.
- Original source fingerprint `b3538b0c44f04016e57d6eb76802665cf405d65f87e856b9860ed8a479065e53` and counts (catalog 3,115; saved 1,611; unreachable 1,504; hands 272,259) remain unchanged. No fingerprint/data generation was rerun.
- The prior independently approved 49-geometry/45-full-input equivalence proof remains applicable: none of those input/geometry sources or saved datasets changed.

Local evidence: `/tmp/fastfold-sentinel-fixture-test.log`, `/tmp/fastfold-sentinel-source-proof.json`. Following independent approval, an attributed source-only renewal was appended and exact current sources/content bound. Structural equality confirms all other original receipt fields unchanged. Unchanged strict restore passed (1,614 files / 43,276,102 decoded bytes), and unchanged delivery verification passed (1,888 datasets / SQL SHA256 `b0bb41c1bf47106654ebadf30f0eba40de4252aca195e73fcbcd9236c6e6e77c` / `generated_strategies:false`). Final-head mandatory CI remains required.

## Limitations

The focused test does not re-prove the opt-in Wrangler full-file import/rollback or remote deployment. CI still requires strict full-delivery verification and preservation. No strategy-quality, GTO/EV, production CPU or authenticated production-play assurance is added. Original Astra and full-suite review limitations remain; result rating is experimental and AI penalty remains zero.
