# OAuth Secret Management

Use this runbook to rotate Google OAuth credentials, validate environment sync, and respond to credential compromise.

## Default GCP Context

All commands in this runbook assume:

- Project: `quorvium`
- Region/location: `australia-southeast1`

Set this context before running commands:

```sh
gcloud config set project quorvium
gcloud config set run/region australia-southeast1
gcloud config set compute/region australia-southeast1
```

## Rotation Playbook

1. Schedule the rotation in `#quorvium-ops` at least 24 hours ahead and confirm no overlapping releases.
2. Generate a new client secret in the Google Cloud Console and download it as JSON.
3. Update Google Secret Manager (staging):
   ```sh
   gcloud secrets versions add google-oauth-client-secret-staging --data-file=client-secret.json
   ```
4. If production is configured with a separate secret, publish a new version there as well.
5. Confirm GitHub environment secret `GOOGLE_CLIENT_SECRET_SECRET_ID` points to the expected Secret Manager secret ID for each environment.
6. Redeploy Cloud Run (stage first) so the new secret version is picked up. Trigger a manual smoke test of Google sign-in.
7. Delete the downloaded JSON file from your workstation and note the rotation in the ops log (timestamp, operator, validation steps).

## Validation Checklist

- After every rotation, run the CI workflow that reads from the staging environment to confirm `GOOGLE_CLIENT_SECRET` matches the latest Secret Manager version.
- If the client ID or redirect URI change, update:
  - GitHub environment secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI`, `CLIENT_ORIGIN`, and the Vite equivalents).
  - `.env.example` files if the change impacts local development.
- Redirect URI values must match exactly between app config and Google OAuth credentials. `https://staging.quorvium.com` and `https://staging.quorvium.com/` are different.

## Incident Response: Compromised OAuth Secret

1. Revoke credentials in Google Cloud Console immediately and generate a new secret.
2. Rotate the GitHub secrets and publish a new Secret Manager version using the playbook above.
3. Force a Cloud Run revision rollout (`gcloud run services update-traffic --to-latest`) to evict cached secrets.
4. Announce the incident in `#quorvium-ops` and email affected stakeholders if user data could have been exposed.
5. File an RCA within 48 hours covering discovery method, blast radius, and mitigation tasks.

## Cost Guardrails

- Keep Cloud Run `max_instance_count` at the Terraform default (`5`) unless load testing justifies increase.
- Configure a project-level budget alert at $200/month and route alerts to `finops@quorvium.dev`. This covers Cloud Run, Secret Manager, and Artifact Registry usage during testing.
- Document any change expected to increase monthly spend by more than 10% (for example, raising instance limits) before applying Terraform.

## Datastore Checks

- Keep staging on `DATA_STORE=firestore` in GitHub environment secrets.
- Confirm Firestore settings in staging secrets: `FIRESTORE_PROJECT_ID`, `FIRESTORE_DATABASE_ID`, `FIRESTORE_BOARDS_COLLECTION`.
- Track production Firestore readiness work in the [Production Readiness Plan](../plans/PRODUCTION_READINESS_PLAN.md).
