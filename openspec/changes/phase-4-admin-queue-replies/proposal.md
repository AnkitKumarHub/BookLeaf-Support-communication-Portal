# Proposal

## Why

Phase 3 lets an author open a ticket, but nobody can work it. There is no admin API at all, so a submitted ticket sits in Postgres with no way to triage it, assign it, change its status, or answer the author. Phase 4 is that working surface, and it must stand up before Phase 5 adds AI, because a human sends every reply whether or not a model produced a draft.

## What Changes

- Add an admin-only module under `/api/v1/admin`. `requireAdmin` sits in `auth.middleware.ts` beside `requireAuthor`. An author on any of these routes is 403.
- Add `GET /admin/tickets`, the cross-author queue. Filters: `status`, `category`, `priority`, `from`, `to`, `assignee` (`me` or `unassigned`), and `q` across public id, subject, author name, and author email. There is no client sort parameter. Default order is unresolved first, then effective priority Critical, High, unclassified, Medium, Low, then oldest `createdAt`. An unclassified ticket keeps a null priority.
- Add `GET /admin/tickets/:ticketId`, the full read: description, the author's name, email, phone, and city, the book, AI category, priority, confidence and rationale, the stored draft columns, public replies, internal notes, attachments, and the audit event list. It reads the draft columns only; it does not start generation.
- Add `PATCH /admin/tickets/:ticketId` for status and for setting or clearing `categoryOverride` and `priorityOverride`. An illegal status move is 409 and names the allowed next statuses. Sending the status the ticket already has is 200 and writes no status audit row. Clearing an override leaves `aiCategory` and `aiPriority` intact.
- Add `POST /admin/tickets/:ticketId/assign-to-me` and `POST .../unassign`. Both are idempotent 200. A repeat call changes nothing and writes no second audit row.
- Add `POST /admin/tickets/:ticketId/notes`. An internal note is 201, never reaches author JSON, and does not change status.
- Add `POST /admin/tickets/:ticketId/replies`. The stored body is exactly the submitted text, never `draft_body`. A reply on an `open` ticket also moves it to `in_progress`. It does not move `resolved` or `closed`.
- Write a `ticket_events` audit row when status, an override, or the assignee changes and when a public reply or an internal note is created. Payloads carry old and new values, never a message body.
- Add an `admins` profile table with a single `name`, and `users.admin_id` pointing at it. The seed creates one profile named `BookLeaf Admin` and links `admin@bookleaf.dev` to it. Author names stay on `authors.name`. `users` gains no name column.

## Capabilities

### New Capabilities

- `admin-ticket-queue`: An authenticated admin lists tickets across every author, filtered and searched, in a fixed work order that surfaces urgent and old unresolved tickets first.
- `admin-ticket-detail`: An authenticated admin reads one ticket in full, including the internal fields an author must never receive.
- `admin-ticket-triage`: An admin routes a ticket by changing its status under a fixed transition table, overriding the AI category and priority, and claiming or releasing it.
- `admin-ticket-replies`: An admin records an internal note or sends the single public reply that reaches the author, with the ticket status and timestamps kept consistent.

### Modified Capabilities

- None. The project has no main specs yet, and author-facing behavior is unchanged: `author-tickets` already specifies that public replies appear and internal notes never do.

## Impact

- New module `api/src/app/admin/` using the same route, controller, service, middleware, module split as auth, tickets, and books, mounted on `/api/v1` from `api/src/app/index.ts` before the 404 handler.
- `requireAdmin` and `requestAdmin` added to `api/src/app/auth/auth.middleware.ts`. Existing author helpers are untouched.
- Reuses `toBookJson` from `books.service.ts` so the book object cannot drift between the author and admin views. Reuses `parsePagination` and `optionalFilter` from `shared/pagination.ts`, which gains a shared `YYYY-MM-DD` date-range parser for `from` and `to`.
- Reads and writes `tickets`, `ticket_messages`, `ticket_events`, `ticket_attachments`, `authors`, `books`, `users`, and the new `admins` table. `assigned_admin_id` still references `users.id`. One migration adds `admins`, `users.admin_id`, and a role check so an admin row points at an admin profile and an author row points at an author.
- `assigneeName` and a note's `authorName` are `admins.name`. For the seeded admin that is `BookLeaf Admin`. `authorName` on a queue row stays `authors.name`.
- Out of scope and still owned by later phases: starting draft generation on first admin open, `POST` and `PATCH .../draft`, `POST .../retry-triage`, `GET /admin/ai-runs/:runId`, the `/api/inngest` route and both Inngest functions (Phase 5); the Next.js admin screens and polling (Phase 6); attachment upload (Phase 7); `api/openapi.yaml` and Swagger UI (Phase 8). No OpenAI call is added, and nothing here requires `OPENAI_API_KEY`.
