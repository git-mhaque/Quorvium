# Productionization Plan

## Stabilise the Codebase
- [x] Configure CI to run automated lint, test, build, and type-check pipelines on every push and pull request.
- [x] Add UI regression tests covering board creation/deletion modals and the My Boards table interactions.
- [x] Enable TypeScript `tsc --noEmit` in the shared CI pipeline alongside existing static analysis.

## Production Configuration & Hardening
- [ ] Mirror all OAuth and app secrets into GitHub encrypted secrets for CI/CD and Google Secret Manager for runtime; ensure local `.env.example` stays current.
- [ ] Replace `server/data/boards.json` with Cloud SQL (Postgres) in production and SQLite for local development; add migration scripts and seed data.
- [ ] Ensure cookies are set with `Secure`, `SameSite=Strict`, and correct domain flags; enforce HTTPS via Cloud Run/Load Balancer.
- [ ] Validate OAuth refresh-token rotation path and document operational playbook for cookie/token revocation.

## Backend Readiness
- [ ] Containerize the Express server with a multi-stage Dockerfile tuned for Cloud Run, including `/healthz` and `/readiness` probes.
- [ ] Add rate limiting, Helmet middleware, and enhance validation on all endpoints.
- [ ] Integrate structured logging (pino/winston) and export JSON logs suitable for Cloud Logging.
- [ ] Provision production Google OAuth credentials and update Cloud Run + client redirect URIs.
- [ ] Add background job or cron strategy (Cloud Scheduler) for pruning stale boards once durable storage is in place.

## Frontend Readiness
- [ ] Configure Vite production build with environment-specific base URLs, asset hashing, and minification.
- [ ] Add React error boundaries and user-friendly fallback states, especially around modal flows.
- [ ] Perform bundle analysis (e.g., `pnpm dlx vite-bundle-visualizer`) and optimize heavy dependencies.
- [ ] Wire build outputs to Google Cloud Storage bucket with Cloud CDN caching rules and cache-busting strategy.

## Deployment Pipeline
- [ ] Finalize hosting topology: Express API on Cloud Run, static client on Cloud Storage + Cloud CDN; document fallback/rollback steps.
- [ ] Author Terraform to provision Cloud Run service, Cloud SQL instance, VPC connector, Secret Manager secrets, and Storage buckets.
- [ ] Extend GitHub Actions to build and push container images to Artifact Registry, run smoke tests, deploy to staging Cloud Run, and promote to production with manual approval.
- [ ] Configure GitHub environments with required reviewers and map secrets for staging vs production.

## Monitoring & Operations
- [ ] Instrument application metrics (latency, error rates, Socket.IO stats) and export them to Cloud Monitoring dashboards/alerts.
- [ ] Add centralized error tracking for client and server (Sentry/Rollbar) with environment-specific routing.
- [ ] Draft incident response documentation, including rollback procedures, on-call schedule, and Cloud Run revision pinning workflow.
- [ ] Configure uptime checks and synthetic board-creation smoke tests (e.g., Cloud Functions/Cloud Scheduler).

## Security & Compliance
- [ ] Perform a threat model/security review for OAuth flows, cookies, and board permissions.
- [ ] Enable dependency vulnerability scanning (npm audit, Snyk) and patch base images regularly.
- [ ] Define data retention and deletion policies for user/board data to comply with GDPR/PII requirements.
- [ ] Enable Binary Authorization or Artifact Registry vulnerability scanning for container images before deploy.

## Documentation & Readiness
- [ ] Expand README/spec with deployment instructions, infrastructure diagram, cost guardrails, and support contacts.
- [ ] Write operational runbooks for rotating secrets, scaling, backup/restore, and Cloud SQL maintenance plans.
- [ ] Prepare release notes and internal launch checklist; consider feature flags for phased rollout.
- [ ] Capture disaster recovery plan covering Cloud SQL backups, Storage object versioning, and failover testing cadence.
