# Production Readiness Plan

Last reviewed: March 15, 2026

## Current State Snapshot

### Completed
- [x] CI runs lint, typecheck, tests, and build on push/PR to `main`.
- [x] Staging deploy pipeline exists for API (Cloud Run) and client (Cloud Storage).
- [x] UI tests cover board creation/deletion modal flows.
- [x] Integration tests cover board CRUD + Socket.IO collaboration flows.
- [x] Baseline Terraform exists for staging-oriented cloud resources.

### Active Constraints
- [ ] Board persistence is file-backed (`/tmp` on Cloud Run) and resets on restart.
- [ ] API authorization is not fully enforced server-side for board ownership-sensitive actions.
- [ ] No token refresh/revocation endpoint yet for Google OAuth cookies.
- [ ] Monitoring, alerting, and incident response automation are still minimal.
- [ ] Production environment and production secret mapping are intentionally not configured yet.

## Production Exit Criteria (Must-Have)

### 1) Data Durability and Multi-Instance Safety
- [ ] Replace file-backed board storage with managed Postgres (Cloud SQL).
- [ ] Add migrations, schema versioning, and rollback plan.
- [ ] Implement backup/restore runbook and test restore at least once.

### 2) Authentication and Authorization Hardening
- [ ] Enforce authn/authz server-side for create/delete and owner-scoped operations.
- [ ] Implement OAuth token refresh/revocation endpoints and cookie lifecycle policy.
- [ ] Add tests for authorization bypass attempts and token edge cases.

### 3) Security Baseline
- [ ] Add HTTP hardening middleware (Helmet) and request rate limiting.
- [ ] Reconfirm cookie policy (`Secure`, `HttpOnly`, `SameSite`, domain/path) for production domains.
- [ ] Enable dependency/container vulnerability scanning in CI or registry.

### 4) Production Infrastructure and Delivery
- [ ] Provision production GCP resources (Cloud Run, DB, bucket/CDN, secrets, IAM) via Terraform.
- [ ] Add production GitHub environment with manual approval gates and required reviewers.
- [ ] Extend CI/CD with post-deploy smoke checks and rollback instructions for production releases.

### 5) Observability and Operations
- [ ] Add structured logging for API and deployment correlation IDs.
- [ ] Define Cloud Monitoring dashboards + alerts (latency, error rate, restart frequency, deploy failures).
- [ ] Add client/server error tracking and incident response runbook.

## Phased Delivery Plan

### Phase A: Runtime Safety (Now)
- [ ] Enforce server-side authorization and ownership checks.
- [ ] Add security middleware and rate limiting.
- [ ] Add auth and permission negative-path tests.

### Phase B: Durable Storage
- [ ] Introduce DB access layer and migrations.
- [ ] Cut over board/note persistence to Postgres.
- [ ] Validate data integrity and restore playbook.

### Phase C: Production Environment
- [ ] Provision production infra in Terraform.
- [ ] Configure production GitHub environment and secrets.
- [ ] Add manual promotion gates from staging to production.

### Phase D: Operability
- [ ] Add dashboards/alerts/error tracking.
- [ ] Finalize on-call/incident workflow and runbooks.
- [ ] Conduct production readiness review and sign-off checklist.

## Backlog Management (Recommended)

- Source of truth: GitHub Issues + one GitHub Project board.
- Use labels: `kind:feature`, `kind:technical`, `priority:p0`, `priority:p1`, `priority:p2`, `area:client`, `area:server`, `area:infra`, `area:auth`, `area:ops`.
- Keep roadmap intent in this file; keep execution items in backlog files/issues.
- Suggested docs for planning drafts: `docs/backlog/FEATURE_BACKLOG.md` and `docs/backlog/TECHNICAL_BACKLOG.md`.

## Definition of Done for Production Launch
- [ ] All Production Exit Criteria sections above complete.
- [ ] No open `priority:p0` bugs.
- [ ] Runbook set covers secret rotation, incident response, rollback, and data restore.
- [ ] At least one successful staging-to-production rehearsal completed end-to-end.
