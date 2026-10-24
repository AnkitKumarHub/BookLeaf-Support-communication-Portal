# Spec Delta

## Purpose

Lets an admin route a ticket through its lifecycle by changing status under a fixed transition table, correcting the AI category and priority, and claiming or releasing ownership of the work.

## ADDED Requirements

### Requirement: Admin role required
The system MUST allow status changes, overrides, assignment, and unassignment only for an authenticated user whose role is admin. Any other role MUST be rejected as forbidden and MUST NOT change the ticket.

#### Scenario: Author cannot patch
- **WHEN** an authenticated author calls `PATCH /api/v1/admin/tickets/:ticketId` for their own ticket
- **THEN** the response is 403 `FORBIDDEN` and the ticket is unchanged

#### Scenario: Author cannot assign
- **WHEN** an authenticated author calls `POST /api/v1/admin/tickets/:ticketId/assign-to-me`
- **THEN** the response is 403 `FORBIDDEN` and the ticket has no assignee set

#### Scenario: Missing access cookie
- **WHEN** a client calls any of these routes without a valid access cookie
- **THEN** the response is 401 `UNAUTHENTICATED` with message `Authentication required.`

### Requirement: Patch requires at least one field
A patch MUST accept `status`, `categoryOverride`, and `priorityOverride`, all optional, and MUST require at least one of them. A body with none of these fields MUST be 400 `VALIDATION_ERROR` and MUST NOT change the ticket. Fields that are absent MUST stay as stored.

#### Scenario: Empty patch
- **WHEN** an admin sends a patch with no recognised field
- **THEN** the response is 400 `VALIDATION_ERROR` and the ticket is unchanged

#### Scenario: Only the sent field changes
- **WHEN** an admin patches only `status` on a ticket that has a priority override
- **THEN** the status changes and the priority override keeps its previous value

### Requirement: Status transition table
Allowed moves are `open` to `in_progress`, `resolved`, or `closed`; `in_progress` to `open`, `resolved`, or `closed`; `resolved` to `in_progress` or `closed`; and `closed` to `in_progress`. Any other change of status MUST be 409 `CONFLICT` with a `fields.status` message naming the allowed next statuses, and MUST NOT change the ticket. Sending the status the ticket already has MUST be 200, MUST leave the ticket unchanged, and MUST NOT write a status audit row.

#### Scenario: Resolved cannot reopen directly
- **WHEN** an admin patches a `resolved` ticket to `open`
- **THEN** the response is 409 `CONFLICT`, `fields.status` names the allowed next statuses, and the ticket stays `resolved`

#### Scenario: Closed can be reopened as in progress
- **WHEN** an admin patches a `closed` ticket to `in_progress`
- **THEN** the response is 200 and the ticket status is `in_progress`

#### Scenario: Same status is a no-op
- **WHEN** an admin patches a ticket to the status it already has and sends no other field
- **THEN** the response is 200, the ticket is unchanged, and no status audit row is written

#### Scenario: Unknown status value
- **WHEN** an admin patches `status` to a value outside the four statuses
- **THEN** the response is 400 `VALIDATION_ERROR`

### Requirement: Resolution timestamp
When a ticket moves to `resolved`, the system MUST record the time it was resolved. When it moves out of `resolved` to a status other than `closed`, that timestamp MUST be cleared. Moving from `resolved` to `closed` MUST keep it.

#### Scenario: Resolving records the time
- **WHEN** an admin moves an `in_progress` ticket to `resolved`
- **THEN** the ticket has a resolution timestamp at that moment

#### Scenario: Reopening clears the time
- **WHEN** an admin moves a `resolved` ticket to `in_progress`
- **THEN** the resolution timestamp is null

#### Scenario: Closing after resolving keeps the time
- **WHEN** an admin moves a `resolved` ticket to `closed`
- **THEN** the original resolution timestamp is unchanged

### Requirement: Category and priority overrides
A patch MUST set `categoryOverride` to any value in the category enum and `priorityOverride` to any value in the priority enum. An explicit JSON null MUST clear that override. A value outside the enum MUST be 400 `VALIDATION_ERROR` and MUST NOT change the ticket.

#### Scenario: Set an override
- **WHEN** an admin patches `categoryOverride` to `isbn_metadata`
- **THEN** the response is 200 and the effective category is `isbn_metadata`

#### Scenario: Clear an override
- **WHEN** an admin patches `priorityOverride` to null on a ticket that had an override
- **THEN** the override is null and the effective priority falls back to the AI priority

#### Scenario: Invalid enum value
- **WHEN** an admin patches `priorityOverride` to `urgent`
- **THEN** the response is 400 `VALIDATION_ERROR` and the ticket is unchanged

### Requirement: Overrides never overwrite AI output
Setting or clearing an override MUST NOT change `aiCategory`, `aiPriority`, `aiConfidence`, `aiRationale`, `aiState`, or the AI job version. An override MUST survive a later re-classification.

#### Scenario: AI values preserved on override
- **WHEN** an admin overrides the category on a ticket the model already classified
- **THEN** `aiCategory` keeps the model's value and only `categoryOverride` changes

#### Scenario: Clearing restores the AI value
- **WHEN** an admin clears a category override
- **THEN** the effective category becomes the stored `aiCategory` rather than null

### Requirement: Assign to self
Assignment MUST set the assignee to the calling admin and return 200. There MUST be no way to assign a ticket to a different user. A repeat call on a ticket already assigned to that admin MUST return 200, leave the row unchanged, and MUST NOT write a second audit row.

#### Scenario: First claim
- **WHEN** an admin calls assign-to-me on an unassigned ticket
- **THEN** the response is 200, the ticket is assigned to that admin, and one assignment audit row exists

#### Scenario: Second claim is a no-op
- **WHEN** the same admin calls assign-to-me again on that ticket
- **THEN** the response is 200 and the ticket still has exactly one assignment audit row

#### Scenario: Client cannot name an assignee
- **WHEN** an admin sends a body naming another user as the assignee
- **THEN** that value is ignored and the ticket is assigned to the calling admin

### Requirement: Unassign
Unassignment MUST clear the assignee and return 200. A call on a ticket that already has no assignee MUST return 200, leave the row unchanged, and MUST NOT write a second audit row.

#### Scenario: Release a claimed ticket
- **WHEN** an admin calls unassign on a ticket assigned to them
- **THEN** the response is 200 and the ticket has no assignee

#### Scenario: Unassign an unassigned ticket
- **WHEN** an admin calls unassign on a ticket with no assignee
- **THEN** the response is 200 and no audit row is written

### Requirement: Triage changes are audited
A status change, an override change, and an assignee change MUST each write an audit entry recording the acting admin, the event type, and the previous and new values.

#### Scenario: Status audit payload
- **WHEN** an admin moves a ticket from `open` to `in_progress`
- **THEN** an audit entry records the acting admin with the previous status `open` and the new status `in_progress`

#### Scenario: Override audit payload
- **WHEN** an admin sets a priority override
- **THEN** an audit entry records the previous and new override values

#### Scenario: One patch, one entry per field
- **WHEN** an admin patches status and a category override in the same request
- **THEN** the audit shows the status change and the category change, and neither is lost

### Requirement: Triage touches no message
A status change, an override, or an assignment MUST NOT create, edit, or delete any reply or note, and MUST NOT send anything to the author.

#### Scenario: No message from a patch
- **WHEN** an admin changes a ticket's status
- **THEN** the ticket's reply and note collections are unchanged
