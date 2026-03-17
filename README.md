# Quorvium
Quorvium is a collaboration app where teams can brainstorm ideas together in real time. 


## Requirements

- Node.js 18.17 or newer
- npm 9+

## First-time setup

```bash
npm install --cache=/tmp/npm-cache
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Populate environment values before starting the app:

| Location          | Variable                     | Example                          |
| ----------------- | ---------------------------- | -------------------------------- |
| `server/.env`     | `GOOGLE_CLIENT_ID`           | `588904878485-abc123…apps.googleusercontent.com` |
|                   | `GOOGLE_CLIENT_SECRET`       | `GOCSPX-…`                       |
|                   | `GOOGLE_REDIRECT_URI`        | `http://localhost:5173/`         |
|                   | `CLIENT_ORIGIN`              | `http://localhost:5173`          |
|                   | `DATA_STORE`                 | `file` (default) or `firestore`  |
|                   | `FIRESTORE_PROJECT_ID`       | `quorvium` (optional in GCP runtime) |
|                   | `FIRESTORE_DATABASE_ID`      | `(default)` (optional)           |
|                   | `FIRESTORE_BOARDS_COLLECTION`| `boards`                         |
| `client/.env`     | `VITE_API_BASE_URL`          | `http://localhost:4000`          |
|                   | `VITE_BASE_PATH`             | `/` (recommended for custom-domain and deep-link routing) |
|                   | `VITE_ROUTER_MODE`           | `browser` (use `hash` for static hosting without rewrites) |
|                   | `VITE_APP_VERSION`           | `dev.local` (CI sets `YYYY.MM.DD.SEQ.commitsha`, with `SEQ=run_number`) |
|                   | `VITE_GOOGLE_CLIENT_ID`      | same as server                   |
|                   | `VITE_GOOGLE_REDIRECT_URI`   | `http://localhost:5173/`         |

For deployed environments, frontend runtime values are injected via `runtime-config.js` at deploy time. This allows staging and production to use the same built frontend artifact.

Backend persistence defaults to local file storage (`DATA_STORE=file`). Set `DATA_STORE=firestore` to use Cloud Firestore (`boards/{boardId}` and `boards/{boardId}/notes/{noteId}`) for durable multi-instance persistence.

Only Google-authenticated users can create boards. Visitors may still join existing boards without signing in, but they collaborate anonymously. Signed-in owners can manage boards from the home page via a "My Boards" table (name, created, updated, quick create, join link, copy, delete).

## Developing locally

Run the backend and frontend in watch mode from the repo root:

```bash
npm run dev
```

- API: http://localhost:4000 (Express + Socket.IO)
- Web app: http://localhost:5173 (Vite + React)
- OAuth redirect: http://localhost:5173/ (must match Google console configuration)

## Testing & quality checks

```bash
npm test --cache=/tmp/npm-cache      # Run server + client Vitest suites
npm run lint  # ESLint across both workspaces
npm run typecheck # Type-check server + client
npm run build # Type-check & build bundles
```

CI parity check before PR:

```bash
npm run lint && npm run typecheck && npm run test --cache=/tmp/npm-cache && npm run build
```

On `main` pushes, CI also produces an immutable frontend release bundle (`client-<product_version>.tar.gz`) and deploys that exact artifact to staging. Production promotion reuses the same artifact and verifies checksums.

The exchange of Google authorization codes happens in `server/src/routes/auth.ts`, which stores access/refresh tokens inside secure HTTP-only cookies (`quorvium_google_access`, `quorvium_google_refresh`). These cookies support future server-side Google API integrations while keeping raw tokens out of browser JavaScript.

## Project structure

- `client/` – React + Vite frontend (Google sign-in UI, board canvas, Socket.IO client)
- `server/` – Express + Socket.IO backend (auth callback, board APIs, real-time hub)
- `infra/` – Infrastructure provisioning code (Cloud Run, Firestore, IAM, secrets, services)
- `.github/workflows/` – CI/CD workflows 
- `docs/SPEC.md` – Canonical product requirements
- `docs/architecture/ARCHITECTURE.md` – System architecture, deployment topology, and promotion flow
- `docs/backlog/` – Feature and technical backlog trackers
- `docs/operations/` – Operations guides, secrets/runbook docs, and setup steps
- `docs/plans/PRODUCTION_READINESS_PLAN.md` – Production readiness plan
- `docs/articles/` – Long-form engineering/product writeups
- `AGENTS.md` – Contributor workflow guide
