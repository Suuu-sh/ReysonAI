#!/usr/bin/env bash
set -euo pipefail

kind delete cluster --name solveaai
echo "kind cluster deleted. Local data remains under .kind/data."
