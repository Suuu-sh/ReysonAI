#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLUSTER_NAME="solveaai"
KUBE_CONTEXT="kind-${CLUSTER_NAME}"
DATA_DIR="${ROOT_DIR}/.kind/data"
GENERATED_CONFIG="${ROOT_DIR}/deploy/kind/kind-config.yaml"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 1
  }
}

require_command docker
require_command kind
require_command kubectl
require_command curl

mkdir -p "${DATA_DIR}/jobs" "${DATA_DIR}/solutions" "${DATA_DIR}/redis"

sed "s|__SOLVEAAI_DATA_ROOT__|${DATA_DIR}|g" \
  "${ROOT_DIR}/deploy/kind/kind-config.yaml.tmpl" > "${GENERATED_CONFIG}"

if ! kind get clusters | grep -Fxq "${CLUSTER_NAME}"; then
  kind create cluster --config "${GENERATED_CONFIG}"
else
  echo "Reusing existing kind cluster: ${CLUSTER_NAME}"
fi

docker build \
  --build-arg BINARY=solveaai-internal-api \
  --tag solveaai-internal-api:local \
  --file "${ROOT_DIR}/deploy/kind/Dockerfile.rust" \
  "${ROOT_DIR}"

docker pull redis:7.4-alpine

docker build \
  --build-arg BINARY=solveaai-worker \
  --tag solveaai-worker:local \
  --file "${ROOT_DIR}/deploy/kind/Dockerfile.rust" \
  "${ROOT_DIR}"

docker build \
  --tag solveaai-ui:local \
  --file "${ROOT_DIR}/deploy/kind/Dockerfile.ui" \
  "${ROOT_DIR}"

kind load docker-image solveaai-internal-api:local --name "${CLUSTER_NAME}"
kind load docker-image solveaai-worker:local --name "${CLUSTER_NAME}"
kind load docker-image solveaai-ui:local --name "${CLUSTER_NAME}"
kind load docker-image redis:7.4-alpine --name "${CLUSTER_NAME}"

kubectl --context "${KUBE_CONTEXT}" apply --filename "${ROOT_DIR}/deploy/kind/base.yaml"
kubectl --context "${KUBE_CONTEXT}" --namespace solveaai create configmap solveaai-game-config \
  --from-file=cash-6max-100bb.json="${ROOT_DIR}/configs/cash-6max-100bb.json" \
  --dry-run=client --output yaml | kubectl --context "${KUBE_CONTEXT}" apply --filename -
kubectl --context "${KUBE_CONTEXT}" --namespace solveaai delete job solveaai-precompute \
  --ignore-not-found

# Local images reuse fixed tags, so applying the manifest alone does not
# replace existing Pods. Restart them explicitly after loading fresh images.
kubectl --context "${KUBE_CONTEXT}" --namespace solveaai rollout restart \
  deployment/solveaai-internal-api deployment/solveaai-worker deployment/solveaai-ui

kubectl --context "${KUBE_CONTEXT}" --namespace solveaai rollout status deployment/solveaai-redis --timeout=180s
kubectl --context "${KUBE_CONTEXT}" --namespace solveaai rollout status deployment/solveaai-internal-api --timeout=180s
kubectl --context "${KUBE_CONTEXT}" --namespace solveaai rollout status deployment/solveaai-worker --timeout=180s
kubectl --context "${KUBE_CONTEXT}" --namespace solveaai rollout status deployment/solveaai-ui --timeout=180s

JOB_RESPONSE=$(curl --fail --silent --show-error \
  --request POST "http://127.0.0.1:30080/api/v1/preflop/jobs" \
  --header 'content-type: application/json' \
  --data '{}')

cat <<EOF

SolveaAI kind environment is ready.

UI:  http://127.0.0.1:30080/
API: kubectl --context ${KUBE_CONTEXT} --namespace solveaai port-forward service/solveaai-internal-api 3000:3000

Generation request:
  ${JOB_RESPONSE}

Status:
  bash scripts/kind-status.sh
  kubectl --context ${KUBE_CONTEXT} --namespace solveaai logs deployment/solveaai-worker -f
EOF
