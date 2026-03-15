# Quorvium Architecture

## Purpose
This document describes Quorvium's current runtime architecture, component boundaries, and key data flows.

## System Context
```text
Browser Client (React + Vite)
  |- REST calls (HTTP)
  |- Realtime events (Socket.IO)
  v
API Service (Express + Socket.IO)
  |- Auth verification (Google OAuth2)
  |- Board + note CRUD
  v
File Store (JSON on local disk or Cloud Run /tmp)
```

## Architecture Diagrams

Regenerate SVGs from Mermaid sources with:

```sh
bash docs/diagrams/render-diagrams.sh
```

### Runtime (Staging)
![Runtime (Staging) Diagram](./diagrams/runtime-staging.svg)
Source: [`docs/diagrams/runtime-staging.mmd`](./diagrams/runtime-staging.mmd)

### Artifact Promotion Flow (Client + API)
![Artifact Promotion Flow Diagram](./diagrams/artifact-promotion.svg)
Source: [`docs/diagrams/artifact-promotion.mmd`](./diagrams/artifact-promotion.mmd)

## Runtime Topology
### Local Development
- Client runs on `http://localhost:5173`.
- API + Socket.IO run on `http://localhost:4000`.
- Board state persists to `server/data/boards.json` unless `DATA_DIR` overrides location.

### Staging Deployment
- API container runs on Cloud Run.
- Client static bundle is deployed to a Cloud Storage bucket and served through an external HTTP(S) load balancer (`staging.quorvium.com`) with managed TLS and HTTP->HTTPS redirect.
- CI/CD pipeline is defined in `.github/workflows/ci.yml`.
- Terraform under `infra/` provisions baseline cloud resources and related IAM/secrets plumbing.

## Component Architecture
### Client (`client/`)
- Entry point: `src/main.tsx`.
- Routing: `BrowserRouter` or `HashRouter` selected by `VITE_ROUTER_MODE` (or storage-host fallback).
- Authentication state in `src/state/auth.tsx` stores active user in `localStorage` (`quorvium:user`).
- Guests are generated client-side; Google auth is verified by the API.
- API client: `src/lib/api.ts` (Axios, base URL resolved from runtime config first, then build-time fallback).
- Runtime config file: `runtime-config.js` is loaded before app bootstrap and supplies deploy-time values (`apiBaseUrl`, OAuth client/redirect, router mode, app version) without rebuilding frontend assets.
- Product version: rendered in the footer so each deployed build is identifiable.
- Realtime client: `src/lib/socket.ts` uses websocket transport and joins board rooms.

### API Server (`server/`)
- Entry point: `src/index.ts`.
- Transport stack: Express HTTP + Socket.IO on shared HTTP server.
- CORS origin comes from `CLIENT_ORIGIN`.
- REST routes include `POST /api/auth/verify`, `POST /api/boards`, `GET /api/boards?ownerId=...`, `GET /api/boards/:boardId`, and `DELETE /api/boards/:boardId`.
- Validation uses Zod schemas in route/socket handlers.

### Realtime Layer (`server/src/socket.ts`)
- `board:join`: joins board room and emits full board state.
- `note:create`: persists note and broadcasts `note:created`.
- `note:update`: persists patch and broadcasts `note:updated`.
- `note:delete`: removes note and broadcasts `note:deleted`.
- Ack callbacks return `{ ok: true }` or `{ ok: false, error }`.

### Persistence Layer (`server/src/store/boardStore.ts`)
- In-memory `Map` is hydrated from JSON on first access.
- Mutations persist full board payload back to disk.
- Default location is `<repo>/server/data/boards.json` for local/dev.
- In Cloud Run, `DATA_DIR` is used (workflow currently sets `/tmp/quorvium-data`).
- Current storage model is single-node file-based and not production durable.

## Data Model
Core server types are defined in `server/src/types.ts`:
- `Participant`: user identity metadata.
- `StickyNote`: positioned note with content, color, timestamps, author.
- `Board`: owner metadata plus note dictionary.

## Authentication and Token Handling
- Google OAuth env inputs (server): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- Google OAuth env inputs (client): `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_REDIRECT_URI`.
- `/api/auth/verify` supports Google authorization code exchange and ID token verification.
- Server writes Google tokens to HTTP-only cookies: `quorvium_google_access` and `quorvium_google_refresh`.
- Cookies are `secure` in production and `SameSite=Lax`.

## Delivery and Operations
- CI workflow (`.github/workflows/ci.yml`) runs lint, typecheck, tests, and build on PRs and pushes to `main`.
- On `main`, CI computes `PRODUCT_VERSION` (`YYYY.MM.DD.SEQ.commitsha`, where `SEQ` is the GitHub run number), packages one immutable client release artifact (`client-<version>.tar.gz` + manifest checksum), tags/pushes API images by commit SHA and product version, and deploys that exact client artifact to staging (no client rebuild in deploy stage).
- Release promotion workflow (`.github/workflows/promote-release-production.yml`) promotes both API image and client artifact by `product_version`, with digest/checksum parity checks when publishing to production.
- Infra code in `infra/*.tf` defines cloud resources and supporting IAM/secrets.

## Current Constraints
- Board persistence is file-based and ephemeral on Cloud Run restart/rollout.
- Horizontal scaling with shared state is not yet supported.
- OAuth token refresh endpoint is not yet implemented.
- Board access uses share-link model; fine-grained board authorization is pending.
