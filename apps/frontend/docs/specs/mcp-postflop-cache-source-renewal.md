# MCP postflop cache control: source-only review renewal

Date: 2026-10-09  
Reviewer: /root/review_postflop_policy_tool  
Reviewed base: 1f14744b503c37b56a6db1a21b6e9363d6c94a55  
Candidate: fb15cf45f1642c5b10f586aaf547b053d7bb609f

## Independent review statement

> base 1f14744b から candidate fb15cf45 の defence.ts cache管理差分を審査した。Web既定動作と数値計算を変えないsource-only更新として承認する。当該範囲のblocking findingは0。元のAstra戦略品質審査、本番性能、全体PRの公開準備完了を再承認するものではない。

## Bound source identity

| File | Before | After |
|---|---|---|
| `apps/frontend/scripts/postflop-ai/defence.ts` | 55,596 bytes; SHA-256 `96c51fecb6c37f88d0c5348ed538168cb72cbe47d2b46c461c5a6b37234eb450` | 56,814 bytes; SHA-256 `808a9dfe3fd436c217556620c3034f914c312a19f3dfb15b989dd9a9d8053cce` |

Receipt content hash: `ad7e6f9b75903c0056c6b451eb7a649858dad7f57fb51f54e0c30c7651c758b9` → `60fa05571900c8b036e90ca7a674133f6a26db2ca05d0648303b8d9f3ad04508`. The source list remains 109 records: this one record changes and the other 108 remain identical. The 1,888 artifact records, LFS archive metadata, source fingerprint, counts, original reviewer attribution, findings, advisories, limitations, and prior renewal entries are preserved.

## Scope limits and separate validation

This is only the independent source-code review stated above. It does not extend the original strategy-quality approval or establish production readiness or CPU/memory safety. The independent reviewer did not restore or re-expand the LFS archive. At receipt authoring, this checkout had only the 132-byte LFS pointer and 274 of 1,888 artifact JSON files; the separate owner CI verification below restored and checked the complete reviewed archive.

## Owner validation after push

The PR merge-ref validation completed successfully for head `1f58c3673236d5ac5b536c040a9ea4acf03b9036`, based on `624139060910ede8d4f55e6ac54c8e085aea7801` (merge-ref commit `e7bcb9826b6b795778cd0c92f88b2e3117c52ffe`). [Reviewed-data workflow run 37895862935](https://github.com/Suuu-sh/ReysonAI/actions/runs/37895862935) restored all 1,614 exact LFS files (43,276,102 bytes), then verified 1,888 reviewed datasets and the original counts: catalog 3,115, saved 1,611, unreachable 1,504, hands 272,259. It explicitly reported `generated_strategies: false`. The same workflow passed continuation invariants, the local D1 roundtrip/rollback suite, typecheck/build, and postflop policy delivery for 85 spots, and retained the validated SQL as an Actions artifact. Its deployment job was skipped.

[Authenticated MCP workflow run 37895862964](https://github.com/Suuu-sh/ReysonAI/actions/runs/37895862964) passed typecheck, the full Workerd-backed test suite (54/54), dry-run build, and existing API contract checks. The separate public postflop runtime configuration and FastFold workflows also passed ([runtime config](https://github.com/Suuu-sh/ReysonAI/actions/runs/37895862996), [FastFold](https://github.com/Suuu-sh/ReysonAI/actions/runs/37895862915)). These checks validate the candidate in CI; they do not claim production CPU or memory evidence, and do not broaden the independent review scope above.
