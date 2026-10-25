import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { message } from "../../openapi/common.js";
import { defineRoutes } from "../../openapi/define-route.js";
import {
  addAdminNoteController,
  addAdminReplyController,
  assignAdminTicketController,
  getAdminTicketController,
  getAiRunController,
  listAdminTicketsController,
  patchAdminTicketController,
  regenerateDraftController,
  retryTriageController,
  saveDraftController,
  unassignAdminTicketController,
} from "./admin.controller.js";
import {
  adminTicketDetail,
  adminTicketParams,
  aiRun,
  aiRunParams,
  assignment,
  messageBody,
  patchedTicket,
  patchTicketBody,
  queueQuery,
  queueRow,
  regenerateBody,
  regenerateResult,
  retryResult,
  savedDraft,
} from "./admin.schemas.js";

const NOT_FOUND = "No ticket with this id.";

export function createAdminRouter(): ExpressRouter {
  const router = Router();
  const route = defineRoutes(router, { basePath: "/api/v1", tag: "Admin" });

  route.get("/admin/tickets", {
    summary: "Ticket queue",
    description:
      "All authors. Unresolved tickets (open and in progress) first, then resolved, then closed. Within each group: priority (Critical, High, unclassified, Medium, Low), then open before in progress, then oldest first. A ticket with no effective category or priority does not match a specific category or priority filter.",
    access: "admin",
    query: queueQuery,
    responses: { 200: { description: "One page of the queue.", schema: z.array(queueRow), paged: true } },
    handler: listAdminTicketsController,
  });

  route.get("/admin/tickets/:ticketId", {
    summary: "Ticket detail",
    description:
      "Everything the admin needs: AI suggestion, overrides, draft, replies, internal notes, attachments, and audit events. The first read after triage has finished starts the AI draft once (`draftState` none to pending).",
    access: "admin",
    params: adminTicketParams,
    responses: { 200: { description: "The ticket.", schema: adminTicketDetail }, 404: NOT_FOUND },
    handler: getAdminTicketController,
  });

  route.patch("/admin/tickets/:ticketId", {
    summary: "Change status or override AI",
    description:
      "Send at least one field. Allowed status moves: open to in_progress, resolved, or closed; in_progress to open, resolved, or closed; resolved to in_progress or closed; closed to in_progress. Sending the current status is a no-op 200.",
    access: "admin",
    params: adminTicketParams,
    body: patchTicketBody,
    responses: {
      200: { description: "Updated.", schema: patchedTicket },
      404: NOT_FOUND,
      409: "That status change is not allowed. `fields.status` lists the allowed moves.",
    },
    handler: patchAdminTicketController,
  });

  route.post("/admin/tickets/:ticketId/assign-to-me", {
    summary: "Assign to me",
    description: "Idempotent: assigning a ticket you already hold returns 200 and writes nothing.",
    access: "admin",
    params: adminTicketParams,
    responses: { 200: { description: "Assigned.", schema: assignment }, 404: NOT_FOUND },
    handler: assignAdminTicketController,
  });

  route.post("/admin/tickets/:ticketId/unassign", {
    summary: "Unassign",
    description: "Idempotent.",
    access: "admin",
    params: adminTicketParams,
    responses: { 200: { description: "Unassigned.", schema: assignment }, 404: NOT_FOUND },
    handler: unassignAdminTicketController,
  });

  route.post("/admin/tickets/:ticketId/notes", {
    summary: "Add an internal note",
    description: "Never shown to the author and never sent to the AI.",
    access: "admin",
    params: adminTicketParams,
    body: messageBody,
    responses: { 201: { description: "Saved.", schema: message }, 404: NOT_FOUND },
    handler: addAdminNoteController,
  });

  route.post("/admin/tickets/:ticketId/replies", {
    summary: "Send a reply to the author",
    description:
      "The only send action. Stores exactly the submitted body (never the stored draft). An open ticket moves to in progress.",
    access: "admin",
    params: adminTicketParams,
    body: messageBody,
    responses: { 201: { description: "Sent.", schema: message }, 404: NOT_FOUND },
    handler: addAdminReplyController,
  });

  route.post("/admin/tickets/:ticketId/retry-triage", {
    summary: "Retry AI classification",
    description: "Starts a new classification job. Keeps overrides and replies. Also recovers a ticket whose first job was never delivered.",
    access: "admin",
    params: adminTicketParams,
    responses: { 202: { description: "Queued.", schema: retryResult }, 404: NOT_FOUND },
    handler: retryTriageController,
  });

  route.patch("/admin/tickets/:ticketId/draft", {
    summary: "Save draft edits",
    description: "Stores composer text and marks the draft as edited. Does not notify the author. The web app does not use it.",
    access: "admin",
    params: adminTicketParams,
    body: messageBody,
    responses: { 200: { description: "Saved.", schema: savedDraft }, 404: NOT_FOUND },
    handler: saveDraftController,
  });

  route.post("/admin/tickets/:ticketId/draft", {
    summary: "Regenerate the AI draft",
    description: "Starts a new draft job. Never sends anything to the author.",
    access: "admin",
    params: adminTicketParams,
    body: regenerateBody,
    responses: {
      202: { description: "Queued.", schema: regenerateResult },
      404: NOT_FOUND,
      409: "The stored draft was edited; send `confirmDiscardEdits: true`.",
      429: "More than 5 regenerations of this ticket in an hour.",
    },
    handler: regenerateDraftController,
  });

  route.get("/admin/ai-runs/:runId", {
    summary: "One AI run",
    description: "Model, prompt version, token counts, and error code. Never includes the prompt, the provider response, or any key.",
    access: "admin",
    params: aiRunParams,
    responses: { 200: { description: "The run.", schema: aiRun }, 404: "No run with this id." },
    handler: getAiRunController,
  });

  return router;
}
