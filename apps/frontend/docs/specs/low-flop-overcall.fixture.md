# Pinned low-flop research fixture and mandatory gate

## Exact v1 archive reproduction after later development

The initial `pack` command inventories the then-current research/report collection. It is not a promise that later source/report globs will recreate the same archive. Use the immutable v1 manifest and an exactly verified restored v1 root instead:

```sh
python scripts/research/low_flop_fixture.py repack \
  --root .local/low-flop-restored-v2 \
  --archive .local/low-flop-repacked-immutable-v1.tar.gz
```

This fresh-output operation reads only the manifest's fixed 467 members and verifies the final compressed bytes against the original hash. Local reproduction succeeded at 1,911,780 bytes and SHA-256 `31294eff5249b46fd737cfa97d0809c103381b80fc7e419eb89261f166b0adfa` with CPython 3.12.14 and zlib 1.3.2. A different compressor that changes bytes fails the exact check rather than silently creating a new v1 artifact. The original archive and manifest are unchanged. On 2026-10-05 the repository LFS object was uploaded, fetched into empty storage and verified on the Mac; a fresh remote checkout restored all 467 members. Its first mandatory gate failed before any Node contract because the authoring checkout's inherited core was missing. See `low-flop-overcall.portable-staging.md` for the separate staging correction and fresh-execution status.

For the current closed-runtime experiment, use the separate mandatory `low_flop_runtime_gate.py` entry point described in `low-flop-overcall.runtime-preview.md`; the historical 27-contract gate by itself does not accept that newer runtime.

Status: **unapproved research**. This package preserves evidence and makes the existing
27 contracts mandatory. It neither applies a runtime policy nor grants candidate,
model-version, delivery, or production approval. Independent delivery review, the
all-combo integrated runtime audit, candidate-wide statistical accounting, and a trusted
review-receipt process remain necessary. The existing prototype previews only four exact
contexts among 21,546 archived rows. Additional negative cases are not automatically approved.

## Preserved bytes

- `artifacts/postflop/low-flop-research-v1.tar.gz` is a Git LFS artifact, following the
  repository's `artifacts/postflop/*.tar.gz` convention.
- SHA-256: `31294eff5249b46fd737cfa97d0809c103381b80fc7e419eb89261f166b0adfa`
- Compressed size: **1,911,780 bytes**; expanded file bytes: **38,976,270**;
  **467 regular-file members**. The adjacent manifest enumerates every path, size and hash.
- Frozen main `2064a41011f0e91685e592c6e5f4c07f07ba7570` v1: 125 files.
  The diagnostic-contract v2 snapshot: 126 files. Each contains the six original saved
  preflop inputs and all 90 preserved HU45 flop/later policy files.
- Candidate checkpoint `96bb46b76a98e64e6c2498f6d056d1b41e243dfc`: a compact 43-file runnable
  source/test/input closure. Packaging checks these files against that exact Git checkpoint.
- Original seven and additional eight 8,192-sample reports, their `.stderr` and `.time`
  files, both predeclared plans, v1/v2 128-sample parity evidence, earlier matrix and
  high-control outputs, provenance records and helper scripts remain byte-exact.
- Both candidate contract attempts are preserved, including the failed pass1 Welford
  exact-equality assertion and the successful pass2. Fourteen tracked research reports
  and reviews are copied unchanged under `reports/`.
- Original policy source archive SHA-256:
  `5f5dd88540c00ce7426146b91b1fd9c0cc10974b146ba02a175cc067395e7b0a`.

The original and additional families together spend a nominal .02 union bound under the
stated IID Monte Carlo approximation, not .01. The archive's hashes attest bytes, not
statistical validity, approval authenticity, GTO correctness, or broad coverage.

## Restore into a new isolated root

Run from the repository root with Python 3.10+ (standard library only). The `.local`
parent must already exist. If using another location, choose an existing parent and a
new child directory. If Git LFS has left only a pointer, materialize the existing LFS
artifact through the repository's normal authorized LFS workflow before restoring.
The tools never download, install, generate a replacement policy, or substitute reference policies for missing evidence.

```sh
python scripts/research/low_flop_fixture.py verify-archive
python scripts/research/low_flop_fixture.py restore --root .local/low-flop-restored-v1
python scripts/research/low_flop_fixture.py verify-root --root .local/low-flop-restored-v1
```

Restore verifies the compressed archive, exact member set, sizes and hashes before
creating the root. It refuses every existing destination, symlink ancestor/member,
absolute/traversal/ambiguous member path, duplicate, missing/extra member, non-regular
entry, extended tar header, LFS pointer, or byte drift. The strictly bounded USTAR reader
checks each header before reading payloads; it does not use tar `extract`/`extractall`.
Only regular files below the freshly created root are written. In-checkout output roots
must be under `.local`; no live policy/source path is populated.

A restore receipt is written only after full verification. Failed restoration remains
available for diagnosis and cannot pass verification without its receipt. The original
archive, snapshots, reports and policies are never rewritten. Files are not filesystem
write-protected because existing mutation tests copy them before editing; every gate
checks their complete hashes both before and after execution. Immutability here means
content-addressed preserved evidence, not an access-control claim. The version-controlled
manifest is the trust anchor; supplying a different manifest changes that trust anchor.

## Mandatory research gate

Node must be the repository-compatible version that supports these existing `.mjs`/`.ts`
research imports. No package installation is needed. Reserve the shared-resource Node
slot before executing this command in the current development environment.

```sh
python scripts/research/low_flop_gate.py \
  --root .local/low-flop-restored-v1 \
  --output .local/low-flop-research-gate-v1
```

The output must not exist and must be separate from the fixture root. Staging version 2
explicitly copies 32 inherited candidate core/input files from the verified archive and
11 enumerated research source/test files from the current checkout. The runtime gate
then stages its current driver, pins, test and two review files. These sources are never
selected according to which files happen to exist. Missing current research source,
missing or changed archived core, and incomplete closure fail before Node starts.
`candidate-source-origins.json` records every selected origin and byte identity.

The gate places all 90 original policy files only in its private run copy. This handles
the existing cache contract's module-relative policy path without writing into the
checkout's production policy directory. A newly introduced dependency outside the
43-file closure must be explicitly incorporated and reviewed. This validates current
research code against the preserved candidate core; it does not validate a current
application core or claim that the authoring HU branch was delivered as product code.

For the exact archived candidate instead of current checkout source, add `--checkpoint`.
This choice is recorded in `summary.json`. The frozen v1/v2 parity snapshots always come
from the verified fixture, regardless of candidate mode.

The gate sets `REQUIRE_LOW_FLOP_RESEARCH=1`, `LOW_FLOP_RESEARCH_ROOT`, and isolated temporary
paths; clears inherited `NODE_OPTIONS`; and runs **13 sequential processes**, each with
`--max-old-space-size=384` and a 90-second timeout. The four test scripts explicitly use
`--test-reporter=tap` without `--test`; parity/replay stdout remains JSON:

1. `postflop-low-flop-diagnostics`: 4 tests
2. `postflop-flop-promotion-veto`: 11 tests
3. `postflop-rollout-contract`: 7 tests
4. `postflop-veto-builder`: 5 tests
5. Frozen v1 and v2, same seed `low-flop-contract-parity-v1`, 128 samples each at the
   original uncapped `BTN_open_BB_call / 8c8d2h / KcQh / bet75 / ip` root
6. Seven builder replays using the preserved reports, without rerunning their simulations

Missing fixtures, missing or skipped/todo/cancelled tests, incorrect TAP totals, nonzero
exits, timeout, parity drift (both between versions and from historical evidence), changed
source/policy bytes, default application, or expanded preview scope fail the gate. Default
application must remain false in all seven cases. Only cases 1–4 may preview true; their
preview must equal the raw mix. Cases 5–7 must remain at the legacy mix, raises stay fixed,
and every preview must have `production_eligible: false`.

There is **no 8,192-sample execution** in this gate. No certificate, approval receipt, policy
or production artifact is published. Original logs remain inside the fixture; fresh
stdout/stderr, candidate identities, and command/exit/time/RSS records are exclusively
created under the new output root. Failed logs and a failed summary are retained. RSS is
Python's cumulative child-process high-water mark, not a per-process measurement.

## Python-only checks and deterministic packaging

```sh
python -m unittest discover -s tests/research -v
python -m py_compile scripts/research/low_flop_fixture.py scripts/research/low_flop_gate.py
```

The 18 Python tests exercise archive/restore attacks, byte and receipt drift, mandatory TAP
counts, missing fixtures, fail-closed replay scope, all 13 commands, timeouts and failed-log
preservation. Subprocesses in the gate orchestration tests are mocked: these tests **do not
execute Node** and do not substitute for the restored-fixture research gate.

To reproduce the archive from the original preserved investigation root, use new output
paths; existing archives/manifests are never overwritten:

```sh
python scripts/research/low_flop_fixture.py pack \
  --root .local/low-flop-research \
  --archive .local/low-flop-research-v1-repeat.tar.gz \
  --manifest .local/low-flop-research-v1-repeat.manifest.json
```

Sorted members, USTAR metadata and gzip timestamp/name are normalized. Two independent
packs in the same Python/zlib environment yielded the exact archive digest above. All 467
members were restored and reverified; Python tests passed. At this packaging checkpoint,
the fresh restored-fixture Node gate has **not yet run** because it awaits its resource
slot. A later run must retain its distinct result rather than rewriting historical reports.
