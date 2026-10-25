import { z } from "zod";
import {
  aiState,
  attachment,
  book,
  draftState,
  message,
  pageQuery,
  ticketCategory,
  ticketPriority,
  ticketStatus,
  uuid,
} from "../../openapi/common.js";
import { MESSAGE_BODY_MESSAGE } from "./admin.constants.js";

const DATE_MESSAGE = "Use a date as YYYY-MM-DD.";

export const queueQuery = z
  .object({
    status: ticketStatus.optional(),
    category: ticketCategory.optional().meta({ description: "Effective category (override, else AI)." }),
    priority: ticketPriority.optional().meta({ description: "Effective priority (override, else AI)." }),
    assignee: z.enum(["me", "unassigned"], { error: "Choose me or unassigned." }).optional(),
    from: z.iso.date({ error: DATE_MESSAGE }).optional().meta({ description: "Created on or after, YYYY-MM-DD (UTC)." }),
    to: z.iso.date({ error: DATE_MESSAGE }).optional().meta({ description: "Created on or before, YYYY-MM-DD (UTC)." }),
    q: z
      .string({ error: "Enter a single text value." })
      .trim()
      .optional()
      .meta({ description: "Public id, subject, author name, or author email contains." }),
    ...pageQuery,
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    error: "Use a from date on or before to.",
    path: ["from"],
  });

export const adminTicketParams = z.object({ ticketId: uuid("ticket id") });
export const aiRunParams = z.object({ runId: uuid("run id") });

export const patchTicketBody = z
  .object({
    status: ticketStatus.optional(),
    categoryOverride: ticketCategory.nullable().optional().meta({ description: "null clears the override." }),
    priorityOverride: ticketPriority.nullable().optional().meta({ description: "null clears the override." }),
  })
  .refine(
    (body) => body.status !== undefined || body.categoryOverride !== undefined || body.priorityOverride !== undefined,
    { error: "Send a status, categoryOverride, or priorityOverride.", path: ["status"] },
  );

export const messageBody = z.object({
  body: z
    .string({ error: MESSAGE_BODY_MESSAGE })
    .trim()
    .min(1, { error: MESSAGE_BODY_MESSAGE })
    .max(10_000, { error: MESSAGE_BODY_MESSAGE }),
});

export const regenerateBody = z.object({
  confirmDiscardEdits: z
    .boolean({ error: "Use true or false." })
    .optional()
    .meta({ description: "Required as true when the stored draft was edited." }),
});

// Response shapes (documentation only).

export const queueRow = z.object({
  id: z.uuid(),
  publicId: z.string(),
  subject: z.string(),
  authorName: z.string(),
  authorEmail: z.email(),
  bookTitle: z.string().nullable().meta({ description: "Null for General / Account Level." }),
  status: ticketStatus,
  aiCategory: ticketCategory.nullable(),
  categoryOverride: ticketCategory.nullable(),
  effectiveCategory: ticketCategory.nullable(),
  aiPriority: ticketPriority.nullable(),
  priorityOverride: ticketPriority.nullable(),
  effectivePriority: ticketPriority.nullable().meta({ description: "Null means AI pending or AI unavailable." }),
  aiState,
  draftState,
  assigneeName: z.string().nullable(),
  assignedToMe: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const adminTicketDetail = queueRow.extend({
  description: z.string(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  book: book.nullable(),
  aiConfidence: z.string().nullable().meta({ description: "Decimal string from 0 to 1." }),
  aiRationale: z.string().nullable(),
  draftBody: z.string().nullable(),
  draftEditedAt: z.iso.datetime().nullable(),
  replies: z.array(message),
  notes: z.array(message.extend({ authorName: z.string() })),
  attachments: z.array(attachment),
  events: z.array(
    z.object({ id: z.number().int(), eventType: z.string(), payload: z.unknown(), createdAt: z.iso.datetime() }),
  ),
});

export const patchedTicket = z.object({
  id: z.uuid(),
  status: ticketStatus,
  categoryOverride: ticketCategory.nullable(),
  priorityOverride: ticketPriority.nullable(),
  effectiveCategory: ticketCategory.nullable(),
  effectivePriority: ticketPriority.nullable(),
  updatedAt: z.iso.datetime(),
});

export const assignment = z.object({
  id: z.uuid(),
  assigneeName: z.string().nullable(),
  assignedToMe: z.boolean(),
});

export const retryResult = z.object({ aiState: z.literal("pending"), aiJobVersion: z.number().int() });
export const regenerateResult = z.object({ draftState: z.literal("pending") });
export const savedDraft = z.object({ body: z.string(), draftState, draftEditedAt: z.iso.datetime() });

export const aiRun = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  taskType: z.enum(["classify", "draft"]),
  state: z.string(),
  attempt: z.number().int(),
  model: z.string().meta({ example: "gpt-4o-mini" }),
  promptVersion: z.string().meta({ example: "triage-v2" }),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});
