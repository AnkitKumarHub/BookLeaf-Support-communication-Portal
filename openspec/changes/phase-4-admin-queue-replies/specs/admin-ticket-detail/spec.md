# Spec Delta

## Purpose

Gives an authenticated admin the full view of a single ticket, including the support context, AI output, internal notes, and audit history that an author must never receive.

## ADDED Requirements

### Requirement: Admin role required
The system MUST allow ticket detail only for an authenticated user whose role is admin. A missing or invalid access cookie MUST be rejected as unauthenticated. Any other role MUST be rejected as forbidden.

#### Scenario: Missing access cookie
- **WHEN** a client calls `GET /api/v1/admin/tickets/:ticketId` without a valid access cookie
- **THEN** the response is 401 `UNAUTHENTICATED` with message `Authentication required.`

#### Scenario: Author is forbidden
- **WHEN** an authenticated author requests the admin detail of a ticket they own
- **THEN** the response is 403 `FORBIDDEN` and no ticket data is returned

### Requirement: Any author's ticket is readable
An admin MUST be able to read a ticket regardless of which author owns it. A ticket id that does not exist MUST be 404 `NOT_FOUND` with message `Not found.`, and a malformed id MUST return the same response rather than a server error.

#### Scenario: Another author's ticket
- **WHEN** an admin requests a ticket owned by any author
- **THEN** the response is 200 with that ticket

#### Scenario: Unknown ticket id
- **WHEN** an admin requests a ticket id that does not exist
- **THEN** the response is 404 `NOT_FOUND` with message `Not found.`

#### Scenario: Malformed ticket id
- **WHEN** an admin requests a ticket id that is not a valid identifier
- **THEN** the response is 404 `NOT_FOUND` with the same body as an unknown id

### Requirement: Detail includes the queue fields
Detail MUST include every field on a queue row, with the same effective category and priority rules, so the admin screen does not have to merge two shapes.

#### Scenario: Shared identity fields
- **WHEN** an admin reads a ticket
- **THEN** the response includes `id`, `publicId`, `subject`, `status`, `aiState`, `draftState`, `effectiveCategory`, `effectivePriority`, `assigneeName`, `assignedToMe`, `createdAt`, and `updatedAt`

### Requirement: Detail includes author support context
Detail MUST include the author's name, email, phone, and city so the admin can act on the request. A null phone or city MUST stay null rather than becoming an empty string.

#### Scenario: Author contact present
- **WHEN** an admin reads a ticket whose author has a phone and city on record
- **THEN** the response carries that author's name, email, phone, and city

#### Scenario: Missing contact field
- **WHEN** the author has no phone on record
- **THEN** the phone field is null

### Requirement: Detail includes the book or null
Detail MUST include the full book object for a book ticket and null for a general ticket. The book object MUST be identical in shape and formatting to the one the author endpoints return.

#### Scenario: Book ticket
- **WHEN** an admin reads a ticket that names a book
- **THEN** the response includes that book with the same fields and money formatting the author sees

#### Scenario: General ticket
- **WHEN** an admin reads a ticket with no book
- **THEN** the book field is null

### Requirement: Detail includes AI output and the stored draft
Detail MUST include `aiConfidence`, `aiRationale`, `draftBody`, `draftState`, and `draftEditedAt` as currently stored. Reading a ticket MUST NOT call a model, and MUST NOT change the ticket row.

#### Scenario: No draft yet
- **WHEN** an admin reads a ticket whose draft has never been generated
- **THEN** `draftState` is `none`, `draftBody` is null, and the response is still 200

#### Scenario: Read is side-effect free
- **WHEN** an admin reads the same ticket twice
- **THEN** the ticket's `draftState`, `aiState`, `aiJobVersion`, and `updatedAt` are unchanged by either read

### Requirement: Detail includes replies, notes, and attachments
Detail MUST include public replies and internal notes as separate collections, each ordered by `createdAt` ascending, plus the ticket's attachments. A note MUST carry `id`, `body`, `createdAt`, and the name of the admin who wrote it. Collections with no rows MUST be empty arrays.

#### Scenario: Notes and replies are separate
- **WHEN** a ticket has one public reply and one internal note
- **THEN** the reply appears only in the replies collection and the note appears only in the notes collection

#### Scenario: Note carries the admin profile name
- **WHEN** the seeded admin adds a note and then reads the ticket
- **THEN** that note's `authorName` is `BookLeaf Admin`

#### Scenario: No messages yet
- **WHEN** an admin reads a ticket with no replies, notes, or attachments
- **THEN** those three fields are empty arrays rather than null

### Requirement: Detail includes the audit trail
Detail MUST include the ticket's audit events ordered oldest first, each with its event type, timestamp, and recorded payload. An event MUST NOT carry a reply body or a note body.

#### Scenario: Created event present
- **WHEN** an admin reads a ticket that an author created
- **THEN** the events collection contains a `ticket.created` entry with its timestamp

#### Scenario: No message text in events
- **WHEN** a ticket has had a reply and a note added
- **THEN** no event entry contains the text of that reply or note

### Requirement: Detail never exposes credentials or raw provider data
The response MUST NOT include a password hash, a raw JWT, a prompt, or a raw AI provider error body. AI failure information MUST be limited to a state and an error code.

#### Scenario: No secrets in the payload
- **WHEN** an admin reads any ticket
- **THEN** the response contains no password hash, token, prompt text, or provider response body

#### Scenario: Failed AI
- **WHEN** an admin reads a ticket whose classification failed
- **THEN** the response conveys the failed state without a stack trace or provider payload
