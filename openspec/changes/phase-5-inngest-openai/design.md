# Design

## Context

See proposal.md for why this slice exists. Behavior is specified in `specs/ticket-classification/spec.md`, `specs/reply-draft/spec.md`, `specs/ai-run-inspection/spec.md`, and `specs/inngest-endpoint/spec.md`.

`api/src/app/ai/inngest.ts` already exports `inngest` (`new Inngest({ id: "bookleaf" })`) and `bookleaf/ticket.created`. `tickets.service.ts` sends that event after commit and, on throw, logs the ticket id and still returns 201. `getAdminTicket` in `admin.queue.service.ts` is a read: Phase 4 required it not to change the row. This phase is the one exception, and only when `draft_state` is `none`. The queue list and the author detail read stay reads.

`ai_runs` and the ticket AI columns already exist. There is no `processing` value on `draft_state` (`none`, `pending`, `suggested`, `failed`). `ai_state` does have `processing`. `loadEnv` does not know about OpenAI or Inngest, and a blank `OPENAI_API_KEY` must not stop the process from booting. `express.json` is limited to 1 MB. The installed SDK is `inngest@4.25.0`, which defaults to cloud mode and takes `triggers` on `createFunction`. `retries` on that version is the number of retries after the first attempt and defaults to 3. There is no test runner.

## Goals / Non-Goals

**Goals:**

- One OpenAI call site, used only from Inngest steps, so create, queue, poll, and reply never import it.
- Conditional writes so a retry or a duplicate event cannot clobber an override, an edited draft, or a newer job version.
- A blank key and a provider failure recorded on `ai_runs`, with the ticket still answerable by hand.

**Non-Goals:**

- A new table, a Redis limiter, or raising the 1 MB JSON limit.
- Returning 503 from create, reply, regenerate, or retry. Those handlers do not call OpenAI.
- The Next.js composer, OpenAPI, and the root README. Fixture notes are a file Phase 9 can copy.

## Decisions

### Module split

Keep the client in `api/src/app/ai/inngest.ts`. Add `knowledge-base.ts` (the six sections from `docs/ai-integration.md`, copied as static strings), `triage.ts` (system text, JSON schema, section picker), `draft.ts` (system text, section picker, subject and signature strip), `openai.ts` (one client, error mapping), `functions.ts` (the three functions), and `serve.ts` (the Express handler). Admin HTTP stays in the admin module. Inngest functions call into `ai/` and write SQL themselves; they do not go through admin controllers.

Alternative considered: putting the functions in the admin service. Rejected because that service is already the mutation surface, and a model call there would make a later poll easy to wire to OpenAI by mistake.

### SDK v4 shape

`createFunction` uses one options object with `triggers`, then the handler. Function ids are `classify-ticket` and `draft-ticket`. Do not rename them after they have run. Do not pass `signingKey` or `isDev` in code. The SDK reads `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`, and `INNGEST_DEV`. Add `INNGEST_DEV=1` to `api/.env.example` and to the env block in `docs/design.md`. Production must not set `INNGEST_DEV`.

`serve` from `inngest/express` is mounted at `/api/inngest` in `createServerApplication`, after `express.json` and before the 404 handler. It is not mounted on the `/api/v1` routers and it does not use `requireAdmin`. CORS stays as it is. Inngest calls the API directly, so the missing `PUT` in the browser allowlist does not apply. The global JSON limit stays 1 MB. Step return values are short status objects, not prompts.

Set `retries: 3` on both model functions. That is one try plus three retries, four total attempts, which is the cap in the classification and draft specs. The SDK default happens to be 3 retries; set it anyway so a later SDK default cannot widen the cap.

401, 403, a blank key, and an output-bounds failure throw `NonRetriableError` after the failed row is written. Timeout, HTTP 429, and HTTP 5xx or a network error throw a normal error so Inngest retries. `onFailure` sets `ai_state` or `draft_state` to `failed` only while the row is still `pending` or, for classification, `processing`, and only for the job version on the event. It does not touch overrides, `draft_body`, or messages.

Database reads, database writes, and the OpenAI call each live in `step.run`. A version mismatch or an already-completed classification returns normally and does not fail the function.

### Classify write

Load the ticket inside a step. Exit when `jobVersion` does not match or `ai_state` is already `completed` for that version. Claim the row with `ai_state = 'processing'` where the version matches and the state is `pending` or already `processing` (a step retry). Insert one `ai_runs` row per attempt inside the step that calls OpenAI, with `attempt` equal to the handler's zero-based `attempt` plus one, `prompt_version` `triage-v2`, and the model from `loadAiEnv()`.

The success `UPDATE` sets `ai_category`, `ai_priority`, `ai_confidence`, `ai_rationale`, `ai_state = 'completed'`, and `updated_at`, with `WHERE id AND ai_job_version AND ai_state = 'processing'`. The statement does not assign `category_override` or `priority_override`. Confidence outside 0..1 or an empty rationale is `invalid_output`: do not write those four suggestion columns. A rationale over 500 characters is trimmed by `fitRationale` and stored.

Idempotency is `'classify:' + event.data.ticketId + ':' + event.data.jobVersion`. A duplicate delivery of the same version is a no-op for 24 hours. Retry triage is a new version, so it runs.

### Draft enqueue and write

After `getAdminTicket` has confirmed the ticket exists, run one conditional update: `draft_state = 'pending'` and `updated_at = now()` where `draft_state = 'none'`, `RETURNING updated_at`. Zero rows means do not send. One row means send `bookleaf/ticket.draft_requested` with `{ ticketId, jobVersion, requestedAt }`, where `requestedAt` is that timestamp's `toISOString()`. If `send` throws, log the ticket id only and leave `pending`. Then load the detail as today, so the JSON shows `pending`.

The draft function's idempotency key is `'draft:' + event.data.ticketId + ':' + event.data.requestedAt`. Recovery sends the same `requestedAt` by formatting the stored `updated_at` with `toISOString()`. A regenerate writes a new `updated_at`, so its key differs and a new call is allowed.

Persist with `WHERE draft_state = 'pending' AND draft_edited_at IS NULL`, setting `draft_body`, `draft_state = 'suggested'`, and `draft_prompt_version = 'draft-v1'`. Zero rows because `draft_edited_at` is set: leave the body, finish the run with `error_code` `skipped_edited` and state `completed`. Do not insert `ticket_messages`. Empty or over 8,000 characters after the subject-line and trailing-signature strip is `invalid_output` and does not store the text.

`POST .../draft` checks the edit conflict first, so a 409 does not count toward the cap. The cap is an in-memory map keyed by ticket id, 5 accepts per rolling hour, same shape as `login-rate-limit.ts`. Only an accept is recorded. It then clears `draft_edited_at`, sets `pending`, and sends. `PATCH .../draft` stores the trimmed body and `draft_edited_at` and does not change `draft_state`, so a save cannot enqueue another generation.

### What the model is allowed to see

Triage sections, in match order: royalty, isbn, printing, distribution, production. Always include `general`. Take the first two keyword matches, or none. Draft sections: the effective category's section (override, else AI category, else skip), always `general`, plus one keyword section for a different topic. Stop at three. Keywords are the lists in `docs/ai-integration.md`.

Description is cut to 6,000 characters before assembly. If the user message still exceeds `AI_MAX_INPUT_CHARS` (default 12,000), shorten the description further. Do not drop `general`. Book facts for a draft use the literal `unknown` for nulls. Public replies: oldest-first among the last five, each cut to 1,500 characters. Omit phone, email, other books, attachment bytes and URLs, and every `internal` message.

Triage uses Chat Completions with `response_format.json_schema`, `strict: true`, name `bookleaf_triage`, temperature 0. Draft uses a plain completion, temperature 0.3, `max_tokens` from `AI_MAX_OUTPUT_TOKENS` (default 700). Timeout is `AI_REQUEST_TIMEOUT_MS` (default 20,000). `loadAiEnv()` applies those defaults and treats a missing key as `""`. It is not part of `loadEnv()`, so boot does not require it.

### Lost send

No recovery cron. The build assumes the API and Inngest are both running. If `inngest.send()` throws, the ticket stays `pending` until an admin presses retry triage (classification) or regenerate (draft).

### Redacted run read

`GET /api/v1/admin/ai-runs/:runId` selects named columns only. The serializer never spreads the row. Logs for a model failure are `ticketId` plus the mapped `error_code`. Do not pass the caught provider error to `console`, because its message can echo the request.

### Failure codes

| Condition | `error_code` | Retry |
|---|---|---|
| Blank `OPENAI_API_KEY`, HTTP 401, HTTP 403 | `config` | No |
| Timeout | `timeout` | Yes, then fail |
| HTTP 429 | `rate_limit` | Yes, then fail |
| HTTP 5xx or network | `provider` | Yes, then fail |
| Bounds or empty draft | `invalid_output` | No |
| Draft finished after an edit | `skipped_edited` | No, run `completed` |

## Risks / Trade-offs

- [Admin reply or patch bumps `updated_at` while a draft is still `pending`] → Recovery may send a second draft event. The persist update still requires `draft_state = 'pending'` and a null `draft_edited_at`, so it cannot add a message or replace an edit. The cost is at most one extra model call.
- [Inngest idempotency window is 24 hours] → A lost run that already consumed `classify:${ticketId}:${jobVersion}` will not run again until retry triage bumps the version. That is the admin's escape hatch, and it is the behavior the product doc chose over an outbox.
- [`onFailure` and the step both mark a row failed] → The `onFailure` update matches only `pending` or `processing`, so a completed row stays completed.
- [Phase 4 readers expect a side-effect-free detail GET] → Only the `none` → `pending` transition writes. The task that verifies this has to open a fresh ticket, not a ticket that was already opened.
- [Dev server returns 500 without `INNGEST_DEV`] → The example env sets it. Code does not force dev mode, so a production deploy that copies the example must delete that line and set the signing key.

## Migration Plan

No schema change. Deploy the API with the new route, set `OPENAI_API_KEY` and `OPENAI_MODEL` when a key exists, and leave the key blank to exercise the manual path. Point the Inngest app at `https://<api>/api/inngest` in Phase 9. Rollback is reverting the serve registration: create and reply keep working, and tickets stay `pending` until the functions are restored. Do not delete `ai_runs` or draft text on rollback.
