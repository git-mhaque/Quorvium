# Infrastructure

This directory contains Terraform configuration that provisions the minimal production footprint for Quorvium while the API still relies on file-backed storage:

- Cloud Run (fully managed) for the Express API container.
- Secret Manager for managing Google OAuth client secrets consumed at runtime.

## Getting Started

1. Install Terraform `>= 1.6.0` and authenticate with Google Cloud (`gcloud auth application-default login`).
2. Create the Artifact Registry repository referenced by `cloud_run_image` (only once per project):
   ```sh
   gcloud artifacts repositories create quorvium-repo \
     --project=quorvium \
     --repository-format=docker \
     --location=australia-southeast1
   ```
   Grant the GitHub deployer service account `roles/artifactregistry.writer`.
3. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in project specific values. Use a pinned image digest (e.g., `...@sha256:...`) once CI publishes an image.
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
   Upload the `client/dist` build with `gsutil -m rsync -r client/dist gs://staging-quorvium-client`. The CI workflow expects a GitHub environment secret named `STAGING_BUCKET` containing this bucket URI (`gs://staging-quorvium-client`).
6. Initialize the workspace:
   ```sh
   terraform init
   ```
7. Review the execution plan:
   ```sh
   terraform plan
   ```
8. Apply the configuration once the plan looks correct:
   ```sh
   terraform apply
   ```

## Notes

- The Google OAuth client secret resource only ensures the secret exists. Publish at least one secret version (see step 4 above) before applying Terraform; otherwise Cloud Run fails with `secret ... versions/latest was not found`.
- `DATA_DIR` defaults to `/tmp/quorvium-data` on Cloud Run, which is ephemeral. Data resets whenever revisions roll or instances restart—acceptable for light testing but not production.
- Remote state (GCS bucket + locking) is not yet configured; add this before running in a shared environment.
- Artifact Registry repositories are not created automatically. Before running the CI workflow or Terraform apply, create the Docker repository referenced by `cloud_run_image`, for example:
  ```sh
  gcloud artifacts repositories create quorvium-repo \
    --project=quorvium \
    --repository-format=docker \
    --location=australia-southeast1
  ```
  Ensure the GitHub deployer service account has `roles/artifactregistry.writer` on the project or repository.
- Static hosting for the client is managed manually via Cloud Storage. Use `gsutil rsync` after each Vite build (or CI deploy job) to keep `gs://staging-quorvium-client` in sync.
