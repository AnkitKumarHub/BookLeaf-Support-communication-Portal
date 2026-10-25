# Design

## Context

See proposal.md for why. `getAdminTicket` in `api/src/app/admin/admin.queue.service.ts` runs one conditional update, `draft_state = 'pending' WHERE id = ? AND draft_state = 'none'`, and sends `bookleaf/ticket.draft_requested` when a row changed. The classify job publishes a ticket-changed event (audience admin) when it completes or fails, and the admin layout's SSE hook revalidates the open ticket's detail key on that event, which repeats the admin GET. `regenerateDraft` (`POST .../draft`) sets `pending` from any draft state and sends the event.

## Goals / Non-Goals

**Goals:**

- The automatic draft always has the category (or a definite triage failure) available.
- Smallest change that reuses the existing trigger, stream, and buttons.

**Non-Goals:**

- Automatic recovery when classification never finishes. Manual recovery (Generate draft, Retry triage) is the project's rule since the recovery cron was removed.
- Re-drafting when a category or override changes after the draft landed. Regenerate covers that.

## Decisions

**Gate the existing trigger instead of making the draft job wait.** Add `ai_state IN ('completed', 'failed')` to the conditional update. The alternative, a bounded `step.sleep` loop inside `draft-ticket`, also works without a lost-event gap, but it is about fifteen lines of step logic for a few seconds of waiting. Gating needs one condition, and the refetch that starts the draft already happens because of the stream.

**`failed` counts as finished.** A failed classification will never produce a category, so waiting longer gains nothing. The draft uses today's keyword fallback.

**Overrides do not need a special case.** An override can be set while `ai_state` is still `pending`. Today's trigger ignores that, and so does this one. The draft starts when triage finishes and uses the override, because `effectiveCategory` is `categoryOverride ?? aiCategory`.

**UI wording.** `DraftStatus` in the composer gets a branch for `draftState = none` with `aiState` `pending` or `processing`. The reply box stays editable, so an admin can still answer by hand.

## Risks / Trade-offs

- [The stream is down when triage finishes, so no refetch fires] → The draft starts on the next admin read: tab focus, Refresh, or reopening the ticket.
- [Classification never finishes (lost event)] → No automatic draft. The composer keeps saying it is waiting, and Generate draft or Retry triage recovers it. Both are enabled in that state.
- [Two admins have the ticket open when triage finishes] → Both refetch, and the conditional update lets exactly one start the draft.

## Migration Plan

No schema or data change. Tickets already at `draft_state = 'pending'`, `'suggested'`, or `'failed'` are unaffected. Rollback is removing the condition.
