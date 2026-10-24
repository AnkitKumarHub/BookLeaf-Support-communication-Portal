import { AppError } from "../shared/errors.js";

const REGENERATE_LIMIT = 5;
const REGENERATE_WINDOW_MS = 60 * 60 * 1000;

const accepts = new Map<string, number[]>();

export function assertDraftRegenerateLimit(ticketId: string) {
  const now = Date.now();
  const recent = (accepts.get(ticketId) ?? []).filter(
    (at) => now - at < REGENERATE_WINDOW_MS,
  );
  if (recent.length >= REGENERATE_LIMIT) {
    accepts.set(ticketId, recent);
    throw AppError.rateLimited();
  }
  recent.push(now);
  accepts.set(ticketId, recent);
}
