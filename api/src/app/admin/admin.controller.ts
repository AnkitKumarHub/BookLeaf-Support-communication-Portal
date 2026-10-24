import type { Request, Response } from "express";
import { requestAdmin } from "../auth/auth.middleware.js";
import { AppError } from "../shared/errors.js";
import { sendData } from "../shared/envelope.js";
import { isUuid } from "../shared/ids.js";
import { optionalFilter, parseDateRange, parsePagination } from "../shared/pagination.js";
import { parseTicketStatus } from "../tickets/tickets.service.js";
import {
  MESSAGE_BODY_MESSAGE,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketPriority,
} from "./admin.constants.js";
import {
  addNote,
  addReply,
  assignTicket,
  getAiRun,
  patchTicket,
  regenerateDraft,
  retryTriage,
  saveDraft,
  unassignTicket,
  type TicketPatch,
} from "./admin.service.js";
import { getAdminTicket, listAdminTickets } from "./admin.queue.service.js";

export async function listAdminTicketsController(req: Request, res: Response) {
  const { userId } = requestAdmin(req);
  const page = parsePagination({ page: req.query.page, limit: req.query.limit });
  const statusText = optionalFilter(req.query.status, "status");
  const categoryText = optionalFilter(req.query.category, "category");
  const priorityText = optionalFilter(req.query.priority, "priority");
  const assigneeText = optionalFilter(req.query.assignee, "assignee");
  const range = parseDateRange({ from: req.query.from, to: req.query.to });
  const result = await listAdminTickets({
    userId,
    page: page.page,
    limit: page.limit,
    status: statusText ? parseTicketStatus(statusText) : undefined,
    category: categoryText ? parseCategory(categoryText) : undefined,
    priority: priorityText ? parsePriority(priorityText) : undefined,
    from: range.from,
    to: range.to,
    assignee: parseAssignee(assigneeText),
    q: optionalFilter(req.query.q, "q"),
  });
  sendData(res, result.rows, 200, {
    page: page.page,
    limit: page.limit,
    total: result.total,
  });
}

export async function getAdminTicketController(req: Request, res: Response) {
  const { userId } = requestAdmin(req);
  sendData(res, await getAdminTicket(userId, ticketId(req)));
}

export async function patchAdminTicketController(req: Request, res: Response) {
  const { userId } = requestAdmin(req);
  sendData(res, await patchTicket(userId, ticketId(req), parsePatch(req.body)));
}

export async function assignAdminTicketController(req: Request, res: Response) {
  const { userId } = requestAdmin(req);
  sendData(res, await assignTicket(userId, ticketId(req)));
}

export async function unassignAdminTicketController(req: Request, res: Response) {
  const { userId } = requestAdmin(req);
  sendData(res, await unassignTicket(userId, ticketId(req)));
}

export async function addAdminNoteController(req: Request, res: Response) {
  const { userId } = requestAdmin(req);
  sendData(res, await addNote(userId, ticketId(req), parseMessageBody(req.body)), 201);
}

export async function addAdminReplyController(req: Request, res: Response) {
  const { userId } = requestAdmin(req);
  sendData(res, await addReply(userId, ticketId(req), parseMessageBody(req.body)), 201);
}

export async function retryTriageController(req: Request, res: Response) {
  requestAdmin(req);
  sendData(res, await retryTriage(ticketId(req)), 202);
}

export async function saveDraftController(req: Request, res: Response) {
  requestAdmin(req);
  sendData(res, await saveDraft(ticketId(req), parseMessageBody(req.body)));
}

export async function regenerateDraftController(req: Request, res: Response) {
  requestAdmin(req);
  sendData(res, await regenerateDraft(ticketId(req), confirmDiscard(req.body)), 202);
}

export async function getAiRunController(req: Request, res: Response) {
  requestAdmin(req);
  sendData(res, await getAiRun(runId(req)));
}

function ticketId(req: Request): string {
  return uuidParam(req.params.ticketId);
}

function runId(req: Request): string {
  return uuidParam(req.params.runId);
}

function uuidParam(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !isUuid(value)) {
    throw AppError.notFound();
  }
  return value;
}

function confirmDiscard(body: unknown): boolean {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  return (body as Record<string, unknown>).confirmDiscardEdits === true;
}

function parseAssignee(value: string | undefined): "me" | "unassigned" | undefined {
  if (value === undefined) return undefined;
  if (value === "me" || value === "unassigned") return value;
  throw AppError.validation("Please correct the highlighted fields.", {
    assignee: "Choose me or unassigned.",
  });
}

function parseCategory(value: string): TicketCategory {
  if (!TICKET_CATEGORIES.includes(value as TicketCategory)) {
    throw AppError.validation("Please correct the highlighted fields.", {
      category: "Choose a known category.",
    });
  }
  return value as TicketCategory;
}

function parsePriority(value: string): TicketPriority {
  if (!TICKET_PRIORITIES.includes(value as TicketPriority)) {
    throw AppError.validation("Please correct the highlighted fields.", {
      priority: "Choose critical, high, medium, or low.",
    });
  }
  return value as TicketPriority;
}

function parsePatch(body: unknown): TicketPatch {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw missingPatch();
  }
  const record = body as Record<string, unknown>;
  const patch: TicketPatch = {};
  if (!("status" in record) && !("categoryOverride" in record) && !("priorityOverride" in record)) {
    throw missingPatch();
  }
  if ("status" in record) {
    if (typeof record.status !== "string") {
      throw AppError.validation("Please correct the highlighted fields.", {
        status: "Choose open, in_progress, resolved, or closed.",
      });
    }
    patch.status = parseTicketStatus(record.status);
  }
  if ("categoryOverride" in record) {
    patch.categoryOverride = parseNullableEnum(
      record.categoryOverride,
      "categoryOverride",
      TICKET_CATEGORIES,
      "Choose a known category.",
    );
  }
  if ("priorityOverride" in record) {
    patch.priorityOverride = parseNullableEnum(
      record.priorityOverride,
      "priorityOverride",
      TICKET_PRIORITIES,
      "Choose critical, high, medium, or low.",
    );
  }
  return patch;
}

function parseNullableEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  message: string,
): T | null {
  if (value === null) return null;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw AppError.validation("Please correct the highlighted fields.", {
      [field]: message,
    });
  }
  return value as T;
}

function parseMessageBody(body: unknown): string {
  const record =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const text = typeof record.body === "string" ? record.body.trim() : "";
  if (text.length < 1 || text.length > 10000) {
    throw AppError.validation("Please correct the highlighted fields.", {
      body: MESSAGE_BODY_MESSAGE,
    });
  }
  return text;
}

function missingPatch(): AppError {
  return AppError.validation("Please correct the highlighted fields.", {
    status: "Send a status, categoryOverride, or priorityOverride.",
  });
}
