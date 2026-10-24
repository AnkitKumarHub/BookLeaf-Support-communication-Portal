import { EventEmitter } from "node:events";

export type TicketAudience = "all" | "admin";

export type TicketChanged = {
  ticketId: string;
  authorId: string;
  // "admin" changes (notes, overrides, AI results) are not sent to the author.
  audience: TicketAudience;
};

const TICKET_CHANGED = "ticket.changed";

// In-process only: a second API instance would not see these events.
// The production upgrade is Postgres LISTEN/NOTIFY behind the same two functions.
const bus = new EventEmitter();
bus.setMaxListeners(0);

// Call only after the transaction has committed.
export function publishTicketChanged(event: TicketChanged): void {
  bus.emit(TICKET_CHANGED, event);
}

export function subscribeTicketChanged(
  listener: (event: TicketChanged) => void,
): () => void {
  bus.on(TICKET_CHANGED, listener);
  return () => {
    bus.off(TICKET_CHANGED, listener);
  };
}
