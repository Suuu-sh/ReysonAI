# Low-flop research Draft delivery

This is source/provenance preservation for an unapproved offline experiment, not a completed user-facing quality fix.

- Target: private `Suuu-sh/ReysonAI`, branch `fix/low-flop-evidence-preview`, Draft PR against `development`.
- Remote base inspected: `506b1235689189ec634f6dc5d7d3832d88ad0da8`.
- No automatic merge, production import, legacy policy rewrite, classifier replacement or old-report refresh is included.
- The active experiment is closed-driver v3, using only the four original exact negative contexts. Its 36-contract local execution gate and independent limited-research review passed; v1/v2 logs retain their original identities.
- The fixed evidence comes from main `2064a41011f0e91685e592c6e5f4c07f07ba7570`, with the full inherited runtime/fallback behavior. It must not be relabeled as evidence for a newer runtime.

## Remote materialization and execution status

`artifacts/postflop/low-flop-research-v1.tar.gz` is committed as a Git LFS pointer. The preserved real object has 1,911,780 bytes and SHA-256 `31294eff5249b46fd737cfa97d0809c103381b80fc7e419eb89261f166b0adfa`. Its 467 members total 38,976,270 bytes.

Local fresh restore, full byte verification and manifest-pinned repack passed. On 2026-10-05, the GitHub LFS object was uploaded and fetched into empty Mac storage with matching size/SHA. A fresh exact-head checkout restored all 467 members. Its first mandatory research gate failed before any contract because staging assumed source files inherited from the authoring HU branch. Staging version 2 explicitly uses the archived core plus current research files; fresh remote execution of this correction is still required. Keep the PR in Draft. See `low-flop-overcall.portable-staging.md`.

Once the exact object is available through the authorized repository LFS workflow:

```sh
python scripts/research/low_flop_fixture.py verify-archive
python scripts/research/low_flop_fixture.py restore --root .local/low-flop-restored
python scripts/research/low_flop_runtime_gate.py \
  --root .local/low-flop-restored \
  --output .local/low-flop-runtime-acceptance
```

The output roots must be fresh. These commands never repeat the 8,192-sample studies or mutate the archived policy bytes. The explicit mandatory gate, rather than an ordinary test run with fixture-dependent skips, determines local research execution acceptance.

## Provenance and limits

Local authoring checkpoint IDs in historical reports are local Git provenance, not promises that those commits exist as remote refs. The archive contains the exact checkpoint source subset; its manifest/file identities and the verified remote main blobs anchor reproducibility. The initial `pack` command needs the original authoring history and inputs. Portable exact reconstruction uses `repack` from a verified restored root and the fixed manifest.

Nine of fifteen selected continuation cases have negative conservative intervals, four are inconclusive and two are positive under the fixed runtime. That selected research does not justify a broad calling rule. The experimental activation stays at four exact rows among 21,546 checked rows. There is no GTO or optimal-frequency claim. Actual application would need a trusted approval supply path, model/derived-artifact handling, fresh-runtime validation and a separate production decision.

## Historical remote failures and current correction

The first Draft head `02a960a11b29cd8588105b6a5df786a62ba02297` passed the public postflop runtime-config check. The reviewed-data workflow stopped during checkout because the exact research LFS object returned server 404; its deployment job was skipped. That LFS 404 was resolved after real object transfer. Attempt 2 passed checkout but the unchanged Stage2 receipt rejected the additive research LFS attribute. Independent source-only review accepted a separate, narrowly scoped receipt amendment in commit `3ca065ada06e2e8385d87dd493cb8aca98ef2267`. No LFS check or required gate was weakened. The separate research staging defect and its unexecuted fresh-remote acceptance remain explicitly open.
