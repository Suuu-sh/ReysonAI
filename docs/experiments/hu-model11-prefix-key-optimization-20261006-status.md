# HU model11 prefix-key optimization checkpoint — 2026-10-06 UTC

The bounded one-slot prefix-key memo passed the existing 43 tests and five matched `As7d2c` all-street probes covering 2,061 requested prefixes. The full ordered result payloads, including proofs and cache diagnostics, match the `5dbd208` baseline after omitting only `diagnostics.elapsedMs`. The independent review clears this source transition for separately bound next-case checks; it does not accept another policy or all 1,755 flops on the new source.

## Source and evidence identity

- Baseline: `5dbd208d2ba70ceec2934efab9de134a5dc19e1c`, source tree `f56e0e98fbc31bf2dd633ad1e73dc3470fc23835`.
- Tested memo source: `3e955abeb6af528b5469b9cfff7012ad5bc53a3c`, tree `448feef556f45a978e4b5e086c3c496a0467c1e1`. Only `apps/frontend/scripts/postflop-ai/effective-reach.mjs` changes from the baseline; its SHA-256 is `3aacad94471833d6dcf720eedc372e6812171bf38af8a601dd0b75da7edfb38b`.
- Next-case execution binding: `4b6b39a613afe72a2362f85aa93a305cd61b3586`, tree `cf4c70d5fe5cfb5fb612be325d3262fc23e23c68`. This adds the exact four current model11 gate/allboard inventory bindings to the tested memo source. It changes no additional numerical implementation.
- [Unmodified independent actual-result receipt](hu-model11-prefix-key-optimization-20261006.json), SHA-256 `167f1435d061abb977c6210c4cdacecbc37de6e04b38318c9525d03bb63f6bd3`. The receipt's original artifact paths remain historical evidence locations, not repository-relative executable inputs. Its candidate identity refers to the actual tested memo source, not this later preservation commit.

This research checkpoint copies those exact five changed files onto research parent `bd1b2072653058f4109407bb947c53d14adada72` and adds only this note and the unchanged receipt. Its remote commit and tree are separate preservation identities containing the accumulated research metadata. Neither executed commit is relabelled as the remote preservation commit.

## Observed result and limits

All 40 existing Node tests and 3 existing Python tests passed. All ten benchmark processes exited zero without a stop and respected their resource limits. The summed gate wall time was 74.690 seconds for the baseline and 65.484 seconds for the memo. Each family has one matched measurement only; this is neither a statistical speed guarantee nor evidence of a general workload improvement. The full actual logs, resource receipts, before/after source bindings, ordered comparison reports and result payloads remain in the preserved archive.

The [pilot](hu-model11-pilot-acceptance-20261006-status.md), [cold-four-bet](hu-model11-cold4bet-acceptance-20261006-status.md) and [CO-squeeze](hu-model11-co-squeeze-acceptance-20261006-status.md) acceptances remain bound to the original `5dbd208` source and their original limitations. They are not reissued for this optimization. At checkpoint preparation, the next native cold-call case is actively in its initial quality gates and is not accepted. Historical acceptance/report bytes, policy thresholds, public validation and the default 45 remain unchanged.

## Preserved archive

Library `libfile_828857f5aae88191b3f9ad53ad99a9b0`, version 6: `hu-model11-prefix-key-verified-and-next-case-ready.tar.gz`, 6,439,805 bytes; SHA-256 `c94bd9bf752ccb09de5f0000beedadcac2833f1c0e19e3b165ed73df8fb7d08c`.

The confirmed Library replacement and local archive hash preserve the full proof/test package, exact source transition patch, raw executed commits and source bundle. This GitHub checkpoint contains the source, transition note and compact independent receipt; the archive pointer is not a claim that GitHub hosts the raw evidence or that a fresh Library download was performed.

This preservation changes only `research/hu-model11-preservation-5dbd208-20261005`. It performs no new numerical execution, PR creation/comment, merge, runtime adoption, typed integration or production deployment.
