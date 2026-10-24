import { Router, type Router as ExpressRouter } from "express";
import { getBookController, listBooksController } from "./books.controller.js";
import { requireAuthor } from "./books.middleware.js";

export function createBooksRouter(): ExpressRouter {
  const router = Router();
  router.get("/author/books", requireAuthor, listBooksController);
  router.get("/author/books/:bookId", requireAuthor, getBookController);
  return router;
}
