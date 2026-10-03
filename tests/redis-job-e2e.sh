#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CONTAINER_NAME="reysonai-redis-e2e-$$"
REDIS_PORT="${REYSONAI_REDIS_E2E_PORT:-6391}"
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/reysonai-redis-job-e2e.XXXXXX")

cleanup() {
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

docker run --rm --detach \
  --name "$CONTAINER_NAME" \
  --publish "127.0.0.1:${REDIS_PORT}:6379" \
  redis:7.4-alpine >/dev/null

for _ in $(seq 1 50); do
  if docker exec "$CONTAINER_NAME" redis-cli ping 2>/dev/null | grep -Fxq PONG; then
    break
  fi
  sleep 0.2
done
docker exec "$CONTAINER_NAME" redis-cli ping | grep -Fxq PONG

export REYSONAI_QUEUE_BACKEND=redis
export REYSONAI_REDIS_URL="redis://127.0.0.1:${REDIS_PORT}/"
export REYSONAI_REDIS_PREFIX="reysonai-e2e-$$"
export REYSONAI_REDIS_GROUP="reysonai-e2e-workers"

REYSONAI_REDIS_TEST_URL="$REYSONAI_REDIS_URL" \
  cargo test -p reysonai-job-queue \
  redis_queue_deduplicates_reclaims_retries_and_completes -- --ignored

cargo build --quiet --bin reysonai-worker

python3 - "$ROOT_DIR/configs/cash-6max-100bb.json" "$TMP_DIR/config.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    config = json.load(source)
config["solver"]["iterations"] = 1
with open(sys.argv[2], "w", encoding="utf-8") as destination:
    json.dump(config, destination)
PY

touch "$TMP_DIR/not-a-directory"
ENQUEUE_OUTPUT=$("$ROOT_DIR/target/debug/reysonai-worker" enqueue \
  "$TMP_DIR/config.json" ignored "$TMP_DIR/not-a-directory/output")
FAILED_JOB_ID=$(printf '%s\n' "$ENQUEUE_OUTPUT" | sed -n 's/^Job enqueued: //p')
"$ROOT_DIR/target/debug/reysonai-worker" worker ignored --once >/dev/null

FAILED_STATUS=$("$ROOT_DIR/target/debug/reysonai-worker" status "$FAILED_JOB_ID" ignored)
python3 - "$FAILED_STATUS" <<'PY'
import json
import sys

status = json.loads(sys.argv[1])
assert status["status"] == "failed"
assert status["error"]
PY

"$ROOT_DIR/target/debug/reysonai-worker" retry "$FAILED_JOB_ID" ignored >/dev/null
RETRIED_STATUS=$("$ROOT_DIR/target/debug/reysonai-worker" status "$FAILED_JOB_ID" ignored)
python3 - "$RETRIED_STATUS" <<'PY'
import json
import sys

status = json.loads(sys.argv[1])
assert status["status"] == "pending"
assert status["error"] is None
assert status["attempts"] == 1
print("Redis failure and explicit retry passed")
PY
