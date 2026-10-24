import type { Application } from "express";
import { createBooksRouter } from "./books.route.js";

export function mountBooksRoutes(app: Application) {
  app.use("/api/v1", createBooksRouter());
}
