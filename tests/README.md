# Cross-layer tests

Domain tests live next to each Rust crate so a failure identifies the owning
boundary. This directory contains black-box API, Queue, Worker, and artifact
promotion tests that cross those boundaries.

Run the API/Worker lifecycle smoke test from the repository root:

```bash
bash tests/api-job-e2e.sh
```

The test uses a one-iteration temporary configuration and verifies job
deduplication, Worker completion, persisted-solution reuse, and API resolve.
Failure and retry state transitions are covered by the `job-queue` crate tests.

Run the same lifecycle against Redis Streams in a temporary Docker container:

```bash
bash tests/redis-job-e2e.sh
```

Validate the local-generation to production-artifact boundary:

```bash
bash tests/solution-promotion-e2e.sh
```

Test the Cloudflare Worker contract with a mocked R2 binding:

```bash
npm test --prefix apps/solveaai-external-api
```
