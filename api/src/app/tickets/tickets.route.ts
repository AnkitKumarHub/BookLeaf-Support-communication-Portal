import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { defineRoutes } from "../../openapi/define-route.js";
import { createTicketController, getTicketController, listTicketsController } from "./tickets.controller.js";
import {
  authorTicketDetail,
  authorTicketRow,
  createdTicket,
  createTicketBody,
  listTicketsQuery,
  ticketParams,
} from "./tickets.schemas.js";

export function createTicketsRouter(): ExpressRouter {
  const router = Router();
  const route = defineRoutes(router, { basePath: "/api/v1", tag: "Author" });

  route.get("/author/tickets", {
    summary: "My tickets",
    description: "Newest update first. Rows omit the description, replies, and attachments, and add `replyCount`.",
    access: "author",
    query: listTicketsQuery,
    responses: { 200: { description: "One page of tickets.", schema: z.array(authorTicketRow), paged: true } },
    handler: listTicketsController,
  });

  route.post("/author/tickets", {
    summary: "Raise a ticket",
    description:
      "Saves the ticket and returns 201 before any AI work. Classification runs afterwards in the background, so this works even when OpenAI or Inngest is down.",
    access: "author",
    body: createTicketBody,
    responses: {
      201: { description: "Created.", schema: createdTicket },
      404: "The book is missing or belongs to another author.",
      429: "More than 20 tickets in an hour.",
    },
    handler: createTicketController,
  });

  route.get("/author/tickets/:ticketId", {
    summary: "One of my tickets",
    description: "Includes public replies and attachments. Never includes internal notes or AI fields.",
    access: "author",
    params: ticketParams,
    responses: {
      200: { description: "The ticket.", schema: authorTicketDetail },
      404: "Missing, or another author's ticket (same body).",
    },
    handler: getTicketController,
  });

  return router;
}
