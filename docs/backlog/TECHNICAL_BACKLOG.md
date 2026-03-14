# Technical Backlog

Last updated: March 15, 2026

Use this file for reliability, performance, security, developer experience, and infrastructure work that may not be directly user-visible.

## Current Items

| ID | Title | Risk/Problem | Priority | Area | Status | Owner | Link |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TECH-001 | Separate staging/prod deploy identities and artifact repositories | Shared deploy identity and artifact target across environments increases blast radius and weakens least-privilege controls. | p0 | infra/ops | proposed | unassigned | [#1](https://github.com/git-mhaque/Quorvium/issues/1) |
| TECH-002 | Frontend true-promotion pipeline (single artifact + runtime config) | Rebuilding client per environment can produce drift; staging-tested bits are not guaranteed identical to prod bits. | p1 | client/infra/ops | proposed | unassigned | [#2](https://github.com/git-mhaque/Quorvium/issues/2) |

## Item Notes

### TECH-002 Scope (Option 2)
- Introduce runtime config loading for deploy-time values (`apiBaseUrl`, OAuth settings, routing mode), instead of baking env into build artifacts.
- Build client once per commit and publish a versioned immutable artifact.
- Deploy same exact artifact to staging and promote the identical artifact to production after approval.
- Add promotion verification step (artifact checksum/hash match between staging and production).
- Update docs/workflows to describe rollback and promotion-by-artifact process.

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
