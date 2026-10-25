import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import type { z } from "zod";
import type { ValidRequest } from "../../openapi/define-route.js";
import type { ticketParams } from "../tickets/tickets.schemas.js";
import { requestAuthor } from "../auth/auth.middleware.js";
import { sendData } from "../shared/envelope.js";
import { AppError } from "../shared/errors.js";
import { FILE_SIZE_MESSAGE, MAX_FILE_BYTES } from "./uploads.constants.js";
import { addAttachment } from "./uploads.service.js";

// Memory storage only: the buffer goes straight to ImageKit and nothing is
// written to disk.
const receiveFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
}).single("file");

// Runs multer and turns its errors into the API's error envelope.
export function receiveFileMiddleware(req: Request, res: Response, next: NextFunction) {
  receiveFile(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(AppError.payloadTooLarge(FILE_SIZE_MESSAGE));
        return;
      }
      next(AppError.validation("Send one file in the file field.", { file: "Send one file in the file field." }));
      return;
    }
    next(err);
  });
}

export async function uploadAttachmentController(
  req: ValidRequest<{ params: z.output<typeof ticketParams> }>,
  res: Response,
) {
  const { authorId } = requestAuthor(req);
  if (!req.file) {
    throw AppError.validation("Choose a file to attach.", { file: "Choose a file to attach." });
  }
  const attachment = await addAttachment({
    authorId,
    ticketId: req.valid.params.ticketId,
    file: {
      originalName: req.file.originalname,
      declaredMime: req.file.mimetype,
      buffer: req.file.buffer,
    },
  });
  sendData(res, attachment, 201);
}
