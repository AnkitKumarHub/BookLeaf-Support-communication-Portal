import type { Response } from "express";
import type { z } from "zod";
import type { ValidRequest } from "../../openapi/define-route.js";
import { requestAdmin } from "../auth/auth.middleware.js";
import { sendData } from "../shared/envelope.js";
import type {
  adminTicketParams,
  aiRunParams,
  flagDraftBody,
  messageBody,
  patchTicketBody,
  queueQuery,
  regenerateBody,
} from "./admin.schemas.js";
import {
  addNote,
  addReply,
  assignTicket,
  flagDraft,
  getAiRun,
  patchTicket,
  regenerateDraft,
  retryTriage,
  saveDraft,
  unassignTicket,
} from "./admin.service.js";
import { getAdminTicket, listAdminTickets } from "./admin.queue.service.js";
import { getAdminStats } from "./admin.stats.service.js";

type TicketParams = { params: z.output<typeof adminTicketParams> };
type TicketBody<S extends z.ZodType> = TicketParams & { body: z.output<S> };

export async function listAdminTicketsController(
  req: ValidRequest<{ query: z.output<typeof queueQuery> }>,
  res: Response,
) {
  const { userId } = requestAdmin(req);
  const { page, limit, from, to, q, ...filters } = req.valid.query;
  const result = await listAdminTickets({
    userId,
    page,
    limit,
    ...filters,
    // Dates are whole UTC days: from is inclusive at 00:00, to through 23:59:59.999.
    from: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
    to: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
    q: q || undefined,
  });
  sendData(res, result.rows, 200, {
    page,
    limit,
    total: result.total,
    counts: { needsReply: result.needsReply, draftReady: result.draftReady },
  });
}

export async function getAdminTicketController(req: ValidRequest<TicketParams>, res: Response) {
  const { userId } = requestAdmin(req);
  sendData(res, await getAdminTicket(userId, req.valid.params.ticketId));
}

export async function patchAdminTicketController(
  req: ValidRequest<TicketBody<typeof patchTicketBody>>,
  res: Response,
) {
  const { userId } = requestAdmin(req);
  sendData(res, await patchTicket(userId, req.valid.params.ticketId, req.valid.body));
}

export async function assignAdminTicketController(req: ValidRequest<TicketParams>, res: Response) {
  const { userId } = requestAdmin(req);
  sendData(res, await assignTicket(userId, req.valid.params.ticketId));
}

export async function unassignAdminTicketController(req: ValidRequest<TicketParams>, res: Response) {
  const { userId } = requestAdmin(req);
  sendData(res, await unassignTicket(userId, req.valid.params.ticketId));
}

export async function addAdminNoteController(req: ValidRequest<TicketBody<typeof messageBody>>, res: Response) {
  const { userId } = requestAdmin(req);
  sendData(res, await addNote(userId, req.valid.params.ticketId, req.valid.body.body), 201);
}

export async function addAdminReplyController(req: ValidRequest<TicketBody<typeof messageBody>>, res: Response) {
  const { userId } = requestAdmin(req);
  sendData(res, await addReply(userId, req.valid.params.ticketId, req.valid.body.body), 201);
}

export async function retryTriageController(req: ValidRequest<TicketParams>, res: Response) {
  requestAdmin(req);
  sendData(res, await retryTriage(req.valid.params.ticketId), 202);
}

export async function saveDraftController(req: ValidRequest<TicketBody<typeof messageBody>>, res: Response) {
  requestAdmin(req);
  sendData(res, await saveDraft(req.valid.params.ticketId, req.valid.body.body));
}

export async function regenerateDraftController(
  req: ValidRequest<TicketBody<typeof regenerateBody>>,
  res: Response,
) {
  requestAdmin(req);
  const confirm = req.valid.body.confirmDiscardEdits === true;
  sendData(res, await regenerateDraft(req.valid.params.ticketId, confirm), 202);
}

export async function getAiRunController(
  req: ValidRequest<{ params: z.output<typeof aiRunParams> }>,
  res: Response,
) {
  requestAdmin(req);
  sendData(res, await getAiRun(req.valid.params.runId));
}

export async function flagDraftController(req: ValidRequest<TicketBody<typeof flagDraftBody>>, res: Response) {
  const { userId } = requestAdmin(req);
  sendData(res, await flagDraft(userId, req.valid.params.ticketId, req.valid.body.flagged));
}

export async function adminStatsController(req: ValidRequest<object>, res: Response) {
  requestAdmin(req);
  sendData(res, await getAdminStats());
}
