# Repository Guidelines

## Project Structure & Key Docs
- Frontend React/Vite workspace lives in `client/`; backend Express + Socket.IO in `server/`. Shared configuration sits at the repo root with `tsconfig.base.json`.
- Product requirements are maintained in `spec.md`. Historical notes stay under `docs/` (see `docs/quorvium-spec.md` deprecation notice before editing).
- Runtime data written by the dev server (`server/data/boards.json`) is gitignored; swap to durable storage before production.

## Build, Test, and Dev Commands
- `npm install --cache=/tmp/npm-cache` installs both workspaces (root `package.json` uses npm workspaces).
- `npm run dev` starts Vite (port 5173) and the API (port 4000) with hot reload.
- `npm run build` emits production bundles: Vite output in `client/dist`, server build artifacts in `server/dist`.
- `npm test --cache=/tmp/npm-cache` runs Vitest suites for API + client. Use `--workspace=server` or `--workspace=client` to scope.
- `npm run lint` / `npm run format` enforce ESLint + Prettier conventions (2-space indent, trailing commas).

## Auth, Env, and Security
- Google OAuth is mandatory for board creation. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` on the server; match `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_REDIRECT_URI` on the client.
- Authorization-code exchanges happen server-side; access/refresh tokens are stored in secure, HTTP-only cookies (`quorvium_google_access`, `quorvium_google_refresh`). Avoid reading them in the browser.
- Never commit raw `.env` files. Update the `*.env.example` files when variables change.

## Coding & Naming Conventions
- Use functional React components with PascalCase filenames; colocate hooks in `client/src/hooks/` and socket helpers in `client/src/lib/`.
- Backend modules follow noun-based naming (`boardStore`, `boardsRouter`). Export typed interfaces from `server/src/types.ts`.
- Prefer concise inline comments only when logic is non-obvious; rely on descriptive function/variable names first.

## Collaboration Workflow
- Follow Conventional Commits (e.g., `feat:`, `fix:`). Keep pull requests scoped (<400 LOC) with summary, testing evidence, and linked issues.
- Include screenshots or Loom/GIF demos for UI changes, especially auth and board interactions.
- When a feature or fix shifts product expectations, update `spec.md` (and other relevant docs) in the same change before opening a PR.
- Run the full test suite before requesting merge. For socket-layer changes, pair with at least one reviewer familiar with real-time flows.
