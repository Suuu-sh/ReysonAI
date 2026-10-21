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
