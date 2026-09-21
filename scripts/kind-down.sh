#!/usr/bin/env bash
set -euo pipefail

kind delete cluster --name solveagto
echo "kind cluster deleted. Local data remains under .kind/data."
