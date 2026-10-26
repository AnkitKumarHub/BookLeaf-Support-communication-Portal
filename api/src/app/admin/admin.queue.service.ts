import { and, asc, count, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../db/index.js";
import {
  admins,
  aiRuns,
  authors,
  books,
  ticketAttachments,
  ticketEvents,
  ticketMessages,
  tickets,
  users,
} from "../../db/schema.js";
import { inngest, ticketDraftRequestedEvent } from "../ai/inngest.js";
import { toBookJson, type BookJson } from "../books/books.service.js";
import { AppError } from "../shared/errors.js";
import { likePattern } from "../shared/like.js";
import type { TicketStatus } from "../tickets/tickets.service.js";
import type { TicketCategory, TicketPriority } from "./admin.constants.js";
import { publishTicketChanged } from "../realtime/ticket-bus.js";

const assigneeUser = alias(users, "assignee_user");
const noteUser = alias(users, "note_user");
const noteAdmin = alias(admins, "note_admin");

export type AdminQueueJson = {
  id: string;
  publicId: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  bookTitle: string | null;
  status: TicketStatus;
  aiCategory: TicketCategory | null;
  categoryOverride: TicketCategory | null;
  effectiveCategory: TicketCategory | null;
  aiPriority: TicketPriority | null;
  priorityOverride: TicketPriority | null;
  effectivePriority: TicketPriority | null;
  aiState: "pending" | "processing" | "completed" | "failed";
  aiConfidence: string | null;
  draftState: "none" | "pending" | "suggested" | "failed";
  // An admin marked the current AI draft as not good enough.
  draftFlagged: boolean;
  assigneeName: string | null;
  assignedToMe: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminNoteJson = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
};

export type AdminEventJson = {
  id: number;
  eventType: string;
  payload: unknown;
  createdAt: string;
};

export type AdminDetailJson = AdminQueueJson & {
  description: string;
  phone: string | null;
  city: string | null;
  book: BookJson | null;
  aiRationale: string | null;
  draftBody: string | null;
  draftEditedAt: string | null;
  replies: { id: string; body: string; createdAt: string }[];
  notes: AdminNoteJson[];
  attachments: {
    id: string;
    name: string;
    url: string;
    mime: string;
    sizeBytes: number;
  }[];
  events: AdminEventJson[];
};

export async function listAdminTickets(input: {
  userId: string;
  page: number;
  limit: number;
  status?: TicketStatus | undefined;
  category?: TicketCategory | undefined;
  priority?: TicketPriority | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  assignee?: "me" | "unassigned" | undefined;
  q?: string | undefined;
}): Promise<{ rows: AdminQueueJson[]; total: number; needsReply: number; draftReady: number }> {
  const where = queueFilters(input);
  // One pass for the page total and the two tallies the queue header shows,
  // so the counts always describe the same filters as the rows below them.
  const [counted] = await db
    .select({
      total: count(),
      needsReply: sql<number>`count(*) filter (where ${tickets.status} = 'open')`,
      draftReady: sql<number>`count(*) filter (where ${tickets.draftState} = 'suggested' and not ${draftFlagged()})`,
    })
    .from(tickets)
    .innerJoin(authors, eq(tickets.authorId, authors.id))
    .leftJoin(books, eq(tickets.bookId, books.id))
    .leftJoin(assigneeUser, eq(tickets.assignedAdminId, assigneeUser.id))
    .leftJoin(admins, eq(assigneeUser.adminId, admins.id))
    .where(where);
  const rows = await db
    .select(queueColumns())
    .from(tickets)
    .innerJoin(authors, eq(tickets.authorId, authors.id))
    .leftJoin(books, eq(tickets.bookId, books.id))
    .leftJoin(assigneeUser, eq(tickets.assignedAdminId, assigneeUser.id))
    .leftJoin(admins, eq(assigneeUser.adminId, admins.id))
    .where(where)
    .orderBy(openWorkRank(), priorityRank(), statusRank(), asc(tickets.createdAt), asc(tickets.id))
    .limit(input.limit)
    .offset((input.page - 1) * input.limit);

  return {
    total: asCount(counted?.total),
    needsReply: asCount(counted?.needsReply),
    draftReady: asCount(counted?.draftReady),
    rows: rows.map((row) => toQueueJson(row, input.userId)),
  };
}

export async function getAdminTicket(
  userId: string,
  ticketId: string,
): Promise<AdminDetailJson> {
  const [ticket] = await db
    .select({
      ...queueColumns(),
      description: tickets.description,
      phone: authors.phone,
      city: authors.city,
      aiConfidence: tickets.aiConfidence,
      aiRationale: tickets.aiRationale,
      draftBody: tickets.draftBody,
      draftEditedAt: tickets.draftEditedAt,
      bookId: books.id,
      sourceId: books.sourceId,
      title: books.title,
      isbn: books.isbn,
      genre: books.genre,
      publicationDate: books.publicationDate,
      bookStatus: books.status,
      mrp: books.mrp,
      royaltyPerCopy: books.royaltyPerCopy,
      totalCopiesSold: books.totalCopiesSold,
      totalRoyaltyEarned: books.totalRoyaltyEarned,
      royaltyPaid: books.royaltyPaid,
      royaltyPending: books.royaltyPending,
      lastRoyaltyPayoutDate: books.lastRoyaltyPayoutDate,
      printPartner: books.printPartner,
      availableOn: books.availableOn,
    })
    .from(tickets)
    .innerJoin(authors, eq(tickets.authorId, authors.id))
    .leftJoin(books, eq(tickets.bookId, books.id))
    .leftJoin(assigneeUser, eq(tickets.assignedAdminId, assigneeUser.id))
    .leftJoin(admins, eq(assigneeUser.adminId, admins.id))
    .where(eq(tickets.id, ticketId))
    .limit(1);
  if (!ticket) throw AppError.notFound();

  const [claimed] = await db
    .update(tickets)
    .set({ draftState: "pending", updatedAt: new Date() })
    // Start the draft only once triage has finished, so it is written with the
    // ticket's category. Until then the admin page shows a waiting state, and
    // the stream refetch after triage repeats this read and starts it.
    .where(
      and(
        eq(tickets.id, ticketId),
        eq(tickets.draftState, "none"),
        inArray(tickets.aiState, ["completed", "failed"]),
      ),
    )
    .returning({
      updatedAt: tickets.updatedAt,
      aiJobVersion: tickets.aiJobVersion,
      authorId: tickets.authorId,
    });
  if (claimed) {
    ticket.draftState = "pending";
    ticket.updatedAt = claimed.updatedAt;
    publishTicketChanged({ ticketId, authorId: claimed.authorId, audience: "admin" });
    try {
      await inngest.send(
        ticketDraftRequestedEvent(
          ticketId,
          claimed.aiJobVersion,
          claimed.updatedAt.toISOString(),
        ),
      );
    } catch {
      console.error("ticket.draft_requested send failed", { ticketId });
    }
  }

  const [replies, notes, attachments, events] = await Promise.all([
    db
      .select({
        id: ticketMessages.id,
        body: ticketMessages.body,
        createdAt: ticketMessages.createdAt,
      })
      .from(ticketMessages)
      .where(
        and(
          eq(ticketMessages.ticketId, ticket.id),
          eq(ticketMessages.visibility, "public"),
        ),
      )
      .orderBy(asc(ticketMessages.createdAt)),
    db
      .select({
        id: ticketMessages.id,
        body: ticketMessages.body,
        createdAt: ticketMessages.createdAt,
        authorName: noteAdmin.name,
      })
      .from(ticketMessages)
      .innerJoin(noteUser, eq(ticketMessages.authorUserId, noteUser.id))
      .leftJoin(noteAdmin, eq(noteUser.adminId, noteAdmin.id))
      .where(
        and(
          eq(ticketMessages.ticketId, ticket.id),
          eq(ticketMessages.visibility, "internal"),
        ),
      )
      .orderBy(asc(ticketMessages.createdAt)),
    db
      .select({
        id: ticketAttachments.id,
        name: ticketAttachments.name,
        url: ticketAttachments.url,
        mime: ticketAttachments.mime,
        sizeBytes: ticketAttachments.sizeBytes,
      })
      .from(ticketAttachments)
      .where(eq(ticketAttachments.ticketId, ticket.id))
      .orderBy(asc(ticketAttachments.createdAt)),
    db
      .select({
        id: ticketEvents.id,
        eventType: ticketEvents.eventType,
        payload: ticketEvents.payload,
        createdAt: ticketEvents.createdAt,
      })
      .from(ticketEvents)
      .where(eq(ticketEvents.ticketId, ticket.id))
      .orderBy(asc(ticketEvents.createdAt)),
  ]);

  return {
    ...toQueueJson(ticket, userId),
    description: ticket.description,
    phone: ticket.phone,
    city: ticket.city,
    book: ticket.bookId
      ? toBookJson({
          id: ticket.bookId,
          sourceId: ticket.sourceId ?? "",
          title: ticket.title ?? "",
          isbn: ticket.isbn,
          genre: ticket.genre,
          publicationDate: ticket.publicationDate,
          status: ticket.bookStatus ?? "",
          mrp: ticket.mrp,
          royaltyPerCopy: ticket.royaltyPerCopy,
          totalCopiesSold: ticket.totalCopiesSold ?? 0,
          totalRoyaltyEarned: ticket.totalRoyaltyEarned,
          royaltyPaid: ticket.royaltyPaid,
          royaltyPending: ticket.royaltyPending,
          lastRoyaltyPayoutDate: ticket.lastRoyaltyPayoutDate,
          printPartner: ticket.printPartner,
          availableOn: ticket.availableOn,
        })
      : null,
    aiConfidence: ticket.aiConfidence,
    aiRationale: ticket.aiRationale,
    draftBody: ticket.draftBody,
    draftEditedAt: ticket.draftEditedAt
      ? ticket.draftEditedAt.toISOString()
      : null,
    replies: replies.map((reply) => ({
      id: reply.id,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
    })),
    notes: notes.map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      authorName: note.authorName ?? "",
    })),
    attachments,
    events: events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

// True when an admin marked the ticket's current AI draft as not good enough.
// Mirrors latestDraftRun: the newest completed draft run is the current one,
// and a draft that has since been cleared or regenerated is not flagged.
function draftFlagged() {
  return sql<boolean>`(
    ${tickets.draftBody} is not null
    and coalesce((
      select ${aiRuns.flaggedAt} is not null
      from ${aiRuns}
      where ${aiRuns.ticketId} = ${tickets.id}
        and ${aiRuns.taskType} = 'draft'
        and ${aiRuns.state} = 'completed'
        and ${aiRuns.errorCode} is null
      order by ${aiRuns.completedAt} desc
      limit 1
    ), false)
  )`;
}

function queueColumns() {
  return {
    id: tickets.id,
    publicId: tickets.publicId,
    subject: tickets.subject,
    authorName: authors.name,
    authorEmail: authors.email,
    bookTitle: books.title,
    status: tickets.status,
    aiCategory: tickets.aiCategory,
    categoryOverride: tickets.categoryOverride,
    effectiveCategory: sql<TicketCategory | null>`coalesce(${tickets.categoryOverride}, ${tickets.aiCategory})`,
    aiPriority: tickets.aiPriority,
    priorityOverride: tickets.priorityOverride,
    effectivePriority: sql<TicketPriority | null>`coalesce(${tickets.priorityOverride}, ${tickets.aiPriority})`,
    aiState: tickets.aiState,
    aiConfidence: tickets.aiConfidence,
    draftState: tickets.draftState,
    draftFlagged: draftFlagged(),
    assigneeName: admins.name,
    assignedAdminId: tickets.assignedAdminId,
    createdAt: tickets.createdAt,
    updatedAt: tickets.updatedAt,
  };
}

type QueueRow = {
  id: string;
  publicId: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  bookTitle: string | null;
  status: TicketStatus;
  aiCategory: TicketCategory | null;
  categoryOverride: TicketCategory | null;
  effectiveCategory: TicketCategory | null;
  aiPriority: TicketPriority | null;
  priorityOverride: TicketPriority | null;
  effectivePriority: TicketPriority | null;
  aiState: AdminQueueJson["aiState"];
  aiConfidence: string | null;
  draftState: AdminQueueJson["draftState"];
  draftFlagged: boolean;
  assigneeName: string | null;
  assignedAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toQueueJson(row: QueueRow, userId: string): AdminQueueJson {
  return {
    id: row.id,
    publicId: row.publicId,
    subject: row.subject,
    authorName: row.authorName,
    authorEmail: row.authorEmail,
    bookTitle: row.bookTitle,
    status: row.status,
    aiCategory: row.aiCategory,
    categoryOverride: row.categoryOverride,
    effectiveCategory: row.effectiveCategory,
    aiPriority: row.aiPriority,
    priorityOverride: row.priorityOverride,
    effectivePriority: row.effectivePriority,
    aiState: row.aiState,
    aiConfidence: row.aiConfidence,
    draftState: row.draftState,
    draftFlagged: row.draftFlagged,
    assigneeName: row.assigneeName,
    assignedToMe: row.assignedAdminId === userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function queueFilters(input: {
  userId: string;
  status?: TicketStatus | undefined;
  category?: TicketCategory | undefined;
  priority?: TicketPriority | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  assignee?: "me" | "unassigned" | undefined;
  q?: string | undefined;
}): SQL | undefined {
  const conditions: SQL[] = [];
  if (input.status) conditions.push(eq(tickets.status, input.status));
  if (input.category) {
    conditions.push(
      sql`coalesce(${tickets.categoryOverride}, ${tickets.aiCategory}) = ${input.category}`,
    );
  }
  if (input.priority) {
    conditions.push(
      sql`coalesce(${tickets.priorityOverride}, ${tickets.aiPriority}) = ${input.priority}`,
    );
  }
  if (input.from) conditions.push(gte(tickets.createdAt, input.from));
  if (input.to) conditions.push(lte(tickets.createdAt, input.to));
  if (input.assignee === "me") {
    conditions.push(eq(tickets.assignedAdminId, input.userId));
  }
  if (input.assignee === "unassigned") {
    conditions.push(sql`${tickets.assignedAdminId} is null`);
  }
  if (input.q) {
    const pattern = likePattern(input.q);
    conditions.push(
      sql`(
        ${tickets.publicId} ILIKE ${pattern} ESCAPE '\\'
        OR ${tickets.subject} ILIKE ${pattern} ESCAPE '\\'
        OR ${authors.name} ILIKE ${pattern} ESCAPE '\\'
        OR ${authors.email} ILIKE ${pattern} ESCAPE '\\'
      )`,
    );
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

// Queue order: unresolved work first (open and in progress together), then
// resolved, then closed. Priority comes next, so a High ticket in progress is
// not buried under a Medium that is merely open.
function openWorkRank() {
  return sql`case ${tickets.status} when 'open' then 0 when 'in_progress' then 0 when 'resolved' then 1 else 2 end`;
}

// Within one priority, open (no reply sent yet) comes before in progress.
function statusRank() {
  return sql`case ${tickets.status} when 'open' then 0 when 'in_progress' then 1 when 'resolved' then 2 else 3 end`;
}

function priorityRank() {
  return sql`case coalesce(${tickets.priorityOverride}, ${tickets.aiPriority}) when 'critical' then 0 when 'high' then 1 when 'medium' then 3 when 'low' then 4 else 2 end`;
}

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return 0;
}
