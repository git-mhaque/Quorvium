# Staging Client Domain Setup (`staging.quorvium.com`)

This runbook covers the full setup for serving the client from Google Cloud Storage on `staging.quorvium.com`, with and without HTTPS.

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

## Current Live Snapshot (March 15, 2026)

The staging custom-domain stack is currently live with these resources:

- Global IPv4: `136.110.208.136`
- HTTPS forwarding rule (`443`): `staging-quorvium-frontend`
- HTTP forwarding rule (`80`): `staging-quorvium-frontend-forwarding-rule`
- HTTPS proxy: `staging-quorvium-lb-target-proxy`
- HTTP proxy (redirect): `staging-quorvium-frontend-target-proxy`
- HTTPS URL map: `staging-quorvium-lb`
- HTTP redirect URL map: `staging-quorvium-frontend-redirect`
- Backend bucket: `staging-quorvium-bucket` (GCS bucket `staging.quorvium.com`)
- Managed certificate: `staging-quorvium-v2` (status `ACTIVE`)

Quick verification:

```sh
gcloud compute forwarding-rules list --global \
  --format='table(name,IPAddress,portRange,target)'
gcloud compute target-https-proxies list \
  --format='table(name,urlMap,sslCertificates)'
gcloud compute target-http-proxies list \
  --format='table(name,urlMap)'
gcloud compute backend-buckets list \
  --format='table(name,bucketName,enableCdn)'
gcloud compute ssl-certificates list \
  --format='table(name,type,managed.status,managed.domains)'

dig +short staging.quorvium.com A
curl -I http://staging.quorvium.com
curl -I https://staging.quorvium.com
```

## Architecture Notes

- Direct `CNAME` from `staging` to `c.storage.googleapis.com` supports `http://` only.
- `https://staging.quorvium.com` requires an External HTTPS Load Balancer with a Google-managed certificate.
- Hiding `/index.html` is controlled by bucket website settings (`web-main-page-suffix`), not DNS.
- Current automation state: bucket deploy is automated in GitHub Actions, but LB/certificate/redirect resources are still manually managed (not Terraform-managed yet).

## Prerequisites

- Google Cloud project with `gcloud` authenticated.
- Domain `quorvium.com` managed in Network Solutions.
- Static client build available in `gs://staging-quorvium-client` or `client/dist`.

## Part A: Create and Configure the Bucket

1. Verify domain ownership in Google (required in some projects before domain-named bucket mapping works).
   - Record type: `TXT`
   - Host: `@`
   - Value: verification token from Google
   - TTL: `300` seconds during setup
2. Create the domain-named bucket:
   ```sh
   gcloud config set project quorvium
   gcloud storage buckets create gs://staging.quorvium.com \
     --location=australia-southeast1 \
     --uniform-bucket-level-access
   ```
3. Upload site contents:
   ```sh
   gcloud storage rsync --recursive gs://staging-quorvium-client gs://staging.quorvium.com
   ```
   Or from local build output:
   ```sh
   gcloud storage rsync --recursive ./client/dist gs://staging.quorvium.com
   ```
4. Configure default and error pages:
   ```sh
   gcloud storage buckets update gs://staging.quorvium.com \
     --web-main-page-suffix=index.html \
     --web-error-page=index.html
   ```
5. Allow public object reads:
   ```sh
   gcloud storage buckets update gs://staging.quorvium.com \
     --public-access-prevention=inherited

   gcloud storage buckets add-iam-policy-binding gs://staging.quorvium.com \
     --member=allUsers \
     --role=roles/storage.objectViewer
   ```
6. Verify bucket state:
   ```sh
   gcloud storage ls gs://staging.quorvium.com/index.html
   gcloud storage buckets describe gs://staging.quorvium.com
   ```

## Part B: HTTP Preflight (Optional but Useful)

Use this only to confirm content is reachable before HTTPS cutover.

1. In Network Solutions, create:
   - Host: `staging`
   - Type: `CNAME`
   - Value: `c.storage.googleapis.com`
   - TTL: `300`
2. Validate:
   ```sh
   dig +short staging.quorvium.com CNAME
   curl -I http://staging.quorvium.com
   curl -I http://staging.quorvium.com/index.html
   ```

## Part C: HTTPS Setup and DNS Cutover

1. Create a Global External Application Load Balancer in Google Cloud.
2. Create a backend bucket that points to `staging.quorvium.com`.
3. Configure HTTPS frontend on port `443` with a global static IPv4.
4. Create and attach a Google-managed certificate for `staging.quorvium.com`.
5. (Optional) Add HTTP `:80` frontend with redirect to HTTPS.
6. Confirm forwarding rules and static IP:
   ```sh
   gcloud compute forwarding-rules list --global \
     --format="table(name,IPAddress,portRange,target)"
   ```
7. Confirm the cert is attached to the HTTPS proxy:
   ```sh
   gcloud compute target-https-proxies describe staging-quorvium-lb-target-proxy \
     --global --format="get(sslCertificates)"
   ```
8. In Network Solutions, remove the `staging` `CNAME` and create:
   - Host: `staging`
   - Type: `A`
   - Value: `<load_balancer_global_ip>`
   - TTL: `300` during cutover (raise later to `3600` or `7200`)
9. Validate authoritative and public DNS views:
   ```sh
   for ns in $(dig +short NS quorvium.com); do
     echo "=== $ns ==="
     dig +short staging.quorvium.com CNAME @$ns
     dig +short staging.quorvium.com A @$ns
     dig +short staging.quorvium.com AAAA @$ns
   done

   for r in 8.8.8.8 1.1.1.1 9.9.9.9; do
     echo "=== resolver $r ==="
     dig +short staging.quorvium.com CNAME @$r
     dig +short staging.quorvium.com A @$r
     dig +short staging.quorvium.com AAAA @$r
   done
   ```
   For TTL-aware inspection (useful during cutover):
   ```sh
   for r in ns25.worldnic.com ns26.worldnic.com 8.8.8.8 1.1.1.1 9.9.9.9; do
     echo "=== $r ==="
     dig +noall +answer staging.quorvium.com CNAME @$r
     dig +noall +answer staging.quorvium.com A @$r
     dig +noall +answer staging.quorvium.com AAAA @$r
   done
   ```
10. Expected DNS state:
    - `CNAME`: empty
    - `A`: only the load balancer IP
    - `AAAA`: empty unless IPv6 frontend is intentionally configured
11. Monitor certificate provisioning:
   ```sh
   CERT_NAME="staging-quorvium-v2"
   ```
   ```sh
   gcloud compute ssl-certificates list \
     --format="table(name,type,managed.status,managed.domainStatus,managed.domains)"

   gcloud compute ssl-certificates describe "${CERT_NAME}" --global \
     --format="yaml(managed.status,managed.domainStatus,managed.domains)"
   ```
   Optional watch loop:
   ```sh
   while true; do
     date
     gcloud compute ssl-certificates describe "${CERT_NAME}" --global \
       --format="yaml(managed.status,managed.domainStatus)"
     sleep 120
   done
   ```
12. Validate HTTPS:
   ```sh
   curl -I https://staging.quorvium.com
   ```

## Provisioning Expectations

- DNS updates are usually visible in minutes, but may take up to previous TTL values.
- Google-managed certs often move to `ACTIVE` in 15 to 60 minutes after DNS is correct.
- Slow propagation can extend issuance to a few hours; in rare cases longer.

## Troubleshooting

### `AccessDenied` on the site

1. Confirm bucket name is exactly `gs://staging.quorvium.com`.
2. Confirm `index.html` is present in that bucket.
3. Confirm website config is set (`web-main-page-suffix` and `web-error-page`).
4. Confirm `allUsers` has `roles/storage.objectViewer`.
5. Confirm protocol path:
   - direct bucket mapping: `http://`
   - custom HTTPS: load balancer + managed cert

### Certificate stuck in `PROVISIONING` or `FAILED_NOT_VISIBLE`

1. Confirm DNS no longer returns any `CNAME` for `staging`.
2. Confirm `A` resolves to the LB global IP from authoritative and public resolvers.
3. Check for wildcard records (for example `* CNAME ...`) in Network Solutions.
4. Check CAA policy:
   ```sh
   dig +short quorvium.com CAA
   dig +short staging.quorvium.com CAA
   ```
5. If any resolver still returns `CNAME ... c.storage.googleapis.com`, DNS cache has not fully expired yet. Wait out the remaining TTL and recheck.
6. If CAA is restrictive, allow Google CA:
   - Host: `@`
   - Type: `CAA`
   - Value: `0 issue "pki.goog"`
7. Flush local DNS cache on macOS if local checks still show stale answers:
   ```sh
   sudo dscacheutil -flushcache
   sudo killall -HUP mDNSResponder
   ```
8. If DNS has been correct for about 2 hours and status is still failed, recreate and reattach cert:
   ```sh
   gcloud compute ssl-certificates create staging-quorvium-v2 \
     --domains=staging.quorvium.com --global

   gcloud compute target-https-proxies update staging-quorvium-lb-target-proxy \
     --global --ssl-certificates=staging-quorvium-v2
   ```
