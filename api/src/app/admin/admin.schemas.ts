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

export const flagDraftBody = z.object({
  flagged: z.boolean({ error: "Use true or false." }).meta({ description: "true flags the current draft, false clears the flag." }),
});

export const flagResult = z.object({ draftFlagged: z.boolean() });

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
  draftFlagged: z.boolean().meta({ description: "An admin flagged the current AI draft as not good enough." }),
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

const period = <T extends z.ZodType>(value: T) => z.object({ today: value, week: value, all: value });
const tokenTotals = z.object({ inputTokens: z.number().int(), outputTokens: z.number().int(), costInr: z.number() });

export const adminStats = z.object({
  generatedAt: z.iso.datetime(),
  tickets: z.object({
    created: period(z.number().int()).meta({ description: "New tickets. Today and this week are India time; weeks start Monday." }),
    closed: period(z.number().int()).meta({ description: "Tickets moved to resolved or closed in the period; `all` is the current resolved + closed count." }),
    open: z.number().int().meta({ description: "Open and in progress now." }),
    total: z.number().int(),
    daily: z.array(z.object({ date: z.string().meta({ example: "2026-10-26" }), created: z.number().int() })).meta({ description: "New tickets per day for the last 14 days." }),
  }),
  ai: z.object({
    usdToInr: z.number().meta({ description: "Rate used for rupee costs (USD_TO_INR)." }),
    tokens: period(tokenTotals),
    byModel: z.array(
      z.object({
        model: z.string(),
        runs: z.number().int(),
        inputTokens: z.number().int(),
        outputTokens: z.number().int(),
        costInr: z.number().nullable().meta({ description: "Null when the model has no price in the API's price table." }),
        priced: z.boolean(),
      }),
    ),
    byTask: z.array(
      z.object({
        task: z.enum(["classify", "draft"]),
        runs: z.number().int(),
        inputTokens: z.number().int(),
        outputTokens: z.number().int(),
        costInr: z.number(),
      }),
    ),
    avgCostPerTicketInr: z.number().nullable(),
    unpricedModels: z.array(z.string()),
  }),
  quality: z.object({
    avgConfidence: z.number().nullable(),
    classified: z.number().int(),
    overridden: z.object({
      category: z.number().int(),
      priority: z.number().int(),
      either: z.number().int(),
      rate: z.number().nullable().meta({ description: "Share of AI-classified tickets where an admin changed the category or priority." }),
    }),
    drafts: z.object({ total: z.number().int(), flagged: z.number().int(), rate: z.number().nullable() }),
    recentFlagged: z.array(
      z.object({ ticketId: z.uuid(), publicId: z.string(), subject: z.string(), flaggedAt: z.iso.datetime() }),
    ),
  }),
});
