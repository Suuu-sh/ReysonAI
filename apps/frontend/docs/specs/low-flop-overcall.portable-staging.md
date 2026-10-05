# Portable research staging correction

Status: independent review accepted staging version 2 as a limited delivery correction after independently repeating the Python contracts and exact staging comparison. A new fresh remote mandatory execution is still required. The closed preview remains unapproved and covers only the four original exact contexts. No policy, numerical report, archived source, runtime driver or production consumer changes.

## Two separate delivery failures

The LFS object `31294eff5249b46fd737cfa97d0809c103381b80fc7e419eb89261f166b0adfa`, 1,911,780 bytes, was uploaded to the private repository and independently fetched into empty Mac storage. A fresh checkout of PR45 head `5d3ff5f1ecbfb1c703ad7daf45ca40b1492ea1e9` restored all 467 exact archive members.

GitHub Actions run `37230240831`, attempt 2, then passed LFS checkout but stopped at the Stage2 source seal. The existing 77-byte `.gitattributes` prefix remained identical; the added research LFS rule changed that file to 239 bytes. All other 85 sealed source records, 1,888 artifact records, the archive, original review/renewal, source fingerprint and both previous amendments were preserved. Independent source-only verification accepted the corresponding receipt amendment. Commit `3ca065ada06e2e8385d87dd493cb8aca98ef2267` records that amendment separately and does not renew strategy-quality acceptance.

The fresh Mac research gate encountered a different failure: `copy_candidate` attempted to read `apps/frontend/scripts/data/hu-after-multiway-spots.json` from the checkout. The archived candidate was authored in a HU-derived branch. Of its 43 required files, three were absent from PR45 and six inherited core files differed from that authoring branch. **Zero contracts ran; both 128-sample parity runs and all seven replays had not started.** The earlier local 36/36 result was valid only for its recorded authoring source identities and did not establish portable remote execution.

## Explicit source contract

The unchanged LFS fixture already contains the complete 43-file candidate closure. Staging version 2 always selects 32 inherited core/input files from this hash-verified archive and exactly 11 research-owned files from the current checkout. The latter include the current four contract test scripts and research entry points. The current runtime driver, pins, runtime test and two pinned review files are staged afterward as before.

The source origin is fixed by an explicit research-file set. There is no fallback based on file availability. An absent current research file fails even when an archived copy exists. Changed or absent archived core fails even when checkout bytes exist. The archive and manifest are unchanged. The candidate mode is recorded as `archived-core-with-current-research`, together with staging version 2 and per-file origins. The explicit `--checkpoint` mode retains its distinct all-archived meaning.

This keeps the experiment's inherited source dependencies inside the isolated research run. It does not add the HU branch's runtime or data to the application's canonical source paths, remove a test, substitute a reference strategy, or re-label old evidence as validation of the latest application core.

## Checks completed before fresh execution

- Python contracts: 32 passed, including six new portable-staging regressions. These do not execute Node.
- A minimal checkout containing only the 16 required current research/runtime/review files successfully staged the full candidate despite having no live inherited core.
- All 138 staged source/test/policy records matched the earlier accepted local v3 execution byte for byte: 133 core/contract/policy records plus five runtime/review records.
- All 467 restored fixture members were reverified. The original archive and 90 legacy policy files remain unchanged.

Independent read-only verification repeated all 32 Python contracts successfully in 0.148 seconds and rebuilt the minimal checkout in a fresh output directory. All 16 current Git blobs, 43 source origins, 138 staged records and 467 fixture members matched. No Node process was started during that review. This accepts the explicit staging correction only.

These checks establish byte-equivalent staging and rejection behavior. They do not substitute for the fresh remote mandatory 36-contract, 128-sample parity and seven-replay run. No 8,192-sample study needs to be repeated for this staging correction.
