import type { ErrorRequestHandler, Request, Response } from "express";
import { AppError } from "./errors.js";
import { sendError } from "./envelope.js";

export function notFoundHandler(_req: Request, res: Response) {
  return sendError(res, 404, "NOT_FOUND", "Not found.");
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message, err.fields);
    return;
  }

  console.error(err);
  sendError(
    res,
    500,
    "INTERNAL",
    "Something went wrong. Please try again later.",
  );
};
