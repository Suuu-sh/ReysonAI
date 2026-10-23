# Immutable reviewed reason amendments

This is a presentation-only sidecar for exactly three findings in the unchanged
`docs/qa/aiv2-postflop-checkthrough-review.json` (raw SHA256
`7729cfcf3aa919e0cd9d94de0fa8b7ff73500de15d88d982415fed0e2ab2ed88`).
It does not amend original artifacts, source responses, frequencies, policy
hashes, decision IDs or descendant references.

## Bounded authoring

Run `node apps/frontend/scripts/aiv2-postflop-amend-cli.ts` to list the three
allowlisted decisions without inference. Add `--decision=<exact-id>` for a dry
request identity, scope and prompt size; `--prompt` shows the actual NEW
amendment schema, not the original policy-generation schema.

Only an authorized coordinating runner may add
`--generate --confirm-one-decision-amendment`. This requests one selected saved
decision, gpt-6.1-sol/medium, with both complete live ranges and the complete
current policy. Normal execution is one request. One bounded repair is allowed
only for structurally invalid JSON/patch validation. Transport/model/auth/quota
errors are not retried; every turn has a 600-second deadline.

Evaluate the turn BTN 85s correction FIRST. A valid `policy-change-required`
assessment is a terminal outcome, exits with code 2 and is saved under
`reason-amendments/diagnostics/`. It must not be repaired into a forced
unchanged-frequency assertion, published as an overlay, or followed by the two
old-river correction requests. Full policy/descendant regeneration requires a
separate scoped decision.

A `reason-only` response must explicitly confirm ALL original frequencies
unchanged after whole-range reconsideration. The turn patch contains exactly
8s5s/8h5h/8d5d/8c5c with each exact original mix. Each river patch changes only
its complete bilingual summary. No other field/reason/frequency is writable.
Mix key order is normalized losslessly to saved action order.

## Binding and publication

Candidates live under
`apps/frontend/candidates/aiv2-postflop/llm-postflop-single-response-v1/reason-amendments/revisions/<revision_id>.json`.
Creation is exclusive; existing identities are never silently overwritten.
Base and failed-review raw hashes are rechecked before and after inference.

The exported schema/types in `scripts/aiv2-postflop-reason-amendments.ts` bind:

- Original decision ID and exact original raw file SHA.
- Original input/response/policy hashes.
- SHA256(JSON.stringify({decision_id,input_hash,legal_actions,
  combos:[{combo,hand,reach_weight,mix},...ALL original rows]})).
- Original failed-review raw SHA, exact finding IDs and patch scope.
- Request/model/version/implementation/prompt/schema identity.
- Actual provider-confirmed model, effort, thread ID and turn ID. These cannot
  be inferred from requested settings. Provider metrics are returned by the CLI.

`revision_id` is SHA256(JSON.stringify(revision body without revision_id)).
The independent approval additionally binds exact raw revision file SHA values.
Revision `generation_mode` is `post-generation-review-amendment`, never the
original simultaneous frequency/reason generation. The original metadata
`reasons_generated_with_frequencies` still refers only to the immutable original.

No approval is created by authoring. A separate independent reviewer must
approve all three exact reason-only revisions using schema
`aiv2-postflop-reason-amendment-approval-v1`, scope
`three-saved-decision-reason-only-amendments`, exact revision/base/digest entries,
non-generator actor identity, independent-review relationship and evidence.
Reviewer model may honestly be null when its runtime identity is not attested.
The planned receipt is
`docs/qa/aiv2-postflop-reason-amendments-approval.json`.

Publisher and dashboard must first validate each revision against its exact
pinned original and report, then validate the separate exact approval receipt.
Missing/mismatched/pending/diagnostic revisions are not rendered as corrections.
Keep the original text available and label any approved corrected text as a
later reviewed explanation revision. Original graph transitions and weighted
matrices always use the untouched base artifact. The rejected original review
is preserved; a new approval resolves named findings rather than rewriting it.

Numeric preservation and a fluent correction alone are not an independent
strategy/GTO approval. Any newly identified frequency problem remains a policy
regeneration blocker, not an invitation to cosmetically defend the old mix.

## First actual assessment

The turn-BTN request returned `policy-change-required` in one model response. The validated terminal diagnostic is saved as `diagnostics/14a8d2662b98717176516bbc74a455cf3b8811f984267a113dbcecb0fb3d2e89.json`. It is **not** a replacement range, successful reason revision, or GTO finding. No overlay was applied, and the two old-river summary amendment calls were not made. The affected turn policy and both downstream river decisions require a new, explicitly versioned generation lineage before publication.
