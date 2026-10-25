import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { requestAuthor } from "../auth/auth.middleware.js";
import { sendData } from "../shared/envelope.js";
import { AppError } from "../shared/errors.js";
import { isUuid } from "../shared/ids.js";
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
      next(AppError.validation("Please correct the highlighted fields.", { file: "Send one file in the file field." }));
      return;
    }
    next(err);
  });
}

export async function uploadAttachmentController(req: Request, res: Response) {
  const { authorId } = requestAuthor(req);
  const ticketId = req.params.ticketId;
  if (typeof ticketId !== "string" || !isUuid(ticketId)) throw AppError.notFound();
  if (!req.file) {
    throw AppError.validation("Please correct the highlighted fields.", { file: "Choose a file to attach." });
  }
  const attachment = await addAttachment({
    authorId,
    ticketId,
    file: {
      originalName: req.file.originalname,
      declaredMime: req.file.mimetype,
      buffer: req.file.buffer,
    },
  });
  sendData(res, attachment, 201);
}
