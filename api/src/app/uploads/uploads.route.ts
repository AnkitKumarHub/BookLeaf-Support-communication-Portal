import { Router, type Router as ExpressRouter } from "express";
import { requireAuthor } from "../auth/auth.middleware.js";
import { receiveFileMiddleware, uploadAttachmentController } from "./uploads.controller.js";

export function createUploadsRouter(): ExpressRouter {
  const router = Router();
  // The author check runs before multer, so an unauthenticated request never
  // has its body read.
  router.post(
    "/author/tickets/:ticketId/attachments",
    requireAuthor,
    receiveFileMiddleware,
    uploadAttachmentController,
  );
  return router;
}
