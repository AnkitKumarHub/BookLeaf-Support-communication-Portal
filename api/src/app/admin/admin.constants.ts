import type { TicketStatus } from "../tickets/tickets.service.js";

export const TICKET_CATEGORIES = [
  "royalty_payments",
  "isbn_metadata",
  "printing_quality",
  "distribution_availability",
  "production_status",
  "general_inquiry",
] as const;

export const TICKET_PRIORITIES = ["critical", "high", "medium", "low"] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "resolved", "closed"],
  in_progress: ["open", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: ["in_progress"],
};

export const MESSAGE_BODY_MESSAGE = "Use between 1 and 10000 characters.";
