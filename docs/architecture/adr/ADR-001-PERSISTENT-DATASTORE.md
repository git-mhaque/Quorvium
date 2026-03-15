# ADR-001: Persistent Datastore for Real-Time Boards

- Status: Accepted
- Date: March 15, 2026
- Owners: Engineering

## Context

Quorvium currently stores boards in a single JSON file and uses in-memory state in the API process. This is not durable on Cloud Run and does not support reliable multi-instance scaling.

Current model:
- `Board` with metadata (`id`, `name`, `owner`, timestamps)
- `notes` as a map of `StickyNote` objects keyed by note ID

Workload and constraints:
- Real-time concurrent collaborators on one board (up to 15 users)
- Frequent note updates from drag/drop and inline edits
- Low-cost-first requirement
- Keep current API + Socket.IO architecture

## Decision

Use **Cloud Firestore (Native mode, Standard tier)** in region `australia-southeast1` as the primary persistent datastore.

Data model in Firestore:
- `boards/{boardId}`
- `boards/{boardId}/notes/{noteId}`

Important rule:
- Do not store all notes in a single board document. Keep one note per document to avoid document-size limits and write contention hotspots.

## Options Considered

1. Cloud Firestore (chosen)
- Pros: serverless pay-per-use, low idle cost, straightforward Node.js integration, strong fit for document-like board/note shape, supports optimistic concurrency patterns.
- Cons: denormalization and query/index planning required; transaction semantics differ from SQL.

2. Cloud SQL (PostgreSQL/MySQL)
- Pros: relational modeling, SQL flexibility, strong transactional guarantees.
- Cons: higher baseline fixed cost (instance + storage) even at low usage; more ops overhead.

3. Firebase Realtime Database
- Pros: native real-time primitives, simple JSON model.
- Cons: cost can become bandwidth-driven; weaker fit with current server-centric Socket.IO pattern.

## Cost Rationale

For this workload profile, Firestore has the lowest expected cost because it avoids always-on instance pricing.

Regional list-price signals collected for Sydney (`australia-southeast1`) on March 15, 2026:
- Reads: about `$0.038 / 100,000`
- Writes: about `$0.115 / 100,000`
- Deletes: about `$0.013 / 100,000`
- Storage: about `$0.115 / GiB-month`

These are list-price references for directional decision-making.

## Consequences

Positive:
- Durable board data across Cloud Run restarts/revisions
- Better horizontal scale posture
- Low idle cost for early-stage usage

Negative:
- Need repository/store refactor from file-backed storage to Firestore adapter
- Need Firestore security/rules and indexes managed as code
- Need to tune write patterns to avoid excessive operation volume

## Implementation Notes

- Introduce storage abstraction:
  - `BoardStore` interface
  - `FileBoardStore` (existing)
  - `FirestoreBoardStore` (new)
- Select implementation via env flag (example: `DATA_STORE=file|firestore`).
- Firestore collections:
  - `boards`
  - `boards/{boardId}/notes`
- Persist only on meaningful events (already mostly true: drag end, textarea blur).
- Add optimistic concurrency guard for note updates (for example updated timestamp/version check where needed).

## Revisit Triggers

Re-open this ADR if any of these happen:
- sustained high write volume causing unexpected Firestore spend
- analytics/reporting requirements become SQL-heavy
- multi-region active-active requirement emerges

