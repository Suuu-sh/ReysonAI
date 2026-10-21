# Review-bound three-decision regeneration

The first turn-BTN reason review validly returned `policy-change-required`.
Its diagnostic is preserved, as are the five original artifacts and the failed
independent report. No reason-only overlays are applied and the two old-river
amendment calls are not run.

## Exactly approved scope

One new complete turn-BTN policy, followed by river-BB then river-BTN, on the
existing checkthrough path `As7d2c9h3s`. The unaffected original flop-BTN and
turn-BB decisions remain parents. This is not all boards, action branches,
profiles or a full HU tree. A selected check with zero reach stops this path;
it must not invent or copy an old continuation range.

No existing core, original CLI, artifact schema, provider or artifact is edited.
The original v1 schema accepts a different implementation hash, so each new
complete policy has a new immutable decision ID while original validation
remains valid.

## Explicit parent-owned execution

Dry plan (no inference):

`node apps/frontend/scripts/aiv2-postflop-reviewed-regeneration.ts`

Dry first-stage identity/prompt budget:

`node apps/frontend/scripts/aiv2-postflop-reviewed-regeneration.ts --stage=turn-btn`

Only the authorized coordinating runner executes these individually, in order:

1. `node apps/frontend/scripts/aiv2-postflop-reviewed-regeneration.ts --stage=turn-btn --generate --confirm-one-reviewed-decision`
2. `node apps/frontend/scripts/aiv2-postflop-reviewed-regeneration.ts --stage=river-bb --generate --confirm-one-reviewed-decision`
3. `node apps/frontend/scripts/aiv2-postflop-reviewed-regeneration.ts --stage=river-btn --generate --confirm-one-reviewed-decision`

There is no automatic stage loop. Each normal stage makes one authenticated
local gpt-6.1-sol/medium request containing both exact current ranges, the whole
previous policy, review findings and the terminal diagnostic. The critique is
a hypothesis, not solver/GTO proof. No bluff quota, compulsory bet size, or
particular 85s frequency is required. The output is a complete simultaneous
policy plus faithful EN/JA reasons. One repair is bounded to invalid JSON or
numeric/shape validation; transport/model/auth/quota failures are not replayed.
Each provider turn has a 600-second deadline.

The first root input is derived with `advancePostflopDecision` from the unchanged
original turn-BB check. Both subsequent inputs are derived only from the NEW
verified saved predecessor and its exact own-action frequencies. Old river
inputs/ranges are never fallback sources.

## Identity, proof and isolation

Implementation identity hashes the new CLI and unchanged core bytes plus exact
raw failed-report/terminal-diagnostic hashes. The run plan binds that identity,
the three stage specifications, original IDs and fixed runout. Any changed
source or bound evidence creates a different identity; originals are pinned
by the already-bound review inventory.

Storage is isolated:

`apps/frontend/candidates/aiv2-postflop/llm-postflop-single-response-v1/reviewed-regeneration/<run_id>/`

- `run-plan.json`: immutable explicit three-stage plan.
- `decisions/<new_decision_id>.json`: standard v1 saved complete decision.
- `generation-revisions/<new_decision_id>.json`: immutable revision record.

Each generation record binds the original and replacement raw-file hashes,
failed review and diagnostic, exact parent/action/card/raw/policy hashes,
new input/response/policy hashes, full base and effective prompts, exact output
schema, all corresponding hashes, attempt count, and actual provider-confirmed
model/effort/thread/turn. Its `record_id` hashes the body excluding record_id.
Exclusive creation prevents overwrites; an incomplete artifact/record pair
requires explicit recovery rather than another hidden model call.

`validateSavedRegeneration` checks these bindings and the unchanged v1 numeric
validator. A new parent must have its matching valid generation record before
a later stage can use it. New river IDs cannot be predetermined: the actual
new parent policies/reasons affect their input history and reach.

All replacements remain `pending-independent-review`. The public dashboard
continues to show original artifacts and warnings until a separately approved
explicit active-run manifest selects the two unaffected originals plus three
reviewed replacements. Never merge all eight into apparent coverage or mark
regeneration itself as independent approval. No legacy review/approval receipt
is modified or reused as approval for new bytes.
