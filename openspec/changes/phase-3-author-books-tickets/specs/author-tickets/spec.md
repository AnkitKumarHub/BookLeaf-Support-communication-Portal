# Spec Delta

## Purpose

Lets an authenticated author create, list, and read only their own support tickets, and starts classification only after the ticket row is committed.

## ADDED Requirements

### Requirement: Author role required
The system MUST allow ticket create, list, and detail only for an authenticated user whose role is author. A missing or invalid access cookie MUST be rejected as unauthenticated. Any other role MUST be rejected as forbidden.

#### Scenario: Missing access cookie
- **WHEN** a client calls `GET /api/v1/author/tickets` without a valid access cookie
- **THEN** the response is 401 `UNAUTHENTICATED` with message `Authentication required.`

#### Scenario: Admin cannot create
- **WHEN** an authenticated admin calls `POST /api/v1/author/tickets`
- **THEN** the response is 403 `FORBIDDEN` and no ticket row is created

### Requirement: Create open ticket
The system MUST create a ticket for the author id on the access token. Omit or JSON null `bookId` MUST store a general ticket. The stored ticket MUST have status `open`, `aiState` `pending`, job version 1, and draft state `none`. The response MUST be 201 and MUST NOT wait on a model call.

#### Scenario: General ticket
- **WHEN** an author posts a valid subject and description and omits `bookId`
- **THEN** the response is 201, `data.status` is `open`, `data.aiState` is `pending`, and `data.bookId` is null

#### Scenario: Empty OpenAI key
- **WHEN** `OPENAI_API_KEY` is empty or unset and the create body is valid
- **THEN** the response is 201 and `data.aiState` is `pending`

### Requirement: Create field lengths
After trim, subject length MUST be 5 to 160 and description length MUST be 10 to 10000. A failure MUST be 400 `VALIDATION_ERROR` with `fields` and MUST NOT insert a ticket.

#### Scenario: Short subject
- **WHEN** an author posts a subject of 2 characters after trim and a valid description
- **THEN** the response is 400 `VALIDATION_ERROR`, `fields.subject` is `Use between 5 and 160 characters.`, and no ticket row is created

#### Scenario: Short description
- **WHEN** an author posts a valid subject and a description shorter than 10 characters after trim
- **THEN** the response is 400 `VALIDATION_ERROR` with `fields.description` and no ticket row is created

### Requirement: Create ignores client identity
Any `authorId`, `role`, or `isAdmin` in the create body MUST be ignored. The stored author MUST be the author id on the access token.

#### Scenario: Spoofed author id
- **WHEN** the create body includes `authorId` for a different author
- **THEN** the stored ticket belongs to the authenticated author

### Requirement: Book must be owned
When `bookId` is present and is a UUID, the book MUST belong to the authenticated author. Otherwise the response MUST be 404 `NOT_FOUND` and no ticket row is created. A `bookId` that is not a UUID and not null MUST be 400 `VALIDATION_ERROR` and MUST NOT insert a ticket.

#### Scenario: Another author's book
- **WHEN** an author posts a valid subject and description with `bookId` of a book owned by someone else
- **THEN** the response is 404 `NOT_FOUND` and no ticket row is created

#### Scenario: Owned book
- **WHEN** an author posts a valid body with `bookId` of their own book
- **THEN** the response is 201 and `data.bookId` is that book id

### Requirement: Public id
Each new ticket MUST receive a unique `publicId` of the form `BL-` plus the next value from the ticket public-id sequence that starts at 1001.

#### Scenario: First id on a fresh sequence
- **WHEN** the first ticket is created and the sequence has not yet been advanced
- **THEN** `data.publicId` is `BL-1001`

### Requirement: Create rate limit
The system MUST allow at most 20 ticket creates per author per rolling hour. The limit MUST be in memory and keyed by author id. The next create MUST be 429 `RATE_LIMITED` and MUST NOT insert a ticket.

#### Scenario: Twenty-first create
- **WHEN** the same author has already created 20 tickets inside the current hour window
- **THEN** the next create is 429 `RATE_LIMITED` with message `Too many attempts. Try again later.` and no new ticket row is stored

### Requirement: Created event after commit
After the ticket and its `ticket.created` audit row are committed, the system MUST send an event named `bookleaf/ticket.created` whose data is `{ ticketId, jobVersion }` for that ticket and job version 1. If the send throws, the system MUST log the ticket id, leave `ai_state` as `pending`, and still return 201. The create response MUST NOT depend on a classify function running. The audit payload MUST NOT include the subject or the description.

#### Scenario: Send throws
- **WHEN** the event send throws after the ticket transaction has committed
- **THEN** the response is still 201, `data.aiState` is `pending`, and the ticket row remains

#### Scenario: Event name and payload
- **WHEN** create succeeds and the send is attempted
- **THEN** the event name is `bookleaf/ticket.created` and the data contains that ticket id and `jobVersion` 1

#### Scenario: Audit row
- **WHEN** create returns 201
- **THEN** exactly one `ticket.created` audit row exists for that ticket and its payload does not contain the description

### Requirement: List own tickets
The system MUST list only the authenticated author's tickets, sorted by `updatedAt` descending. It MUST accept `status`, `page`, and `limit` using the same pagination bounds as book list. A `status` outside `open`, `in_progress`, `resolved`, and `closed` MUST be 400 `VALIDATION_ERROR`. Each list row MUST omit `description`, `replies`, and `attachments`, and MUST include `replyCount` equal to the number of public replies.

#### Scenario: Other author's tickets hidden
- **WHEN** author A lists tickets and author B has tickets
- **THEN** no ticket owned by author B is included

#### Scenario: Newest update first
- **WHEN** an author has two tickets with different `updatedAt` values
- **THEN** the ticket with the later `updatedAt` appears first

#### Scenario: List row shape
- **WHEN** an author lists tickets
- **THEN** each row has `replyCount` and does not include `description`, `replies`, or `attachments`

### Requirement: Author ticket detail shape
Detail MUST return `id`, `publicId`, `status`, `subject`, `description`, `book` (the book object or null), `createdAt`, `updatedAt`, `replies`, and `attachments`. Timestamps MUST be ISO-8601 UTC. Each reply MUST include `id`, `body`, and `createdAt`, ordered by `createdAt` ascending.

#### Scenario: Owner reads detail
- **WHEN** an author requests a ticket they own
- **THEN** the response is 200 and `data` includes `subject`, `description`, `book`, `replies`, and `attachments`

### Requirement: Author detail hides internal fields
The JSON MUST NOT include a `notes` key, internal message bodies, `aiRationale`, `aiConfidence`, category or priority fields, or `draftBody`. `replies` MUST contain only public messages.

#### Scenario: No notes key
- **WHEN** an author reads their ticket and an internal note exists on it
- **THEN** the response JSON has no `notes` key and does not contain the note body

#### Scenario: Public replies only
- **WHEN** the ticket has one public reply and one internal note
- **THEN** `replies` contains only the public reply

### Requirement: Missing and foreign tickets
A missing ticket id and a ticket id owned by another author MUST both return 404 `NOT_FOUND` with the same code and message.

#### Scenario: Another author's ticket
- **WHEN** an author requests a ticket id owned by someone else
- **THEN** the response is 404 `NOT_FOUND` with message `Not found.`

#### Scenario: Unknown ticket id
- **WHEN** an author requests a ticket id that does not exist
- **THEN** the response is 404 `NOT_FOUND` with the same code and message as a ticket owned by someone else
