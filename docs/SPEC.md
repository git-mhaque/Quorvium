# Quorvium Product Specification

## Overview
Quorvium is a collaborative whiteboard for distributed teams to capture and organize ideas in real time. The application consists of a React/Vite client and an Express + Socket.IO backend, with TypeScript across the stack.
Implementation details and runtime topology are documented in `ARCHITECTURE.md`.

## Product Versioning
- Every CI build generates a product version string in the format `YYYY.MM.DD.SEQ.commitsha`.
- `SEQ` is sourced from the GitHub Actions run number for that build.
- Frontend deploy-time values are provided via `runtime-config.js`, so the same built frontend artifact can be promoted across environments without rebuild.
- The version is displayed in the in-app footer for operator/user visibility.
- The same version is attached to released container images and client artifact manifests to support staging-to-production promotion by version and checksum.

## Authentication & Access
- **Google Sign-In (OAuth 2.0):** Product behavior requires Google-authenticated users to create boards. The current UX enforces this at the client layer.
- **Shared Access Links:** Visitors without Google accounts can open a board URL shared by teammates and collaborate anonymously.
- **Current hardening gap:** API endpoints do not yet enforce ownership/auth claims server-side for board creation/deletion.

## Board Lifecycle
- **Creation:** Authenticated users provide a name and receive a shareable `/boards/:id` URL. Owner metadata (id, name, email, avatar) is persisted.
- **Joining:** Participants can join via full URL or board ID. Access does not require authentication.
- **Persistence:** Boards and sticky notes are stored in `server/data/boards.json` (developer machines only; swap for durable storage in production).
- **Management:** Signed-in owners see a "My Boards" table listing their boards with created/updated timestamps, direct board links, one-click copy, delete controls, and a quick "Create board" action that captures the board name in-place.

## Collaboration Canvas
- Sticky notes support free positioning, color selection, and live updates. Socket.IO broadcasts create/update/delete events with optimistic UI rollback on failure.
- Presence is indicated via lightweight participant join notifications.

## Security & Tokens
- OAuth refresh and access tokens are written to `quorvium_google_refresh` and `quorvium_google_access` cookies (secure, HTTP-only, `SameSite=Lax`) when Google returns those tokens via authorization-code exchange.
- Add a token-refresh endpoint before calling downstream Google APIs from authenticated server workflows.
- Environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `CLIENT_ORIGIN`, `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_REDIRECT_URI`, `VITE_API_BASE_URL`, `VITE_APP_VERSION`.

## Testing & Tooling
- Root quality commands: `npm run lint`, `npm run typecheck`, `npm test --cache=/tmp/npm-cache`, `npm run build`.
- `npm test --workspace=server` runs integration tests that exercise REST + websockets.
- `npm test --workspace=client` covers landing page auth gating.
- ESLint/Prettier enforcement via `npm run lint` / `npm run format`.

## Roadmap Considerations
- Add board-level permissions (owner, co-owner, read-only guests).
- Replace file-based storage with a managed database.
- Implement token refresh endpoint and Google API integrations (Drive export, Calendar summaries, etc.).
- Extend OAuth flow with a refresh endpoint that reads secure cookies and rotates access tokens server-side.
