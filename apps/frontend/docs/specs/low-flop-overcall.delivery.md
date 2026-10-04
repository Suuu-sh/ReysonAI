# Low-flop research Draft delivery

This is source/provenance preservation for an unapproved offline experiment, not a completed user-facing quality fix.

- Target: private `Suuu-sh/ReysonAI`, branch `fix/low-flop-evidence-preview`, Draft PR against `development`.
- Remote base inspected: `506b1235689189ec634f6dc5d7d3832d88ad0da8`.
- No automatic merge, production import, legacy policy rewrite, classifier replacement or old-report refresh is included.
- The active experiment is closed-driver v3, using only the four original exact negative contexts. Its new 36-contract execution gate is pending; v1/v2 logs retain their original identities.
- The fixed evidence comes from main `2064a41011f0e91685e592c6e5f4c07f07ba7570`, with the full inherited runtime/fallback behavior. It must not be relabeled as evidence for a newer runtime.

## Real archive delivery is still pending

`artifacts/postflop/low-flop-research-v1.tar.gz` is committed as a Git LFS pointer. The preserved real object has 1,911,780 bytes and SHA-256 `31294eff5249b46fd737cfa97d0809c103381b80fc7e419eb89261f166b0adfa`. Its 467 members total 38,976,270 bytes.

Local fresh restore, full byte verification and manifest-pinned repack have passed. **GitHub LFS object upload and a clean remote materialization have not passed yet.** The pointer alone is not artifact delivery. Keep the PR in Draft and do not treat missing bytes as authorization to synthesize policies, use a reference strategy or skip the mandatory research gate.

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
