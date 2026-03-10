# GitHub Environment Secrets Map

Quorvium uses GitHub environments to isolate staging and production deployment credentials. Populate the secrets below before enabling the CI/CD deployment gates. Keep values synchronized with Google Secret Manager to avoid drift.

## Shared Conventions

- Secrets prefixed with `GCP_` relate to infrastructure provisioning and Cloud Run deployments.
- OAuth secrets mirror the Google Cloud credentials created under **APIs & Services → Credentials**.
- Values that also exist in Google Secret Manager should be rotated there first; update GitHub secrets immediately afterward.
- Use short-lived JSON service account keys (`gcloud iam service-accounts keys create`) for automation and rotate quarterly.

## Staging Environment (`staging`)

| Secret Name | Description | Source of Truth | Notes |
| --- | --- | --- | --- |
| `GCP_PROJECT_ID` | Sandbox project ID hosting staging resources. | Terraform remote state / infra repo | Example: `quorvium-staging` |
| `GCP_REGION` | Region for Cloud Run resources. | Terraform variables | Must match `terraform.tfvars` (`us-central1`). |
| `GCP_SA_KEY` | JSON key for the deployer service account with deploy + Secret Manager access. | Google Cloud IAM | Grant `roles/run.admin` and `roles/secretmanager.secretAccessor`. |
| `CLOUD_RUN_SERVICE` | Target Cloud Run service name. | Terraform output `cloud_run_service_name` | e.g., `quorvium-api-staging`. |
| `ARTIFACT_REGISTRY_REPO` | Repository path for container images. | Artifact Registry | Format: `us-central1-docker.pkg.dev/quorvium-staging/api`. |
| `GOOGLE_CLIENT_ID` | OAuth client ID used by the API. | Google OAuth credentials | Used by the API deploy job (`gcloud run deploy --set-env-vars`). |
| `GOOGLE_CLIENT_SECRET_SECRET_ID` | Secret Manager secret ID containing OAuth client secret. | Secret Manager | Example: `google-oauth-client-secret-staging`; deploy job binds `GOOGLE_CLIENT_SECRET` from `latest`. |
| `GOOGLE_REDIRECT_URI` | OAuth redirect for staging Cloud Run domain. | Application config | e.g., `https://staging.quorvium.dev/oauth/callback`. |
| `CLIENT_ORIGIN` | Frontend origin allowed by CORS. | Vite deployment config | e.g., `https://staging.quorvium.dev`. |
| `VITE_API_BASE_URL` | API base URL injected into client build. | Cloud Run URL | Example: `https://quorvium-api-staging-a4nw.run.app`. |
| `VITE_GOOGLE_CLIENT_ID` | Client-side OAuth ID. | Same as `GOOGLE_CLIENT_ID` unless split. | Optional if staging UI uses the same OAuth app. |
| `VITE_GOOGLE_REDIRECT_URI` | Client redirect URL. | Vite environment config | Typically matches `GOOGLE_REDIRECT_URI`. |
| `VITE_BASE_PATH` | Base path for Vite asset URLs. | Vite config | Use `./` for Cloud Storage static hosting. |
| `VITE_ROUTER_MODE` | Client routing strategy. | Frontend runtime config | Use `hash` for raw Cloud Storage hosting; use `browser` when your host supports SPA rewrites. |
| `STAGING_BUCKET` | Google Cloud Storage bucket URI for static client hosting. | Cloud Storage (`gs://...`) | Example: `gs://staging-quorvium-client`. |

### Known-Good Staging OAuth Config (March 10, 2026)

Current verified staging app host:

- `https://staging-quorvium-client.storage.googleapis.com/index.html`

GitHub `staging` environment values that worked together:

- `CLIENT_ORIGIN=https://staging-quorvium-client.storage.googleapis.com`
- `GOOGLE_REDIRECT_URI=https://staging-quorvium-client.storage.googleapis.com`
- `VITE_GOOGLE_REDIRECT_URI=https://staging-quorvium-client.storage.googleapis.com`
- `VITE_API_BASE_URL=https://quorvium-api-staging-bnr4ohmdsa-ts.a.run.app`
- `VITE_ROUTER_MODE=hash`

Google OAuth client settings that matched this deployment:

- Authorized JavaScript origin: `https://staging-quorvium-client.storage.googleapis.com`
- Authorized redirect URI: `https://staging-quorvium-client.storage.googleapis.com/`

Notes:

- The raw bucket URL (`https://storage.googleapis.com/staging-quorvium-client/index.html`) uses a different origin and can cause OAuth/CORS mismatch.
- Ensure Secret Manager value for `google-oauth-client-secret-staging` is the raw `client_secret` string, not full JSON.

## Production Environment (`production`)

| Secret Name | Description | Source of Truth | Notes |
| --- | --- | --- | --- |
| `GCP_PROJECT_ID` | Production GCP project ID. | Terraform remote state / infra repo | Example: `quorvium-prod`. |
| `GCP_REGION` | Deployment region (default `us-central1`). | Terraform variables | Keep aligned with staging for parity. |
| `GCP_SA_KEY` | JSON key for production deployer service account. | Google Cloud IAM | Assign least privilege + audit key rotation monthly. |
| `CLOUD_RUN_SERVICE` | Production Cloud Run service name. | Terraform output | e.g., `quorvium-api-production`. |
| `ARTIFACT_REGISTRY_REPO` | Production Artifact Registry repository. | Artifact Registry | Format: `us-central1-docker.pkg.dev/quorvium-prod/api`. |
| `GOOGLE_CLIENT_ID` | Production OAuth client ID. | Google OAuth credentials | Used by the API deploy job (`gcloud run deploy --set-env-vars`). |
| `GOOGLE_CLIENT_SECRET_SECRET_ID` | Secret Manager secret ID containing production OAuth client secret. | Secret Manager | Example: `google-oauth-client-secret-production`; deploy job binds `GOOGLE_CLIENT_SECRET` from `latest`. |
| `GOOGLE_REDIRECT_URI` | Production redirect URI. | Application config | e.g., `https://app.quorvium.com/oauth/callback`. |
| `CLIENT_ORIGIN` | Production frontend origin. | DNS + CDN config | e.g., `https://app.quorvium.com`. |
| `VITE_API_BASE_URL` | Production API base for client. | Cloud Run URL or custom domain | Example: `https://api.quorvium.com`. |
| `VITE_GOOGLE_CLIENT_ID` | Client-side OAuth ID for production. | OAuth credentials | Use separate OAuth app if scoped differently. |
| `VITE_GOOGLE_REDIRECT_URI` | Client redirect. | Frontend config | Usually matches `GOOGLE_REDIRECT_URI`. |
| `SENTRY_DSN` | (Reserved) Error tracking DSN when enabled. | Sentry project settings | Placeholder until monitoring work lands. |
| `SLACK_WEBHOOK_URL` | (Optional) Notifications for deployments/incidents. | Slack App config | Required once deploy gates notify Slack. |

## Next Steps

- Automate diff checks that compare Terraform outputs with GitHub secret values during pipeline runs.
- Keep `.github/workflows/ci.yml` in sync with this map; the staging Cloud Run deploy job now reads project/region/service plus runtime OAuth and CORS settings from the `staging` environment.
- Document rotation history and owners in `docs/operations/ops-log.md`.
