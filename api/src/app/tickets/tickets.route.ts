import { Router, type Router as ExpressRouter } from "express";
import {
  createTicketController,
  getTicketController,
  listTicketsController,
} from "./tickets.controller.js";
import { requireAuthor } from "./tickets.middleware.js";

export function createTicketsRouter(): ExpressRouter {
  const router = Router();
  router.get("/author/tickets", requireAuthor, listTicketsController);
  router.post("/author/tickets", requireAuthor, createTicketController);
  router.get("/author/tickets/:ticketId", requireAuthor, getTicketController);
  return router;
}
