# Release Promotion Runbook

## Purpose

Promote the exact staged release into production without rebuilding artifacts:

- Frontend: immutable client bundle (`client-<product_version>.tar.gz`)
- API: container image selected by the same `product_version`

## Inputs

- Product version in format `YYYY.MM.DD.SEQ.commitsha`
- Staging release catalog object path: `gs://<staging-bucket>/_releases/<product_version>/`
- Staging API image tag: `<staging-artifact-repo>:<product_version>`

## Pipeline Components

- CI build + staging deploy workflow: `.github/workflows/ci.yml`
- Production promotion workflow: `.github/workflows/promote-release-production.yml`

## How Promotion Works

1. CI on `main` builds once and produces:
   - frontend bundle + manifest + checksum
   - API image tags (`<git_sha>`, `<product_version>`)
2. CI publishes frontend bundle + manifest to staging release catalog `_releases/<product_version>/`.
3. Promotion workflow fetches staged frontend release and verifies checksum.
4. Promotion workflow resolves staged API image digest from `<staging-repo>:<product_version>`.
5. In production environment, workflow:
   - promotes API image to production Artifact Registry and verifies digest parity
   - deploys API revision to production Cloud Run using promoted image
   - deploys frontend artifact to production bucket with production runtime-config
6. Workflow re-verifies production frontend artifact checksum.

## Manual Promotion Procedure

1. Confirm staging is healthy and running intended footer version.
2. Trigger GitHub workflow `Promote Release to Production`.
3. Set `product_version` to the staged version being promoted.
4. Wait for staging fetch/digest verification job to pass.
5. Approve `production` environment deployment when prompted.
6. Validate:
   - API revision deployed with promoted image/version
   - frontend footer version matches
   - production smoke checks pass

## Rollback

1. Select a previously known-good `product_version` available in staging release catalog.
2. Re-run `Promote Release to Production` using that version.
3. Confirm API digest + frontend checksum verification passes.
4. Run production smoke checks.

## Required Production Environment Secrets

- `GCP_SA_KEY`
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `CLOUD_RUN_SERVICE`
- `PRODUCTION_ARTIFACT_REGISTRY_REPO`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_CLIENT_SECRET_SECRET_ID`
- `CLIENT_ORIGIN`
- `PRODUCTION_BUCKET`
- `VITE_API_BASE_URL`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_REDIRECT_URI`
- `VITE_ROUTER_MODE`

These are read from GitHub `production` environment at promotion time.
