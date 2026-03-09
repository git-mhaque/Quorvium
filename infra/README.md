# Infrastructure

This directory contains Terraform configuration that provisions the minimal production footprint for Quorvium while the API still relies on file-backed storage:

- Cloud Run (fully managed) for the Express API container.
- Secret Manager for managing Google OAuth client secrets consumed at runtime.

## Getting Started

1. Install Terraform `>= 1.6.0` and authenticate with Google Cloud (`gcloud auth application-default login`).
2. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in project specific values.
3. Initialize the workspace:
   ```sh
   terraform init
   ```
4. Review the execution plan:
   ```sh
   terraform plan
   ```
5. Apply the configuration once the plan looks correct:
   ```sh
   terraform apply
   ```

## Notes

- The Google OAuth client secret resource only ensures the secret exists. Publish the real value with `gcloud secrets versions add google-oauth-client-secret --data-file=secret.json`.
- `DATA_DIR` defaults to `/tmp/quorvium-data` on Cloud Run, which is ephemeral. Data resets whenever revisions roll or instances restart—acceptable for light testing but not production.
- Remote state (GCS bucket + locking) is not yet configured; add this before running in a shared environment.
