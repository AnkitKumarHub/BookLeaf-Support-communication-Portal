import type { Request, Response } from "express";
import { AppError } from "../shared/errors.js";
import { subscribeTicketChanged, type TicketChanged } from "./ticket-bus.js";

const HEARTBEAT_MS = 25_000;

function canSee(
  auth: NonNullable<Request["auth"]>,
  event: TicketChanged,
): boolean {
  if (auth.role === "admin") return true;
  return event.audience === "all" && event.authorId === auth.authorId;
}

export function streamController(req: Request, res: Response) {
  const auth = req.auth;
  if (!auth) {
    throw AppError.unauthenticated("Authentication required.");
  }

  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const unsubscribe = subscribeTicketChanged((event) => {
    if (!canSee(auth, event)) return;
    res.write(`event: ticket\ndata: ${JSON.stringify({ ticketId: event.ticketId })}\n\n`);
  });

  // Keeps idle proxies from closing the connection.
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, HEARTBEAT_MS);

  // A stream never outlives its access token; the client refreshes and reconnects.
  const expiry = setTimeout(
    () => res.end(),
    Math.max(0, auth.expiresAt.getTime() - Date.now()),
  );

  req.on("close", () => {
    unsubscribe();
    clearInterval(heartbeat);
    clearTimeout(expiry);
  });
}
