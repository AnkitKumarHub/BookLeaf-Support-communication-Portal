import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  books,
  ticketAttachments,
  ticketEvents,
  ticketMessages,
  tickets,
} from "../../db/schema.js";
import { inngest, ticketCreatedEvent } from "../ai/inngest.js";
import { authorOwnsBook, toBookJson, type BookJson } from "../books/books.service.js";
import { AppError } from "../shared/errors.js";
import { assertCreateRateLimit } from "./create-rate-limit.js";

const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export type TicketReplyJson = {
  id: string;
  body: string;
  createdAt: string;
};

export type TicketAttachmentJson = {
  id: string;
  name: string;
  url: string;
  mime: string;
  sizeBytes: number;
};

export type TicketListJson = {
  id: string;
  publicId: string;
  status: TicketStatus;
  subject: string;
  book: BookJson | null;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
};

export type TicketDetailJson = {
  id: string;
  publicId: string;
  status: TicketStatus;
  subject: string;
  description: string;
  book: BookJson | null;
  createdAt: string;
  updatedAt: string;
  replies: TicketReplyJson[];
  attachments: TicketAttachmentJson[];
};

export type CreatedTicketJson = {
  id: string;
  publicId: string;
  status: "open";
  aiState: "pending";
  bookId: string | null;
  subject: string;
  createdAt: string;
};

export function parseTicketStatus(value: string): TicketStatus {
  if (!TICKET_STATUSES.includes(value as TicketStatus)) {
    throw AppError.validation("Please correct the highlighted fields.", {
      status: "Choose open, in_progress, resolved, or closed.",
    });
  }
  return value as TicketStatus;
}

export async function createTicket(input: {
  userId: string;
  authorId: string;
  bookId: string | null;
  subject: string;
  description: string;
}): Promise<CreatedTicketJson> {
  if (input.bookId) {
    const owned = await authorOwnsBook(input.authorId, input.bookId);
    if (!owned) throw AppError.notFound();
  }
  assertCreateRateLimit(input.authorId);

  let created: CreatedTicketJson & { jobVersion: number };
  try {
    created = await db.transaction(async (tx) => {
      const [ticket] = await tx
        .insert(tickets)
        .values({
          publicId: sql`'BL-' || nextval('ticket_public_id_seq')`,
          authorId: input.authorId,
          bookId: input.bookId,
          subject: input.subject,
          description: input.description,
          status: "open",
          aiState: "pending",
          aiJobVersion: 1,
          draftState: "none",
        })
        .returning({
          id: tickets.id,
          publicId: tickets.publicId,
          aiJobVersion: tickets.aiJobVersion,
          bookId: tickets.bookId,
          subject: tickets.subject,
          createdAt: tickets.createdAt,
        });
      if (!ticket) throw AppError.internal();
      await tx.insert(ticketEvents).values({
        ticketId: ticket.id,
        actorUserId: input.userId,
        eventType: "ticket.created",
        payload: { status: "open" },
      });
      return {
        id: ticket.id,
        publicId: ticket.publicId,
        status: "open" as const,
        aiState: "pending" as const,
        bookId: ticket.bookId,
        subject: ticket.subject,
        createdAt: ticket.createdAt.toISOString(),
        jobVersion: ticket.aiJobVersion,
      };
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (isForeignKeyViolation(err)) throw AppError.notFound();
    throw err;
  }

  const { jobVersion, ...response } = created;
  try {
    await inngest.send(ticketCreatedEvent(response.id, jobVersion));
  } catch {
    console.error("ticket.created send failed", { ticketId: response.id });
  }
  return response;
}

export async function listTickets(input: {
  authorId: string;
  page: number;
  limit: number;
  status?: TicketStatus | undefined;
}): Promise<{ rows: TicketListJson[]; total: number }> {
  const where = ticketFilters(input.authorId, input.status);
  const [counted] = await db
    .select({ total: count() })
    .from(tickets)
    .where(where);
  const rows = await db
    .select({
      id: tickets.id,
      publicId: tickets.publicId,
      status: tickets.status,
      subject: tickets.subject,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      replyCount: sql<number>`(select count(*)::int from ticket_messages where ticket_id = ${tickets.id} and visibility = 'public')`,
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
    .leftJoin(books, eq(tickets.bookId, books.id))
    .where(where)
    .orderBy(desc(tickets.updatedAt), desc(tickets.id))
    .limit(input.limit)
    .offset((input.page - 1) * input.limit);

  return {
    total: asCount(counted?.total),
    rows: rows.map((row) => ({
      id: row.id,
      publicId: row.publicId,
      status: row.status,
      subject: row.subject,
      book: row.bookId
        ? toBookJson({
            id: row.bookId,
            sourceId: row.sourceId ?? "",
            title: row.title ?? "",
            isbn: row.isbn,
            genre: row.genre,
            publicationDate: row.publicationDate,
            status: row.bookStatus ?? "",
            mrp: row.mrp,
            royaltyPerCopy: row.royaltyPerCopy,
            totalCopiesSold: row.totalCopiesSold ?? 0,
            totalRoyaltyEarned: row.totalRoyaltyEarned,
            royaltyPaid: row.royaltyPaid,
            royaltyPending: row.royaltyPending,
            lastRoyaltyPayoutDate: row.lastRoyaltyPayoutDate,
            printPartner: row.printPartner,
            availableOn: row.availableOn,
          })
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      replyCount: asCount(row.replyCount),
    })),
  };
}

export async function getTicket(
  authorId: string,
  ticketId: string,
): Promise<TicketDetailJson> {
  const [ticket] = await db
    .select({
      id: tickets.id,
      publicId: tickets.publicId,
      status: tickets.status,
      subject: tickets.subject,
      description: tickets.description,
      bookId: tickets.bookId,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
    })
    .from(tickets)
    .where(and(eq(tickets.authorId, authorId), eq(tickets.id, ticketId)))
    .limit(1);
  if (!ticket) throw AppError.notFound();

  const [book, replies, attachments] = await Promise.all([
    loadBook(authorId, ticket.bookId),
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
        id: ticketAttachments.id,
        name: ticketAttachments.name,
        url: ticketAttachments.url,
        mime: ticketAttachments.mime,
        sizeBytes: ticketAttachments.sizeBytes,
      })
      .from(ticketAttachments)
      .where(eq(ticketAttachments.ticketId, ticket.id))
      .orderBy(asc(ticketAttachments.createdAt)),
  ]);

  return {
    id: ticket.id,
    publicId: ticket.publicId,
    status: ticket.status,
    subject: ticket.subject,
    description: ticket.description,
    book,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    replies: replies.map((reply) => ({
      id: reply.id,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
    })),
    attachments,
  };
}

async function loadBook(
  authorId: string,
  bookId: string | null,
): Promise<BookJson | null> {
  if (!bookId) return null;
  const [row] = await db
    .select({
      id: books.id,
      sourceId: books.sourceId,
      title: books.title,
      isbn: books.isbn,
      genre: books.genre,
      publicationDate: books.publicationDate,
      status: books.status,
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
    .from(books)
    .where(and(eq(books.id, bookId), eq(books.authorId, authorId)))
    .limit(1);
  return row ? toBookJson(row) : null;
}

function ticketFilters(
  authorId: string,
  status: TicketStatus | undefined,
): SQL | undefined {
  const conditions: SQL[] = [eq(tickets.authorId, authorId)];
  if (status) conditions.push(eq(tickets.status, status));
  return and(...conditions);
}

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return 0;
}

function isForeignKeyViolation(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: unknown }).code === "23503") return true;
  if ("cause" in err) return isForeignKeyViolation((err as { cause: unknown }).cause);
  return false;
}
