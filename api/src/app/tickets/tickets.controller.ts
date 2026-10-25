import type { Response } from "express";
import type { z } from "zod";
import type { ValidRequest } from "../../openapi/define-route.js";
import { requestAuthor } from "../auth/auth.middleware.js";
import { sendData } from "../shared/envelope.js";
import type { createTicketBody, listTicketsQuery, ticketParams } from "./tickets.schemas.js";
import { createTicket, getTicket, listTickets } from "./tickets.service.js";

export async function listTicketsController(
  req: ValidRequest<{ query: z.output<typeof listTicketsQuery> }>,
  res: Response,
) {
  const { authorId } = requestAuthor(req);
  const { page, limit, status } = req.valid.query;
  const result = await listTickets({ authorId, page, limit, status });
  sendData(res, result.rows, 200, { page, limit, total: result.total });
}

export async function getTicketController(
  req: ValidRequest<{ params: z.output<typeof ticketParams> }>,
  res: Response,
) {
  const { authorId } = requestAuthor(req);
  sendData(res, await getTicket(authorId, req.valid.params.ticketId));
}

export async function createTicketController(
  req: ValidRequest<{ body: z.output<typeof createTicketBody> }>,
  res: Response,
) {
  const { userId, authorId } = requestAuthor(req);
  const { bookId, subject, description } = req.valid.body;
  const created = await createTicket({ userId, authorId, bookId: bookId ?? null, subject, description });
  sendData(res, created, 201);
}
