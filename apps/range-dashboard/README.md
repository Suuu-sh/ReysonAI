# Range Observatory (read-only)

Standalone mobile-first viewer for saved **new single-response v6** candidate ranges. No login, API key, package install, model invocation, generation control, or production integration. Node.js 22.18+ (native TypeScript stripping) is required.

```sh
node apps/range-dashboard/server.ts
```

Default: `http://127.0.0.1:5188`. `PORT` and `HOST` may override the listener; leave the default loopback host when using a tunnel. A public tunnel makes the saved range frequencies and explanations publicly readable by anyone with the URL; it remains read-only. The tunnel lifecycle is separate from this app.

```sh
node --test apps/range-dashboard/server.test.ts
```

## Data and verification

Reads only `apps/frontend/candidates/aiv2-preflop/llm-range-single-response-v6/manifest.json` and node-key-derived artifacts below its `spots/` directory. Absolute artifact paths in the manifest are never used. Complete `single-pass-v6` nodes must pass method/mode/status, optional artifact hash, canonical final policy hash, canonical bilingual reason hash, 169-cell completeness, physical-combo reach summaries and weighted rounded grid verification. Unreachable placeholders and invalid artifacts are excluded. Hashes establish saved-data integrity, **not** strategic correctness, translation accuracy, EV, GTO, or profit.

The isolated verifier mirrors the repository's exact-class-defaults-v1 canonical codec and rounding, without importing provider/generator code. Missing hero reach means all own combos remain reachable (1), as in the generator; only the hero's own prior actions weight that hero. Class reasons describe saved exact defaults; any concrete-card exceptions and exact saved reasons are shown separately. Grid cells are reach-weighted rounded displays, while overall action frequencies are recomputed from exact physical combos, not an equal-weight average of 169 cells.

Allowlisted routes only: `/`, `/app.js`, `/style.css`, `/api/status`, `/api/scenes`, `/api/scene?key=...`. No arbitrary static hosting, raw files, manifest, prompts, credentials, writes, or generation endpoints. Responses omit all filesystem paths and raw metadata. Client reason content uses `textContent`, never HTML parsing. No third-party assets/analytics. The browser polls saved files every 30 seconds; the server caches verified snapshots for at most 2.5 seconds.

The UI explicitly displays partial progress (`new_single_pass / generated_total`), verified count, running/failed state, source save time and poll time. URL hashes preserve scene/hand/language. An unavailable source preserves the previous displayed data with an error. No production/frontend/generator files are changed.

## Design

Restrained standalone dark-neutral palette, compact mobile-first layout, red raise/open, green call/check, blue fold; mixed frequencies use proportional segments with textual action labels and percentages. 13×13 is fully visible at 375 px. 21st CLI and MCP search were unavailable in the working environment; no unrelated dependencies were installed.


## Actual postflop decisions

The **Postflop** tab reads only `apps/frontend/candidates/aiv2-postflop/llm-postflop-single-response-v1/decisions/<64hex>.json`. Endpoints: `/api/postflop/scenes` and `/api/postflop/scene?key=<64hex>`. No manifest is needed; only exact 64-hex `.json` files are scanned, with real-path confinement. No generator/provider module is imported.

Independent verification checks identity, method/version/model/effort, input and full response hashes, expanded physical-combo policy hash, exact response-group membership/reasons, positive actor-reach board-legal coverage, all legal action sizes (new 33/66/100/125% bets), and all 169 reach-weighted grid aggregates. Raw-file SHA-256 is shown separately. Board-blocked and zero-reach cells have **no generated policy**, not a fold/legacy-frequency fallback. Each reached physical combo's exact saved English/Japanese reason is available below the cell; summary prose is also saved original text. Hashes are integrity checks, not signed authenticity or strategic-quality proof.

The initial line's BB flop check is explicitly assumed with probability 1; it is **not** a generated BB check strategy. Flop/Turn/River filtering only shows saved actual decisions. Missing streets/boards/histories are explicitly ungenerated, never synthesized. Client polling never requests new model generations. The preflop headline uses independently reverified keys from the existing 65-target basic-HU audit when present, separates 20 prerequisites, and marks type profiles deferred; all saved verified scenes remain viewable.

Focused new postflop tests (do not require or generate actual candidates):

```sh
node --test apps/range-dashboard/postflop.test.ts
```

## Independent reason-review annotations

The fixed local report `docs/qa/aiv2-postflop-checkthrough-review.json` may add public notes without changing or hiding generated artifacts. A note is accepted only when both its report artifact binding and finding binding match the current decision ID **and exact raw-file SHA-256**. The viewer exposes only note ID/severity, EN/JA warning text and validated combo labels—not report filesystem paths or raw evidence. Affected decisions prominently show **理由に要修正箇所あり・本番未承認**. Original generated text remains separately labeled and unchanged. No warning, missing report, or passing numeric/hash checks ever imply semantic/production approval.

Focused binding check: `node --test apps/range-dashboard/review.test.ts`.

## Independently approved reason-only sidecars

Only an exact independent approval receipt at `docs/qa/aiv2-postflop-reason-amendments-approval.json` can expose a saved revision from `reason-amendments/revisions/<revision_id>.json`. The resolver independently checks original decision/raw SHA/policy/input/response hashes, a digest of **every** physical-combo frequency and reach, failed-review raw SHA, request identity, full revision content identity and raw SHA, and receipt bindings/reviewer evidence. Scope must exactly cover the named bound finding; combo patches must preserve the original mix. Missing/unapproved receipts, changed bytes, policy-change assessments, invalid provenance, or scope mismatches fail closed to the original text plus warnings.

Approved amendments are additive and separately labeled **Approved amended EN/JA**. Generated original reasons, original frequencies, counters, decisions and lineage remain unchanged and visible. Review history retains the original notes, marking only exactly covered findings resolved. Approval of a reason-only amendment is never production/solver/GTO/EV approval.

Focused new resolver check: `node --test apps/range-dashboard/amendments.test.ts` (test-only data, no production fixtures).

## Explicit reviewed regeneration selection (inactive until independently approved)

No automatic merge scans `reviewed-regeneration/`. A fixed `docs/qa/aiv2-postflop-active-selection.json` may request exactly five ordered nodes: original flop BTN, original turn BB, then regenerated turn BTN / river BB / river BTN from the fixed `4cf32b71efd09dddfea2de266d93a28f7a0ed791a25bc9c1bd96182ad86324a5` run. Selection contains only schema/run/run-plan raw SHA, a fixed review filename/raw SHA reference, and exact five artifact/revision raw-SHA pins. It cannot approve itself.

The separate immutable `docs/qa/aiv2-postflop-reviewed-regeneration-review.json` must actually approve that identical five-node inventory with independent reviewer/evidence, no unresolved findings, and scope `dashboard-data-content-only`. Each new generation receipt, original replaced artifact, raw hash, parent/check identity, policy/input/response hashes, and provider attestation must agree. All four check transitions independently reconstruct the complete next input, including actor-specific physical-range conditioning, board filtering, history, actor and geometry. All-or-nothing failure preserves the original five scenes and original warnings; eight-node mixed coverage cannot be published by this resolver.

Original artifacts, reason amendments, counters and lineage are untouched. A successful dashboard-content review remains `production_approved:false`; it is not completion of production CI/release gates, a solver validation, or an EV/profit claim. No selection or approval file is generated by this service.

Focused new contract check: `node --test apps/range-dashboard/selection.test.ts`.

## Lazy public postflop action tree

`GET /api/postflop/tree?board=As7d2c&path=[]` replays only the selected public action/card path (maximum 64 steps), returning the current node and its immediate children. It starts at BB's flop decision in a 100 BB BTN 2.5 BB open / BB call pot. Users can change all three distinct flop cards, browse every branch under the existing 33/66/100/125% bet, 3x/minimum raise, effective-cap/67%-merge and four-raise rules, and choose from 49 legal turn / 48 legal river cards after betting closes. This is the complete **configured discrete action structure**, not arbitrary bet amounts or a claim that all boards/policies were generated. Fold, river showdown and called all-in are terminal decision states; all-in runout has no remaining decisions.

The existing independent verifier supplies only public geometry/history and a digest of upstream source lineage. A saved scene connects only on exact public state plus source digest and every parent decision/policy identity. The initial BB check is explicitly an assumption, never a generated BB policy. No unknown branch inherits ranges, frequencies, or reasons. Zero frequency under a saved parent is marked zero reach but may still be browsed structurally. Unknown descendants remain ungenerated, not evaluated strategies. The original review warnings and fail-closed selection/amendment contracts remain intact. Opening, expanding or refreshing never calls a provider or changes candidates.

The collapsible explorer uses existing dashboard tokens/buttons, breadcrumbs and saved scene rendering; hash parameters `tree` (JSON path) and `board` preserve structural links alongside existing saved-scene navigation.

Focused checks: `node --experimental-strip-types --test apps/range-dashboard/tree.test.ts` and `node --check apps/range-dashboard/app.js`.
