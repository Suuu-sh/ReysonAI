# Independent static re-review of the offline veto candidate

Reviewed source HEAD: `d7a4ddcf83a12438ab5d5248182691fc77608eb0`.
Numerical candidate code unchanged from `66bec8e`.
Reviewer was separately assigned the requested Astra review; the runtime did not independently expose a model identifier. No Node execution or source edits were performed by the reviewer.

## Verdict

The previously identified implementation issues are corrected. No new blocker was found to continuing the narrowly scoped offline candidate validation. Delivery, runtime application and model changes remain unapproved.

## Independently confirmed

- The receipt key matches the gate. Mutation tests first establish a valid synthetic positive control.
- The builder closure includes Gate, Builder, audit helper and diagnostic helper; each dependency has an isolated mutation rejection test.
- Six saved input files have raw-byte identities. Semantically equivalent whitespace changes cannot reuse an earlier certificate/receipt.
- The builder validates forced call, zero-increment fold, sample count, observed bounds, variance, standard error, positive-result count and protocol/source/policy/mix consistency.
- Only added call returns to fold. Raw calls and raises remain fixed. Integer micropercent conservation and exact JavaScript totals are both checked; drift is rejected rather than normalized.
- No floor/ceiling recalculation or redistribution into another hand occurs.

Gate SHA-256: `6c7049b10f3a41630aefc26363438ae7f3a19a78b33aa3cc133ecf04be6c3b67`.

Builder dependency-closure SHA-256: `6a0d29aeb2549fcbf84c04959b76b8c4b1daad3a0e70c517477921caa934ffcc`.

The reviewer independently recomputed the closure with Python, verified all eight recorded source/test identities, raw-report hashes and saved-input byte records. The pass2 logs contain 27/27 passing contracts and zero skips; the runner requires the pinned fixtures. The earlier Welford exact-equality assertion was the sole pass1 failure; a 1e-14 tolerance is appropriate for its binary64 roundoff.

Direct comparison of both 128-sample parity JSONs confirmed exact reach, initial mix, rollout and input/policy identities. This covers one uncapped root only. The cap-active helper test verifies call order, not an integrated cap-active engine case.

All seven binding replays leave the default unapplied without a trusted receipt. Explicit previews apply only to the original four negative cases, returning 98, 99, 93 and 92 call percentage points to fold. Raw calls, raises and totals are preserved. The draw, set and AK controls are unchanged. Every preview carries `production_eligible: false`.

## Remaining acceptance conditions

1. Reproducible pinned-fixture delivery/storage and a mandatory research gate. An ordinary checkout may skip the dependent tests.
2. Candidate-wide statistical accounting. Original seven plus additional eight spend a nominal .02 union bound, not .01.
3. Integrated gate execution across all affected combinations. The four-row substitution in 21,546 archived rows is useful but is not this audit.
4. Completion and independent review of the additional eight cases. Their results cannot automatically expand application scope.
5. A trusted source of review receipts. The gate is not an authenticity verifier for arbitrary receipt JSON.

This review predates examination of the eight additional outcomes; those require their own result review.
