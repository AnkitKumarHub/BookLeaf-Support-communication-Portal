import type { Response } from "express";
import type { z } from "zod";
import type { ValidRequest } from "../../openapi/define-route.js";
import { requestAuthor } from "../auth/auth.middleware.js";
import { sendData } from "../shared/envelope.js";
import type { addBookBody, bookParams, listBooksQuery } from "./books.schemas.js";
import { addBook, getBook, listBooks } from "./books.service.js";

export async function listBooksController(
  req: ValidRequest<{ query: z.output<typeof listBooksQuery> }>,
  res: Response,
) {
  const { authorId } = requestAuthor(req);
  const { page, limit, status, q } = req.valid.query;
  const result = await listBooks({ authorId, page, limit, status: status || undefined, q: q || undefined });
  sendData(res, result.rows, 200, { page, limit, total: result.total });
}

export async function getBookController(
  req: ValidRequest<{ params: z.output<typeof bookParams> }>,
  res: Response,
) {
  const { authorId } = requestAuthor(req);
  sendData(res, await getBook(authorId, req.valid.params.bookId));
}

export async function addBookController(
  req: ValidRequest<{ body: z.output<typeof addBookBody> }>,
  res: Response,
) {
  const { authorId } = requestAuthor(req);
  sendData(res, await addBook(authorId, req.valid.body), 201);
}
