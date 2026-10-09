# New-HU observable actions: model 10 implementation candidate

Status (2026-10-04): the independently reviewed contract has been adopted for nonproduction implementation. The exact code diff, complete consumer tests and fresh numerical evidence are still pending. This document is not policy acceptance or release approval. The saved Draft PR checkpoint uses model8; the separately frozen local model9 checkpoint is `b3af21f94ede4119e333722f03adfbc3bf6fb5fe`.

## Why model9 is not the complete correction

Model9 removes only MDF-added calls whose exact sign is negative against the known compatible saved bettor range. It retains raw logistic calls, legal/capped raises, unknown/empty-support behavior and the existing floor allocation. However, different authored size labels can produce the same chips after the existing stack cap/all-in merge. Conditioning a defender on the hidden sampled label gives different ranges and responses to an indistinguishable public action. Model10 keeps the model9 floor rule and corrects this separate observation contract.

The scope is only catalog spots with `spot.history` (407 current nonzero-support HU-after-multiway entries). All45 legacy policy pairs and original reports retain their bytes, source fingerprints, model6 behavior and artifact identity. The Agent's existing `no_multiway` rule is unchanged: 68 of these407 paths are naturally reachable under that table rule, not all407.

## Physical transition and canonical history

A pure shared transition projects each legal label to its paid chips, street-total amount, remaining stacks and commitments, semantic family, terminal/next-actor result and effective next-response raise legality. Fold/check are distinct despite both paying zero. Preserve the existing unrounded flop merge comparison and rounded later-street comparison. A class chooses the configured explicit `allin` token when present, otherwise its first configured member. Singleton tokens stay unchanged. Actual all-in metadata drives captions even when flop/turn use a size token because those streets have no explicit allin node.

Engine logs, every earlier action's reach factor, response-node lookup, caches, facts, profile registry keys and consumers use the same canonical public history. A raw sampled label may appear only as diagnostic provenance. At the input boundary, validate the old full structural path before canonicalizing it. Thus an old merged regular bet followed by an impossible requested raise still becomes a call; explicit allin followed by raise is illegal, and no suffix may continue after an effective call. URL `B33/B75/B125` remain percentage-label tokens, never silently reinterpreted as paid amounts.

The current positive catalog geometry is pot19–79BB, stack70–92BB. Distinct unmerged opening sizes differ by at least7.98BB, so cent rounding cannot merge them here. For a future unknown non-all-in multi-label collision with legal raises, the runtime fails closed instead of selecting an arbitrary latent raise row. A catalog/config regression and synthetic collision test bind this assumption.

## Preserve the generative bettor strategy, then pool

Keep authored rules, impossible-raise collapse, river rerouting and **each individual label's existing bluff cap** in their original order. Pool only the final actually played masses, including cap rounding and the existing ordered sampler's final-action remainder. Never cap a previously pooled mix or normalize one label's range before summing it with another. Balanced sampling remains one draw over the original ordered raw labels followed immediately by projection; raw/reference and Agent profile overrides retain their existing uncapped source behavior.

For public class C, the action likelihood is the sum of final mass over its member labels. Apply that likelihood at every observed history entry. Existing reach still models saved-policy-plus-cap paths; this correction does not silently replace it with fully Bayesian reach under every computed call decision or under another opponent profile.

Keep label-specific cap internals, but expose public class pre/post value and bluff masses from actual final probabilities. `capped`/`wasReduced` means positive weighted bluff mass was actually removed. Preserve this provenance trigger for the inherited MDF ceiling. It does not prove that the pooled range saturates the break-even bluff ratio: an under-bluffed label mixed with a clipped label can remain under-bluffed. Changing that ceiling criterion would be a separate model revision.

## Consumers, identities and acceptance

- Range rows, exact-combo/weighted summaries, explanations, local/browser routes, stored-base histories, Agent options/labels/logged amounts and inference share the projection. Invalid new-HU structural nodes are explicitly unavailable, never raw-policy fallbacks.
- Exact EV constructs one child per physical class and prunes only after aggregation; raw aliases must not become separate evidence or independently pruned branches. These remain offline research tools, not product EV features.
- New-HU defence and observable-action identities are10. Raw reports also carry the scoped action identity. Earlier reports/bases/offline-EV/proofs must fail freshness. No global legacy simulation-version bump and no metadata-only report renewal.
- Required regressions include partial/full/singleton classes, both roles/trees/all streets, raise chains, rounding boundaries, imported aliases/invalid tails, missing support, raw/profile sampling, canonical facts and all45 legacy byte/numeric behavior.
- Required actual evidence remains fresh representative simulation at the configured12 boards ×6 comparisons ×10,000 paired deals, independent fixed-seed replay, and all1,755 canonical-flop audit with existing later coverage; then the same per-spot gates for the remaining authored scope. Repeated aliases do not count as independent successful branches.

Model10 does not prove equilibrium. Model9's lower-than-MDF robustness tradeoff remains, and the inherited ceiling can still trim positive model-EV calls. Opponent profiles use different assumed ranges. Report achieved defense, active floor/ceiling, remaining raw negative-call tails and candidate/comparator differences honestly. Policy acceptance remains0/407 until independent quality review and all required current-identity gates pass.
