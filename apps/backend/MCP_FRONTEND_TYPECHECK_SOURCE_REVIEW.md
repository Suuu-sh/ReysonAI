# MCP/frontend Worker type-split source-only review

- Review date: 2026-10-10 UTC
- Reviewed source head: `da27207eae11c0d33ca89a8c5f12710b6c3fb37a`
- Reviewer: independent source-only reviewer (`/root/source_only_review`)
- Scope: TypeScript project separation for browser and Worker code, its package typecheck wiring, and source-receipt renewal boundaries.
- This is source/configuration review only. It does not renew strategy, numerical, saved-data, production, merge, or deployment approval.

## Findings

The browser `apps/frontend/tsconfig.json` includes only `src/**/*.ts` and `src/**/*.tsx` and keeps `vite/client` types. It no longer pulls Worker declarations into the browser project.

The Worker project in `apps/frontend/tsconfig.worker.json` includes backend and MCP source, the generated Worker environment declarations, and the pinned `@cloudflare/workers-types` declarations. Its explicit `lib: ["ES2022"]` excludes TypeScript's DOM library, resolving the earlier DOM-global concern. The package `typecheck` script runs the browser, Worker, and existing runtime projects sequentially.

The reviewed deployment workflow installs `apps/mcp` dependencies before invoking the frontend typecheck, so the explicitly included MCP Worker type declarations are available in that path. The reviewer found no blocking configuration issue. A local typecheck after installing only frontend dependencies would not have the MCP types available; the reviewer did not run a compiler check.

## Receipt renewal boundary

The only direct Stage 2 and Stage 3 source row affected by this typecheck wiring is `apps/frontend/package.json` (2,585 UTF-8 bytes, SHA-256 `e758dd947c258287bc5b334e55e733b82f5e61de9a3c5660f16d362aea8ce981`, replacing 2,514 bytes, SHA-256 `7aa07c287011bd5c2f303680bc6f3fa07203ddb7692ed53b38b8de0907222696`). Stage 3 also rebinds `configs/multiway-preflop-stage2.review.json` to the renewed Stage 2 receipt. The `tsconfig.worker.json` configuration is not listed in either receipt's source records. No strategy, policy, saved data, artifact record, archive, count, or source fingerprint is regenerated or changed.

Preserve all prior review history and all Stage 2/Stage 3 artifacts, archives, counts, and fingerprints. Exact-head CI must run after these receipt updates.

## References

- [Cloudflare Workers TypeScript](https://developers.cloudflare.com/workers/languages/typescript/)
- [Cloudflare Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [TypeScript `lib` option](https://www.typescriptlang.org/tsconfig/#lib)
