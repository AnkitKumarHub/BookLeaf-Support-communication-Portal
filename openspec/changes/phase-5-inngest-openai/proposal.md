# Proposal

## Why

A ticket is stored and an admin can answer it, but nothing classifies the request or drafts a reply. Phase 5 runs those two OpenAI calls inside Inngest after the HTTP handlers have already returned, so a missing key or a slow model cannot block create or a manual reply.

## What Changes

- Add `api/src/app/ai/` knowledge sections, the triage schema, the draft prompt, and two Inngest functions: `classify-ticket` on `bookleaf/ticket.created`, and `draft-ticket` on `bookleaf/ticket.draft_requested`.
- Register `GET`, `POST`, and `PUT /api/inngest` with the SDK serve handler. Signature auth, not the access cookie. The route stays outside `/api/v1`.
- On the first admin ticket GET where `draft_state` is `none`, conditionally set `pending` and send the draft event. Later GETs, the queue GET, and author reads do not enqueue and do not call the model.
- Add `PATCH /admin/tickets/:ticketId/draft`, `POST .../draft` (regenerate, 5 per ticket per hour, `confirmDiscardEdits` when the composer was edited), and `POST .../retry-triage` (bumps `ai_job_version`, does not clear overrides).
- Add `GET /admin/ai-runs/:runId`, returning the stored run without a prompt or a provider body.
- No recovery cron. A lost send leaves the ticket `pending` until an admin presses retry triage or regenerate.
- Persist `model`, `prompt_version`, token counts, and `error_code` on `ai_runs`. Never log the API key. A blank key still lets create and reply return 201; the job records `failed` with `error_code = config` and does not retry.

## Capabilities

### New Capabilities

- `ticket-classification`: After create or an admin retry, classify the ticket into one category and one priority, store them as suggestions, and leave overrides and ticket status untouched.
- `reply-draft`: The first admin open starts a draft, the admin can edit or regenerate it, and the draft never becomes a public message.
- `ai-run-inspection`: Each model attempt is stored with tokens and an error code, and an admin can read that record without seeing secrets.
- `inngest-endpoint`: Inngest reaches the two functions through a signed `/api/inngest` handler that the browser session cannot authorize.

### Modified Capabilities

- None. This project has no main specs under `openspec/specs/` yet. The unarchived Phase 4 delta `admin-ticket-detail` says an admin read does not change the ticket. This change supersedes that for the single case `draft_state = none`: the first admin detail GET may flip it to `pending` and send one event. Queue GET, author detail, and every later admin detail read stay side-effect free. Author ticket JSON is unchanged.

## Impact

- Extends `api/src/app/ai/inngest.ts` and adds the prompt, OpenAI, and function modules beside it. `serve` is mounted from `api/src/app/index.ts` on `/api/inngest`, before the 404 handler, and is not JWT-authenticated.
- Admin detail, draft, and retry routes stay in `api/src/app/admin/`. Reply handling still stores the submitted body and still does not read `draft_body`.
- Reads and writes `tickets` and `ai_runs`. No new table. `ai_runs` already has model, prompt version, tokens, and `error_code`.
- `openai` and `inngest` are already dependencies. `OPENAI_API_KEY` stays optional so the process boots with a blank key. Local dev needs `INNGEST_DEV=1` because the installed SDK defaults to cloud mode. Do not hardcode `isDev`.
- Out of scope: the Next.js composer and polling UI (Phase 6), uploads (Phase 7), `api/openapi.yaml` and Swagger (Phase 8), and the root README (Phase 9). The seven manual fixtures are run in this phase and the notes are kept for that README. No live-API unit test is added.
