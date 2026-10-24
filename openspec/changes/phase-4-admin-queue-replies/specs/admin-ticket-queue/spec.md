# Spec Delta

## Purpose

Gives an authenticated admin one work list of tickets across every author, filtered and searched, in a fixed order that puts urgent and old unresolved tickets at the top.

## ADDED Requirements

### Requirement: Admin role required
The system MUST allow the queue only for an authenticated user whose role is admin. A missing or invalid access cookie MUST be rejected as unauthenticated. Any other role MUST be rejected as forbidden.

#### Scenario: Missing access cookie
- **WHEN** a client calls `GET /api/v1/admin/tickets` without a valid access cookie
- **THEN** the response is 401 `UNAUTHENTICATED` with message `Authentication required.`

#### Scenario: Author is forbidden
- **WHEN** an authenticated author calls `GET /api/v1/admin/tickets`
- **THEN** the response is 403 `FORBIDDEN` and no ticket data is returned

### Requirement: Queue spans every author
The queue MUST return tickets belonging to all authors. It MUST NOT be narrowed by the caller's identity unless an explicit filter asks for that.

#### Scenario: Two authors have tickets
- **WHEN** an admin lists the queue and tickets exist for two different authors
- **THEN** tickets from both authors appear in the same page of results

### Requirement: Default work order
With no filters, the queue MUST order by status group first (`open`, then `in_progress`, then `resolved`, then `closed`), then by effective priority, then by `createdAt` ascending. Priority order MUST be `critical`, then `high`, then a null effective priority, then `medium`, then `low`. A null effective priority MUST remain null in the response. There MUST be no client sort parameter.

#### Scenario: Urgent old ticket outranks a newer trivial one
- **WHEN** an `open` ticket with effective priority `critical` created yesterday and an `open` ticket with effective priority `low` created today are both in the queue
- **THEN** the critical ticket appears before the low ticket

#### Scenario: Unresolved outranks resolved
- **WHEN** an `open` ticket and a `resolved` ticket are both in the queue
- **THEN** the `open` ticket appears before the `resolved` ticket

#### Scenario: Oldest first within one priority
- **WHEN** two `open` tickets share the same effective priority
- **THEN** the one with the earlier `createdAt` appears first

#### Scenario: Unclassified ticket sits between high and medium
- **WHEN** three `open` tickets have effective priorities `high`, null, and `medium`
- **THEN** they appear in that order, and the middle ticket's `effectivePriority` is null

#### Scenario: Failed classification stays unclassified
- **WHEN** an `open` ticket has `aiState` `failed` and no priority override
- **THEN** it sorts with the other null-priority tickets and `effectivePriority` is null

### Requirement: Effective category and priority
Effective category MUST be `categoryOverride` when set, otherwise `aiCategory`. Effective priority MUST be `priorityOverride` when set, otherwise `aiPriority`. The response MUST return the AI value, the override, and the effective value as separate fields, and MUST return null rather than a substituted value when both are unset.

#### Scenario: Override wins
- **WHEN** a ticket has `aiCategory` `general_inquiry` and `categoryOverride` `isbn_metadata`
- **THEN** `effectiveCategory` is `isbn_metadata` and `aiCategory` is still `general_inquiry`

#### Scenario: Nothing set
- **WHEN** a ticket has no AI priority and no priority override
- **THEN** `aiPriority`, `priorityOverride`, and `effectivePriority` are all null

### Requirement: Status filter
The queue MUST accept a `status` filter of `open`, `in_progress`, `resolved`, or `closed` and return only tickets in that status. Any other value MUST be 400 `VALIDATION_ERROR`.

#### Scenario: Filter to open
- **WHEN** an admin lists the queue with `status=open`
- **THEN** every returned ticket has status `open`

#### Scenario: Unknown status
- **WHEN** an admin lists the queue with `status=archived`
- **THEN** the response is 400 `VALIDATION_ERROR` with a `fields.status` message

### Requirement: Category and priority filters
The queue MUST filter `category` and `priority` on the effective value. A ticket whose effective value is null MUST NOT match a specific value, and MUST appear when that filter is omitted. A value outside the category or priority enum MUST be 400 `VALIDATION_ERROR`.

#### Scenario: Override matches the filter
- **WHEN** an admin filters `category=isbn_metadata` and a ticket has `aiCategory` `general_inquiry` with `categoryOverride` `isbn_metadata`
- **THEN** that ticket is included

#### Scenario: Null effective value excluded
- **WHEN** an admin filters `priority=medium` and a ticket has no AI priority and no override
- **THEN** that ticket is not included

#### Scenario: Null effective value included unfiltered
- **WHEN** an admin lists the queue without a `priority` filter
- **THEN** a ticket with no AI priority and no override is included

### Requirement: Created-at range filter
The queue MUST accept `from` and `to` as `YYYY-MM-DD`. `from` MUST be inclusive from `00:00:00.000Z` of that day and `to` MUST be inclusive through `23:59:59.999Z` of that day. A malformed date, or `from` later than `to`, MUST be 400 `VALIDATION_ERROR`.

#### Scenario: Ticket created on the boundary day
- **WHEN** an admin filters `from` and `to` set to the same date and a ticket was created at 23:30 UTC that day
- **THEN** that ticket is included

#### Scenario: Reversed range
- **WHEN** an admin sends `from` later than `to`
- **THEN** the response is 400 `VALIDATION_ERROR`

#### Scenario: Malformed date
- **WHEN** an admin sends `from=23-10-2026`
- **THEN** the response is 400 `VALIDATION_ERROR` with a `fields.from` message

### Requirement: Assignee filter
The queue MUST accept `assignee` of `me` or `unassigned`. `me` MUST return only tickets assigned to the calling admin. `unassigned` MUST return only tickets with no assignee. Any other value MUST be 400 `VALIDATION_ERROR`.

#### Scenario: Only my tickets
- **WHEN** an admin lists the queue with `assignee=me`
- **THEN** every returned ticket is assigned to that admin and `assignedToMe` is true on each row

#### Scenario: Only unclaimed tickets
- **WHEN** an admin lists the queue with `assignee=unassigned`
- **THEN** every returned ticket has `assigneeName` null

#### Scenario: Unknown assignee value
- **WHEN** an admin lists the queue with `assignee=someone-else`
- **THEN** the response is 400 `VALIDATION_ERROR`

### Requirement: Search
The queue MUST accept `q` as a case-insensitive substring match on public id, subject, author name, and author email. Wildcard characters in `q` MUST be treated as literal text. A blank `q` MUST be ignored.

#### Scenario: Search by public id
- **WHEN** an admin searches `q=bl-1001`
- **THEN** the ticket whose `publicId` is `BL-1001` is returned

#### Scenario: Search by author email
- **WHEN** an admin searches `q=priya.sharma`
- **THEN** tickets whose author email contains that text are returned

#### Scenario: Wildcard is literal
- **WHEN** an admin searches `q=%`
- **THEN** only tickets whose searchable text actually contains a percent character are returned

### Requirement: Queue pagination
The queue MUST accept `page` defaulting to 1 and `limit` defaulting to 20 with a maximum of 100, using the same bounds and error bodies as the author list endpoints. `meta.total` MUST be the count of rows matching the filters, not the size of the returned page.

#### Scenario: Limit above the maximum
- **WHEN** an admin lists the queue with `limit=101`
- **THEN** the response is 400 `VALIDATION_ERROR`

#### Scenario: Total counts all matches
- **WHEN** 25 tickets match the filters and the admin requests `limit=20`
- **THEN** the page holds 20 rows and `meta.total` is 25

### Requirement: Empty result is success
A filter combination that matches no ticket MUST return 200 with an empty array and a total of 0, not an error.

#### Scenario: No match
- **WHEN** an admin filters to a combination no ticket satisfies
- **THEN** the response is 200, `data` is `[]`, and `meta.total` is 0

### Requirement: Queue row shape
Each row MUST include `id`, `publicId`, `subject`, `authorName`, `authorEmail`, `bookTitle`, `status`, `aiCategory`, `categoryOverride`, `effectiveCategory`, `aiPriority`, `priorityOverride`, `effectivePriority`, `aiState`, `draftState`, `assigneeName`, `assignedToMe`, `createdAt`, and `updatedAt`. `bookTitle` MUST be null for a general ticket. Rows MUST NOT include the description, replies, notes, or draft body.

#### Scenario: General ticket row
- **WHEN** a queue row is for a ticket with no book
- **THEN** `bookTitle` is null

#### Scenario: Row omits heavy and internal fields
- **WHEN** an admin lists the queue
- **THEN** no row contains `description`, `notes`, `replies`, `draftBody`, or `aiRationale`

#### Scenario: Assignment flags
- **WHEN** the seeded admin assigns a ticket to themselves and lists the queue
- **THEN** `assignedToMe` is true and `assigneeName` is `BookLeaf Admin`
