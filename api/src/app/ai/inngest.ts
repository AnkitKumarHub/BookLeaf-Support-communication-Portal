import { Inngest } from "inngest";

export const TICKET_CREATED_EVENT = "bookleaf/ticket.created";
export const TICKET_DRAFT_REQUESTED_EVENT = "bookleaf/ticket.draft_requested";

export const inngest = new Inngest({ id: "bookleaf" });

export function ticketCreatedEvent(ticketId: string, jobVersion: number) {
  return {
    name: TICKET_CREATED_EVENT,
    data: { ticketId, jobVersion },
  };
}

export function ticketDraftRequestedEvent(
  ticketId: string,
  jobVersion: number,
  requestedAt: string,
) {
  return {
    name: TICKET_DRAFT_REQUESTED_EVENT,
    data: { ticketId, jobVersion, requestedAt },
  };
}
