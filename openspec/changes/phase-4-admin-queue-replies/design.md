# Design

## Context

See proposal.md for why this slice exists. Behavior is specified in `specs/admin-ticket-queue/spec.md`, `specs/admin-ticket-detail/spec.md`, `specs/admin-ticket-triage/spec.md`, and `specs/admin-ticket-replies/spec.md`.

Phase 3 established the shape this change follows. `api/src/app/index.ts` mounts auth, books, and tickets on `/api/v1` before the 404 handler. Controllers validate input, throw `AppError`, and call `sendData`; services own SQL and transactions; Express 5 forwards async rejections to `errorHandler`. `requireAuth`, `requireRole`, `requireAuthor`, and `requestAuthor` live in `auth.middleware.ts`. `shared/pagination.ts` exports `parsePagination` and `optionalFilter`. `shared/ids.ts` exports `isUuid`. `books.service.ts` exports `toBookJson` and keeps a private `likePattern` that escapes `%`, `_`, and `\`.

Ticket columns this change writes already exist: `tickets.assigned_admin_id` with an index on `(assigned_admin_id, status)`, `tickets.resolved_at`, `ticket_messages.visibility`, and `ticket_events`. `api/src/db/index.ts` exports a Drizzle client without the relational query API, so services use the query builder. There is no test runner in `api/package.json`, so verification is manual against a migrated and seeded database.

`authors` is the person and `users` is the login. Author display names already live on `authors.name`. An admin login has no person row, and `users` has no name column. `tickets.updated_at` is `defaultNow()` with no `$onUpdate`, so every mutation has to set it explicitly.

## Goals / Non-Goals

**Goals:**

- One admin module that reuses the Phase 3 serializers and parsers rather than copying them, so the book object and the pagination bounds cannot drift between portals.
- Queue ordering and effective category and priority computed in SQL, so a page boundary cannot reorder results.
- Every mutation is a single transaction that writes the row change and its audit entry together.
- Admin detail is a side-effect-free read in this phase, so Phase 5 can add draft enqueue to one place without reworking the serializer.
- An `admins` profile that holds the ops person's name, parallel to `authors`, so `users` stays credentials and a role link.

**Non-Goals:**

- Draft generation, the draft endpoints, retry triage, the AI run route, and `/api/inngest`. No OpenAI client is imported here.
- A new npm dependency, Redis, or a rate limit on admin actions.
- A name column on `users`, and putting the admin into `authors`. The seed count stays 10 authors.
- Assigning to another admin, and any UI.

## Decisions

### Module layout and the admin gate

Add `api/src/app/admin/` with `admin.route.ts`, `admin.controller.ts`, `admin.service.ts`, `admin.middleware.ts`, and `admin.module.ts`, mounted on `/api/v1` from `createServerApplication` before the 404 handler. The service file is the largest in the project, so split the SQL into `admin.queue.service.ts` (list and detail reads) and `admin.service.ts` (mutations) if either passes roughly 300 lines. The route file stays the single list of paths.

`requireAdmin` and `requestAdmin` go in `auth.middleware.ts` next to the author pair, built the same way: `requireAdmin` runs `requireAuth`, then requires `role === "admin"`, otherwise 403. `requestAdmin` returns `{ userId }` and throws 403 if the request was not gated. `admin.middleware.ts` re-exports them, mirroring `tickets.middleware.ts`.

Alternative considered: `requireRole("admin")`, which already exists. Rejected because it does not run `requireAuth` itself, so a route would need two middlewares and a missed one would be a silent authorization hole. The author gate already set the one-middleware precedent.

### Effective values and ordering in SQL

Effective category is `COALESCE(category_override, ai_category)` and effective priority is `COALESCE(priority_override, ai_priority)`. Both the filter and the sort use that expression; the serializer returns the AI value, the override, and the effective value as three separate fields so the UI can distinguish a real medium from "AI pending".

Order is three expressions, not a sort parameter:

1. `CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END`
2. Effective priority rank: `critical` 0, `high` 1, null 2, `medium` 3, `low` 4. A null is its own band, between high and medium. It is not stored or returned as `medium`. A failed classification with no override stays in that band because its effective priority is still null. An override moves the ticket into the matching known band.
3. `created_at ASC`, then `id ASC` as a tiebreaker so pagination is stable across requests.

Doing this in SQL rather than in JavaScript matters because the queue is paginated: sorting a 20-row page in memory would order each page independently and scramble the overall work order.

### Query shape

The queue joins `authors` (inner, every ticket has one), `books` (left, null for a general ticket), `users` (left, for the assignee), and `admins` (left, through `users.admin_id`). `meta.total` is a separate `count()` over the same joins and the same `WHERE`, because the row query carries `LIMIT` and `OFFSET`.

Filters compose into one `and(...)` array, matching `ticketFilters` in `tickets.service.ts`:

- `status` reuses `parseTicketStatus`, so the admin and author endpoints reject the same values with the same body.
- `category` and `priority` are enum-parsed, then compared against the `COALESCE` expression. A null effective value fails that equality naturally, which is the specified behavior.
- `assignee=me` is `assigned_admin_id = :callerId`; `assignee=unassigned` is `assigned_admin_id IS NULL`.
- `q` is a case-insensitive substring across `tickets.public_id`, `tickets.subject`, `authors.name`, and `authors.email`.

`likePattern` moves from `books.service.ts` into `shared/like.ts` and both services import it. Copying the escape into a second module is the kind of duplication that drifts the first time someone fixes a bug in one copy, and the author book search already depends on it.

### Date range parsing

`parseDateRange` joins `parsePagination` in `shared/pagination.ts`. It accepts `YYYY-MM-DD` only, rejects anything else with 400 and a field message, converts `from` to `00:00:00.000Z` and `to` to `23:59:59.999Z` of that day, and rejects `from > to`. Returning concrete `Date` bounds keeps the half-open-interval question out of the service.

Alternative considered: accepting a full ISO timestamp. Rejected because `docs/api.md` fixes the query format at `YYYY-MM-DD`, and accepting both would make the inclusive-`to` rule ambiguous.

### Admin profile

Add `admins` with `id` (uuid, primary key) and `name` (text, not null). Add nullable `users.admin_id` referencing `admins.id`. Replace `users_role_author_check` so the two roles stay exclusive:

- `role = 'author'` requires `author_id` set and `admin_id` null.
- `role = 'admin'` requires `admin_id` set and `author_id` null.

`tickets.assigned_admin_id` keeps referencing `users.id`. `assigneeName` is `admins.name` reached by ticket → user → admin profile, and is null when `assigned_admin_id` is null. A note's `authorName` uses the same join from `ticket_messages.author_user_id`. A queue row's `authorName` stays `authors.name`.

The seed upserts one profile named `BookLeaf Admin` and points `admin@bookleaf.dev` at it. A second seed updates that profile's name rather than inserting another row: look up the user by email, update `admins.name` when `admin_id` is already set, and insert the profile only when it is not. Author user rows keep `admin_id` null. The admin is not inserted into `authors`, so the seeded author count stays 10.

Alternative considered: a `users.name` column set only on the admin row. Rejected because author rows would carry an empty name while the admin row carried one, and `users` would stop meaning only "login". Copying every author name onto `users.name` was also rejected, because `authors.name` is already the catalog name and a second copy can drift.

### Patch: absent versus explicit null

`PATCH` has to tell "field not sent" from "field sent as null", because null clears an override while absent leaves it alone. `JSON.parse` keeps both, but a plain `?? undefined` read collapses them, so the controller checks key presence with `in` on the parsed object before reading each value, and builds a patch object whose keys exist only for fields the client actually sent. Unknown keys are dropped, so a client cannot patch `authorId`, `aiCategory`, or `assignedAdminId`.

A body with none of the three recognised keys is 400 rather than a 200 no-op, so a typo in a field name fails loudly instead of silently doing nothing.

### Status transitions

A single `ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]>` constant in `admin.constants.ts` is the only place the table lives, and the 409 message is generated from it so the message cannot contradict the check. A real change is checked against that table. Sending the status the ticket already has is not a change: the handler returns 200, skips the status update, and writes no `ticket.status_changed` row. Other fields in the same body still apply, and each of those still gets its own audit row. A body whose only effect is the repeated status writes nothing.

`resolved_at` is set to the transaction time when the new status is `resolved`, cleared when moving from `resolved` to `open` or `in_progress`, and left alone on `resolved` to `closed`. Closing from `open` or `in_progress` does not set it, because the ticket was never resolved.

### Mutations and audit

Every mutating endpoint runs one transaction that updates `tickets` (always setting `updated_at` to the transaction time, since the column has no `$onUpdate`) and inserts its `ticket_events` rows. A patch that changes status and an override in the same request writes one event per changed field, so each field keeps its own before and after values.

Event types extend the existing `ticket.created`: `ticket.status_changed`, `ticket.category_override_changed`, `ticket.priority_override_changed`, `ticket.assigned`, `ticket.unassigned`, `ticket.replied`, and `ticket.note_added`. Payloads carry `from` and `to` values and never a message body, matching `docs/design.md`.

Assign and unassign get their idempotency from the `UPDATE` predicate rather than a read-then-write: assign updates `WHERE id = :id AND assigned_admin_id IS DISTINCT FROM :adminId`, unassign updates `WHERE id = :id AND assigned_admin_id IS NOT NULL`. When `returning()` is empty the ticket exists but was already in the target state, so the handler skips the audit insert and returns 200. That is the "pick skip" policy from `docs/tasks.md`, and it also closes the race where two concurrent claims would otherwise both write an event. Distinguishing "no row changed" from "no such ticket" needs one existence check, which runs inside the same transaction.

The reply transaction inserts the message with `visibility = 'public'`, conditionally updates status from `open` to `in_progress`, always bumps `updated_at`, and writes `ticket.replied` plus a `ticket.status_changed` event when the status actually moved. The note transaction inserts with `visibility = 'internal'` and writes `ticket.note_added`, and deliberately does not touch `tickets` at all — that is what keeps a note out of the author's `updatedAt`-ordered list.

Reply bodies come only from the request. `admin.service.ts` never reads `draft_body` on this path, which is the one rule that keeps a model from sending text to an author.

### Serializers

Both admin serializers are explicit object literals that never spread a row, the same rule Phase 3 used to keep `notes` out of author JSON. Here the risk runs the other way — a spread would leak `password_hash` from the joined `users` row — so the queries select named columns rather than whole tables.

Detail reuses `toBookJson` from `books.service.ts`. The book lookup is by `books.id` alone, without an `author_id` predicate, because an admin reads every author's books; ownership is already guaranteed by the composite foreign key that ties a ticket's book to its author.

Detail issues the ticket query first, 404s if there is no row, then runs the replies, notes, attachments, and events queries with `Promise.all`, mirroring `getTicket` in `tickets.service.ts`.

### Draft enqueue stays out

`GET /admin/tickets/:ticketId` reads the draft columns and starts nothing. `docs/design.md` specifies a conditional update to `draft_state = pending` plus a `bookleaf/ticket.draft_requested` event on first open, and `docs/tasks.md` assigns that to Phase 5. Adding it now would mean a second Inngest event with no function to consume it, and would break this phase's verification that two reads leave the ticket unchanged. Phase 5 adds it between the ticket load and the serializer in the one controller that already exists.

## Risks / Trade-offs

- [Queue sort uses `CASE` expressions, so the existing indexes do not serve the ordering] → Accepted. The demo dataset is 18 books and a handful of tickets, so this is a sequential scan over a tiny table. Adding a priority-rank index now would be speculative; the fix, if volume ever justified it, is a stored rank column or an expression index.
- [Existing databases already have `admin@bookleaf.dev` with a null `admin_id`] → The migration inserts the `BookLeaf Admin` profile and sets that user's `admin_id` before replacing the role check, so the new check does not fail on a row that was seeded earlier. A fresh database has no users yet, and the seed creates the profile and the login.
- [Two admins patching the same ticket concurrently] → Last write wins on the row, but the audit keeps both entries with their before and after values, so the history stays truthful. Optimistic concurrency on `updated_at` is out of scope for a single-admin demo.
- [Same-status patch returns 200] → A client can re-send the current status and see success. The ticket and its audit history stay unchanged, so the 200 does not look like a new status change. An illegal move is still 409.
- [Moving `likePattern` touches working Phase 3 code] → The move is mechanical and `pnpm run build` plus a re-run of the author book search check covers it.
- [Reply and status change are one transaction] → If the status update fails, the reply rolls back too, so the author never sees a reply on a ticket still marked `open`. The cost is that a transient failure loses the submitted text and the admin must resend.

## Migration Plan

One migration creates `admins`, adds `users.admin_id`, backfills the existing admin login when that row is already present, then replaces `users_role_author_check`. The seed learns the profile upsert. `docs/design.md` gains the `admins` table and the new column in its table list. Deploy is that migration, the seed change, the new `admin` module, the two new helpers in `auth.middleware.ts`, `shared/like.ts`, and `parseDateRange`, plus one mount in `app/index.ts`. Rollback is reverting the migration and those files. Tickets created while the routes were live stay valid. An `admins` row created by the backfill can remain; it is not referenced once `users.admin_id` is dropped.

Verification is manual against a migrated and seeded database, using the scenarios in the four specs: the queue order check from `docs/tasks.md`, an author receiving 403 on a note and a reply, a note absent from the author payload while a reply is present, `resolved` to `open` returning 409, `closed` to `in_progress` returning 200, and a second assign-to-me leaving a single audit row.
