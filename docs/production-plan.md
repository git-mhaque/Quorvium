# Productionization Plan

## Stabilise the Codebase
- [x] Configure CI to run automated lint, test, build, and type-check pipelines on every push and pull request.
- [x] Add UI regression tests covering board creation/deletion modals and the My Boards table interactions.
- [x] Enable TypeScript `tsc --noEmit` in the shared CI pipeline alongside existing static analysis.

## Production Configuration & Hardening
- [ ] Move environment variables to a managed secrets provider (GitHub/GitLab secrets, AWS Parameter Store, etc.) and remove reliance on local `.env` files.
- [ ] Replace `server/data/boards.json` with a durable data store (e.g., Postgres, DynamoDB) and add migration scripts.
- [ ] Ensure cookies are set with `Secure`, `SameSite=Strict`, and correct domain flags; enforce HTTPS via load balancer/reverse proxy.

## Backend Readiness
- [ ] Containerize the Express server with a multi-stage Dockerfile, including health checks.
- [ ] Add rate limiting, Helmet middleware, and enhance validation on all endpoints.
- [ ] Integrate structured logging (pino/winston) and wire logs to a central sink (CloudWatch, ELK, Datadog).
- [ ] Provision production Google OAuth credentials and update redirect URIs.

## Frontend Readiness
- [ ] Configure Vite production build with environment-specific base URLs, asset hashing, and minification.
- [ ] Add React error boundaries and user-friendly fallback states, especially around modal flows.
- [ ] Perform bundle analysis (e.g., `pnpm dlx vite-bundle-visualizer`) and optimize heavy dependencies.

## Deployment Pipeline
- [ ] Define hosting strategy (e.g., API on ECS/Kubernetes/Render, client on S3+CloudFront/Netlify/Vercel).
- [ ] Author Infrastructure as Code (Terraform/CloudFormation) to provision dev/staging/prod environments.
- [ ] Build a CI/CD pipeline that builds images/artifacts, runs smoke tests, deploys to staging, and promotes to prod with approval gates.

## Monitoring & Operations
- [ ] Instrument application metrics (latency, error rates, Socket.IO stats) and set up dashboards/alerts (Prometheus/Grafana, Datadog, etc.).
- [ ] Add centralized error tracking for client and server (Sentry/Rollbar).
- [ ] Draft incident response documentation, including rollback procedures and on-call expectations.

## Security & Compliance
- [ ] Perform a threat model/security review for OAuth flows, cookies, and board permissions.
- [ ] Enable dependency vulnerability scanning (npm audit, Snyk) and patch base images regularly.
- [ ] Define data retention and deletion policies for user/board data to comply with GDPR/PII requirements.

## Documentation & Readiness
- [ ] Expand README/spec with deployment instructions, infrastructure diagram, and support contacts.
- [ ] Write operational runbooks for rotating secrets, scaling, and backup/restore.
- [ ] Prepare release notes and internal launch checklist; consider feature flags for phased rollout.
