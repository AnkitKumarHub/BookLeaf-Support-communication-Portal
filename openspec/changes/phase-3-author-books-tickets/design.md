# Design

## Context

See proposal.md for why this slice exists. Auth is already mounted at `/api/v1` from `api/src/app/index.ts`. `requireAuth` and `requireRole` live in `api/src/app/auth/auth.middleware.ts`. Controllers parse input with Zod, throw `AppError`, and call `sendData`. Express 5 forwards async rejections to `errorHandler`.

`books`, `tickets`, `ticket_messages`, `ticket_attachments`, `ticket_events`, and `ticket_public_id_seq` (start 1001) already exist. The composite foreign key `tickets_book_author_fk` requires a non-null `book_id` to share `author_id` with that book. `api/src/db/index.ts` exports a Drizzle client without the relational query API, so services use the query builder. `inngest` is already a dependency. `OPENAI_API_KEY` is not in the required env schema. There is no test runner in `api/package.json`.

Behavior is specified in `specs/author-books/spec.md` and `specs/author-tickets/spec.md`.

## Goals / Non-Goals

**Goals:**

- Author book list and detail, and author ticket create, list, and detail, with ownership taken only from the access token.
- Create commits the ticket and a `ticket.created` audit row, then sends `bookleaf/ticket.created`. A send failure still returns 201 with `aiState: pending`.
- Author JSON matches the field lists in the specs, including the absence of a `notes` key.

**Non-Goals:**

- `GET /author/me`, attachment upload, admin routes, classify and draft functions, `GET`/`POST`/`PUT /api/inngest`, the web app, and OpenAPI.
- A new migration, Redis, or a required Inngest or OpenAI env var.

## Decisions

### Modules follow the auth split

Add `api/src/app/books/` and `api/src/app/tickets/`, each with `*.route.ts`, `*.controller.ts`, `*.service.ts`, `*.middleware.ts`, and `*.module.ts`. Mount both on `/api/v1` from `createServerApplication` before the 404 handler.

`requireAuthor` is implemented once in `auth.middleware.ts`: run `requireAuth`, then require `role === "author"` and a non-null `authorId`, otherwise 403. Both feature `*.middleware.ts` files re-export that function. Routes use it on every handler. An admin never reaches a book or ticket query.

Alternative considered: a copied role check in each module. Rejected because the two copies would drift from `requireAuth`.

### Controllers validate, services query

Controllers Zod-parse query and body and call services with `req.auth.authorId` and `req.auth.id`. Services own SQL and the create transaction. Authorization is the `author_id` predicate, not a second lookup that returns a different 404 body.

Shared page and limit parsing goes in `api/src/app/shared/pagination.ts` (`page` default 1, `limit` default 20, max 100, integers only). Both list controllers use it so the 400 bounds stay the same. A filter that matches nothing is 200 with `data: []` and `total: 0`.

### Book query

`WHERE books.author_id = token author id`. Optional `status` is exact equality on the stored text. Optional `q` is a case-insensitive substring on `title`, `isbn`, or `source_id`, with `%`, `_`, and `\` escaped. Blank `status` or `q` is ignored. Order is `title` ascending, then `source_id` ascending. No new index; the seeded catalog is 18 rows.

`toBookJson` in `books.service.ts` is the only book serializer. Ticket detail and ticket list import it so the book object cannot drift. Money is normalized from the driver string to two fractional digits without `Number`. Null stays null. `totalCopiesSold` is a number. `availableOn` is the stored array or `[]`. Date columns pass through as `YYYY-MM-DD`.

Detail is the same query plus `books.id = :bookId`. Zero rows is `AppError.notFound()`. A foreign id and a missing id therefore share code `NOT_FOUND` and message `Not found.`

### Ticket create

Body schema: `bookId` optional uuid or null, `subject` trimmed length 5–160, `description` trimmed length 10–10,000. Unknown keys are stripped, so a client `authorId` cannot change ownership. Field messages are `Use between 5 and 160 characters.` and `Use between 10 and 10000 characters.` Invalid `bookId` is 400 with `fields.bookId`.

When `bookId` is a uuid, select that book with `author_id` equal to the token. No row means 404 and no insert, which also avoids consuming `ticket_public_id_seq`.

Rate limit runs after validation and the ownership check, and only then is an attempt recorded. It copies the login limiter: an in-memory map, 20 timestamps per rolling hour, keyed by author id, throwing `AppError.rateLimited()`. A 400 or 404 does not consume a slot. Constants live in `tickets.constants.ts`.

The transaction then:

1. Inserts `tickets` with `author_id` from the token, `public_id` set to `'BL-' || nextval('ticket_public_id_seq')`, `status = open`, `ai_state = pending`, `ai_job_version = 1`, `draft_state = none`.
2. Inserts `ticket_events` with `event_type = ticket.created`, `actor_user_id` of the caller, and payload `{ "status": "open" }`. The payload has no subject and no description.

`returning()` supplies `id`, `publicId`, `aiJobVersion`, and `createdAt` for the 201 body: `id`, `publicId`, `status`, `aiState`, `bookId`, `subject`, `createdAt`.

If the composite foreign key still rejects the insert, map Postgres `23503` to 404. Do not surface SQL.

### Event after commit

`api/src/app/ai/inngest.ts` exports one client, `new Inngest({ id: "bookleaf" })`, and the event name `bookleaf/ticket.created`. Do not call `serve`, do not add a function, and do not add env vars to `env.ts`. The SDK may read `INNGEST_EVENT_KEY` from the process environment when it is present.

After the transaction resolves, `inngest.send({ name, data: { ticketId, jobVersion } })` uses the stored job version. The `catch` logs `ticketId` only and does not change the row. The controller still returns 201. Create does not import `openai` and does not read `OPENAI_API_KEY`.

Alternative considered: register a no-op function and `/api/inngest` now. Rejected because Phase 5 owns that route and the real classify function. The send payload is already the one that function will consume.

### Ticket list and detail

List: `tickets.author_id = token`, optional status enum (`open`, `in_progress`, `resolved`, `closed`), order `updated_at DESC`, page window from the shared parser. `replyCount` is a count of `ticket_messages` with `visibility = public`. Each row is the detail identity fields plus `book` (or null) and `replyCount`, and the serializer omits `description`, `replies`, and `attachments`.

Detail: same author predicate. `replies` are public messages ordered by `created_at` ascending, shaped `{ id, body, createdAt }`. `attachments` are the stored rows shaped `{ id, name, url, mime, sizeBytes }`, or `[]`. Timestamps use `toISOString()`. The serializer is an explicit object. It must not spread the ticket row, so `notes`, AI fields, overrides, and `draftBody` cannot leak. Zero rows is the same 404 as books.

## Risks / Trade-offs

- [Inngest is down or unsigned] → Create still returns 201 and leaves `ai_state = pending`. Those rows stay pending until Phase 5's recovery cron. That is the required failure mode.
- [In-memory create limit] → A restart clears it, and two API processes would not share it. The assignment forbids Redis for this demo. Validation and ownership failures do not consume slots; a crash between recording the slot and insert can consume one.
- [Sequence gaps] → `nextval` is not rolled back if the insert fails. Ownership is checked first so a foreign `bookId` does not burn an id.
- [Concurrent creates] → Two requests can both pass the limiter and slightly exceed 20. Acceptable for the demo limiter.
- [Explicit serializers] → A later column added to `tickets` is omitted until a serializer is updated. That is preferable to spreading the row into author JSON.

## Migration Plan

No migration and no seed change. Deploy is the new modules plus the two mounts. Rollback is reverting those files; tickets created while the routes were live can remain in the database.

Verification is manual against a migrated and seeded database, using the scenarios in the specs (AUTH001, AUTH003, AUTH007, foreign book id, two-character subject, empty `OPENAI_API_KEY`, author detail without `notes`).
