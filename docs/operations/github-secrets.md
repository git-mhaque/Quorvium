# GitHub Environment Secrets Map

Quorvium currently uses a GitHub `staging` environment for deployment credentials. Populate the secrets below before enabling CI/CD deployment gates. Keep values synchronized with Google Secret Manager to avoid drift.

## Shared Conventions

- Secrets prefixed with `GCP_` relate to infrastructure provisioning and Cloud Run deployments.
- OAuth secrets mirror the Google Cloud credentials created under **APIs & Services → Credentials**.
- Values that also exist in Google Secret Manager should be rotated there first; update GitHub secrets immediately afterward.
- Use short-lived JSON service account keys (`gcloud iam service-accounts keys create`) for automation and rotate quarterly.

## One-Command Bootstrap (Staging, Custom Domain Hosting)

Use the helper script to populate all required staging environment secrets in one run:

```sh
bash docs/operations/scripts/populate-staging-github-secrets.sh
```

Optional flags:

```sh
# Target a specific repo slug (instead of current local repo)
bash docs/operations/scripts/populate-staging-github-secrets.sh --repo owner/repo

# Preview commands without writing secrets
bash docs/operations/scripts/populate-staging-github-secrets.sh --dry-run
```

Script behavior:

- Creates a new service account key for `github-deployer-staging@quorvium.iam.gserviceaccount.com` and sets staging environment secret `GCP_SA_KEY`.
- Sets staging environment secret `ARTIFACT_REGISTRY_REPO=australia-southeast1-docker.pkg.dev/quorvium/quorvium-staging-repo/quorvium-api`.
- Sets all required `staging` environment secrets for the current custom-domain deployment.
- Normalizes `STAGING_BUCKET` to `gs://...` because CI requires that prefix.
- Sets `VITE_ROUTER_MODE=browser` (the CI/workflow key name is `VITE_ROUTER_MODE`).

## Staging Environment (`staging`)

| Secret Name | Description | Source of Truth | Notes |
| --- | --- | --- | --- |
| `GCP_PROJECT_ID` | Sandbox project ID hosting staging resources. | Terraform remote state / infra repo | Example: `quorvium` |
| `GCP_REGION` | Region for Cloud Run resources. | Terraform variables | Must match deployment region (`australia-southeast1`). |
| `GCP_SA_KEY` | JSON key for the staging deployer service account. | Google Cloud IAM | Use `github-deployer-staging@quorvium.iam.gserviceaccount.com`; grant `roles/run.admin`, `roles/artifactregistry.writer`, `roles/secretmanager.secretAccessor`, and bucket `roles/storage.objectAdmin`. |
| `CLOUD_RUN_SERVICE` | Target Cloud Run service name. | Terraform output `cloud_run_service_name` | e.g., `quorvium-api-staging`. |
| `ARTIFACT_REGISTRY_REPO` | Repository path for container images. | Artifact Registry | Format: `australia-southeast1-docker.pkg.dev/quorvium/quorvium-staging-repo/quorvium-api`. |
| `GOOGLE_CLIENT_ID` | OAuth client ID used by the API. | Google OAuth credentials | Used by the API deploy job (`gcloud run deploy --set-env-vars`). |
| `GOOGLE_CLIENT_SECRET_SECRET_ID` | Secret Manager secret ID containing OAuth client secret. | Secret Manager | Example: `google-oauth-client-secret-staging`; deploy job binds `GOOGLE_CLIENT_SECRET` from `latest`. |
| `GOOGLE_REDIRECT_URI` | OAuth redirect URI for the staging client. | Application config | e.g., `https://staging.quorvium.com`. |
| `CLIENT_ORIGIN` | Frontend origin allowed by CORS. | Vite deployment config | e.g., `https://staging.quorvium.com`. |
| `VITE_API_BASE_URL` | API base URL written into `runtime-config.js` during deploy. | Cloud Run URL | Example: `https://quorvium-api-staging-a4nw.run.app`. |
| `VITE_GOOGLE_CLIENT_ID` | Client-side OAuth ID. | Same as `GOOGLE_CLIENT_ID` unless split. | Optional if staging UI uses the same OAuth app. |
| `VITE_GOOGLE_REDIRECT_URI` | Client redirect URL written into `runtime-config.js`. | Frontend runtime config | Typically matches `GOOGLE_REDIRECT_URI`. |
| `VITE_BASE_PATH` | Base path for Vite asset URLs. | Vite config | Legacy/optional for local builds. CI artifact promotion path does not require per-environment base-path secrets. |
| `VITE_ROUTER_MODE` | Client routing strategy. | Frontend runtime config | Use `browser` for the custom-domain setup behind HTTPS LB. |
| `STAGING_BUCKET` | Google Cloud Storage bucket URI for static client hosting and release catalog path (`_releases/<product_version>`). | Cloud Storage (`gs://...`) | Example: `gs://staging.quorvium.com`. |

`VITE_APP_VERSION` is intentionally not stored as a GitHub secret. CI computes it on each build as `YYYY.MM.DD.SEQ.commitsha` (`SEQ` = GitHub run number) and injects it at client build time.

### Identity Split (Staging)

- Runtime identity: `quorvium-api-staging@quorvium.iam.gserviceaccount.com` (Cloud Run runtime only).
- Deployer identity: `github-deployer-staging@quorvium.iam.gserviceaccount.com` (GitHub Actions only).
- Grant `roles/iam.serviceAccountUser` on the runtime SA to the deployer SA so CI can deploy revisions without sharing runtime credentials.
- Keep user-managed keys disabled for the runtime SA; only the deployer SA should have the GitHub `GCP_SA_KEY`.

### Known-Good Staging OAuth Config (March 11, 2026)

Current verified staging app host:

- `https://staging.quorvium.com`

GitHub `staging` environment values that worked together:

- `CLIENT_ORIGIN=https://staging.quorvium.com`
- `GOOGLE_REDIRECT_URI=https://staging.quorvium.com`
- `VITE_GOOGLE_REDIRECT_URI=https://staging.quorvium.com`
- `VITE_API_BASE_URL=https://quorvium-api-staging-bnr4ohmdsa-ts.a.run.app`
- `VITE_BASE_PATH=/`
- `VITE_ROUTER_MODE=browser`
- `STAGING_BUCKET=gs://staging.quorvium.com`

Google OAuth client settings that matched this deployment:

- Authorized JavaScript origin: `https://staging.quorvium.com`
- Authorized redirect URI: `https://staging.quorvium.com`

Notes:

- The old bucket URL (`https://staging-quorvium-client.storage.googleapis.com/index.html`) is a different origin and can cause OAuth/CORS mismatch if mixed with the new domain config.
- Ensure Secret Manager value for `google-oauth-client-secret-staging` is the raw `client_secret` string, not full JSON.
- Google redirect URI matching is exact. `https://staging.quorvium.com` and `https://staging.quorvium.com/` are treated as different values.

## Next Steps

- Automate diff checks that compare Terraform outputs with GitHub secret values during pipeline runs.
- Keep `.github/workflows/ci.yml` in sync with this map; the staging deploy now publishes immutable frontend release bundles and writes runtime config at deploy time.
- Document rotation history and owners in your team runbook/process notes.
