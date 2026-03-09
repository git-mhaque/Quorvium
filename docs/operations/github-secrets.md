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
| `GOOGLE_CLIENT_ID` | OAuth client ID used by the API. | Terraform variable `google_client_id` / Google OAuth credentials | Should align with Vite staging origin. |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret. | Secret Manager `google-oauth-client-secret` | Rotate quarterly with Secret Rotation Playbook. |
| `GOOGLE_REDIRECT_URI` | OAuth redirect for staging Cloud Run domain. | Application config | e.g., `https://staging.quorvium.dev/oauth/callback`. |
| `CLIENT_ORIGIN` | Frontend origin allowed by CORS. | Vite deployment config | e.g., `https://staging.quorvium.dev`. |
| `VITE_API_BASE_URL` | API base URL injected into client build. | Cloud Run URL | Example: `https://quorvium-api-staging-a4nw.run.app`. |
| `VITE_GOOGLE_CLIENT_ID` | Client-side OAuth ID. | Same as `GOOGLE_CLIENT_ID` unless split. | Optional if staging UI uses the same OAuth app. |
| `VITE_GOOGLE_REDIRECT_URI` | Client redirect URL. | Vite environment config | Typically matches `GOOGLE_REDIRECT_URI`. |

## Production Environment (`production`)

| Secret Name | Description | Source of Truth | Notes |
| --- | --- | --- | --- |
| `GCP_PROJECT_ID` | Production GCP project ID. | Terraform remote state / infra repo | Example: `quorvium-prod`. |
| `GCP_REGION` | Deployment region (default `us-central1`). | Terraform variables | Keep aligned with staging for parity. |
| `GCP_SA_KEY` | JSON key for production deployer service account. | Google Cloud IAM | Assign least privilege + audit key rotation monthly. |
| `CLOUD_RUN_SERVICE` | Production Cloud Run service name. | Terraform output | e.g., `quorvium-api-production`. |
| `ARTIFACT_REGISTRY_REPO` | Production Artifact Registry repository. | Artifact Registry | Format: `us-central1-docker.pkg.dev/quorvium-prod/api`. |
| `GOOGLE_CLIENT_ID` | Production OAuth client ID. | Terraform variable `google_client_id` / Google OAuth credentials | Created in production OAuth consent screen. |
| `GOOGLE_CLIENT_SECRET` | Production OAuth client secret. | Secret Manager | Rotate with 24-hour communication to customers. |
| `GOOGLE_REDIRECT_URI` | Production redirect URI. | Application config | e.g., `https://app.quorvium.com/oauth/callback`. |
| `CLIENT_ORIGIN` | Production frontend origin. | DNS + CDN config | e.g., `https://app.quorvium.com`. |
| `VITE_API_BASE_URL` | Production API base for client. | Cloud Run URL or custom domain | Example: `https://api.quorvium.com`. |
| `VITE_GOOGLE_CLIENT_ID` | Client-side OAuth ID for production. | OAuth credentials | Use separate OAuth app if scoped differently. |
| `VITE_GOOGLE_REDIRECT_URI` | Client redirect. | Frontend config | Usually matches `GOOGLE_REDIRECT_URI`. |
| `SENTRY_DSN` | (Reserved) Error tracking DSN when enabled. | Sentry project settings | Placeholder until monitoring work lands. |
| `SLACK_WEBHOOK_URL` | (Optional) Notifications for deployments/incidents. | Slack App config | Required once deploy gates notify Slack. |

## Next Steps

- Automate diff checks that compare Terraform outputs with GitHub secret values during pipeline runs.
- When deployment workflows are added, reference these secrets explicitly in `.github/workflows/` with environment protection rules (required reviewers, manual approval).
- Document rotation history and owners in `docs/operations/ops-log.md`.
