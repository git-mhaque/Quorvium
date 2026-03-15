# Client Artifact Promotion Runbook

## Purpose

Promote the exact frontend artifact that was validated in staging into production, without rebuilding.

## Inputs

- Product version in format `YYYY.MM.DD.SEQ.commitsha`
- Staging release catalog object path: `gs://<staging-bucket>/_releases/<product_version>/`

## Pipeline Components

- CI build + staging deploy workflow: `.github/workflows/ci.yml`
- Production promotion workflow: `.github/workflows/promote-client-production.yml`

## How Promotion Works

1. CI on `main` builds frontend once and packages `client-<product_version>.tar.gz`.
2. CI writes `release-manifest.json` with SHA256 and publishes both bundle + manifest to staging release catalog under `_releases/<product_version>/`.
3. Production promotion workflow fetches that staged release by version.
4. Workflow verifies staged artifact checksum against manifest.
5. Workflow deploys the same artifact to production bucket and writes environment-specific `runtime-config.js`.
6. Workflow re-downloads published production artifact and verifies checksum parity with staging.

## Manual Promotion Procedure

1. Confirm staging is running the intended version in footer and smoke tests are green.
2. Trigger GitHub workflow `Promote Client Artifact to Production`.
3. Set `product_version` to the version being promoted.
4. Wait for staging fetch/verify job to pass.
5. Approve `production` environment deployment when prompted.
6. Confirm production footer version matches and perform smoke checks.

## Rollback

1. Select a previously known-good `product_version` from staging release catalog.
2. Re-run `Promote Client Artifact to Production` with that version.
3. Confirm checksum verification passes and smoke test production.

## Required Production Environment Secrets

- `GCP_SA_KEY`
- `PRODUCTION_BUCKET`
- `VITE_API_BASE_URL`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_REDIRECT_URI`
- `VITE_ROUTER_MODE`

These are read from GitHub `production` environment at promotion time.
