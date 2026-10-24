import type { Application } from "express";
import { createTicketsRouter } from "./tickets.route.js";

export function mountTicketsRoutes(app: Application) {
  app.use("/api/v1", createTicketsRouter());
}
