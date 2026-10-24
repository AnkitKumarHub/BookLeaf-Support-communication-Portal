import type { Request, Response } from "express";
import { requestAuthor } from "../auth/auth.middleware.js";
import { AppError } from "../shared/errors.js";
import { sendData } from "../shared/envelope.js";
import { isUuid } from "../shared/ids.js";
import { optionalFilter, parsePagination } from "../shared/pagination.js";
import {
  createTicket,
  getTicket,
  listTickets,
  parseTicketStatus,
} from "./tickets.service.js";

const SUBJECT_MESSAGE = "Use between 5 and 160 characters.";
const DESCRIPTION_MESSAGE = "Use between 10 and 10000 characters.";
const BOOK_ID_MESSAGE = "Enter a valid book id.";

export async function listTicketsController(req: Request, res: Response) {
  const { authorId } = requestAuthor(req);
  const page = parsePagination({
    page: req.query.page,
    limit: req.query.limit,
  });
  const statusText = optionalFilter(req.query.status, "status");
  const status = statusText ? parseTicketStatus(statusText) : undefined;
  const result = await listTickets({
    authorId,
    page: page.page,
    limit: page.limit,
    status,
  });
  sendData(res, result.rows, 200, {
    page: page.page,
    limit: page.limit,
    total: result.total,
  });
}

export async function getTicketController(req: Request, res: Response) {
  const { authorId } = requestAuthor(req);
  const ticketId = req.params.ticketId;
  if (typeof ticketId !== "string" || !isUuid(ticketId)) {
    throw AppError.notFound();
  }
  sendData(res, await getTicket(authorId, ticketId));
}

export async function createTicketController(req: Request, res: Response) {
  const { userId, authorId } = requestAuthor(req);
  const body = parseCreateBody(req.body);
  const created = await createTicket({
    userId,
    authorId,
    bookId: body.bookId,
    subject: body.subject,
    description: body.description,
  });
  sendData(res, created, 201);
}

function parseCreateBody(body: unknown): {
  bookId: string | null;
  subject: string;
  description: string;
} {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw AppError.validation("Please correct the highlighted fields.", {
      subject: SUBJECT_MESSAGE,
      description: DESCRIPTION_MESSAGE,
    });
  }
  const record = body as Record<string, unknown>;
  const fields: Record<string, string> = {};
  let bookId: string | null = null;
  if (record.bookId !== undefined && record.bookId !== null) {
    if (typeof record.bookId !== "string" || !isUuid(record.bookId)) {
      fields.bookId = BOOK_ID_MESSAGE;
    } else {
      bookId = record.bookId;
    }
  }
  const subject = typeof record.subject === "string" ? record.subject.trim() : "";
  const description =
    typeof record.description === "string" ? record.description.trim() : "";
  if (subject.length < 5 || subject.length > 160) {
    fields.subject = SUBJECT_MESSAGE;
  }
  if (description.length < 10 || description.length > 10000) {
    fields.description = DESCRIPTION_MESSAGE;
  }
  if (Object.keys(fields).length > 0) {
    throw AppError.validation("Please correct the highlighted fields.", fields);
  }
  return { bookId, subject, description };
}
