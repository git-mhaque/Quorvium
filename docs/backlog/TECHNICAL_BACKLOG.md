# Technical Backlog

Last updated: March 15, 2026

Use this file for reliability, performance, security, developer experience, and infrastructure work that may not be directly user-visible.

## Current Items

| ID | Title | Risk/Problem | Priority | Area | Status | Owner | Link |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TECH-001 | Staging deploy identity and artifact repository isolation | Staging deploy credentials and artifact target were not explicitly isolated to staging scope. | p0 | infra/ops | done | unassigned | [#1](https://github.com/git-mhaque/Quorvium/issues/1) |
| TECH-002 | Frontend true-promotion pipeline (single artifact + runtime config) | Rebuilding client per environment can produce drift; staging-tested bits are not guaranteed identical to prod bits. | p1 | client/infra/ops | proposed | unassigned | [#2](https://github.com/git-mhaque/Quorvium/issues/2) |
| TECH-003 | Production environment and infrastructure setup | Production environment resources/identities are not yet separated and provisioned. | p0 | infra/ops | proposed | unassigned | [#3](https://github.com/git-mhaque/Quorvium/issues/3) |
| TECH-004 | Promotion and deployment flow to production | No formal gated production promotion path with smoke/rollback controls. | p0 | infra/ops/release | proposed | unassigned | [#4](https://github.com/git-mhaque/Quorvium/issues/4) |
| TECH-005 | Split staging deployer and runtime service accounts | Staging runtime and CI previously shared one identity, increasing blast radius and violating least privilege. | p0 | infra/security/ops | done | unassigned | [#5](https://github.com/git-mhaque/Quorvium/issues/5) |

## Item Notes

### TECH-002 Scope (Option 2)
- Introduce runtime config loading for deploy-time values (`apiBaseUrl`, OAuth settings, routing mode), instead of baking env into build artifacts.
- Build client once per commit and publish a versioned immutable artifact.
- Deploy same exact artifact to staging and promote the identical artifact to production after approval.
- Add promotion verification step (artifact checksum/hash match between staging and production).
- Update docs/workflows to describe rollback and promotion-by-artifact process.

### TECH-003 Scope
- Provision production-specific infrastructure and deployment identity boundaries.
- Separate production artifact destination from staging.
- Configure GitHub `production` environment secrets and required reviewers.

### TECH-004 Scope
- Implement production deployment workflow with approval gates.
- Define release verification and rollback process.
- Document artifact promotion policy (digest/tag/rebuild rules).

### TECH-005 Scope
- Use separate staging identities for deployment (`github-deployer-staging`) and Cloud Run runtime (`quorvium-api-staging`).
- Move GitHub `staging` `GCP_SA_KEY` to deployer SA key material.
- Remove deploy-only project roles from runtime SA and revoke its user-managed keys.
- Keep deployer access scoped to deploy needs, including `roles/iam.serviceAccountUser` on the runtime SA and staging bucket object write access.

## Intake Template

| ID | Title | Risk/Problem | Priority | Area | Status | Owner | Link |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TECH-XXX | Example hardening task | Prevents production outage class Y | p0 | server/infra | proposed | unassigned | issue-link |

## Status Values
- `proposed`
- `planned`
- `in-progress`
- `blocked`
- `done`

## Prioritization Hints
- `p0`: Security/data-loss/release blocker.
- `p1`: Important for scale or reliability within next release window.
- `p2`: Cleanup, optimization, or debt with limited short-term impact.
