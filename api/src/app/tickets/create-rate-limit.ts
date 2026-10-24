import { AppError } from "../shared/errors.js";
import {
  TICKET_CREATE_LIMIT,
  TICKET_CREATE_WINDOW_MS,
} from "./tickets.constants.js";

const attempts = new Map<string, number[]>();

export function assertCreateRateLimit(authorId: string) {
  const now = Date.now();
  const recent = (attempts.get(authorId) ?? []).filter(
    (at) => now - at < TICKET_CREATE_WINDOW_MS,
  );
  if (recent.length >= TICKET_CREATE_LIMIT) {
    throw AppError.rateLimited();
  }
  recent.push(now);
  attempts.set(authorId, recent);
}
