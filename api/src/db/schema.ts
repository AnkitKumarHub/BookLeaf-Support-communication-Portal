import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["author", "admin"]);

export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

export const ticketCategoryEnum = pgEnum("ticket_category", [
  "royalty_payments",
  "isbn_metadata",
  "printing_quality",
  "distribution_availability",
  "production_status",
  "general_inquiry",
]);

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const aiStateEnum = pgEnum("ai_state", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const draftStateEnum = pgEnum("draft_state", [
  "none",
  "pending",
  "suggested",
  "failed",
]);

export const messageVisibilityEnum = pgEnum("message_visibility", [
  "public",
  "internal",
]);

export const aiTaskTypeEnum = pgEnum("ai_task_type", ["classify", "draft"]);

export const aiRunStateEnum = pgEnum("ai_run_state", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const ticketPublicIdSeq = pgSequence("ticket_public_id_seq", {
  startWith: 1001,
  increment: 1,
});

export const authors = pgTable(
  "authors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    city: text("city"),
    joinedDate: date("joined_date"),
  },
  (t) => [uniqueIndex("authors_source_id_unique").on(t.sourceId)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    authorId: uuid("author_id").references(() => authors.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    uniqueIndex("users_email_lower_unique").on(sql`lower(${t.email})`),
    check(
      "users_role_author_check",
      sql`(
        (${t.role} = 'author' AND ${t.authorId} IS NOT NULL)
        OR (${t.role} = 'admin' AND ${t.authorId} IS NULL)
      )`,
    ),
  ],
);

export const books = pgTable(
  "books",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: text("source_id").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => authors.id),
    title: text("title").notNull(),
    isbn: text("isbn"),
    genre: text("genre"),
    publicationDate: date("publication_date"),
    status: text("status").notNull(),
    mrp: numeric("mrp", { precision: 12, scale: 2 }),
    royaltyPerCopy: numeric("royalty_per_copy", { precision: 12, scale: 2 }),
    totalCopiesSold: integer("total_copies_sold").notNull().default(0),
    totalRoyaltyEarned: numeric("total_royalty_earned", {
      precision: 12,
      scale: 2,
    }),
    royaltyPaid: numeric("royalty_paid", { precision: 12, scale: 2 }),
    royaltyPending: numeric("royalty_pending", { precision: 12, scale: 2 }),
    lastRoyaltyPayoutDate: date("last_royalty_payout_date"),
    printPartner: text("print_partner"),
    availableOn: text("available_on").array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [
    uniqueIndex("books_source_id_unique").on(t.sourceId),
    index("books_author_id_status_idx").on(t.authorId, t.status),
    uniqueIndex("books_id_author_id_unique").on(t.id, t.authorId),
  ],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicId: text("public_id").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => authors.id),
    bookId: uuid("book_id"),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    status: ticketStatusEnum("status").notNull().default("open"),
    aiCategory: ticketCategoryEnum("ai_category"),
    categoryOverride: ticketCategoryEnum("category_override"),
    aiPriority: ticketPriorityEnum("ai_priority"),
    priorityOverride: ticketPriorityEnum("priority_override"),
    aiConfidence: numeric("ai_confidence", { precision: 5, scale: 4 }),
    aiRationale: text("ai_rationale"),
    aiState: aiStateEnum("ai_state").notNull().default("pending"),
    aiJobVersion: integer("ai_job_version").notNull().default(1),
    assignedAdminId: uuid("assigned_admin_id").references(() => users.id),
    draftBody: text("draft_body"),
    draftState: draftStateEnum("draft_state").notNull().default("none"),
    draftPromptVersion: text("draft_prompt_version"),
    draftEditedAt: timestamp("draft_edited_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    uniqueIndex("tickets_public_id_unique").on(t.publicId),
    index("tickets_author_id_updated_at_idx").on(t.authorId, t.updatedAt),
    index("tickets_status_created_at_idx").on(t.status, t.createdAt),
    index("tickets_assigned_admin_id_status_idx").on(
      t.assignedAdminId,
      t.status,
    ),
    foreignKey({
      name: "tickets_book_author_fk",
      columns: [t.bookId, t.authorId],
      foreignColumns: [books.id, books.authorId],
    }),
  ],
);

export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    visibility: messageVisibilityEnum("visibility").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ticket_messages_ticket_id_created_at_idx").on(
      t.ticketId,
      t.createdAt,
    ),
  ],
);

export const ticketAttachments = pgTable(
  "ticket_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id),
    imagekitFileId: text("imagekit_file_id").notNull(),
    url: text("url").notNull(),
    name: text("name").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    mime: text("mime").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ticket_attachments_ticket_id_idx").on(t.ticketId)],
);

export const ticketEvents = pgTable("ticket_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const aiRuns = pgTable("ai_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id),
  taskType: aiTaskTypeEnum("task_type").notNull(),
  state: aiRunStateEnum("state").notNull(),
  attempt: integer("attempt").notNull().default(1),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  jobVersion: integer("job_version").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_hash_unique").on(t.tokenHash)],
);
