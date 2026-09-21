# Cross-layer tests

Domain tests live next to each Rust crate so a failure identifies the owning
boundary. This directory is reserved for black-box API and SDK fixtures once
the service is deployed as a separate process.

Run the API/Worker lifecycle smoke test from the repository root:

```bash
bash tests/api-job-e2e.sh
```

The test uses a one-iteration temporary configuration and verifies job
deduplication, Worker completion, persisted-solution reuse, and API resolve.
Failure and retry state transitions are covered by the `job-queue` crate tests.
