#!/usr/bin/env bash
set -euo pipefail

CONTEXT="kind-solveaai"
kubectl --context "${CONTEXT}" --namespace solveaai get pods,deployments,services

echo
echo "Redis queue:"
kubectl --context "${CONTEXT}" --namespace solveaai exec deployment/solveaai-redis -- \
  redis-cli XLEN solveaai:jobs
kubectl --context "${CONTEXT}" --namespace solveaai exec deployment/solveaai-redis -- \
  redis-cli XPENDING solveaai:jobs solveaai-workers
