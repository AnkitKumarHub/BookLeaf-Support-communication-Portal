import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { book } from "../../openapi/common.js";
import { defineRoutes } from "../../openapi/define-route.js";
import { getBookController, listBooksController } from "./books.controller.js";
import { bookParams, listBooksQuery } from "./books.schemas.js";

export function createBooksRouter(): ExpressRouter {
  const router = Router();
  const route = defineRoutes(router, { basePath: "/api/v1", tag: "Author" });

  route.get("/author/books", {
    summary: "My books",
    description: "Every book of the signed-in author, including books still in production. Money fields are decimal strings and null stays null.",
    access: "author",
    query: listBooksQuery,
    responses: { 200: { description: "One page of books.", schema: z.array(book), paged: true } },
    handler: listBooksController,
  });

  route.get("/author/books/:bookId", {
    summary: "One of my books",
    access: "author",
    params: bookParams,
    responses: {
      200: { description: "The book.", schema: book },
      404: "Missing, or another author's book (same body).",
    },
    handler: getBookController,
  });

  return router;
}
