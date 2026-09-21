#!/usr/bin/env bash
set -euo pipefail

CONTEXT="kind-solveagto"
kubectl --context "${CONTEXT}" --namespace solveagto get pods,deployments,services

echo
echo "Redis queue:"
kubectl --context "${CONTEXT}" --namespace solveagto exec deployment/solveagto-redis -- \
  redis-cli XLEN solveagto:jobs
kubectl --context "${CONTEXT}" --namespace solveagto exec deployment/solveagto-redis -- \
  redis-cli XPENDING solveagto:jobs solveagto-workers
