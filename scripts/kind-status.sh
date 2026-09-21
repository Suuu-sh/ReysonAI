#!/usr/bin/env bash
set -euo pipefail

CONTEXT="kind-solveagto"
kubectl --context "${CONTEXT}" --namespace solveagto get pods,deployments,services,jobs
