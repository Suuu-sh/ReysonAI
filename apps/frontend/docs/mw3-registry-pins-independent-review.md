# Independent review of the exact 32 MW3 registry pins

Date: 2026-10-05 UTC  
Reviewed checkout: `213af50f54746a10c44a67a9d710eae322414e05`  
Executed draft checkpoint: `a2cf5f6ea429eb8dd3cafc424e2ab07c17d30579`  
Draft source tree: `4bfb8950903591ca68f66575010f8fb2bdc9078d`

## Decision

**GO to adopt the exact proposed registry below into NONPRODUCTION source, then run the remaining activation and delivery gates.** No required pin, identity, eligibility, transport, or source-authority correction was found. This decision is limited to this exact 14,126-byte proposal and its 32 six-field pins. Any changed pin or relevant source requires renewed review.

This is not a production/publication approval, final independent archive receipt, successful real D1 execution, LFS delivery confirmation, browser QA result, GTO/equilibrium judgment, or release-readiness declaration. Do not deploy or make remote D1 changes on this GO. The actual `apps/shared/mw3-approved.ts` remains empty during this review; this reviewer did not install the proposal.

Only this review document was written. Inspection used Git, sequential file reads and Python. No Node, npm, esbuild, JavaScript tests, recipe execution, strategy generation, Monte Carlo, process/HTTP fixture, Wrangler, D1, browser, archive save, receipt creation or SQL generation ran. The numerical evidence was read and bound, not rerun. Python independently reconstructed the transport representation without importing or executing the application encoder.

## Exact subjects

- Proposal: `apps/frontend/.local/postflop-ai/mw3/activation-draft/proposed-mw3-approved-a2cf5f6.ts`
  - 14,126 bytes
  - SHA-256 `7e1ac4ba059b4a34d8fdc7f6c6891be9929eafec470dc577c0d8702cf632fe81`
- Draft: `apps/frontend/.local/postflop-ai/mw3/activation-draft/683ad141af9014736237ef0720d9cd97d0d1a8ab652587e62847cb1ce6d4b697-4bfb8950903591ca68f66575010f8fb2bdc9078d.draft-pins.json`
  - 79,397 bytes
  - SHA-256 `1b35c2c1d2820cf7a7a7366e0cce23f92426731e1b03db0ab48251eec01e1ec8`
- Raw inventory: `apps/frontend/.local/postflop-ai/mw3/sixteen-finished-gates-20261005T0020.json`
  - 31,559 bytes
  - SHA-256 `683ad141af9014736237ef0720d9cd97d0d1a8ab652587e62847cb1ce6d4b697`
- Actual empty registry: 421 bytes; SHA-256 `779a2a1e1d897feb343b45a8481112fe4735f25ce380b90d69cce539fab95e30`
- Canonical compact JSON of the full proposed pin array: SHA-256 `5f51c26f33424fa2b0aab1b69b7cc86baa46821ffba47b551b9034177bb4e323`

The draft retains `unapproved_transport_encoding_only`, publication `not-authorized`, independent receipt `not-created`, and registry `not-modified`. Its provisional manifest digests and source tree are not final receipt subjects. I independently recomputed the draft source/input inventories; I did not regenerate the provisional compressed archives or treat the `draft_manifest_sha256` fields as formal acceptance evidence.

`a2cf5f6` to `213af50` changes only the activation-review document and `multiway-postflop-stage1.result.md`. The relevant code is identical. The result document's chronological earlier pending statements are explicitly historical; its current-scope section records the actual draft run. Adding the registry, this review, or subsequent source changes requires a new final source freeze and freshly bound manifests/receipts, even when numerical identities stay unchanged.

## Independent byte, source and authorship checks

1. All **112 distinct current raw files** match their inventory byte lengths and SHA-256 values, totaling **235,515,283 bytes**. Every draft subject references exactly its two candidate files and five reports, and all 112 records are consumed exactly once. Their content-addressed object names and spot identities match.
2. The quality-review index covers exactly these **16 spots in eight distinct review documents**. All eight document lengths/hashes match the index. For every spot, its assigned review contains the exact current source hash, both inner policy hashes, and all seven raw-file hashes. Each recorded verdict is bounded AI-estimate acceptance. The index is explicitly not an independent archive receipt.
3. Python rebuilt all 20 catalog geometries from the actual opening, first-response and overcall JSON. It checked 169 unique hand rows, frequency bounds, the 2.5BB open/100BB stack geometry, seat order, rake inputs and existence of a legal nonoverlapping three-hand tuple. Exactly 16 are reachable. All **16 source fingerprints** independently match the inventory, both candidates and both pins, using the current source objects, 8/8.5/9BB pot geometry, 97.5BB remaining stacks, sizing, evaluator, classifier version 4 and nine-tier list.
4. Python independently recomputed the 13-file implementation identity as `4ec6b527f8e2d53f08147a5c48657366a0b4b2333a5844e8bc4a0a79d3073113`. Every pin and candidate has that identity.
5. Every nonpilot profile is individually bound to its correct spot/source. All 16 recipe identities and author tasks were independently recomputed from the exact source bytes, without calling a recipe. The pilot retains V4 and recipe `ae196be62d212769fb27a1b1f6619ffd4c7f6488f5d0c3c132efd13eade42798`; the remaining profiles retain V1 and their own recipe hashes. Candidate metadata remains `candidate_pending_independent_review`, `gpt-6-astra`, and `ai_estimate_not_gto`; it is not rewritten to manufacture authority.
6. All five reports per spot bind the correct source, implementation, two policies, verification identity, author model and unpublished status. Nonpilot reports also bind their exact recipe and author version. All report directories match those identities. The authored gate hash independently recomputes to `92b946dfc5c87359dcb3e610e832e262c2d3ac366110f295968eca2f7392c088`; the pilot gate remains `0f35a9371c0220d1a41587c51f6d90698f9294d3f0706c841b58b31bed4d19d6`.
7. An independent static dependency walk reconstructed each source ledger: **185 source files for the pilot**, **187 for each other subject**, plus the three input files. Every reconstructed `sources_sha256` and `inputs_sha256` equals its draft subject. All **205 distinct source/input paths** across those ledgers match the actual Git blobs in the stated draft tree. Common input-ledger SHA-256 is `cc12d24aac0ace9e825419837f3e6027f0fdaa92331a873c59d2ffdcbf1d91c7`.
8. Current bytes of all **13 numerical sources, eight authored gate-hash files, 20 recipes and the complete seven-limitations module** are identical to `c70cdec`; the pilot gate source is also unchanged. No frequency, recipe, semantic classifier, gate or limitation was changed to obtain this GO.

The saved structural reports retain 28,080 flop and 3,776 later board checks with zero recorded structural errors/gaps. Joint reports retain 1,469 positive events, 259 zero-support events, 29,380,000 accepted tuples and **561 warnings**. The simulation/replay reports retain their full 1,920,000 hands each. I checked identity, scope, stored counts and completion flags here, not fresh simulation or a new independent full-hand evaluator. Detailed numerical-quality and zero-support judgments remain those of the eight exact independent reviews. Preserve their explanation errata and substantial overfold/overcontinue limitations; neither lower warning counts nor self-play completion establishes strategy quality.

## All 32 transports independently reproduced

Python read each actual candidate separately and reconstructed the dictionary codec in original key/insertion order: node, tier, selector, mix and rule-order dictionaries; six-column rows; root order; and unchanged header fields. It hashed the full inner policy, encoded payload, each 16,000-character part, and the complete transport header with the actual saved metadata. All encoded bodies were explicitly verified ASCII, so these boundaries are also exact UTF-16 and UTF-8 boundaries for this data.

All **32 inner-policy hashes and complete transport/header hashes match** the proposed pins. Every one of **972,648 rules** retains integer 0–100 percentages summing to 100, and reconstructs the exact original ordered rule JSON. Together the transports contain **1,552 parts / 24,632,707 encoded bytes**. The Python pass was serial and completed in 21.926 seconds. This is lossless byte/structure validation, not reauthoring or solver validation.

The ordered compact summary rows `[spot, stage, ruleCount, partCount, encodedBytes, deliveryHash]` have SHA-256 `3d65b05cfe93c1a718f045a9ce283e65418fea33f8e37b2885ac1c8bfa1dfca6`.

The pilot delivery hashes are unchanged:

- Flop: `4c8d43795b1d11d85d938c877431a72be30bc68269d10f7e4bc26de1cdeed8ad`
- Later: `bcdeb4ca96a84c211ef508bc422436a40a355c1e343218cd0fee509a422d8148`

### Exact delivery pairs

| Spot | Flop delivery SHA-256 | Later delivery SHA-256 |
| --- | --- | --- |
| `CO_open_BTN_call_BB_call` | `4c8d43795b1d11d85d938c877431a72be30bc68269d10f7e4bc26de1cdeed8ad` | `bcdeb4ca96a84c211ef508bc422436a40a355c1e343218cd0fee509a422d8148` |
| `CO_open_BTN_call_SB_call` | `5d30c32819503b35eb4776cbb6ff3ccd65b83a30b4df48fa9ee57ad5b676735f` | `300deabfd54fff4225a00ba8ff84d3aeef0f6c48517d592d446125b2fb2b6d23` |
| `HJ_open_BTN_call_BB_call` | `da4cba6972420b5ff615d6392d47dc963b0638a29c747b9314f2cf871d95e7cc` | `c53b9061809b04c62af049e0a9eec8c37f4295e977384a5c3497f6132737b6ba` |
| `HJ_open_BTN_call_SB_call` | `cee641a36e91368a41b1f7e79622dd90b464d425c4f5b127956ff4c90b9323c2` | `2e6ce4d41eb9857465199f2774e702590b738530df09429c6b3523761b441cfc` |
| `HJ_open_CO_call_BB_call` | `75fffa9b7c5af63da62d254fc23b06dfe85d79313bbde5e72ff2536556ed12e1` | `7df78fdad444be2866905f02df9a05dd6d3e3b3de76103f5ba83cacf82da2607` |
| `HJ_open_CO_call_BTN_call` | `e7773c69bd680c1271612c3ebfc15c899872aa1655737b146d70497a673a323e` | `7e499cb944dd020b96ac35b55cdfd26f2699e55acf251b123d4c18a0ef5ac216` |
| `HJ_open_CO_call_SB_call` | `ce8132397a2eccb7c3b2c41dbb3d1058f4292d2c22100eb5292869cb16155704` | `9029fab129d6d3dfc9b5cfb057343e4cac14500da275708cd40b7c0421e9ed94` |
| `UTG_open_BTN_call_BB_call` | `4aa2ec01bfe9d59f86193b3a170390084cfed23513f3236353f34364b78517d5` | `d7c52388810b7944b23e242862e9e112b6a08fa26d73ca5a61ee373bd9c6df15` |
| `UTG_open_BTN_call_SB_call` | `029d0402b784532ad46b5e2ecce71c3a1540ea0a30539d64150bcf9d4811310e` | `08f2e05bd9745f5ad5d476b96930592bcf889325d984ca686acb61a287d7bfd3` |
| `UTG_open_CO_call_BB_call` | `bd91d467dbaf60b1ae5bb4e265d81ede9173befd88ac613eabdec459d16dafee` | `f669db4d3263a3049fcf3ccaa1bf898670dad7214cad87cbf41e8ff464f01fa8` |
| `UTG_open_CO_call_BTN_call` | `76bb1356d12a275d0351fd48e9b7c5d8bd2ea42f646552197d35a217be56d8f8` | `c196c22dd82a699ceeb828a43edfb53cbc72db52ee5a6166bbe10a31ef367a27` |
| `UTG_open_CO_call_SB_call` | `0bb86ee2d5cb471d9954a7d7f3cc11a9629744f9934329662f2d1c55d6697a31` | `4141a16a5845c07afea24a466df27d0499e7ba4ff479561ede64e9800ed497fd` |
| `UTG_open_HJ_call_BB_call` | `281abf5777b51568dc98ae2a7b7fbc37727062e99a882431b49a5807c73cbdde` | `742daf0c4e7d7a4a3c4a9b7012e1adbdab5ea6ed08dac28414412d190d9bb8d3` |
| `UTG_open_HJ_call_BTN_call` | `5439f957cdcbbc13d5d8ad23ec5b685e5b03a726e6111c96c1527134ac43cb9a` | `234b4b1dde7a12b0d47fbbb508d7ee41c3616c369bb7eb3dc2f7acd3b9496068` |
| `UTG_open_HJ_call_CO_call` | `f957d312947d1eec25b3341bbf3f6e8d757265688cbf939cf6e781ac2f272cbb` | `adc75543803c6dceae64be212bf0a2fd63869babbcd2f8a8fbf3523b119f5af7` |
| `UTG_open_HJ_call_SB_call` | `70131b3742203fad717c5d2a418e270476ebd0f4906d9a99e55c21d7714ae9c8` | `af5e72db20253f928399c0fbba2413c232a323b5c0b8be005ccacfc28862b68b` |

## Literal registry and fail-closed authority

The proposal matches the strict source parser's complete declaration shape: the six-field TypeScript type and a JSON array inside `Object.freeze`, with no executable expression, dynamic import, alternate registry or data-driven authorizer. Its parsed literal equals the draft pins in both value and compact JSON order. There are exactly **32 unique delivery hashes and 32 unique spot/stage keys**, with one flop/later pair per reachable spot and no extra fields. Every object uses the required insertion order:

`spotId, stage, deliveryHash, implementationHash, policyHash, sourceHash`

The pair ordering is flop then later, and spot ordering matches the sorted draft inventory. Thus the actual proposal avoids the known parent-deep-equality versus generated-worker-JSON-order false-rejection edge documented in the activation review. The general parser-order and existing-output-read hardening observations remain nonblocking; this proposal does not change that code.

The four `BTN/CO/HJ/UTG_open_SB_call_BB_call` paths have no legal saved three-range support because the first SB call range is zero. They have **no pins**. The source routing predicates still require exactly one open and two calls, exactly three distinct active seats, the correct seat order and sizes. Four-or-more-player, squeeze/3bet, limp and other unsupported origins do not become eligible through this registry. A three-player origin that later folds to two retains MW3 seats, original roles, saved reach and policy dispatch; it does not enter the existing HU defence/strategy path.

The default consumer clones and freezes the source-owned pins. It requires a complete pair before loading, rebuilds current source inputs, verifies source/implementation pairing, checks exact header and part hashes, restores the complete payload, checks inner policy identity and requires the full stage-specific engine node inventory. Missing, stale, corrupt or mismatched data remains an unavailable/error path. Range dispatch retains its dedicated multiway-unavailable rendering; Agent dispatch checks a genuinely verified matching kit and returns unavailable before any HU dispatch on unsupported multiway origin or failed kit. No generated, HU, query, localStorage or database-only policy fallback was added.

Backend approval remains the captured build registry, not a row or query. The exact header hash commits all metadata and payload/part hashes; malformed/missing/corrupt saved data rejects, including before conditional-response acceptance. Merely inserting a database row does not authorize a delivery. These are current-source observations and exact-data checks, not an executed browser/backend acceptance run against the proposed nonempty registry.

## Prior runtime contract and this run's evidence

The activation review was read and its exact identity checked: **24,645 bytes**, SHA-256 `877e50658cde9d7f82baa24e9270c09111d7971d21c37d4f64f6f1b7e248acdb`. It separately records independent review of the exact `a2cf5f6` **90/90, skip 0** targeted runtime result. That result establishes the reviewed preparation's bounded contract; it is not automatically a runtime pass for this uninstalled 32-entry authority.

The actual draft execution record is 558 bytes, SHA-256 `2dfa3591993510d86be9be40dbffadc91630504e4e2525e43128a6b2a9fb4974`. It records the explicit inventory/hash CLI, `a2cf5f6`, start **01:03:21.601386 UTC**, finish **01:05:03.835647 UTC**, exit **0**, elapsed **102.234284833 seconds**, and cumulative child maximum RSS **283,860 KiB**. Its stdout is 369 bytes, SHA-256 `f5d6fd6c444916035517f3e649b889cfc61bb7739cbed7f16b84e8bab674f91b`; it names the exact reviewed draft hash/length and 32 pins/16 spots. Its stderr is 1,250 bytes, SHA-256 `9473b9ba2b66358860566bbf06c6be5e6225738c21467650500ebde881d91d61`, with one saved-byte transport-pair success line for each of the 16 spots. The recorded maximum RSS is not a hard process-tree memory ceiling. The execution JSON does not itself record the heap environment; no stronger heap attestation is inferred from it.

The source still defaults to the original empty-registry proof mode. After adoption, activated verification must bind the **actual captured and evaluated source registry**, the complete 32-pin digest and the exact separately receipted subject pair. Choosing `--registry-mode activated` cannot grant approval, insert pins, bypass an empty registry or substitute database metadata. Real public `/v1/mw3/manifest` and `/v1/mw3/part` paths must be used for activated proof; the receipt-injected empty-mode namespace cannot stand in for them.

The exact Python owner remains 19,014 bytes, SHA-256 `61d0fe490ff4e1e82667a8ec188c1206efd1c26067ff8d6061b4bc8a1a67164d`. R1 still requires successful controller completion, exact final-worker birth/owned TERM-or-KILL/reap evidence and rejection of spontaneous or positive-failure final exit. R2 still requires builtin-only capture before application evaluation, the complete captured parent graph, raw/executed TS provenance and exact saved-input/source binding. Both remain necessary in the final real strict proof; this review did not execute them.

## Required next gates and stopping boundary

1. Adopt only the exact proposal into nonproduction source. Keep all raw files, candidate metadata, numerical sources, recipes, gates, saved frequencies and seven limitations unchanged. Record the new registry/source checkpoint and run the relevant tests with no skips under the separate serial resource lease; review any additional relevant source change.
2. Freeze the **final source** before producing genuine source-bound manifests/archives, separate matching independent receipts and exact SQL. Each receipt must bind its actual final manifest/archive/content/source/input hashes, all six fields of both delivery pins and complete evidence/limitations. Do not copy the draft manifest digests or the draft tree into a final receipt merely because delivery hashes are stable.
3. Verify the complete saved inventory and independently restore all 16 actual saved pairs. Establish the actual pinned strict local D1 proof for **each subject** through public routes and all four activated phases, including original whole-file imports/idempotence, immutable-conflict rollback, exact database preservation, restart, late header/part corruption rejection and exact repair. Full-registry digest inclusion alone does not prove the other 15 subjects.
4. Retain the exact Python ownership and R1/R2 parent/API contracts, full outcome/source/runtime/input ledgers, final negative-response/race fixtures and cleanup evidence. Reference SQLite or fake HTTP fixtures do not replace real Wrangler/D1 behavior. No lower sample counts, shortened imports, synthetic-only PASS or omitted phase may be substituted.
5. Complete actual archive/LFS payload upload and fresh fetch/hash verification, final integrated inventory/consumer/backend/full frontend tests, typecheck/build, final exact Node22.20 CI and HU regression requirements. Finish actual Range/Agent browser checks, including all streets, exact combos, original-role-preserving 3-to-2, rewind/reset/retry and failed/missing/stale data. No browser or publication gate is closed by this review.

All seven accepted evidence limitations remain explicit: AI estimate rather than GTO/equilibrium proof; advisory joint MDF; independently reviewed zero-support reasons; same-engine replay; geometric/source-combo coverage rather than joint policy reach; unmodeled outside forced-fold seats; and possible merging of surviving-opponent identities after 3-to-2. The eight quality reviews' detailed errata and residual weaknesses remain applicable.

**Final bounded verdict: GO for the exact nonproduction registry source adoption and subsequent verification work. No production, release, genuine receipt, real strict D1, LFS or browser approval is granted.**
