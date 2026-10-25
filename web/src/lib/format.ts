import type { TicketCategory, TicketPriority, TicketStatus } from "./types";

export const EM_DASH = "—";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

// "3570.00" -> "₹3,570.00". Zero stays "₹0.00"; null is the caller's em dash.
export function formatMoney(value: string | number | null): string | null {
  if (value === null) return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? inr.format(amount) : null;
}

// Adds stored amounts in paise so decimals do not drift. Null counts as 0.
export function sumMoney(values: (string | null)[]): number {
  const paise = values.reduce((total, value) => total + Math.round(Number(value ?? 0) * 100), 0);
  return paise / 100;
}

const dateOnly = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

// SQL dates such as "2023-06-20" carry no time zone; format them as UTC so
// they never shift a day.
export function formatDate(value: string | null): string | null {
  return value ? dateOnly.format(new Date(`${value.slice(0, 10)}T00:00:00Z`)) : null;
}

export function formatDateTime(value: string): string {
  return dateTime.format(new Date(value));
}

// "just now", "5 min ago", "3 h ago", "4 d ago", then a date.
export function formatAge(value: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  return dateOnly.format(new Date(value));
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const TICKET_STATUSES = Object.keys(TICKET_STATUS_LABELS) as TicketStatus[];

export function isInProduction(bookStatus: string): boolean {
  return bookStatus.startsWith("In Production");
}

export const GENERAL_TICKET_LABEL = "General / Account Level";

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  royalty_payments: "Royalty & Payments",
  isbn_metadata: "ISBN & Metadata Issues",
  printing_quality: "Printing & Quality",
  distribution_availability: "Distribution & Availability",
  production_status: "Book Status & Production Updates",
  general_inquiry: "General Inquiry",
};

export const TICKET_CATEGORIES = Object.keys(CATEGORY_LABELS) as TicketCategory[];

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const TICKET_PRIORITIES = Object.keys(PRIORITY_LABELS) as TicketPriority[];

// Mirrors ALLOWED_TRANSITIONS in the API. The API still enforces it (409).
export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "resolved", "closed"],
  in_progress: ["open", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: ["in_progress"],
};

export function isUnresolved(status: TicketStatus): boolean {
  return status === "open" || status === "in_progress";
}

// Unresolved for longer than this is shown as overdue in the queue.
const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export function isOverdue(status: TicketStatus, createdAt: string, now = Date.now()): boolean {
  return isUnresolved(status) && now - new Date(createdAt).getTime() > STALE_AFTER_MS;
}

const inrPrecise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumSignificantDigits: 2 });

// AI costs are often fractions of a rupee: "₹0.031" reads better than "₹0.03".
export function formatCostInr(value: number | null): string | null {
  if (value === null) return null;
  return value > 0 && value < 1 ? inrPrecise.format(value) : inr.format(value);
}

export function formatPercent(value: number | null): string | null {
  return value === null ? null : `${Math.round(value * 100)}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-IN");
}
