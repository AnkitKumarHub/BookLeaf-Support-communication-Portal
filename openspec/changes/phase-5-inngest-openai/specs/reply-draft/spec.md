# Spec Delta

## Purpose

Starts a suggested reply the first time an admin opens a ticket, lets that admin edit or regenerate it, and never sends the suggestion to the author.

## ADDED Requirements

### Requirement: First admin open enqueues one draft
`GET /api/v1/admin/tickets/:ticketId` MUST, when `draftState` is `none`, set it to `pending` and emit `bookleaf/ticket.draft_requested` for that ticket. The response MUST still be 200. A second detail read while the draft is `pending`, `suggested`, or `failed` MUST NOT emit another draft event. The queue list, an author ticket read, and a model call MUST NOT happen on this request.

#### Scenario: First open starts a draft
- **WHEN** an admin opens a ticket whose `draftState` is `none`
- **THEN** the response is 200 and `draftState` is `pending`

#### Scenario: Second open does not enqueue again
- **WHEN** an admin opens the same ticket again while `draftState` is `pending`
- **THEN** the response is 200 and no additional draft request is emitted

#### Scenario: Queue does not enqueue
- **WHEN** an admin lists the queue and a ticket still has `draftState` `none`
- **THEN** that ticket's `draftState` stays `none`

#### Scenario: Author read does not enqueue
- **WHEN** the owning author reads their ticket
- **THEN** `draftState` stays `none`

### Requirement: A failed draft send stays pending
If emitting the draft event throws after `draftState` was set to `pending`, the detail response MUST still be 200 and `draftState` MUST stay `pending`.

#### Scenario: Send throws
- **WHEN** the draft event send throws on the first admin open
- **THEN** the response is 200 and `draftState` remains `pending`

### Requirement: A successful draft is stored and not sent
A successful draft MUST store the reply text in `draftBody`, set `draftState` to `suggested`, and record prompt version `draft-v1`. It MUST NOT insert a public reply or an internal note. It MUST NOT change ticket status.

#### Scenario: Draft lands in the composer field
- **WHEN** draft generation succeeds and the admin has not edited the draft
- **THEN** `draftState` is `suggested` and `draftBody` is the model text

#### Scenario: No message row
- **WHEN** draft generation succeeds
- **THEN** the ticket's public replies and internal notes are unchanged

### Requirement: An edited draft is not overwritten
If `draftEditedAt` is set when generation finishes, the system MUST leave `draftBody` unchanged and MUST record the run as `skipped_edited`. Regeneration MUST be the only path that replaces an edited draft.

#### Scenario: In-flight edit wins
- **WHEN** an admin saves composer edits and the in-flight generation then finishes
- **THEN** `draftBody` is still the admin's text

### Requirement: Draft text bounds
The system MUST set `draftState` to `failed` with `error_code` `invalid_output` when the model text is empty or longer than 8,000 characters, and MUST NOT store that text. Shorter text MUST be stored as returned, except a leading `Subject:` line and a trailing signature block MUST be removed when present.

#### Scenario: Empty draft fails
- **WHEN** the model returns an empty string
- **THEN** `draftState` is `failed`, `error_code` is `invalid_output`, and `draftBody` is null

#### Scenario: Subject line is stripped
- **WHEN** the model returns a body that begins with a `Subject:` line and is otherwise within the length limit
- **THEN** the stored `draftBody` does not include that line

### Requirement: Draft policy sections are capped
The draft request MUST include the general section and the section for the effective category, using the override when set, otherwise the AI category, otherwise general only. A keyword match on a different topic MUST add that one section. The request MUST NOT include more than three sections.

#### Scenario: Override picks the section
- **WHEN** the category override is `isbn_metadata`
- **THEN** the draft request includes the ISBN section and the general section

### Requirement: Draft facts stay inside the known record
Null book facts MUST be sent as the word `unknown`. The request MUST include at most the last five public replies, each truncated to 1,500 characters, and MUST truncate the description to 6,000 characters. It MUST NOT include internal notes, attachment bytes or URLs, or the author's other books.

#### Scenario: Notes stay out of the draft
- **WHEN** the ticket has an internal note and draft generation runs
- **THEN** the note body is not part of the draft request

#### Scenario: Null fact is unknown
- **WHEN** the linked book has a null last payout date
- **THEN** the draft request contains `unknown` for that field rather than an invented date

### Requirement: Draft provider failures
A blank `OPENAI_API_KEY`, or provider HTTP 401 or 403, MUST set `draftState` to `failed` with `error_code` `config` and MUST NOT be retried. Timeout MUST use `timeout`, HTTP 429 MUST use `rate_limit`, and HTTP 5xx or a network failure MUST use `provider`, each retried for at most 4 total attempts. A manual reply MUST still succeed.

#### Scenario: Blank key leaves a manual reply
- **WHEN** `OPENAI_API_KEY` is empty and an admin sends a public reply
- **THEN** the reply response is 201 and the submitted body is stored

#### Scenario: Draft timeout fails the draft only
- **WHEN** draft generation times out until the attempt cap is exhausted
- **THEN** `draftState` is `failed` with `error_code` `timeout` and the ticket status is unchanged

### Requirement: Admin can save composer edits
`PATCH /api/v1/admin/tickets/:ticketId/draft` MUST store the trimmed body and set `draftEditedAt`. The body MUST be 1 to 10,000 characters after trim. The response MUST be 200 and MUST include the stored body. The call MUST NOT create a message, notify the author, or change ticket status. An author MUST receive 403. A missing cookie MUST receive 401 `UNAUTHENTICATED` with message `Authentication required.` An unknown or malformed ticket id MUST receive 404 `NOT_FOUND` with message `Not found.`

#### Scenario: Edit is stored
- **WHEN** an admin patches the draft with a non-empty body
- **THEN** the response is 200, `draftBody` is that text, and `draftEditedAt` is set

#### Scenario: Edit creates no reply
- **WHEN** an admin saves a draft edit
- **THEN** the author's ticket detail does not gain a reply

#### Scenario: Empty edit rejected
- **WHEN** an admin patches the draft with a whitespace-only body
- **THEN** the response is 400 `VALIDATION_ERROR` and `draftBody` is unchanged

### Requirement: Regeneration is explicit and confirmed
`POST /api/v1/admin/tickets/:ticketId/draft` MUST be admin-only. When `draftEditedAt` is set and `confirmDiscardEdits` is not `true`, the response MUST be 409 `CONFLICT` and the draft MUST be unchanged. Otherwise it MUST clear `draftEditedAt`, set `draftState` to `pending`, emit one draft event, and return 202 with `draftState` `pending`. It MUST NOT insert a message.

#### Scenario: Edited draft needs confirmation
- **WHEN** an admin regenerates and `draftEditedAt` is set and `confirmDiscardEdits` is false
- **THEN** the response is 409 `CONFLICT` and `draftBody` is unchanged

#### Scenario: Confirmed regenerate
- **WHEN** an admin regenerates with `confirmDiscardEdits` true
- **THEN** the response is 202, `draftState` is `pending`, and `draftEditedAt` is null

#### Scenario: Author cannot regenerate
- **WHEN** an authenticated author calls regenerate on their own ticket
- **THEN** the response is 403 `FORBIDDEN` and `draftState` is unchanged

### Requirement: Regeneration is rate limited
The same ticket MUST accept at most 5 draft regenerations per rolling hour. The next request MUST be 429 `RATE_LIMITED` with message `Too many attempts. Try again later.` and MUST NOT change the draft.

#### Scenario: Sixth regenerate in an hour
- **WHEN** the same ticket has already been regenerated 5 times in the current hour
- **THEN** the next regenerate is 429 `RATE_LIMITED` and `draftState` is unchanged
