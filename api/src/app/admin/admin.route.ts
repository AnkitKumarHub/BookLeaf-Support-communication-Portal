import { Router, type Router as ExpressRouter } from "express";
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
import { requireAdmin } from "./admin.middleware.js";

export function createAdminRouter(): ExpressRouter {
  const router = Router();
  router.get("/admin/tickets", requireAdmin, listAdminTicketsController);
  router.get("/admin/tickets/:ticketId", requireAdmin, getAdminTicketController);
  router.patch("/admin/tickets/:ticketId", requireAdmin, patchAdminTicketController);
  router.post(
    "/admin/tickets/:ticketId/assign-to-me",
    requireAdmin,
    assignAdminTicketController,
  );
  router.post(
    "/admin/tickets/:ticketId/unassign",
    requireAdmin,
    unassignAdminTicketController,
  );
  router.post("/admin/tickets/:ticketId/notes", requireAdmin, addAdminNoteController);
  router.post("/admin/tickets/:ticketId/replies", requireAdmin, addAdminReplyController);
  router.post("/admin/tickets/:ticketId/retry-triage", requireAdmin, retryTriageController);
  router.patch("/admin/tickets/:ticketId/draft", requireAdmin, saveDraftController);
  router.post("/admin/tickets/:ticketId/draft", requireAdmin, regenerateDraftController);
  router.get("/admin/ai-runs/:runId", requireAdmin, getAiRunController);
  return router;
}
