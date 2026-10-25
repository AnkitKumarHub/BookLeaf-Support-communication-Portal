import { Router, type Router as ExpressRouter } from "express";
import { defineRoutes } from "../../openapi/define-route.js";
import { streamController } from "./realtime.controller.js";

export function createRealtimeRouter(): ExpressRouter {
  const router = Router();
  const route = defineRoutes(router, { basePath: "/api/v1", tag: "Realtime" });

  route.get("/stream", {
    summary: "Live ticket updates (Server-Sent Events)",
    description: [
      "One connection per browser tab. Each `ticket` event says only which ticket changed; refetch it over REST.",
      "An admin receives every ticket. An author receives replies and status changes on their own tickets.",
      "A `: ping` comment arrives every 25 seconds. The server ends the stream when the access token expires; refresh the session and reconnect.",
    ].join("\n\n"),
    access: "user",
    responses: {
      200: {
        description: "Event stream.",
        contentType: "text/event-stream",
        example: 'event: ticket\ndata: {"ticketId":"91dda60a-3ca0-4811-a9bc-ea09dd11e5eb"}\n\n: ping\n',
      },
    },
    handler: streamController,
  });

  return router;
}
