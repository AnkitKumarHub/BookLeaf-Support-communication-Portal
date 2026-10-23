import type { Response } from "express";

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
};

export function sendData<T>(
  res: Response,
  data: T,
  status = 200,
  meta?: PaginationMeta,
) {
  const body: { data: T; meta?: PaginationMeta } = { data };
  if (meta) {
    body.meta = meta;
  }
  return res.status(status).json(body);
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
) {
  const error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  } = { code, message };
  if (fields && Object.keys(fields).length > 0) {
    error.fields = fields;
  }
  return res.status(statusCode).json({ error });
}
