#!/usr/bin/env bash
set -euo pipefail
# Needs Linux Node22.20.0 + Git and the exact 339b97a checkout with LFS payloads.
# This command does not install tools, request credentials or modify source gates.
repo=${1:?Pass the exact reviewed source checkout}
output=${2:?Pass a diagnostic output directory outside that checkout}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec node --experimental-strip-types --expose-gc \
  "$script_dir/pr160-linux-mw3-check.mjs" "$repo" "$output"
