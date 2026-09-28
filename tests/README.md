# Cross-layer tests

Domain tests live next to each Rust crate so a failure identifies the owning
boundary. This directory contains Queue, Worker, and artifact-promotion tests
for the standalone solver experiment.

Exercise Redis Streams queue failure, retry, and completion in a temporary
Docker container:

```bash
bash tests/redis-job-e2e.sh
```

Validate the local-generation to production-artifact boundary:

```bash
bash tests/solution-promotion-e2e.sh
```

Test the Cloudflare Worker contract with a mocked R2 binding:

```bash
npm test --prefix apps/solveaai-edge-api
```
