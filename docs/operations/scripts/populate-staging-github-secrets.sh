#!/usr/bin/env bash
set -euo pipefail

# Populate GitHub secrets for Quorvium staging (custom domain hosting).
# - Environment secrets (staging): GCP_SA_KEY, ARTIFACT_REGISTRY_REPO, CLIENT_ORIGIN, CLOUD_RUN_SERVICE, ...
#
# Usage:
#   bash docs/operations/scripts/populate-staging-github-secrets.sh
#   bash docs/operations/scripts/populate-staging-github-secrets.sh --repo owner/repo
#   bash docs/operations/scripts/populate-staging-github-secrets.sh --dry-run

ENV_NAME="staging"
REPO_SLUG=""
DRY_RUN="false"

PROJECT_ID="${PROJECT_ID:-quorvium}"
REGION="${REGION:-australia-southeast1}"
DEPLOYER_SERVICE_ACCOUNT_EMAIL="${DEPLOYER_SERVICE_ACCOUNT_EMAIL:-github-deployer-staging@quorvium.iam.gserviceaccount.com}"

ARTIFACT_REGISTRY_REPO_VALUE="${ARTIFACT_REGISTRY_REPO_VALUE:-australia-southeast1-docker.pkg.dev/quorvium/quorvium-staging-repo/quorvium-api}"

CLIENT_ORIGIN_VALUE="${CLIENT_ORIGIN_VALUE:-https://staging.quorvium.com}"
CLOUD_RUN_SERVICE_VALUE="${CLOUD_RUN_SERVICE_VALUE:-quorvium-api-staging}"
GOOGLE_CLIENT_ID_VALUE="${GOOGLE_CLIENT_ID_VALUE:-588904878485-u39c10ovvhg1imuam4f0jdt979ka4rlh.apps.googleusercontent.com}"
GOOGLE_CLIENT_SECRET_SECRET_ID_VALUE="${GOOGLE_CLIENT_SECRET_SECRET_ID_VALUE:-google-oauth-client-secret-staging}"
GOOGLE_REDIRECT_URI_VALUE="${GOOGLE_REDIRECT_URI_VALUE:-https://staging.quorvium.com}"
STAGING_BUCKET_VALUE="${STAGING_BUCKET_VALUE:-staging.quorvium.com}"
VITE_API_BASE_URL_VALUE="${VITE_API_BASE_URL_VALUE:-https://quorvium-api-staging-bnr4ohmdsa-ts.a.run.app}"
VITE_BASE_PATH_VALUE="${VITE_BASE_PATH_VALUE:-/}"
VITE_GOOGLE_CLIENT_ID_VALUE="${VITE_GOOGLE_CLIENT_ID_VALUE:-588904878485-u39c10ovvhg1imuam4f0jdt979ka4rlh.apps.googleusercontent.com}"
VITE_GOOGLE_REDIRECT_URI_VALUE="${VITE_GOOGLE_REDIRECT_URI_VALUE:-https://staging.quorvium.com}"
VITE_ROUTER_MODE_VALUE="${VITE_ROUTER_MODE_VALUE:-${VITE_ROUTER_MOD:-browser}}"

# Normalize origin-style URLs to avoid redirect_uri mismatch from trailing slash differences.
for origin_like_var in CLIENT_ORIGIN_VALUE GOOGLE_REDIRECT_URI_VALUE VITE_GOOGLE_REDIRECT_URI_VALUE; do
  value="${!origin_like_var}"
  if [[ "${value}" =~ ^https?://[^/]+/$ ]]; then
    printf -v "${origin_like_var}" '%s' "${value%/}"
  fi
done

if [[ "${STAGING_BUCKET_VALUE}" != gs://* ]]; then
  STAGING_BUCKET_VALUE="gs://${STAGING_BUCKET_VALUE}"
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO_SLUG="${2:-}"
      shift 2
      ;;
    --env)
      ENV_NAME="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--repo owner/repo] [--env staging] [--dry-run]" >&2
      exit 1
      ;;
  esac
done

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
}

if [[ "${DRY_RUN}" != "true" ]]; then
  require_command gh
  require_command gcloud
  gh auth status >/dev/null
  gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q .
else
  if ! command -v gh >/dev/null 2>&1; then
    echo "[dry-run] warning: gh not found; printing commands only." >&2
  fi
  if ! command -v gcloud >/dev/null 2>&1; then
    echo "[dry-run] warning: gcloud not found; printing commands only." >&2
  fi
fi

GH_ARGS=()
if [[ -n "${REPO_SLUG}" ]]; then
  GH_ARGS+=(--repo "${REPO_SLUG}")
fi

set_env_secret() {
  local name="$1"
  local value="$2"
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[dry-run] gh secret set ${name} --env ${ENV_NAME} ${GH_ARGS[*]-} --body '<redacted>'"
    return
  fi
  if [[ ${#GH_ARGS[@]} -gt 0 ]]; then
    gh secret set "${name}" --env "${ENV_NAME}" "${GH_ARGS[@]}" --body "${value}"
  else
    gh secret set "${name}" --env "${ENV_NAME}" --body "${value}"
  fi
}

set_env_secret_file() {
  local name="$1"
  local file="$2"
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[dry-run] gh secret set ${name} --env ${ENV_NAME} ${GH_ARGS[*]-} < ${file}"
    return
  fi
  if [[ ${#GH_ARGS[@]} -gt 0 ]]; then
    gh secret set "${name}" --env "${ENV_NAME}" "${GH_ARGS[@]}" < "${file}"
  else
    gh secret set "${name}" --env "${ENV_NAME}" < "${file}"
  fi
}

tmp_key="$(mktemp "/tmp/quorvium-gh-key.XXXXXX")"
cleanup() {
  rm -f "${tmp_key}"
}
trap cleanup EXIT

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "[dry-run] gcloud iam service-accounts keys create ${tmp_key} --iam-account=${DEPLOYER_SERVICE_ACCOUNT_EMAIL} --project=${PROJECT_ID}"
else
  gcloud iam service-accounts keys create "${tmp_key}" \
    --iam-account="${DEPLOYER_SERVICE_ACCOUNT_EMAIL}" \
    --project="${PROJECT_ID}" >/dev/null
fi

echo "Setting ${ENV_NAME} environment secrets..."
set_env_secret_file "GCP_SA_KEY" "${tmp_key}"
set_env_secret "ARTIFACT_REGISTRY_REPO" "${ARTIFACT_REGISTRY_REPO_VALUE}"
set_env_secret "CLIENT_ORIGIN" "${CLIENT_ORIGIN_VALUE}"
set_env_secret "CLOUD_RUN_SERVICE" "${CLOUD_RUN_SERVICE_VALUE}"
set_env_secret "GCP_PROJECT_ID" "${PROJECT_ID}"
set_env_secret "GCP_REGION" "${REGION}"
set_env_secret "GOOGLE_CLIENT_ID" "${GOOGLE_CLIENT_ID_VALUE}"
set_env_secret "GOOGLE_CLIENT_SECRET_SECRET_ID" "${GOOGLE_CLIENT_SECRET_SECRET_ID_VALUE}"
set_env_secret "GOOGLE_REDIRECT_URI" "${GOOGLE_REDIRECT_URI_VALUE}"
set_env_secret "STAGING_BUCKET" "${STAGING_BUCKET_VALUE}"
set_env_secret "VITE_API_BASE_URL" "${VITE_API_BASE_URL_VALUE}"
set_env_secret "VITE_BASE_PATH" "${VITE_BASE_PATH_VALUE}"
set_env_secret "VITE_GOOGLE_CLIENT_ID" "${VITE_GOOGLE_CLIENT_ID_VALUE}"
set_env_secret "VITE_GOOGLE_REDIRECT_URI" "${VITE_GOOGLE_REDIRECT_URI_VALUE}"
set_env_secret "VITE_ROUTER_MODE" "${VITE_ROUTER_MODE_VALUE}"

echo "Done."
echo "Notes:"
echo "- STAGING_BUCKET was set to ${STAGING_BUCKET_VALUE}"
echo "- A new service account key was created for ${DEPLOYER_SERVICE_ACCOUNT_EMAIL} and uploaded to ${ENV_NAME} secret GCP_SA_KEY."
echo "- Rotate and prune old keys periodically: gcloud iam service-accounts keys list --iam-account=${DEPLOYER_SERVICE_ACCOUNT_EMAIL} --project=${PROJECT_ID}"
