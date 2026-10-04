# Current service notice — review notes (2026-10-04)

Published page source: `apps/frontend/src/site/legal-content.ts`, routes `/terms` and `/privacy` (all four locales).

Operator/contact were supplied by the user: **Suu**, **yisshiki39@gmail.com**. No other identity or address was inferred.

The pages describe verified implementation rather than copying the older `terms-ja.md` draft: Google OpenID/email sign-in, Cloudflare/D1 account-scoped records, guest localStorage, explicit guest import, server-authoritative ranked records and pseudonymous leaderboard statistics. Practice scores/ratings are not GTO/EV/win-rate evidence. Plus billing is not active. No blanket liability exclusion, zero-yen liability cap or unilateral immediate-change clause was carried forward.

## Operational/legal review still needed

- Confirm the operator's legal identity/address and the actual response process for providing those details to data subjects. PPC guidance §3-8-1 requires the name/address (and a corporate representative where applicable) to be knowable to the person, including by answering a request without delay. An email contact alone does not establish that this process exists. Supplied “Suu” is used as given, not asserted to be a registered company; no identity or address was invented and no legal-compliance certification is made.
- Set an intentional retention/deletion policy. The current application has no account/practice/ranked automatic deletion TTL. Cookie expiry is not data deletion. Do not invent a fixed retention period.
- Document the manual workflow for verified requests arriving at the supplied email: account identity verification, account data plus ranked records, provider backups and lawful exceptions where applicable. No completion deadline or automatic deletion promise appears on the page.
- Review actual Google/Cloudflare processing locations and overseas-transfer obligations, including applicable regional rights. The page does not promise Japan-only storage or name unverified processing countries.
- Review consent presentation before treating these terms as an accepted contract; merely linking pages does not record consent. Paid seller/renewal/cancellation disclosures must be separately completed before billing launches.

## Release evidence (2026-10-04)

- [PR #40](https://github.com/Suuu-sh/ReysonAI/pull/40) merged the legal pages and server-ranked practice to main commit `ab46b0472c5eea455737ced9cd7a425f74ff6e43` at 13:38 UTC.
- [Production workflow 37206318169](https://github.com/Suuu-sh/ReysonAI/actions/runs/37206318169) completed successfully, including exact additive ranked schema application, API deployment, a live `/v1/ranked/status` readiness check, frontend deployment and reviewed preflop import. This is deployment evidence, not evidence of a completed authenticated browser match or a legal-compliance certification.
- The admin `release_terms` item tracks availability of `/terms` and `/privacy`, their four locales and the AI/GTO limitations. It is complete because those pages were shipped. The operational/legal items above remain open; marking page delivery complete does not close them.
- Ranked readiness still fails closed on missing authentication configuration, account/ranked schema or published question inputs. Scores and rating updates use server-issued snapshots, authenticated account ownership and an atomic finalization trigger. Daily quotas, expiry and duplicate/replayed submissions are server-enforced. Browser records are not authoritative. The practice policies are inspectable learning material; this is not a claim of cheat-proof competitive play.

The PPC general guidance (June 2026 revision) and the Consumer Affairs Agency's consumer-contract-law materials were checked on 2026-10-04. The existing text retains mandatory-law/consumer-rights safeguards instead of a blanket liability waiver. Policy wording was not changed to promise deletion deadlines, processing locations, billing conditions or acceptance that have not been established.

## Authoritative references consulted

- [PPC General Guidelines](https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/) — use purposes, held-data disclosures and access/correction/suspension requests.
- [Consumer Affairs Agency: Consumer Contract Act](https://www.caa.go.jp/policies/policy/consumer_system/consumer_contract_act/) — consumer-contract and liability-clause review reference.
- [Ministry of Justice standard terms explanation](https://www.moj.go.jp/content/001259612) — appropriate notice/content/effective date for changes; not an unrestricted immediate rewrite.
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) — identifier/email scopes and claims.
- [Google Privacy Policy](https://policies.google.com/privacy) and [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/) — provider handling and international processing.
