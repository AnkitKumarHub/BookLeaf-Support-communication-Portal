# Proposal

## Why

Authors can log in, but they still cannot see their catalog or open a support ticket. Phase 3 is the next required slice: owned books (including in-production rows) and the ticket create/list/detail API, with classification kicked off only after the ticket row is committed.

## What Changes

- Add author-only book list and detail under `/api/v1/author/books`. Lists include every status by default, including in-production books, and never return another author's row.
- Add author-only ticket create, list, and detail under `/api/v1/author/tickets`. Create validates subject and description, rejects a book the author does not own with 404 and no insert, and returns `201` with `aiState: pending` before any model call.
- After the create transaction commits, send Inngest event `bookleaf/ticket.created` with `{ ticketId, jobVersion }`. If that send throws, log the ticket id and still return `201` with `ai_state` left `pending`.
- Serialize author ticket detail as in `docs/api.md`: public replies and attachments only. The JSON has no `notes` key and no AI rationale, confidence, or overrides.
- Apply the in-memory ticket-create cap of 20 requests per hour per author.

## Capabilities

### New Capabilities

- `author-books`: An authenticated author lists and reads only their own books, including production rows, with pagination and filters.
- `author-tickets`: An authenticated author creates, lists, and reads only their own tickets, and create emits `bookleaf/ticket.created` after commit without waiting on OpenAI.

### Modified Capabilities

- None. There are no existing specs.

## Impact

- New modules `api/src/app/books/` and `api/src/app/tickets/`, mounted from `api/src/app/index.ts` on `/api/v1`, using the same route/controller/service/middleware/module split as auth.
- Reads and writes `books`, `tickets`, and `ticket_events`. `public_id` uses the existing `ticket_public_id_seq` (starts at 1001, formatted `BL-1001`). No schema migration.
- Uses the `inngest` dependency already in `api/package.json` to send one event. Does not call OpenAI and does not require `OPENAI_API_KEY`.
- Out of scope: `GET /author/me`, attachment upload, admin queue and replies, the classify/draft Inngest functions and `/api/inngest`, the Next.js UI, and OpenAPI/Swagger. Those stay in later phases.
