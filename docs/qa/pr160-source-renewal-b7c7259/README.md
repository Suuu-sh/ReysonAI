# PR #160 source renewal preparation

This packet records a bounded metadata renewal prepared from the exact saved bytes authorized by the independent source-context addendum. It is a candidate for a fresh independent review at the final head; it does not issue numerical acceptance, installable acceptance, merge readiness, or deployment authority.

## Source identity

The prior review head is `b7c7259f88a4ceb11c55139349d934c507a5302c`. The separately collected application source is commit `7c979c8b5e60c5443455d8650ff3448733216bfc`, tree `cdc33e3de4fadca999dba8479ea1ca676e9ebee7`. The Linux run head, actual harness checkout, and actual application tree are distinct identities and are preserved in the addendum and preparation ledger.

The PR was based on development `a9ee6d735f8174cc55dc135975fa220e94604758`; the latest live development observed by the addendum was `ff17d71fbce0aa70c6137dbcfc8a7f2c38eb6733`. Its three changed paths were outside the 18 reviewed source closures. This preparation remains at `b7c7259` and does not claim latest-base integration or merge readiness.

## Bounded updates

Stage 2 source records and aggregate content identity were recollected first. All 1,888 saved artifact records, the 1,747,857-byte archive, fingerprint `b3538b0c…`, and historical counts remain unchanged. Stage 3 was collected only after the renewed Stage 2 receipt was finalized; its source list binds the exact new Stage 2 receipt SHA-256 `22ad5f2a…`. All 1,805 saved artifact records, the 2,436,451-byte archive, fingerprint `a3b44b0e…`, and historical counts remain unchanged.

For the 16 MW3 subjects, the manifest change is limited to `source_tree`, `sources`, `sources_sha256`, and dependent `content_sha256`. The source tree remains the truthful historical collected application tree `cdc33e3…`; it is not relabeled as the b7 root tree. The review receipts bind the new source/manifest identities and record preparation status, while retaining historical numerical author/reviewer fields, evidence, limitations and delivery pins. Each SQL file changes only the receipt-derived hash comment on line 2; archive hash and all SQL statements are unchanged.

The separately downloaded Linux artifact was verified as 308,041 bytes with SHA-256 `97c847bdf626f70eb003114b51a94939c5a9aea07400ab2b17f3bbfd7da1bfcd`. Its diagnostic confirms exact canonical compressed archive equality for all 16 saved MW3 archives, including gzip header byte 9; no archive normalization or replacement was performed. The local official snapshot verifier also validated the renewed source records and saved archive bytes. A local macOS recompression is not used as an equality claim because its gzip header/DEFLATE output differs; the original archive bytes remain unchanged.

## Reporting correction

The Linux MW3 diagnostic left 112 verified decoded files in ignored ephemeral runner paths. The preflop field `raw_restore_files_retained:false` applies only to files created by that preflop restore step; it does not mean every MW3 raw file was removed. Git-clean status does not include ignored paths. No archived data was uploaded, and no production or real-user account history was used.

## Unchanged approval boundary

The original independent report is copied byte-for-byte. No strategy or source implementation, gate, parser, collector, archive, numerical value, compatibility receipt, registry pin, SQL statement, database, deployment, or production data was changed. The current implementation author model remains unknown. Final exact-head verification, CI, and an independent review of the resulting head remain required.
