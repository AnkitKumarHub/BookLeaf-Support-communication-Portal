// Response shapes from the API (see docs/api.md). Money is a decimal string.

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type Book = {
  id: string;
  sourceId: string;
  title: string;
  isbn: string | null;
  genre: string | null;
  publicationDate: string | null;
  status: string;
  mrp: string | null;
  royaltyPerCopy: string | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: string | null;
  royaltyPaid: string | null;
  royaltyPending: string | null;
  lastRoyaltyPayoutDate: string | null;
  printPartner: string | null;
  availableOn: string[];
};

export type AuthorTicketRow = {
  id: string;
  publicId: string;
  status: TicketStatus;
  subject: string;
  book: Book | null;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
};

export type TicketReply = { id: string; body: string; createdAt: string };

export type TicketAttachment = {
  id: string;
  name: string;
  url: string;
  mime: string;
  sizeBytes: number;
};

export type AuthorTicketDetail = Omit<AuthorTicketRow, "replyCount"> & {
  description: string;
  replies: TicketReply[];
  attachments: TicketAttachment[];
};

export type CreatedTicket = {
  id: string;
  publicId: string;
  status: "open";
  aiState: "pending";
  bookId: string | null;
  subject: string;
  createdAt: string;
};

export type TicketCategory =
  | "royalty_payments"
  | "isbn_metadata"
  | "printing_quality"
  | "distribution_availability"
  | "production_status"
  | "general_inquiry";

export type TicketPriority = "critical" | "high" | "medium" | "low";

export type AiState = "pending" | "processing" | "completed" | "failed";
export type DraftState = "none" | "pending" | "suggested" | "failed";

export type AdminQueueRow = {
  id: string;
  publicId: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  bookTitle: string | null;
  status: TicketStatus;
  aiCategory: TicketCategory | null;
  categoryOverride: TicketCategory | null;
  effectiveCategory: TicketCategory | null;
  aiPriority: TicketPriority | null;
  priorityOverride: TicketPriority | null;
  effectivePriority: TicketPriority | null;
  aiState: AiState;
  draftState: DraftState;
  assigneeName: string | null;
  assignedToMe: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminNote = { id: string; body: string; createdAt: string; authorName: string };

export type AdminEvent = { id: number; eventType: string; payload: unknown; createdAt: string };

export type AdminTicketDetail = AdminQueueRow & {
  description: string;
  phone: string | null;
  city: string | null;
  book: Book | null;
  aiConfidence: string | null;
  aiRationale: string | null;
  draftBody: string | null;
  draftEditedAt: string | null;
  replies: TicketReply[];
  notes: AdminNote[];
  attachments: TicketAttachment[];
  events: AdminEvent[];
};
