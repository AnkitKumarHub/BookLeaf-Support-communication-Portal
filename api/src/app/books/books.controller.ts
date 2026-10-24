import type { Request, Response } from "express";
import { requestAuthor } from "../auth/auth.middleware.js";
import { AppError } from "../shared/errors.js";
import { isUuid } from "../shared/ids.js";
import { sendData } from "../shared/envelope.js";
import { optionalFilter, parsePagination } from "../shared/pagination.js";
import { getBook, listBooks } from "./books.service.js";

export async function listBooksController(req: Request, res: Response) {
  const { authorId } = requestAuthor(req);
  const page = parsePagination({
    page: req.query.page,
    limit: req.query.limit,
  });
  const status = optionalFilter(req.query.status, "status");
  const q = optionalFilter(req.query.q, "q");
  const result = await listBooks({
    authorId,
    page: page.page,
    limit: page.limit,
    status,
    q,
  });
  sendData(res, result.rows, 200, {
    page: page.page,
    limit: page.limit,
    total: result.total,
  });
}

export async function getBookController(req: Request, res: Response) {
  const { authorId } = requestAuthor(req);
  const bookId = req.params.bookId;
  if (typeof bookId !== "string" || !isUuid(bookId)) {
    throw AppError.notFound();
  }
  const book = await getBook(authorId, bookId);
  sendData(res, book);
}
