import { Router, type Router as ExpressRouter } from "express";
import { attachment } from "../../openapi/common.js";
import { defineRoutes } from "../../openapi/define-route.js";
import { ticketParams } from "../tickets/tickets.schemas.js";
import { receiveFileMiddleware, uploadAttachmentController } from "./uploads.controller.js";

export function createUploadsRouter(): ExpressRouter {
  const router = Router();
  const route = defineRoutes(router, { basePath: "/api/v1", tag: "Author" });

  route.post("/author/tickets/:ticketId/attachments", {
    summary: "Attach a file to my ticket",
    description:
      "One file per request in the `file` field: JPEG, PNG, WebP, or PDF, 2 MB at most. The file's first bytes must match its type. At most 2 files per ticket, and only while the ticket is open. The file is stored in ImageKit; nothing is written to the API's disk.",
    access: "author",
    // Runs after the author check, so an unauthenticated request never has its body read.
    middlewares: [receiveFileMiddleware],
    params: ticketParams,
    fileField: "file",
    responses: {
      201: { description: "Stored.", schema: attachment },
      404: "Missing, or another author's ticket (same body).",
      409: "The ticket already has 2 attachments, or is not open.",
      413: "The file is over 2 MB.",
      502: "ImageKit rejected the file. The ticket is unaffected.",
      503: "Uploads are not configured on this server.",
    },
    handler: uploadAttachmentController,
  });

  return router;
}
