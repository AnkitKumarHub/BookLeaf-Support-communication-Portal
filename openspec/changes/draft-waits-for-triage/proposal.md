# Proposal

## Why

The draft picks its knowledge-base section from the ticket's category, but today it starts the moment an admin first opens a ticket. If that happens while classification is still running, the category is empty and the draft is written from `general` plus a keyword guess. That draft is saved and reused on later visits. The senior engineer's requirement is that drafts use the KB policy for the ticket's category, so the draft should start only once classification has finished.

## What Changes

- The first admin open starts a draft only when classification has finished (`ai_state` is `completed` or `failed`). While classification is `pending` or `processing`, the open does not start a draft and `draft_state` stays `none`.
- When classification finishes, the classify job already publishes a ticket-changed event. The admin's open ticket page refetches on it, and that read starts the draft, now with the category available.
- The admin composer shows "Waiting for triage before drafting…" while classification runs, then the existing "Drafting a reply with AI…" while the draft is generated.
- A classification that never finishes (lost event; there is no recovery cron) does not start a draft automatically. The admin uses the existing Generate draft or Retry triage buttons, as for any lost send.
- No change to the draft job, events, routes, or schema.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `reply-draft`: the first-open trigger now also requires finished classification. This capability is defined in the unarchived `phase-5-inngest-openai` change ("First admin open enqueues one draft"); there are no main specs under `openspec/specs/` yet, so the delta adds the new condition as its own requirement.

## Impact

- API: one extra condition in the conditional update in `getAdminTicket` (`api/src/app/admin/admin.queue.service.ts`).
- Web: the composer's draft status line in `web/src/app/admin/tickets/[id]/composer.tsx`.
- Docs: the draft trigger in `docs/design.md` and `docs/ai-integration.md`.
- Cost: unchanged, one draft call per ticket. Latency: on a brand-new ticket the draft starts a few seconds later, after classification, and is right the first time.
