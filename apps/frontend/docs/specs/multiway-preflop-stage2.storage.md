# Stage 2 storage and publication

## Source and artifact boundary

Git owns the 75-root / 3,115-decision catalog, profiles, sampler, strict validators, audit, versioned reason templates, tests and the separate `configs/multiway-preflop-stage2.json` sizing config. The shared cash config is unchanged, preserving all existing HU policy fingerprints.

The following generated delivery artifacts are deliberately ignored:

- `src/estimated/continuation-responses.json`
- `src/estimated/continuation-call-equities.json`
- `src/estimated/continuation-audit-report.json`
- `src/estimated/reasons/{sq_,sq2_,cc_,c4_}*.json`

The 242 legacy data/reason files remain unchanged and tracked. Adding ignore rules does not remove blobs from already-published Git history. Do not rewrite or force-push that history without separate approval.

## Reproduce and validate

From `apps/frontend`, install the existing lockfile dependencies, then run:

```sh
node scripts/build-continuations.mjs --install
node --test --test-concurrency=1 tests/continuation-*.test.mjs tests/detailed-reasons.test.mjs
node scripts/audit-estimates.mjs --json
NODE_OPTIONS='--max-old-space-size=384 --max-semi-space-size=1' node --test --test-force-exit --test-concurrency=1 tests/*.test.mjs
npm run typecheck
npm run build
npm run test:sites
```

`build-continuations` copies only the existing legacy prerequisites into a new `.local/continuations-build-*` directory, runs the seeded generator, revalidates exact source reach/geometry/EV/joint defense, produces facts and compact reasons, and optionally installs only Stage 2 outputs. Staging remains available for inspection. Without `--install`, nothing is copied into `src/estimated`. A clean equity/defense cache recomputes the same seeded inputs; caches are speed aids and must pass fingerprint validation. The broader existing `build:estimates`/pipeline remains supported, but regenerates legacy inputs too; use the stage2-only command for this work.

For migration of an existing dense generation without changing its frequencies/equities:

```sh
node scripts/compact-continuations.mjs src/estimated .local/compacted-continuations
```

Migration validates every omission and audits the result; it never overwrites its input directory. This is optional and not necessary for fresh generation.

## Runtime contract

Schema 1.1 has `metadata.storage="reachable-only"`, `catalog_spot_count=3115`, `spot_count=1611`, `omitted_unreachable_count=1504` and 169 rows per stored spot for this generation. The counts are descriptive; validation rechecks every catalog node from exact predecessor actions. No list of assumed-impossible IDs is trusted. Missing reachable rows or ancestors fail closed. The coverage catalog exposes proved omissions as `unreachable` separately from `todo`; they are not counted as missing authoring work. `continuationAvailability` distinguishes `saved`, `unreachable` and `missing`; malformed sources throw. `findContinuationSpot` can produce an in-memory non-recommendation placeholder only after proving impossible support.

Impossible histories have no disk strategy, equity or reason payload. Individual impossible hands within a reachable history retain their 169-row placeholders and null equity facts. Folded participants' source factors and dead chips remain part of reachability.

Reason files use `continuation-reasons-v1`. Arrays preserve the exact saved numerical facts; integer references deduplicate unreachable explanations. `expandContinuationReasons` reconstructs the legacy detailed-reason shape from versioned browser-safe templates. The UI's existing `loadDetailedReasons` performs this expansion, so no visual redesign is involved. Consumers reading raw D1 JSON directly must use the same decoder; the API returns the compact payload unchanged. Do not deploy new compact reason payloads before deploying the compatible loader.

A clean checkout or deployment without generated Stage 2 data still supports legacy ranges. Stage 2 artifact tests explicitly skip until generation; the audit CLI labels this `not-generated` and audits legacy data only. Neither such a skip nor a legacy-only pass proves Stage 2 publication is ready. Stage 2 action-path integration remains a separate task.

## Publication

After generated-artifact tests, the complete suite and independent review pass, create the D1 delivery SQL using the existing publisher:

```sh
node scripts/publish-d1.mjs --only preflop --out .local/reysonai-stage2-preflop.sql
```

This creates a full preflop delivery snapshot, including compact reasons and unchanged legacy data. The publisher first requires a complete, freshly audited Stage 2 generation and all current compact reasons, even when only creating SQL. Inspect its dataset names/counts and byte sizes. A clean checkout is blocked by default; `--allow-legacy-only` explicitly opts into a legacy-only replacement that removes any deployed Stage 2 data. Partial generations always fail, even with that flag. The existing D1 path is not a delta and clears/replaces the preflop delivery tables; do not execute it remotely without explicit deployment authorization. Run the existing publisher's `--execute local` against the local database for delivery testing, or `--execute remote` only after approval and the compatible client deployment. The preflop API serves data without fetching equities into the normal app boot. Stage 2 files are loaded only by authoring/audit/coverage or explicit consumers, never substituted for HU ranges.

## Measured review compaction

Original generated outputs totaled 341,870,219 bytes (3,115 decisions; 1,504 wholly unreachable). The final regenerated compact delivery totaled 43,276,102 bytes, 87.34% smaller:

| Artifact | Before bytes | Compact bytes |
| --- | ---: | ---: |
| Strategies | 55,071,958 | 27,736,908 |
| Equities | 12,037,728 | 8,271,408 |
| Audit | 1,794,858 | 1,545,287 |
| Reasons | 272,965,675 | 5,722,499 |

The optional compact migration writes a whitespace-minimized audit (1,154,282 bytes); the table reports the actual final generator output. All 1,611 preserved strategy histories have identical frequencies/geometry; all expanded reason text/facts match the previous generation except its deliberately refreshed provenance fingerprint.
