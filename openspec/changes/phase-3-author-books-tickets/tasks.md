# Tasks

## 1. Shared author gate and pagination

- [x] 1.1 Add `requireAuthor` to `api/src/app/auth/auth.middleware.ts` so it runs `requireAuth`, then rejects any role other than `author` or a null `authorId` with 403. Verify `pnpm run build` in `api/` succeeds and existing auth routes still compile.
- [x] 1.2 Add `api/src/app/shared/pagination.ts` that parses `page` (default 1) and `limit` (default 20, max 100) and throws `AppError.validation` for a non-integer, a page below 1, or a limit outside 1–100. Verify `pnpm run build` in `api/` succeeds.

## 2. Author books

- [x] 2.1 Add `api/src/app/books/` (`route`, `controller`, `service`, `middleware` re-exporting `requireAuthor`, `module`) and mount it on `/api/v1` in `api/src/app/index.ts` before the 404 handler. Verify `GET /api/v1/author/books` without a cookie is 401 `UNAUTHENTICATED` with message `Authentication required.`, and the same call as `admin@bookleaf.dev` is 403 `FORBIDDEN`.
- [x] 2.2 Implement list and detail in the books service: filter by the token `authorId`, exact `status`, escaped case-insensitive `q` on title, isbn, and source id, order by title then source id, and `toBookJson` (two-decimal money strings or null, numeric `totalCopiesSold`, `availableOn` array, `YYYY-MM-DD` dates). Verify a seeded login as `priya.sharma@email.com` (`AUTH001`) returns `meta.total` 2, `ananya.reddy@email.com` (`AUTH003`) returns `meta.total` 1, and `sneha.kulkarni@email.com` (`AUTH007`) returns `meta.total` 3 including `sourceId` `BK013` with null MRP, null publication date, `totalCopiesSold` 0, and `availableOn` `[]`.
- [x] 2.3 Return `AppError.notFound()` when the book id is missing or owned by someone else, using the same `author_id` predicate. Verify Priya's `GET /api/v1/author/books/:bookId` for one of Sneha's book ids is 404 `NOT_FOUND` with message `Not found.`, and `limit=101` on the list is 400 `VALIDATION_ERROR`.

## 3. Ticket create

- [x] 3.1 Add `api/src/app/ai/inngest.ts` exporting `new Inngest({ id: "bookleaf" })` and the event name `bookleaf/ticket.created`. Do not register a function or `/api/inngest`, and do not add env vars. Verify `pnpm run build` in `api/` succeeds and `api/src/env.ts` is unchanged.
- [x] 3.2 Add `api/src/app/tickets/` with the auth file split, `tickets.constants.ts` (20 creates per hour), and an in-memory limiter keyed by author id that records an attempt only after Zod and the book-ownership check. Mount the module on `/api/v1`. Verify an admin `POST /api/v1/author/tickets` is 403 and creates no row, and a subject of `ab` with a valid description is 400 with `fields.subject` `Use between 5 and 160 characters.` and creates no row.
- [x] 3.3 Implement create: reject a uuid `bookId` the author does not own with 404 and no insert; insert the ticket and a `ticket.created` audit row (`payload` `{ "status": "open" }`, no description) in one transaction; set `public_id` from `'BL-' || nextval('ticket_public_id_seq')`; map Postgres `23503` to 404. After commit, send `{ ticketId, jobVersion }` and on throw log only `ticketId` and still return 201. Verify a general-ticket create with `OPENAI_API_KEY` unset returns 201 `aiState: pending`, the first id on an unused sequence is `BL-1001`, a book id owned by another author is 404 with no new ticket, and one `ticket.created` row exists whose payload has no description.

## 4. Ticket list and detail

- [x] 4.1 Implement `GET /api/v1/author/tickets` for the token author only, optional status enum, shared pagination, `updatedAt` descending, and `replyCount` of public messages. Omit `description`, `replies`, and `attachments`. Verify Priya's list does not include a ticket created by Sneha, an invalid `status` is 400, and a row includes `replyCount` without those three fields.
- [x] 4.2 Implement `GET /api/v1/author/tickets/:ticketId` with an explicit serializer: book via `toBookJson` or null, public replies by `createdAt` ascending, attachments array, ISO-8601 timestamps, and no `notes`, AI, override, or `draftBody` fields. Verify the owner gets 200, another author's ticket id is 404 `Not found.`, and the JSON has no `notes` key.

## 5. Phase check

- [x] 5.1 Run `pnpm run build` in `api/` and repeat the Phase 3 checks from `docs/tasks.md`: Priya 2 books, Ananya 1, Sneha 3 including `BK013`, foreign book id 404 with no ticket, two-character subject 400 with no ticket, create 201 `aiState: pending` with `OPENAI_API_KEY` empty, author ticket JSON has no `notes` key. Check those Phase 3 boxes in `docs/tasks.md` only after each check is true.
