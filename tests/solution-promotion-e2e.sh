#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/solveagto-promotion-e2e.XXXXXX")

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

CONFIG_PATH="$TMP_DIR/cash-6max-100bb.json"
python3 - "$ROOT_DIR/configs/cash-6max-100bb.json" "$CONFIG_PATH" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    config = json.load(source)
config["solver"]["iterations"] = 1
with open(sys.argv[2], "w", encoding="utf-8") as destination:
    json.dump(config, destination)
PY

cargo run --quiet --bin solveagto-worker -- \
  solve "$CONFIG_PATH" "$TMP_DIR/generated" >/dev/null
cargo run --quiet --bin solveagto-promote -- \
  "$CONFIG_PATH" \
  "$TMP_DIR/generated/cash-6max-100bb-v1.json" \
  "$TMP_DIR/release" >/dev/null

python3 - "$TMP_DIR/release/manifest.json" "$TMP_DIR/release/solutions/cash-6max-100bb-v1.json" "$TMP_DIR/release/solutions/cash-6max-100bb-v1/summary.json" "$TMP_DIR/release/solutions/cash-6max-100bb-v1/nodes/index.json" <<'PY'
import json
import os
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    manifest = json.load(source)
assert manifest["solutionId"] == "cash-6max-100bb-v1"
assert manifest["iterations"] == 1
assert manifest["artifactHash"].startswith("fnv1a-")
assert manifest["stackBb"] == 100.0
assert manifest["edge"]["summary"] == "solutions/cash-6max-100bb-v1/summary.json"
assert manifest["edge"]["nodesIndex"] == "solutions/cash-6max-100bb-v1/nodes/index.json"
assert os.path.getsize(sys.argv[2]) > 0
assert os.path.getsize(sys.argv[3]) > 0
with open(sys.argv[4], encoding="utf-8") as source:
    assert len(json.load(source)) > 0
print("solution promotion passed")
PY

if cargo run --quiet --bin solveagto-promote -- \
  "$ROOT_DIR/configs/cash-6max-100bb.json" \
  "$TMP_DIR/generated/cash-6max-100bb-v1.json" \
  "$TMP_DIR/invalid-release" >/dev/null 2>&1; then
  echo "promotion unexpectedly accepted a mismatched config" >&2
  exit 1
fi

echo "mismatched config rejection passed"
