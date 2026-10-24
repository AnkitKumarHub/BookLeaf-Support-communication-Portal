import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  aiRuns,
  authors,
  books,
  ticketMessages,
  tickets,
} from "../../db/schema.js";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketPriority,
} from "../admin/admin.constants.js";
import { loadAiEnv } from "./ai-env.js";
import {
  buildDraftUserMessage,
  DRAFT_MAX_CHARS,
  DRAFT_PROMPT_VERSION,
  stripDraftText,
} from "./draft.js";
import {
  inngest,
  TICKET_CREATED_EVENT,
  TICKET_DRAFT_REQUESTED_EVENT,
} from "./inngest.js";
import {
  AiFailure,
  AiRetry,
  completeDraft,
  completeTriage,
  type AiErrorCode,
  type TokenUsage,
} from "./openai.js";
import { buildTriageUserMessage, fitRationale } from "./triage.js";
import { TRIAGE_PROMPT_VERSION } from "./triage.js";

type ClassifyLoad = {
  id: string;
  subject: string;
  description: string;
  aiState: "pending" | "processing" | "completed" | "failed";
  aiJobVersion: number;
  book: {
    title: string;
    status: string;
    isbn: string | null;
    publicationDate: string | null;
    royaltyPending: string | null;
    royaltyPaid: string | null;
    lastRoyaltyPayoutDate: string | null;
    availableOn: string[];
  } | null;
};

type DraftLoad = {
  id: string;
  subject: string;
  description: string;
  draftState: "none" | "pending" | "suggested" | "failed";
  draftEditedAt: string | null;
  effectiveCategory: string | null;
  authorName: string;
  bookTitle: string | null;
  bookStatus: string | null;
  isbn: string | null;
  publicationDate: string | null;
  mrp: string | null;
  royaltyPending: string | null;
  royaltyPaid: string | null;
  totalCopiesSold: number | null;
  lastRoyaltyPayoutDate: string | null;
  availableOn: string[] | null;
  publicReplies: string[];
};

export const classifyTicket = inngest.createFunction(
  {
    id: "classify-ticket",
    triggers: [{ event: TICKET_CREATED_EVENT }],
    retries: 3,
    idempotency: "'classify:' + event.data.ticketId + ':' + string(event.data.jobVersion)",
    onFailure: async ({ event, step }) => {
      const data = originalData(event);
      if (!data) return;
      await step.run("mark-classify-failed", () =>
        markClassifyFailed(data.ticketId, data.jobVersion),
      );
    },
  },
  async ({ event, step, attempt }) => {
    const ticketId = stringField(event.data, "ticketId");
    const jobVersion = numberField(event.data, "jobVersion");
    if (!ticketId || jobVersion === null) return { status: "invalid" };
    const loaded = await step.run("load-ticket", () => loadClassifyTicket(ticketId));
    if (!loaded || loaded.aiJobVersion !== jobVersion || loaded.aiState === "completed") {
      return { status: "skip" };
    }
    const claimed = await step.run("claim", () => claimClassify(ticketId, jobVersion));
    if (!claimed) return { status: "skip" };
    await step.run("classify", () =>
      runClassifyAttempt(loaded, jobVersion, attempt + 1),
    );
    return { status: "done" };
  },
);

export const draftTicket = inngest.createFunction(
  {
    id: "draft-ticket",
    triggers: [{ event: TICKET_DRAFT_REQUESTED_EVENT }],
    retries: 3,
    idempotency: "'draft:' + event.data.ticketId + ':' + event.data.requestedAt",
    onFailure: async ({ event, step }) => {
      const data = originalData(event);
      if (!data) return;
      await step.run("mark-draft-failed", () => markDraftFailed(data.ticketId));
    },
  },
  async ({ event, step, attempt }) => {
    const ticketId = stringField(event.data, "ticketId");
    const jobVersion = numberField(event.data, "jobVersion");
    if (!ticketId || jobVersion === null) return { status: "invalid" };
    const loaded = await step.run("load-ticket", () => loadDraftTicket(ticketId));
    if (!loaded || loaded.draftState !== "pending") return { status: "skip" };
    if (loaded.draftEditedAt) {
      await step.run("skip-edited", () =>
        recordDraftSkip(ticketId, jobVersion, attempt + 1),
      );
      return { status: "skipped_edited" };
    }
    await step.run("draft", () => runDraftAttempt(loaded, jobVersion, attempt + 1));
    return { status: "done" };
  },
);

export const aiFunctions = [classifyTicket, draftTicket];

async function loadClassifyTicket(ticketId: string): Promise<ClassifyLoad | null> {
  const [row] = await db
    .select({
      id: tickets.id,
      subject: tickets.subject,
      description: tickets.description,
      aiState: tickets.aiState,
      aiJobVersion: tickets.aiJobVersion,
      bookId: books.id,
      title: books.title,
      bookStatus: books.status,
      isbn: books.isbn,
      publicationDate: books.publicationDate,
      royaltyPending: books.royaltyPending,
      royaltyPaid: books.royaltyPaid,
      lastRoyaltyPayoutDate: books.lastRoyaltyPayoutDate,
      availableOn: books.availableOn,
    })
    .from(tickets)
    .leftJoin(books, eq(tickets.bookId, books.id))
    .where(eq(tickets.id, ticketId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    subject: row.subject,
    description: row.description,
    aiState: row.aiState,
    aiJobVersion: row.aiJobVersion,
    book: row.bookId
      ? {
          title: row.title ?? "",
          status: row.bookStatus ?? "",
          isbn: row.isbn,
          publicationDate: row.publicationDate,
          royaltyPending: row.royaltyPending,
          royaltyPaid: row.royaltyPaid,
          lastRoyaltyPayoutDate: row.lastRoyaltyPayoutDate,
          availableOn: row.availableOn ?? [],
        }
      : null,
  };
}

async function loadDraftTicket(ticketId: string): Promise<DraftLoad | null> {
  const [row] = await db
    .select({
      id: tickets.id,
      subject: tickets.subject,
      description: tickets.description,
      draftState: tickets.draftState,
      draftEditedAt: tickets.draftEditedAt,
      categoryOverride: tickets.categoryOverride,
      aiCategory: tickets.aiCategory,
      authorName: authors.name,
      bookId: books.id,
      title: books.title,
      bookStatus: books.status,
      isbn: books.isbn,
      publicationDate: books.publicationDate,
      mrp: books.mrp,
      royaltyPending: books.royaltyPending,
      royaltyPaid: books.royaltyPaid,
      totalCopiesSold: books.totalCopiesSold,
      lastRoyaltyPayoutDate: books.lastRoyaltyPayoutDate,
      availableOn: books.availableOn,
    })
    .from(tickets)
    .innerJoin(authors, eq(tickets.authorId, authors.id))
    .leftJoin(books, eq(tickets.bookId, books.id))
    .where(eq(tickets.id, ticketId))
    .limit(1);
  if (!row) return null;
  const replies = await db
    .select({ body: ticketMessages.body })
    .from(ticketMessages)
    .where(
      and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.visibility, "public")),
    )
    .orderBy(asc(ticketMessages.createdAt));
  return {
    id: row.id,
    subject: row.subject,
    description: row.description,
    draftState: row.draftState,
    draftEditedAt: row.draftEditedAt ? row.draftEditedAt.toISOString() : null,
    effectiveCategory: row.categoryOverride ?? row.aiCategory,
    authorName: row.authorName,
    bookTitle: row.bookId ? row.title : null,
    bookStatus: row.bookId ? row.bookStatus : null,
    isbn: row.bookId ? row.isbn : null,
    publicationDate: row.bookId ? row.publicationDate : null,
    mrp: row.bookId ? row.mrp : null,
    royaltyPending: row.bookId ? row.royaltyPending : null,
    royaltyPaid: row.bookId ? row.royaltyPaid : null,
    totalCopiesSold: row.bookId ? row.totalCopiesSold : null,
    lastRoyaltyPayoutDate: row.bookId ? row.lastRoyaltyPayoutDate : null,
    availableOn: row.bookId ? (row.availableOn ?? []) : null,
    publicReplies: replies.map((reply) => reply.body),
  };
}

async function claimClassify(ticketId: string, jobVersion: number): Promise<boolean> {
  const rows = await db
    .update(tickets)
    .set({ aiState: "processing", updatedAt: new Date() })
    .where(
      and(
        eq(tickets.id, ticketId),
        eq(tickets.aiJobVersion, jobVersion),
        inArray(tickets.aiState, ["pending", "processing"]),
      ),
    )
    .returning({ id: tickets.id });
  return rows.length > 0;
}

async function runClassifyAttempt(
  ticket: ClassifyLoad,
  jobVersion: number,
  attempt: number,
): Promise<{ status: "completed" | "failed" }> {
  const env = loadAiEnv();
  const runId = await insertRun({
    ticketId: ticket.id,
    taskType: "classify",
    attempt,
    model: env.model,
    promptVersion: TRIAGE_PROMPT_VERSION,
    jobVersion,
  });
  try {
    const result = await completeTriage({
      ticketId: ticket.id,
      user: buildTriageUserMessage({
        subject: ticket.subject,
        description: ticket.description,
        book: ticket.book,
        maxInputChars: env.maxInputChars,
      }),
    });
    const category = asCategory(result.category);
    const priority = asPriority(result.priority);
    const rationale = fitRationale(result.rationale);
    if (
      !category ||
      !priority ||
      !Number.isFinite(result.confidence) ||
      result.confidence < 0 ||
      result.confidence > 1 ||
      rationale.length < 1
    ) {
      await finishRun(runId, "failed", "invalid_output", result);
      await markClassifyFailed(ticket.id, jobVersion);
      throw new AiFailure("invalid_output");
    }
    await db
      .update(tickets)
      .set({
        aiCategory: category,
        aiPriority: priority,
        aiConfidence: result.confidence.toFixed(4),
        aiRationale: rationale,
        aiState: "completed",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tickets.id, ticket.id),
          eq(tickets.aiJobVersion, jobVersion),
          eq(tickets.aiState, "processing"),
        ),
      );
    await finishRun(runId, "completed", null, result);
    return { status: "completed" };
  } catch (err) {
    if (err instanceof AiFailure && err.errorCode === "invalid_output") throw err;
    const failure = err instanceof AiFailure || err instanceof AiRetry ? err : null;
    const errorCode: AiErrorCode = failure?.errorCode ?? "provider";
    const retriable = err instanceof AiRetry;
    await finishRun(runId, "failed", errorCode, null);
    if (!retriable) {
      await markClassifyFailed(ticket.id, jobVersion);
      throw err instanceof AiFailure ? err : new AiFailure(errorCode);
    }
    throw err instanceof AiRetry ? err : new AiRetry(errorCode);
  }
}

async function runDraftAttempt(
  ticket: DraftLoad,
  jobVersion: number,
  attempt: number,
): Promise<{ status: "suggested" | "failed" | "skipped_edited" }> {
  const env = loadAiEnv();
  const runId = await insertRun({
    ticketId: ticket.id,
    taskType: "draft",
    attempt,
    model: env.model,
    promptVersion: DRAFT_PROMPT_VERSION,
    jobVersion,
  });
  try {
    const result = await completeDraft({
      ticketId: ticket.id,
      user: buildDraftUserMessage({
        subject: ticket.subject,
        description: ticket.description,
        effectiveCategory: ticket.effectiveCategory,
        facts: {
          authorName: ticket.authorName,
          bookTitle: ticket.bookTitle,
          bookStatus: ticket.bookStatus,
          isbn: ticket.isbn,
          publicationDate: ticket.publicationDate,
          mrp: ticket.mrp,
          royaltyPending: ticket.royaltyPending,
          royaltyPaid: ticket.royaltyPaid,
          totalCopiesSold: ticket.totalCopiesSold,
          lastRoyaltyPayoutDate: ticket.lastRoyaltyPayoutDate,
          availableOn: ticket.availableOn,
        },
        publicReplies: ticket.publicReplies,
        maxInputChars: env.maxInputChars,
      }),
    });
    if (result.text.trim().length === 0 || result.text.length > DRAFT_MAX_CHARS) {
      await finishRun(runId, "failed", "invalid_output", result);
      await markDraftFailed(ticket.id);
      throw new AiFailure("invalid_output");
    }
    const body = stripDraftText(result.text);
    if (body.length === 0) {
      await finishRun(runId, "failed", "invalid_output", result);
      await markDraftFailed(ticket.id);
      throw new AiFailure("invalid_output");
    }
    const saved = await db
      .update(tickets)
      .set({
        draftBody: body,
        draftState: "suggested",
        draftPromptVersion: DRAFT_PROMPT_VERSION,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tickets.id, ticket.id),
          eq(tickets.draftState, "pending"),
          isNull(tickets.draftEditedAt),
        ),
      )
      .returning({ id: tickets.id });
    if (saved.length === 0) {
      const [current] = await db
        .select({ draftEditedAt: tickets.draftEditedAt })
        .from(tickets)
        .where(eq(tickets.id, ticket.id))
        .limit(1);
      const skipped = Boolean(current?.draftEditedAt);
      await finishRun(runId, "completed", skipped ? "skipped_edited" : null, result);
      return { status: skipped ? "skipped_edited" : "suggested" };
    }
    await finishRun(runId, "completed", null, result);
    return { status: "suggested" };
  } catch (err) {
    if (err instanceof AiFailure && err.errorCode === "invalid_output") throw err;
    const failure = err instanceof AiFailure || err instanceof AiRetry ? err : null;
    const errorCode: AiErrorCode = failure?.errorCode ?? "provider";
    const retriable = err instanceof AiRetry;
    await finishRun(runId, "failed", errorCode, null);
    if (!retriable) {
      await markDraftFailed(ticket.id);
      throw err instanceof AiFailure ? err : new AiFailure(errorCode);
    }
    throw err instanceof AiRetry ? err : new AiRetry(errorCode);
  }
}

async function recordDraftSkip(
  ticketId: string,
  jobVersion: number,
  attempt: number,
): Promise<void> {
  const env = loadAiEnv();
  const runId = await insertRun({
    ticketId,
    taskType: "draft",
    attempt,
    model: env.model,
    promptVersion: DRAFT_PROMPT_VERSION,
    jobVersion,
  });
  await finishRun(runId, "completed", "skipped_edited", null);
}

async function insertRun(input: {
  ticketId: string;
  taskType: "classify" | "draft";
  attempt: number;
  model: string;
  promptVersion: string;
  jobVersion: number;
}): Promise<string> {
  const [run] = await db
    .insert(aiRuns)
    .values({
      ticketId: input.ticketId,
      taskType: input.taskType,
      state: "processing",
      attempt: input.attempt,
      model: input.model,
      promptVersion: input.promptVersion,
      jobVersion: input.jobVersion,
      startedAt: new Date(),
    })
    .returning({ id: aiRuns.id });
  if (!run) throw new Error("ai run insert failed");
  return run.id;
}

async function finishRun(
  runId: string,
  state: "completed" | "failed",
  errorCode: AiErrorCode | "skipped_edited" | null,
  tokens: TokenUsage | null,
): Promise<void> {
  await db
    .update(aiRuns)
    .set({
      state,
      errorCode,
      inputTokens: tokens?.inputTokens ?? null,
      outputTokens: tokens?.outputTokens ?? null,
      completedAt: new Date(),
    })
    .where(eq(aiRuns.id, runId));
}

async function markClassifyFailed(ticketId: string, jobVersion: number): Promise<void> {
  await db
    .update(tickets)
    .set({ aiState: "failed", updatedAt: new Date() })
    .where(
      and(
        eq(tickets.id, ticketId),
        eq(tickets.aiJobVersion, jobVersion),
        inArray(tickets.aiState, ["pending", "processing"]),
      ),
    );
}

async function markDraftFailed(ticketId: string): Promise<void> {
  await db
    .update(tickets)
    .set({ draftState: "failed", updatedAt: new Date() })
    .where(and(eq(tickets.id, ticketId), eq(tickets.draftState, "pending")));
}

function asCategory(value: string): TicketCategory | null {
  return TICKET_CATEGORIES.includes(value as TicketCategory)
    ? (value as TicketCategory)
    : null;
}

function asPriority(value: string): TicketPriority | null {
  return TICKET_PRIORITIES.includes(value as TicketPriority)
    ? (value as TicketPriority)
    : null;
}

function originalData(event: {
  data: { event?: { data?: unknown } };
}): { ticketId: string; jobVersion: number } | null {
  const data = event.data.event?.data;
  if (!data || typeof data !== "object") return null;
  const ticketId = stringField(data, "ticketId");
  const jobVersion = numberField(data, "jobVersion");
  if (!ticketId || jobVersion === null) return null;
  return { ticketId, jobVersion };
}

function stringField(data: object, key: string): string {
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function numberField(data: object, key: string): number | null {
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
