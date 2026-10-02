#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RELEASE_DIR=${1:?"usage: scripts/publish-solution-r2.sh <release_dir> [bucket]"}
BUCKET=${2:-solveaai-solutions}
MANIFEST="$RELEASE_DIR/manifest.json"

if [[ ! -f "$MANIFEST" ]]; then
  echo "missing manifest: $MANIFEST" >&2
  exit 1
fi

UPLOAD_LIST=$(mktemp "${TMPDIR:-/tmp}/solveaai-r2-upload.XXXXXX")
cleanup() {
  rm -f "$UPLOAD_LIST"
}
trap cleanup EXIT

python3 - "$MANIFEST" "$RELEASE_DIR" > "$UPLOAD_LIST" <<'PY'
import json
import pathlib
import sys

manifest_path = pathlib.Path(sys.argv[1])
release_dir = pathlib.Path(sys.argv[2]).resolve()
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
artifact = manifest.get("artifact")
if not isinstance(artifact, str) or not artifact.startswith("solutions/") or ".." in pathlib.PurePosixPath(artifact).parts:
    raise SystemExit("manifest contains an invalid artifact path")

def add(relative_path):
    if not isinstance(relative_path, str) or not relative_path.startswith("solutions/"):
        raise SystemExit(f"invalid release path: {relative_path}")
    path = (release_dir / relative_path).resolve()
    if release_dir not in path.parents or not path.is_file():
        raise SystemExit(f"missing release artifact: {path}")
    print(f"{relative_path}\t{path}")

add(artifact)
edge = manifest.get("edge") or {}
for field in ("summary", "nodesIndex"):
    if field in edge:
        add(edge[field])

nodes_prefix = edge.get("nodesPrefix")
if nodes_prefix:
    if not isinstance(nodes_prefix, str) or not nodes_prefix.startswith("solutions/"):
        raise SystemExit("invalid nodes prefix")
    nodes_dir = (release_dir / nodes_prefix).resolve()
    if release_dir not in nodes_dir.parents or not nodes_dir.is_dir():
        raise SystemExit(f"missing node directory: {nodes_dir}")
    for path in sorted(nodes_dir.glob("*.json")):
        if path.name == "index.json":
            continue
        add(f"{nodes_prefix}{path.name}")
PY

cd "$ROOT_DIR"

# Upload the immutable artifact first. The manifest is uploaded last so the
# edge API never observes a manifest pointing to an absent artifact.
while IFS=$'\t' read -r ARTIFACT_KEY ARTIFACT_PATH; do
  wrangler r2 object put "$BUCKET/$ARTIFACT_KEY" --file "$ARTIFACT_PATH"
done < "$UPLOAD_LIST"
wrangler r2 object put "$BUCKET/manifest.json" --file "$MANIFEST"

echo "Published $(wc -l < "$UPLOAD_LIST" | tr -d ' ') artifacts to R2 bucket $BUCKET"
