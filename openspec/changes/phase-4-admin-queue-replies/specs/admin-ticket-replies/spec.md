# Spec Delta

## Purpose

Lets an admin record an internal note that stays private to staff, and send the single public reply that reaches the author, with ticket status and timestamps kept consistent.

## ADDED Requirements

### Requirement: Admin role required
The system MUST allow creating notes and replies only for an authenticated user whose role is admin. Any other role MUST be rejected as forbidden and MUST NOT store a message.

#### Scenario: Author cannot post a note
- **WHEN** an authenticated author calls `POST /api/v1/admin/tickets/:ticketId/notes` on their own ticket
- **THEN** the response is 403 `FORBIDDEN` and no message is stored

#### Scenario: Author cannot post a reply
- **WHEN** an authenticated author calls `POST /api/v1/admin/tickets/:ticketId/replies` on their own ticket
- **THEN** the response is 403 `FORBIDDEN` and no message is stored

#### Scenario: Missing access cookie
- **WHEN** a client calls either route without a valid access cookie
- **THEN** the response is 401 `UNAUTHENTICATED` with message `Authentication required.`

### Requirement: Body length
A note body and a reply body MUST each be 1 to 10,000 characters after trimming. A body outside that range, a missing body, or a non-text body MUST be 400 `VALIDATION_ERROR` naming the body field, and MUST NOT store a message.

#### Scenario: Empty body
- **WHEN** an admin posts a reply whose body is only whitespace
- **THEN** the response is 400 `VALIDATION_ERROR` with a `fields.body` message and no message is stored

#### Scenario: Oversized body
- **WHEN** an admin posts a note longer than 10,000 characters after trim
- **THEN** the response is 400 `VALIDATION_ERROR` and no message is stored

### Requirement: Unknown ticket
Posting a note or a reply to a ticket id that does not exist MUST be 404 `NOT_FOUND` with message `Not found.` and MUST NOT store a message. A malformed ticket id MUST return the same response.

#### Scenario: Unknown ticket id
- **WHEN** an admin posts a reply to a ticket id that does not exist
- **THEN** the response is 404 `NOT_FOUND` and no message is stored

### Requirement: Internal note is staff-only
A note MUST be stored with internal visibility and return 201 with its id, body, and creation time. It MUST NOT appear in any author-facing response, and MUST NOT be counted as a reply.

#### Scenario: Note hidden from the author
- **WHEN** an admin adds a note and the owning author then reads that ticket
- **THEN** the author response has no `notes` key and does not contain the note text

#### Scenario: Note is not a reply
- **WHEN** an admin adds a note to a ticket with no replies
- **THEN** the author's list row shows a reply count of 0

### Requirement: Internal note does not change the ticket
Adding a note MUST NOT change the ticket's status, assignee, overrides, or AI fields.

#### Scenario: Status unchanged by a note
- **WHEN** an admin adds a note to an `open` ticket
- **THEN** the ticket status is still `open`

### Requirement: Public reply reaches the author
A reply MUST be stored with public visibility and return 201 with its id, body, and creation time. It MUST appear in the owning author's ticket detail and MUST increase that author's reply count by one.

#### Scenario: Author sees the reply
- **WHEN** an admin sends a reply and the owning author then reads that ticket
- **THEN** the reply body appears in the author's replies collection

#### Scenario: Reply count increases
- **WHEN** an admin sends the first reply on a ticket
- **THEN** the author's list row for that ticket shows a reply count of 1

### Requirement: Reply body is the submitted text
The stored reply MUST be exactly the text the client submitted, after trimming. The system MUST NOT read the stored AI draft when sending a reply, and MUST NOT alter, append to, or reformat the submitted text.

#### Scenario: Draft is not sent
- **WHEN** a ticket has a stored draft body and an admin sends a reply with different text
- **THEN** the stored reply is the submitted text and the draft body is untouched

#### Scenario: No draft, reply still sends
- **WHEN** a ticket has no draft at all and an admin sends a reply
- **THEN** the response is 201 and the reply is stored

### Requirement: First reply moves an open ticket to in progress
Sending a reply on an `open` ticket MUST set its status to `in_progress` in the same operation. A reply on a ticket in any other status MUST leave the status unchanged.

#### Scenario: Open becomes in progress
- **WHEN** an admin sends a reply on an `open` ticket
- **THEN** the ticket status becomes `in_progress` and the author sees that status

#### Scenario: Resolved stays resolved
- **WHEN** an admin sends a reply on a `resolved` ticket
- **THEN** the response is 201 and the status is still `resolved`

#### Scenario: Closed stays closed
- **WHEN** an admin sends a reply on a `closed` ticket
- **THEN** the response is 201 and the status is still `closed`

### Requirement: Reply refreshes the ticket update time
Sending a reply MUST advance the ticket's `updatedAt`, so the author's list ordering and polling reflect the new activity. A note MUST NOT advance it.

#### Scenario: Reply reorders the author list
- **WHEN** an admin replies to the author's older ticket
- **THEN** that ticket moves to the top of the author's list, which is ordered by `updatedAt` descending

#### Scenario: Note leaves the order alone
- **WHEN** an admin adds a note to a ticket
- **THEN** the ticket's `updatedAt` is unchanged

### Requirement: Messages are audited without their text
Creating a note or a reply MUST write an audit entry naming the acting admin and the event type. The audit payload MUST NOT contain the message body.

#### Scenario: Reply audit entry
- **WHEN** an admin sends a reply
- **THEN** an audit entry records the acting admin and a reply event type, and the entry does not contain the reply text

#### Scenario: Note audit entry
- **WHEN** an admin adds a note
- **THEN** an audit entry records a note event type without the note text

### Requirement: Reply does not consume the AI draft
Sending a reply MUST NOT clear, overwrite, or regenerate the stored draft, and MUST NOT change `aiState` or the AI job version.

#### Scenario: Draft survives a reply
- **WHEN** an admin sends a reply on a ticket whose draft state is `suggested`
- **THEN** the draft body and draft state are unchanged after the reply
