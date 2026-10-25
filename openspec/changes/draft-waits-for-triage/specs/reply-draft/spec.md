# Spec Delta

## ADDED Requirements

### Requirement: A draft starts only after classification finishes
An admin ticket read MUST start a draft only when `draftState` is `none` and classification has finished (`aiState` is `completed` or `failed`). While `aiState` is `pending` or `processing`, the read MUST NOT start a draft and `draftState` MUST stay `none`. A later admin read after classification finishes MUST start the draft.

#### Scenario: Admin opens a ticket before triage finishes
- **WHEN** an admin opens a ticket whose `aiState` is `pending` and `draftState` is `none`
- **THEN** the response is 200 and `draftState` stays `none`

#### Scenario: The page refreshes after triage finishes
- **WHEN** classification for that ticket completes with category `royalty_payments` and the admin ticket is read again
- **THEN** `draftState` is `pending`, one draft request is emitted, and the draft uses the royalty section and the general section

#### Scenario: Triage already finished
- **WHEN** an admin opens a ticket whose `aiState` is `completed` and `draftState` is `none`
- **THEN** `draftState` becomes `pending` on that read

#### Scenario: Triage failed
- **WHEN** an admin opens a ticket whose `aiState` is `failed` and `draftState` is `none`
- **THEN** `draftState` becomes `pending` on that read and the draft uses the general section plus at most one keyword-matched section

### Requirement: The admin sees that the draft is waiting for triage
The admin ticket view MUST show a waiting state while `draftState` is `none` and `aiState` is `pending` or `processing`, and the reply box MUST remain usable for a manual reply.

#### Scenario: Waiting state
- **WHEN** an admin views a ticket whose classification is still running and no draft has started
- **THEN** the composer shows "Waiting for triage before drafting…" and the admin can still type and send a reply

### Requirement: An admin can start a draft by hand
The admin MUST be able to request a draft while `draftState` is `none`, so a ticket whose classification never finishes can still get a draft.

#### Scenario: Lost classification event
- **WHEN** `aiState` stays `pending` and the admin presses Generate draft
- **THEN** `draftState` becomes `pending` and one draft request is emitted
