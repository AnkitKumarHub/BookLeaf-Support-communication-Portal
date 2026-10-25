# Tasks

## 1. Start the draft after triage

- [x] 1.1 In `getAdminTicket` (`api/src/app/admin/admin.queue.service.ts`), add `inArray(tickets.aiState, ["completed", "failed"])` to the conditional `draft_state` update. Verify `pnpm run build` in `api/` succeeds, and against the running API: an admin GET of a ticket with `ai_state = 'pending'` returns `draftState` `none`; after setting that ticket's `ai_state` to `completed`, the next admin GET returns `draftState` `pending`; an admin GET of a `failed` ticket with `draftState` `none` returns `pending`.

## 2. Waiting state in the composer

- [x] 2.1 In `web/src/app/admin/tickets/[id]/composer.tsx`, pass `aiState` to `DraftStatus` and show "Waiting for triage before drafting…" when `draftState` is `none` and `aiState` is `pending` or `processing`; keep the reply box and Generate draft enabled. Verify `pnpm exec tsc --noEmit`, `pnpm run lint`, and `pnpm run build` in `web/` succeed, and that the admin view of a pending-triage ticket shows the message with an editable box.

## 3. Docs

- [x] 3.1 Update the draft trigger in `docs/design.md` (Draft, step 1) and `docs/ai-integration.md` (Tasks and human control, item 2) to say the first admin open starts the draft once classification is `completed` or `failed`, and that the stream refetch starts it when triage finishes. Verify both files describe the same condition as the code.
