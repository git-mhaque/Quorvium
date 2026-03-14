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
   Grant the GitHub deployer service account `roles/artifactregistry.writer`.
   Grant the deployer account permission to act as the Cloud Run runtime service account:
   ```sh
   DEPLOYER_SA="quorvium-api-staging@quorvium.iam.gserviceaccount.com"
   RUNTIME_SA="quorvium-api-staging@quorvium.iam.gserviceaccount.com"

   gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
   --member="serviceAccount:$DEPLOYER_SA" \
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
   gsutil mb -p quorvium -l australia-southeast1 gs://staging-quorvium-client
   gsutil web set -m index.html -e 404.html gs://staging-quorvium-client
   ```
   Grant the GitHub deployer service account write access to the bucket (for example):
   ```sh
   gsutil iam ch \
     serviceAccount:YOUR_DEPLOYER_SA@quorvium.iam.gserviceaccount.com:objectAdmin \
     gs://staging-quorvium-client
   ```
   Make the bucket’s objects publicly readable for staging testing:
   ```sh
   gsutil uniformbucketlevelaccess set on gs://staging-quorvium-client
   gsutil iam ch allUsers:objectViewer gs://staging-quorvium-client
   ```
   Upload the `client/dist` build with `gsutil -m rsync -r client/dist gs://staging-quorvium-client`. The CI workflow expects GitHub environment secrets named `STAGING_BUCKET` (`gs://staging-quorvium-client`) and `VITE_BASE_PATH` (use `./` for Cloud Storage hosting) so Vite emits the correct asset URLs.
6. In the GitHub `staging` environment, configure deploy settings used by `.github/workflows/ci.yml`: `GCP_SA_KEY`, `ARTIFACT_REGISTRY_REPO`, `GCP_PROJECT_ID`, `GCP_REGION`, `CLOUD_RUN_SERVICE`, `CLIENT_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI`, and `GOOGLE_CLIENT_SECRET_SECRET_ID`.
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
- Static hosting for the client is managed manually via Cloud Storage. Use `gsutil rsync` after each Vite build (or CI deploy job) to keep `gs://staging-quorvium-client` in sync.
