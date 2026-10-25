import { z } from "zod";
import { attachment, book, message, pageQuery, ticketStatus, uuid } from "../../openapi/common.js";

const SUBJECT_MESSAGE = "Use between 5 and 160 characters.";
const DESCRIPTION_MESSAGE = "Use between 10 and 10000 characters.";

export const listTicketsQuery = z.object({
  status: ticketStatus.optional(),
  ...pageQuery,
});

export const ticketParams = z.object({ ticketId: uuid("ticket id") });

export const createTicketBody = z.object({
  bookId: uuid("book id").nullable().optional().meta({ description: "Omit or null for General / Account Level." }),
  subject: z.string({ error: SUBJECT_MESSAGE }).trim().min(5, { error: SUBJECT_MESSAGE }).max(160, { error: SUBJECT_MESSAGE }),
  description: z
    .string({ error: DESCRIPTION_MESSAGE })
    .trim()
    .min(10, { error: DESCRIPTION_MESSAGE })
    .max(10_000, { error: DESCRIPTION_MESSAGE }),
});

export const createdTicket = z.object({
  id: z.uuid(),
  publicId: z.string().meta({ example: "BL-1001" }),
  status: z.literal("open"),
  aiState: z.literal("pending"),
  bookId: z.uuid().nullable(),
  subject: z.string(),
  createdAt: z.iso.datetime(),
});

export const authorTicketRow = z.object({
  id: z.uuid(),
  publicId: z.string(),
  status: ticketStatus,
  subject: z.string(),
  book: book.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  replyCount: z.number().int(),
});

export const authorTicketDetail = authorTicketRow.omit({ replyCount: true }).extend({
  description: z.string(),
  replies: z.array(message),
  attachments: z.array(attachment),
});
