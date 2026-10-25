// SWR keys shared by several author screens, so they share one cached request.
// An author has a handful of books and tickets, so one page of 100 is all of them.
export const AUTHOR_BOOKS_KEY = "/author/books?limit=100";
export const AUTHOR_TICKETS_KEY = "/author/tickets?limit=100";

export function authorTicketKey(ticketId: string): string {
  return `/author/tickets/${ticketId}`;
}

export function adminTicketKey(ticketId: string): string {
  return `/admin/tickets/${ticketId}`;
}

export const ADMIN_STATS_KEY = "/admin/stats";
