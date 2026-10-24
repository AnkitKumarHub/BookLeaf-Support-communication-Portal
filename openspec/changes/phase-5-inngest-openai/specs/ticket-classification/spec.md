# Spec Delta

## Purpose

Classifies a ticket into one category and one priority after the ticket exists, and stores those values as suggestions an admin can override.

## ADDED Requirements

### Requirement: Classification does not block create
The system MUST start classification only after `POST /api/v1/author/tickets` has committed the ticket and returned. The create response MUST remain 201 with `aiState` `pending` and MUST NOT wait for a model result.

#### Scenario: Create returns before classification finishes
- **WHEN** an author creates a valid ticket
- **THEN** the response is 201 with `aiState` `pending` before classification has finished

#### Scenario: Blank key still creates
- **WHEN** `OPENAI_API_KEY` is empty or unset and the create body is valid
- **THEN** the response is 201 with `aiState` `pending`

### Requirement: One classification per job version
The system MUST call the model at most once for a given ticket id and `aiJobVersion`. A second delivery of `bookleaf/ticket.created` for that same pair MUST NOT call the model again. A delivery whose `jobVersion` does not equal the ticket's current `aiJobVersion` MUST leave the ticket unchanged. Listing or reading the admin queue MUST NOT start classification.

#### Scenario: Duplicate delivery
- **WHEN** the same ticket id and job version are delivered again after classification has completed
- **THEN** the stored AI category, priority, confidence, rationale, and `aiState` stay as they were and no further model call is made

#### Scenario: Stale job version
- **WHEN** a delivery carries a job version other than the ticket's current `aiJobVersion`
- **THEN** the ticket's AI columns and overrides are unchanged

#### Scenario: Queue read does not classify
- **WHEN** an admin lists the queue
- **THEN** no ticket's `aiState` or `aiJobVersion` changes because of that read

### Requirement: Successful classification stores suggestions
A successful classification MUST set `aiCategory` and `aiPriority` to one allowed value each, store `aiConfidence` and `aiRationale`, and set `aiState` to `completed`. It MUST NOT change `categoryOverride`, `priorityOverride`, ticket status, public replies, or internal notes.

#### Scenario: Suggestions recorded
- **WHEN** classification succeeds for a ticket
- **THEN** `aiState` is `completed` and `aiCategory`, `aiPriority`, `aiConfidence`, and `aiRationale` are stored

#### Scenario: Overrides stay put
- **WHEN** an admin has set a category override and classification then finishes
- **THEN** `categoryOverride` is unchanged and `aiCategory` holds only the model suggestion

#### Scenario: Status stays open
- **WHEN** classification finishes for a ticket that is still `open`
- **THEN** the ticket status is still `open`

### Requirement: Triage input is limited
The classification request MUST include the general policy section plus at most two other sections, chosen in this order from keyword matches in the subject and description: royalty, isbn, printing, distribution, production. No keyword match MUST send the general section only. The description used in the request MUST be truncated to 6,000 characters. The request MUST NOT include the author's phone or email, other books, attachment bytes or URLs, or internal notes.

#### Scenario: Royalty wording selects that section
- **WHEN** the subject or description matches royalty, payout, payment, earning, or bank
- **THEN** the classification request includes the royalty section and the general section

#### Scenario: No keyword
- **WHEN** the subject and description match none of the keyword rules
- **THEN** the classification request includes only the general section

#### Scenario: Contact and notes stay out
- **WHEN** the author has a phone and email and the ticket has an internal note
- **THEN** the classification request does not include that phone, email, or note body

### Requirement: Output bounds fail the run
The system MUST reject a classification whose confidence is outside 0 to 1 inclusive or whose trimmed rationale is empty. That rejection MUST set `aiState` to `failed` with `error_code` `invalid_output` and MUST NOT store the rejected category, priority, confidence, or rationale. A rationale longer than 500 characters MUST NOT fail the run: it is trimmed to the whole sentences that fit, or cut at a word with `…`, and the classification is stored.

#### Scenario: Confidence out of range
- **WHEN** the model returns a confidence below 0 or above 1
- **THEN** `aiState` is `failed`, `error_code` is `invalid_output`, and `aiCategory` stays null

#### Scenario: Rationale too long
- **WHEN** the model returns a valid category and priority with a rationale longer than 500 characters
- **THEN** `aiState` is `completed`, the category and priority are stored, and the stored rationale is at most 500 characters

### Requirement: Provider failures use a fixed code
A missing or blank `OPENAI_API_KEY`, or an HTTP 401 or 403 from the provider, MUST fail immediately with `error_code` `config` and MUST NOT be retried. A timeout MUST use `error_code` `timeout`, HTTP 429 MUST use `rate_limit`, and HTTP 5xx or a network failure MUST use `provider`. Those three MUST be retried for at most 4 total attempts and then set `aiState` to `failed`. Ticket status MUST stay unchanged.

#### Scenario: Blank key fails closed
- **WHEN** classification runs and `OPENAI_API_KEY` is empty
- **THEN** `aiState` becomes `failed` with `error_code` `config` and the job is not retried

#### Scenario: Rate limit then failure
- **WHEN** the provider returns HTTP 429 until the attempt cap is exhausted
- **THEN** `aiState` is `failed` with `error_code` `rate_limit`

#### Scenario: Auth failure is immediate
- **WHEN** the provider returns HTTP 401 or 403
- **THEN** `aiState` is `failed` with `error_code` `config` without further attempts

### Requirement: Admin can retry classification
`POST /api/v1/admin/tickets/:ticketId/retry-triage` MUST be admin-only. It MUST increment `aiJobVersion`, set `aiState` to `pending`, and emit `bookleaf/ticket.created` for the new version. It MUST NOT clear overrides, replies, or notes. The response MUST be 202 with the new `aiJobVersion`. An author receives 403, a missing cookie receives 401 `UNAUTHENTICATED` with message `Authentication required.`, and an unknown or malformed id receives 404 `NOT_FOUND` with message `Not found.`

#### Scenario: Retry bumps the version
- **WHEN** an admin retries triage on a classified ticket whose job version is 1
- **THEN** the response is 202 and `data` is `aiState` `pending` with `aiJobVersion` 2

#### Scenario: Overrides survive the retry
- **WHEN** an admin has set a priority override and then retries triage, and the new classification finishes
- **THEN** `priorityOverride` is still the admin's value

#### Scenario: Author cannot retry
- **WHEN** an authenticated author calls retry-triage on their own ticket
- **THEN** the response is 403 `FORBIDDEN` and `aiJobVersion` is unchanged

#### Scenario: Sent replies stay
- **WHEN** an admin retries triage on a ticket that already has a public reply
- **THEN** that reply is still stored
