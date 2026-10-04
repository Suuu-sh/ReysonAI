# Current service notice — review notes (2026-10-04)

Published page source: `apps/frontend/src/site/legal-content.ts`, routes `/terms` and `/privacy` (all four locales).

Operator/contact were supplied by the user: **Suu**, **yisshiki39@gmail.com**. No other identity or address was inferred.

The pages describe verified implementation rather than copying the older `terms-ja.md` draft: Google OpenID/email sign-in, Cloudflare/D1 account-scoped records, guest localStorage, explicit guest import, server-authoritative ranked records and pseudonymous leaderboard statistics. Practice scores/ratings are not GTO/EV/win-rate evidence. Plus billing is not active. No blanket liability exclusion, zero-yen liability cap or unilateral immediate-change clause was carried forward.

## Operational/legal review still needed

- Verify operator legal name/address disclosure obligations for held personal data (PPC guidance §3-8-1). Supplied “Suu” is used as given, not asserted to be a registered company. No legal-compliance certification is made.
- Set an intentional retention/deletion policy. The current application has no account/practice/ranked automatic deletion TTL. Cookie expiry is not data deletion. Do not invent a fixed retention period.
- Document the manual workflow for verified requests arriving at the supplied email: account identity verification, account data plus ranked records, provider backups and lawful exceptions where applicable. No completion deadline or automatic deletion promise appears on the page.
- Review actual Google/Cloudflare processing locations and overseas-transfer obligations, including applicable regional rights. The page does not promise Japan-only storage or name unverified processing countries.
- Review consent presentation before treating these terms as an accepted contract; merely linking pages does not record consent. Paid seller/renewal/cancellation disclosures must be separately completed before billing launches.

## Authoritative references consulted

- [PPC General Guidelines](https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/) — use purposes, held-data disclosures and access/correction/suspension requests.
- [Ministry of Justice standard terms explanation](https://www.moj.go.jp/content/001259612) — appropriate notice/content/effective date for changes; not an unrestricted immediate rewrite.
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) — identifier/email scopes and claims.
- [Google Privacy Policy](https://policies.google.com/privacy) and [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/) — provider handling and international processing.
