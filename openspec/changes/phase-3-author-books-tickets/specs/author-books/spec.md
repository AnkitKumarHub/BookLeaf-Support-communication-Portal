# Spec Delta

## Purpose

Lets an authenticated author list and read only their own books, including titles still in production, without seeing another author's catalog.

## ADDED Requirements

### Requirement: Author role required
The system MUST allow book list and detail only for an authenticated user whose role is author. A missing or invalid access cookie MUST be rejected as unauthenticated. Any other role MUST be rejected as forbidden.

#### Scenario: Missing access cookie
- **WHEN** a client calls `GET /api/v1/author/books` without a valid access cookie
- **THEN** the response is 401 `UNAUTHENTICATED` with message `Authentication required.`

#### Scenario: Admin role
- **WHEN** an authenticated admin calls `GET /api/v1/author/books` or `GET /api/v1/author/books/:bookId`
- **THEN** the response is 403 `FORBIDDEN`

### Requirement: List every owned book
The system MUST return only books whose author id matches the author id on the access token. With no status filter, the list MUST include every status, including in-production books.

#### Scenario: Priya sees two books
- **WHEN** the author user for source id `AUTH001` requests the book list with no status filter
- **THEN** the response is 200 and `meta.total` is 2

#### Scenario: Ananya sees one book
- **WHEN** the author user for source id `AUTH003` requests the book list with no status filter
- **THEN** the response is 200 and `meta.total` is 1

#### Scenario: Sneha sees the production book
- **WHEN** the author user for source id `AUTH007` requests the book list with no status filter
- **THEN** the response is 200, `meta.total` is 3, and the list includes the book whose `sourceId` is `BK013`

### Requirement: Filters and pagination
The system MUST accept `page`, `limit`, `status`, and `q`. `page` starts at 1. `limit` defaults to 20 and MUST be at most 100. A page below 1, a limit below 1, a limit above 100, or a non-integer page or limit MUST be 400 `VALIDATION_ERROR`. `status`, when present and non-blank, MUST match the stored status text exactly. `q`, when present and non-blank, MUST match a case-insensitive substring of title, isbn, or source id. A blank filter MUST be treated as omitted.

#### Scenario: Out-of-range limit
- **WHEN** an author requests the book list with `limit` greater than 100 or `page` less than 1
- **THEN** the response is 400 `VALIDATION_ERROR`

#### Scenario: Exact status filter
- **WHEN** an author requests the book list with `status` set to `Published & Live`
- **THEN** every returned book has that exact status and belongs to that author

#### Scenario: Search
- **WHEN** an author requests the book list with `q` set to a substring of one of their book titles
- **THEN** every returned book matches that substring, ignoring case, in title, isbn, or source id

### Requirement: Book fields
Each book object MUST include `id`, `sourceId`, `title`, `isbn`, `genre`, `publicationDate`, `status`, `mrp`, `royaltyPerCopy`, `totalCopiesSold`, `totalRoyaltyEarned`, `royaltyPaid`, `royaltyPending`, `lastRoyaltyPayoutDate`, `printPartner`, and `availableOn`.

#### Scenario: Detail includes the catalog fields
- **WHEN** the owner reads the book whose `sourceId` is `BK013`
- **THEN** the object includes `sourceId`, `title`, `status`, `totalCopiesSold`, and `availableOn`

### Requirement: Book value formatting
Money fields MUST be two-decimal strings or null. `totalCopiesSold` MUST be a number. Null columns MUST stay null. `availableOn` MUST be an array. Royalty amounts MUST be the stored values, not a recalculation. Dates MUST be `YYYY-MM-DD` or null.

#### Scenario: Production nulls stay null
- **WHEN** the owner reads the book whose `sourceId` is `BK013`
- **THEN** `publicationDate`, `mrp`, `royaltyPerCopy`, `printPartner`, and `lastRoyaltyPayoutDate` are null, `totalCopiesSold` is 0, and `availableOn` is an empty array

#### Scenario: Stored zero is not null
- **WHEN** an author reads a book whose stored royalty pending is zero
- **THEN** `royaltyPending` is `"0.00"` and not null

### Requirement: Missing and foreign books
A book id that does not exist and a book id owned by another author MUST both return 404 `NOT_FOUND` with the same code and message. The author id MUST come from the access token, not from the query or body.

#### Scenario: Another author's book
- **WHEN** an author requests `GET /api/v1/author/books/:bookId` for a book owned by a different author
- **THEN** the response is 404 `NOT_FOUND` with message `Not found.`

#### Scenario: Unknown book id
- **WHEN** an author requests a book id that does not exist
- **THEN** the response is 404 `NOT_FOUND` with the same code and message as a book owned by someone else

### Requirement: Collection envelope
A successful list MUST return `{ "data": [], "meta": { "page", "limit", "total" } }`. A successful detail MUST return `{ "data": { ...book } }` without pagination meta.

#### Scenario: List envelope
- **WHEN** an author lists books successfully
- **THEN** `data` is an array and `meta` includes `page`, `limit`, and `total`
