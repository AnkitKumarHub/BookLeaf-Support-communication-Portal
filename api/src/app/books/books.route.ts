import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { book } from "../../openapi/common.js";
import { defineRoutes } from "../../openapi/define-route.js";
import { selfServiceEnabled } from "../shared/flags.js";
import { addBookController, getBookController, listBooksController } from "./books.controller.js";
import { addBookBody, bookParams, listBooksQuery } from "./books.schemas.js";

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

  if (selfServiceEnabled()) {
    route.post("/author/books", {
      summary: "Add a book (demo)",
      description:
        "Demo only, enabled by `DEMO_SELF_SERVICE=true`. In production BookLeaf owns the catalogue; this lets a test author create books to raise tickets about. Money is a number in rupees and is stored with two decimals; blank optional fields are stored as null.",
      access: "author",
      body: addBookBody,
      responses: { 201: { description: "Created.", schema: book } },
      handler: addBookController,
    });
  }

  return router;
}
