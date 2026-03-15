# Infrastructure

This directory contains Terraform configuration that provisions the minimal production footprint for Quorvium while the API still relies on file-backed storage:

- Cloud Run (fully managed) service scaffolding for the Express API container.
- Secret Manager for managing Google OAuth client secrets consumed at runtime.

## Getting Started

1. Install Terraform `>= 1.6.0` and authenticate with Google Cloud (`gcloud auth application-default login`).
2. Create environment-specific Artifact Registry repositories referenced by `cloud_run_image` (each repository is created once per project):
   ```sh
   gcloud artifacts repositories create quorvium-staging-repo \
     --project=quorvium \
     --repository-format=docker \
     --location=australia-southeast1
   ```
   Use separate repositories per environment (for example `quorvium-staging-repo` and `quorvium-prod-repo`), and create each repository once.
   Establish split identities for staging deployment:
   ```sh
   PROJECT_ID="quorvium"
   DEPLOYER_SA="github-deployer-staging@${PROJECT_ID}.iam.gserviceaccount.com"
   RUNTIME_SA="quorvium-api-staging@${PROJECT_ID}.iam.gserviceaccount.com"

   if ! gcloud iam service-accounts describe "${DEPLOYER_SA}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
     gcloud iam service-accounts create github-deployer-staging \
       --project="${PROJECT_ID}" \
       --display-name="GitHub Deployer (staging)"
   fi

   for role in roles/run.admin roles/artifactregistry.writer roles/secretmanager.secretAccessor; do
     gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
       --member="serviceAccount:${DEPLOYER_SA}" \
       --role="${role}"
   done

   gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
     --project="${PROJECT_ID}" \
     --member="serviceAccount:${DEPLOYER_SA}" \
     --role="roles/iam.serviceAccountUser"
   ```
3. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in project specific values. `cloud_run_image` is only a bootstrap image used when Terraform creates the service for the first time.
4. Publish the Google OAuth client secret material so Cloud Run can resolve it at runtime:
   ```sh
   gcloud secrets versions add google-oauth-client-secret-staging \
     --project=quorvium \
     --data-file=client-secret.json
   ```
5. Create the Cloud Storage bucket that hosts the staging web client and enable static-site mode:
   ```sh
   gsutil mb -p quorvium -l australia-southeast1 gs://staging.quorvium.com
   gsutil web set -m index.html -e 404.html gs://staging.quorvium.com
   ```
   Grant the GitHub deployer service account write access to the bucket:
   ```sh
   gsutil iam ch \
     serviceAccount:github-deployer-staging@quorvium.iam.gserviceaccount.com:objectAdmin \
     gs://staging.quorvium.com
   ```
   Make the bucket’s objects publicly readable for staging testing:
   ```sh
   gsutil uniformbucketlevelaccess set on gs://staging.quorvium.com
   gsutil iam ch allUsers:objectViewer gs://staging.quorvium.com
   ```
   Upload the `client/dist` build with `gsutil -m rsync -r client/dist gs://staging.quorvium.com`. The CI workflow expects GitHub environment secret `STAGING_BUCKET` (`gs://staging.quorvium.com`) and runtime-config values (`VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_REDIRECT_URI`, `VITE_ROUTER_MODE`) in the `staging` environment.
   For `https://staging.quorvium.com`, also configure an external HTTP(S) load balancer + managed certificate + HTTP->HTTPS redirect as documented in `docs/operations/staging-client-domain-setup.md`.
6. In the GitHub `staging` environment, configure deploy settings used by `.github/workflows/ci.yml`: `GCP_SA_KEY`, `ARTIFACT_REGISTRY_REPO`, `GCP_PROJECT_ID`, `GCP_REGION`, `CLOUD_RUN_SERVICE`, `CLIENT_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI`, `GOOGLE_CLIENT_SECRET_SECRET_ID`, `STAGING_BUCKET`, `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_REDIRECT_URI`, and `VITE_ROUTER_MODE`.
   Set `GCP_SA_KEY` to a key created from `github-deployer-staging@quorvium.iam.gserviceaccount.com` (not the runtime SA).
7. Initialize the workspace:
   ```sh
   terraform init
   ```
8. Review the execution plan:
   ```sh
   terraform plan
   ```
9. Apply the configuration once the plan looks correct:
   ```sh
   terraform apply
   ```
10. Deploy revisions by pushing to `main`. The CI workflow builds the container, pushes it to Artifact Registry, and runs `gcloud run deploy` using the commit-SHA image tag.
11. Smoke test the staging API after deploy:
   ```sh
   PROJECT_ID="quorvium"
   REGION="australia-southeast1"
   SERVICE="quorvium-api-staging"

   API_URL="$(gcloud run services describe "$SERVICE" \
     --project "$PROJECT_ID" \
     --region "$REGION" \
     --format='value(status.url)')"

   curl -i "${API_URL}/api/boards?ownerId=smoke-test"
   ```
   Expect `HTTP/2 200` with a JSON payload (for example `{"boards":[]}`).

## Notes

- The Google OAuth client secret resource only ensures the secret exists. Publish at least one secret version (see step 4 above) before applying Terraform; otherwise Cloud Run fails with `secret ... versions/latest was not found`.
- Terraform ignores Cloud Run container image drift (`template[0].containers[0].image`) so workflow-driven deploys are not reverted on later `terraform apply` runs.
- Terraform no longer manages Cloud Run runtime environment variables or secret bindings; those are set in the deploy workflow.
- Keep runtime/deployer identities separate: runtime SA should hold only runtime permissions, while GitHub deploy credentials should use `github-deployer-staging`.
- Prefer `/api/boards?ownerId=smoke-test` for a basic health check. `/healthz` can return a platform-level 404 on Cloud Run even when the service is healthy.
- `DATA_DIR` defaults to `/tmp/quorvium-data` on Cloud Run, which is ephemeral. Data resets whenever revisions roll or instances restart—acceptable for light testing but not production.
- Remote state (GCS bucket + locking) is not yet configured; add this before running in a shared environment.
- Artifact Registry repositories are not created automatically. Before running the CI workflow or Terraform apply, create the Docker repository referenced by `cloud_run_image`, for example:
  ```sh
  gcloud artifacts repositories create quorvium-staging-repo \
    --project=quorvium \
    --repository-format=docker \
    --location=australia-southeast1
  ```
  Ensure the GitHub deployer service account has `roles/artifactregistry.writer` on the project or repository.
- Static hosting for the client is managed manually via Cloud Storage. Use `gsutil rsync` after each Vite build (or CI deploy job) to keep `gs://staging.quorvium.com` in sync.
- External LB/certificate/HTTP-redirect resources for `staging.quorvium.com` are currently manual and are not yet provisioned by the Terraform in this directory.
