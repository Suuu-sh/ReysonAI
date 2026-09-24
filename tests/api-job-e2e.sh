#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/solveaai-internal-api-job-e2e.XXXXXX")
QUEUE_DIR="$TMP_DIR/jobs"
SOLUTION_DIR="$TMP_DIR/solutions"
CONFIG_PATH="$TMP_DIR/cash-6max-100bb.json"
API_LOG="$TMP_DIR/api.log"
PORT="${SOLVEAAI_E2E_PORT:-3311}"
BASE_URL="http://127.0.0.1:${PORT}"
API_PID=""

cleanup() {
  if [[ -n "$API_PID" ]]; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$QUEUE_DIR" "$SOLUTION_DIR"
cat > "$CONFIG_PATH" <<'JSON'
{
  "game": "Cash",
  "players": 6,
  "stack_bb": 100.0,
  "ante_bb": 0.0,
  "positions": ["UTG", "HJ", "CO", "BTN", "SB", "BB"],
  "sizing": {
    "open_sizes_bb": [2.5],
    "three_bet_ip_multiplier": 3.0,
    "three_bet_oop_multiplier": 4.0,
    "four_bet_multiplier": 2.2,
    "five_bet_all_in": true
  },
  "solver": {
    "iterations": 1,
    "strategy": "dcfr"
  }
}
JSON

cargo build --quiet -p solveaai-internal-api -p solveaai-worker

SOLVEAAI_SOLUTION_DIR="$SOLUTION_DIR" \
SOLVEAAI_QUEUE_DIR="$QUEUE_DIR" \
SOLVEAAI_ENABLE_GENERATION="true" \
SOLVEAAI_CONFIG_PATH="$CONFIG_PATH" \
SOLVEAAI_SOLUTION_ID="cash-6max-100bb-v1" \
SOLVEAAI_API_BIND="127.0.0.1:${PORT}" \
  "$ROOT_DIR/target/debug/solveaai-internal-api" >"$API_LOG" 2>&1 &
API_PID=$!

for _ in $(seq 1 50); do
  if curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    cat "$API_LOG"
    exit 1
  fi
  sleep 0.2
done
curl -fsS "$BASE_URL/health" >/dev/null

FIRST=$(curl -fsS -X POST "$BASE_URL/v1/preflop/jobs" \
  -H 'content-type: application/json' -d '{}')
SECOND=$(curl -fsS -X POST "$BASE_URL/v1/preflop/jobs" \
  -H 'content-type: application/json' -d '{}')

python3 - "$FIRST" "$SECOND" <<'PY'
import json
import sys

first = json.loads(sys.argv[1])
second = json.loads(sys.argv[2])
assert first["created"] is True
assert first["deduplicated"] is False
assert first["status"] == "pending"
assert second["created"] is False
assert second["deduplicated"] is True
assert second["jobId"] == first["jobId"]
print(f"deduplicated job: {first['jobId']}")
PY

JOB_ID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["jobId"])' "$FIRST")
SOLVEAAI_QUEUE_DIR="$QUEUE_DIR" \
  "$ROOT_DIR/target/debug/solveaai-worker" worker "$QUEUE_DIR" --once >/dev/null

STATUS=$(curl -fsS "$BASE_URL/v1/preflop/jobs/$JOB_ID")
python3 - "$STATUS" <<'PY'
import json
import sys

status = json.loads(sys.argv[1])
assert status["status"] == "succeeded"
assert status["solutionAvailable"] is True
assert status["attempts"] == 1
print("job succeeded")
PY

RESOLVE=$(curl -fsS -X POST "$BASE_URL/v1/preflop/resolve" \
  -H 'content-type: application/json' \
  -d '{"solutionId":"cash-6max-100bb-v1","heroPosition":"HJ","actions":[{"position":"UTG","action":"raise","sizeBb":2.5}]}' )
python3 - "$RESOLVE" <<'PY'
import json
import sys

response = json.loads(sys.argv[1])
assert response["solutionId"] == "cash-6max-100bb-v1"
assert response["heroPosition"] == "HJ"
assert len(response["node"]["combos"]) == 1326
print("resolve succeeded")
PY

AVAILABLE=$(curl -fsS -X POST "$BASE_URL/v1/preflop/jobs" \
  -H 'content-type: application/json' -d '{}')
python3 - "$AVAILABLE" <<'PY'
import json
import sys

response = json.loads(sys.argv[1])
assert response["solutionAvailable"] is True
assert response["created"] is False
assert response["jobId"] is None
print("saved solution is reused")
PY

echo "API job lifecycle E2E passed"
