import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { aiRuns, admins, ticketEvents, ticketMessages, tickets, users } from "../../db/schema.js";
import { inngest, ticketCreatedEvent, ticketDraftRequestedEvent } from "../ai/inngest.js";
import { assertDraftRegenerateLimit } from "./draft-rate-limit.js";
import { AppError } from "../shared/errors.js";
import type { TicketStatus } from "../tickets/tickets.service.js";
import {
  ALLOWED_TRANSITIONS,
  type TicketCategory,
  type TicketPriority,
} from "./admin.constants.js";
import { publishTicketChanged, type TicketChanged } from "../realtime/ticket-bus.js";

export type TicketPatch = {
  status?: TicketStatus;
  categoryOverride?: TicketCategory | null;
  priorityOverride?: TicketPriority | null;
};

export type PatchedTicketJson = {
  id: string;
  status: TicketStatus;
  categoryOverride: TicketCategory | null;
  priorityOverride: TicketPriority | null;
  effectiveCategory: TicketCategory | null;
  effectivePriority: TicketPriority | null;
  updatedAt: string;
};

export type AssignmentJson = {
  id: string;
  assigneeName: string | null;
  assignedToMe: boolean;
};

export type MessageJson = {
  id: string;
  body: string;
  createdAt: string;
};

export async function patchTicket(
  userId: string,
  ticketId: string,
  patch: TicketPatch,
): Promise<PatchedTicketJson> {
  let changed: TicketChanged | null = null;
  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: tickets.id,
        authorId: tickets.authorId,
        status: tickets.status,
        aiCategory: tickets.aiCategory,
        categoryOverride: tickets.categoryOverride,
        aiPriority: tickets.aiPriority,
        priorityOverride: tickets.priorityOverride,
        updatedAt: tickets.updatedAt,
      })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);
    if (!current) throw AppError.notFound();

    const now = new Date();
    const values: {
      status?: TicketStatus;
      categoryOverride?: TicketCategory | null;
      priorityOverride?: TicketPriority | null;
      resolvedAt?: Date | null;
      updatedAt?: Date;
    } = {};
    const events: { eventType: string; payload: Record<string, unknown> }[] = [];

    if (patch.status !== undefined && patch.status !== current.status) {
      const allowed = ALLOWED_TRANSITIONS[current.status];
      if (!allowed.includes(patch.status)) {
        throw AppError.conflict("That status change is not allowed.", {
          status: `Choose ${allowed.join(", ")}.`,
        });
      }
      values.status = patch.status;
      if (patch.status === "resolved") {
        values.resolvedAt = now;
      } else if (
        current.status === "resolved" &&
        (patch.status === "open" || patch.status === "in_progress")
      ) {
        values.resolvedAt = null;
      }
      events.push({
        eventType: "ticket.status_changed",
        payload: { from: current.status, to: patch.status },
      });
    }
    if (
      patch.categoryOverride !== undefined &&
      patch.categoryOverride !== current.categoryOverride
    ) {
      values.categoryOverride = patch.categoryOverride;
      events.push({
        eventType: "ticket.category_override_changed",
        payload: { from: current.categoryOverride, to: patch.categoryOverride },
      });
    }
    if (
      patch.priorityOverride !== undefined &&
      patch.priorityOverride !== current.priorityOverride
    ) {
      values.priorityOverride = patch.priorityOverride;
      events.push({
        eventType: "ticket.priority_override_changed",
        payload: { from: current.priorityOverride, to: patch.priorityOverride },
      });
    }

    let updatedAt = current.updatedAt;
    if (Object.keys(values).length > 0) {
      values.updatedAt = now;
      updatedAt = now;
      await tx.update(tickets).set(values).where(eq(tickets.id, ticketId));
      if (events.length > 0) {
        await tx.insert(ticketEvents).values(
          events.map((event) => ({
            ticketId,
            actorUserId: userId,
            eventType: event.eventType,
            payload: event.payload,
          })),
        );
      }
      changed = {
        ticketId,
        authorId: current.authorId,
        audience: values.status ? "all" : "admin",
      };
    }

    const categoryOverride =
      values.categoryOverride !== undefined
        ? values.categoryOverride
        : current.categoryOverride;
    const priorityOverride =
      values.priorityOverride !== undefined
        ? values.priorityOverride
        : current.priorityOverride;
    return {
      id: current.id,
      status: values.status ?? current.status,
      categoryOverride,
      priorityOverride,
      effectiveCategory: categoryOverride ?? current.aiCategory,
      effectivePriority: priorityOverride ?? current.aiPriority,
      updatedAt: updatedAt.toISOString(),
    };
  });
  if (changed) publishTicketChanged(changed);
  return result;
}

export async function assignTicket(
  userId: string,
  ticketId: string,
): Promise<AssignmentJson> {
  const name = await adminName(userId);
  let changed: TicketChanged | null = null;
  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ assignedAdminId: tickets.assignedAdminId, authorId: tickets.authorId })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .for("update")
      .limit(1);
    if (!current) throw AppError.notFound();
    if (current.assignedAdminId === userId) {
      return { id: ticketId, assigneeName: name, assignedToMe: true };
    }
    const updated = await tx
      .update(tickets)
      .set({ assignedAdminId: userId, updatedAt: new Date() })
      .where(
        and(
          eq(tickets.id, ticketId),
          sql`${tickets.assignedAdminId} is distinct from ${userId}`,
        ),
      )
      .returning({ id: tickets.id });
    if (updated.length === 0) {
      return { id: ticketId, assigneeName: name, assignedToMe: true };
    }
    await tx.insert(ticketEvents).values({
      ticketId,
      actorUserId: userId,
      eventType: "ticket.assigned",
      payload: { from: current.assignedAdminId, to: userId },
    });
    changed = { ticketId, authorId: current.authorId, audience: "admin" };
    return { id: ticketId, assigneeName: name, assignedToMe: true };
  });
  if (changed) publishTicketChanged(changed);
  return result;
}

export async function unassignTicket(
  userId: string,
  ticketId: string,
): Promise<AssignmentJson> {
  let changed: TicketChanged | null = null;
  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ assignedAdminId: tickets.assignedAdminId, authorId: tickets.authorId })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .for("update")
      .limit(1);
    if (!current) throw AppError.notFound();
    if (!current.assignedAdminId) {
      return { id: ticketId, assigneeName: null, assignedToMe: false };
    }
    await tx
      .update(tickets)
      .set({ assignedAdminId: null, updatedAt: new Date() })
      .where(eq(tickets.id, ticketId));
    await tx.insert(ticketEvents).values({
      ticketId,
      actorUserId: userId,
      eventType: "ticket.unassigned",
      payload: { from: current.assignedAdminId, to: null },
    });
    changed = { ticketId, authorId: current.authorId, audience: "admin" };
    return { id: ticketId, assigneeName: null, assignedToMe: false };
  });
  if (changed) publishTicketChanged(changed);
  return result;
}

export async function addNote(
  userId: string,
  ticketId: string,
  body: string,
): Promise<MessageJson> {
  let authorId = "";
  const result = await db.transaction(async (tx) => {
    authorId = await assertTicket(tx, ticketId);
    const [note] = await tx
      .insert(ticketMessages)
      .values({
        ticketId,
        authorUserId: userId,
        body,
        visibility: "internal",
      })
      .returning({
        id: ticketMessages.id,
        body: ticketMessages.body,
        createdAt: ticketMessages.createdAt,
      });
    if (!note) throw AppError.internal();
    await tx.insert(ticketEvents).values({
      ticketId,
      actorUserId: userId,
      eventType: "ticket.note_added",
      payload: {},
    });
    return {
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
    };
  });
  publishTicketChanged({ ticketId, authorId, audience: "admin" });
  return result;
}

export async function addReply(
  userId: string,
  ticketId: string,
  body: string,
): Promise<MessageJson> {
  let authorId = "";
  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ status: tickets.status, authorId: tickets.authorId })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);
    if (!current) throw AppError.notFound();
    authorId = current.authorId;

    const now = new Date();
    const [reply] = await tx
      .insert(ticketMessages)
      .values({
        ticketId,
        authorUserId: userId,
        body,
        visibility: "public",
      })
      .returning({
        id: ticketMessages.id,
        body: ticketMessages.body,
        createdAt: ticketMessages.createdAt,
      });
    if (!reply) throw AppError.internal();

    const moved = current.status === "open";
    await tx
      .update(tickets)
      .set({
        updatedAt: now,
        ...(moved ? { status: "in_progress" as const } : {}),
      })
      .where(eq(tickets.id, ticketId));

    await tx.insert(ticketEvents).values({
      ticketId,
      actorUserId: userId,
      eventType: "ticket.replied",
      payload: {},
    });
    if (moved) {
      await tx.insert(ticketEvents).values({
        ticketId,
        actorUserId: userId,
        eventType: "ticket.status_changed",
        payload: { from: "open", to: "in_progress" },
      });
    }
    return {
      id: reply.id,
      body: reply.body,
      createdAt: reply.createdAt.toISOString(),
    };
  });
  publishTicketChanged({ ticketId, authorId, audience: "all" });
  return result;
}

export async function retryTriage(ticketId: string): Promise<{
  aiState: "pending";
  aiJobVersion: number;
}> {
  const [updated] = await db
    .update(tickets)
    .set({
      aiJobVersion: sql`${tickets.aiJobVersion} + 1`,
      aiState: "pending",
      updatedAt: new Date(),
    })
    .where(eq(tickets.id, ticketId))
    .returning({ aiJobVersion: tickets.aiJobVersion, authorId: tickets.authorId });
  if (!updated) throw AppError.notFound();
  publishTicketChanged({ ticketId, authorId: updated.authorId, audience: "admin" });
  try {
    await inngest.send(ticketCreatedEvent(ticketId, updated.aiJobVersion));
  } catch {
    console.error("ticket.created send failed", { ticketId });
  }
  return { aiState: "pending", aiJobVersion: updated.aiJobVersion };
}

export async function saveDraft(
  ticketId: string,
  body: string,
): Promise<{ body: string; draftState: string; draftEditedAt: string }> {
  const now = new Date();
  const [updated] = await db
    .update(tickets)
    .set({ draftBody: body, draftEditedAt: now, updatedAt: now })
    .where(eq(tickets.id, ticketId))
    .returning({
      draftBody: tickets.draftBody,
      draftState: tickets.draftState,
      draftEditedAt: tickets.draftEditedAt,
    });
  if (!updated || !updated.draftBody || !updated.draftEditedAt) throw AppError.notFound();
  return {
    body: updated.draftBody,
    draftState: updated.draftState,
    draftEditedAt: updated.draftEditedAt.toISOString(),
  };
}

export async function regenerateDraft(
  ticketId: string,
  confirmDiscardEdits: boolean,
): Promise<{ draftState: "pending" }> {
  const [current] = await db
    .select({
      id: tickets.id,
      draftEditedAt: tickets.draftEditedAt,
      aiJobVersion: tickets.aiJobVersion,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);
  if (!current) throw AppError.notFound();
  if (current.draftEditedAt && !confirmDiscardEdits) {
    throw AppError.conflict("Confirm discarding edits before regenerating.");
  }
  assertDraftRegenerateLimit(ticketId);
  const now = new Date();
  const [updated] = await db
    .update(tickets)
    .set({
      draftState: "pending",
      draftEditedAt: null,
      updatedAt: now,
    })
    .where(eq(tickets.id, ticketId))
    .returning({
      aiJobVersion: tickets.aiJobVersion,
      updatedAt: tickets.updatedAt,
      authorId: tickets.authorId,
    });
  if (!updated) throw AppError.notFound();
  publishTicketChanged({ ticketId, authorId: updated.authorId, audience: "admin" });
  try {
    await inngest.send(
      ticketDraftRequestedEvent(ticketId, updated.aiJobVersion, updated.updatedAt.toISOString()),
    );
  } catch {
    console.error("ticket.draft_requested send failed", { ticketId });
  }
  return { draftState: "pending" };
}

export async function getAiRun(runId: string) {
  const [run] = await db
    .select({
      id: aiRuns.id,
      ticketId: aiRuns.ticketId,
      taskType: aiRuns.taskType,
      state: aiRuns.state,
      attempt: aiRuns.attempt,
      model: aiRuns.model,
      promptVersion: aiRuns.promptVersion,
      inputTokens: aiRuns.inputTokens,
      outputTokens: aiRuns.outputTokens,
      errorCode: aiRuns.errorCode,
      startedAt: aiRuns.startedAt,
      completedAt: aiRuns.completedAt,
    })
    .from(aiRuns)
    .where(eq(aiRuns.id, runId))
    .limit(1);
  if (!run) throw AppError.notFound();
  return {
    id: run.id,
    ticketId: run.ticketId,
    taskType: run.taskType,
    state: run.state,
    attempt: run.attempt,
    model: run.model,
    promptVersion: run.promptVersion,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    errorCode: run.errorCode,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
  };
}

async function adminName(userId: string): Promise<string> {
  const [row] = await db
    .select({ name: admins.name })
    .from(users)
    .innerJoin(admins, eq(users.adminId, admins.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw AppError.forbidden();
  return row.name;
}

async function assertTicket(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ticketId: string,
): Promise<string> {
  const [row] = await tx
    .select({ authorId: tickets.authorId })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);
  if (!row) throw AppError.notFound();
  return row.authorId;
}
