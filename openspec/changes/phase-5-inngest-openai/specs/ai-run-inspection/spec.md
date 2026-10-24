# Spec Delta

## Purpose

Records each classification and draft attempt so an admin can see the outcome and the token cost without seeing secrets or the provider payload.

## ADDED Requirements

### Requirement: Each attempt is stored
Every classification or draft attempt MUST insert one run row for that ticket. The row MUST store the task type, attempt number starting at 1, model id, prompt version, job version, timestamps, and `errorCode` when the attempt failed. Reported token counts MUST be stored.

#### Scenario: Successful classification records tokens
- **WHEN** a classification attempt finishes and the provider reports token usage
- **THEN** a run exists with `taskType` `classify`, `promptVersion` `triage-v2`, those token counts, and a `completedAt` time

#### Scenario: Failed attempt records the code
- **WHEN** a draft attempt fails with `error_code` `timeout`
- **THEN** a run for that ticket has `taskType` `draft`, `state` `failed`, and `errorCode` `timeout`

### Requirement: Model id comes from configuration
The stored model id MUST be `OPENAI_MODEL` when that variable is set, and `gpt-4o-mini` when it is unset.

#### Scenario: Default model
- **WHEN** `OPENAI_MODEL` is unset and a run is stored
- **THEN** the run's `model` is `gpt-4o-mini`

### Requirement: Runs hold no secrets
A run row and the process logs MUST NOT contain `OPENAI_API_KEY`, the prompt text, the provider response body, or a stack from the provider. A skipped edited draft MUST be stored with `error_code` `skipped_edited` and MUST NOT contain the draft text in the run row.

#### Scenario: Key is not logged
- **WHEN** a model call fails
- **THEN** the error log does not contain the API key or the provider response body

#### Scenario: Skipped edit is a code only
- **WHEN** generation finishes after the admin has edited the draft
- **THEN** the run's `errorCode` is `skipped_edited` and the row has no draft text

### Requirement: Admin can read one redacted run
`GET /api/v1/admin/ai-runs/:runId` MUST be admin-only and MUST return the stored run without a prompt, a provider body, or an API key. An unknown or malformed id MUST be 404 `NOT_FOUND` with message `Not found.` An author MUST receive 403. A missing access cookie MUST receive 401 `UNAUTHENTICATED` with message `Authentication required.`

#### Scenario: Admin reads a run
- **WHEN** an admin requests a run id that exists
- **THEN** the response is 200 and `data` includes `taskType`, `model`, `promptVersion`, token counts, and `errorCode`

#### Scenario: Response has no prompt
- **WHEN** an admin reads a completed run
- **THEN** the JSON does not include the prompt text or a provider body

#### Scenario: Author cannot read a run
- **WHEN** an authenticated author requests a run id
- **THEN** the response is 403 `FORBIDDEN`
