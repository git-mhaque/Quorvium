# AGENTS.md

## Scope and Precedence
- This file defines repository-wide instructions for coding agents.
- If a subdirectory contains another `AGENTS.md`, the closest file to the edited code takes precedence.

## Project Overview
- Quorvium is a TypeScript monorepo using npm workspaces (`client`, `server`).
- `client/`: React + Vite frontend.
- `server/`: Express + Socket.IO backend.
- Shared TypeScript config lives at `tsconfig.base.json`.
- Canonical product requirements are in `docs/SPEC.md`.
- Dev runtime board data is stored in `server/data/boards.json` (gitignored, not production storage).

## Repository Map (Key Paths)
```text
.
|-- AGENTS.md
|-- README.md
|-- package.json
|-- tsconfig.base.json
|-- client/
|   |-- src/
|   |-- package.json
|   `-- vite.config.ts
|-- server/
|   |-- src/
|   |-- data/
|   `-- package.json
|-- docs/
|   |-- SPEC.md
|   |-- ARCHITECTURE.md
|   |-- PRODUCTION_READINESS_PLAN.md
|   `-- operations/
|-- .github/
|   `-- workflows/
|       `-- ci.yml
`-- infra/
    |-- README.md
    |-- *.tf
    `-- terraform.tfvars.example
```

## Setup and Core Commands
- Install dependencies: `npm install --cache=/tmp/npm-cache`
- Start local dev stack (API + web): `npm run dev`
- Build both workspaces: `npm run build`
- Run all tests: `npm test --cache=/tmp/npm-cache`
- Lint all workspaces: `npm run lint`
- Typecheck all workspaces: `npm run typecheck`
- Format code: `npm run format`

## Workspace Commands
- Server tests only: `npm run test --workspace=server`
- Client tests only: `npm run test --workspace=client`
- Server build only: `npm run build --workspace=server`
- Client build only: `npm run build --workspace=client`

## Validation Expectations
- Run targeted checks while iterating on changes.
- Before opening a PR or requesting merge, run CI-parity checks from repo root: `npm run lint && npm run typecheck && npm run test --cache=/tmp/npm-cache && npm run build`
- Add or update tests whenever behavior changes (API, socket events, or UI behavior).

## GitHub Workflows (`.github/workflows/`)
- Primary pipeline: `.github/workflows/ci.yml`.
- PRs and pushes to `main` run lint, typecheck, tests, and build.
- Pushes to `main` also run image publish and staging deploy jobs (API + client).
- When changing workflow env/secrets names, update matching operations docs in `docs/operations/` in the same change.
- Keep CI steps aligned with root scripts (`lint`, `typecheck`, `test`, `build`) unless intentionally changing CI policy.

## Infrastructure (`infra/`)
- Terraform configuration for Cloud Run, IAM, services, outputs, and secret wiring lives in `infra/`.
- Read `infra/README.md` before changing Terraform resources or deploy assumptions.
- Do not hardcode secrets in `.tf` files; use Secret Manager references and documented secret inputs.
- Use `terraform.tfvars.example` as the template; keep `terraform.tfvars` environment-specific.
- Never edit Terraform state files manually; treat state as tooling-managed data.
- If infra changes impact deploy/runtime behavior, update `docs/operations/` and relevant workflow config together.

## Auth, Env, and Security
- Google OAuth is required for board creation.
- Server env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CLIENT_ORIGIN`.
- Client env vars: `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_REDIRECT_URI`, `VITE_API_BASE_URL`.
- Keep OAuth code exchange server-side; do not expose raw access/refresh tokens to browser JS.
- Token cookies: `quorvium_google_access`, `quorvium_google_refresh` (secure, HTTP-only).
- Never commit `.env` files or secrets. If env requirements change, update both `server/.env.example` and `client/.env.example`.

## Code Style and Naming
- Use functional React components with PascalCase filenames.
- Keep hooks in `client/src/hooks/` and socket helpers in `client/src/lib/`.
- Backend modules should use noun-based names (for example `boardStore`, `boardsRouter`).
- Export shared backend interfaces from `server/src/types.ts` when applicable.
- Prefer clear naming over comments; add brief comments only for non-obvious logic.
- Follow existing ESLint + Prettier rules (2-space indentation, trailing commas).

## Documentation Update Rules
- If product behavior changes, update `docs/SPEC.md` in the same change.
- If architecture, deployment topology, or core data flow changes, update `docs/ARCHITECTURE.md`.
- If auth, deployment, or secrets handling changes, update relevant docs under `docs/operations/`.
- Keep AGENT guidance and docs aligned with the current repository state; remove stale paths/commands when discovered.

## Collaboration Workflow
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- Keep pull requests focused (target under ~400 LOC when practical).
- Include a concise PR summary, test evidence (exact commands run), and linked issue(s).
- Include screenshots or Loom/GIF demos for user-visible UI changes.
- For socket-layer changes, request at least one reviewer familiar with real-time flows.
