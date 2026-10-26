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
  aiConfidence: string | null;
  draftState: DraftState;
  // An admin marked the current AI draft as not good enough.
  draftFlagged: boolean;
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
  aiRationale: string | null;
  draftBody: string | null;
  draftEditedAt: string | null;
  replies: TicketReply[];
  notes: AdminNote[];
  attachments: TicketAttachment[];
  events: AdminEvent[];
};

type Periods<T> = { today: T; week: T; all: T };
type TokenTotals = { inputTokens: number; outputTokens: number; costInr: number };

export type AdminStats = {
  generatedAt: string;
  tickets: {
    created: Periods<number>;
    closed: Periods<number>;
    open: number;
    total: number;
    daily: { date: string; created: number }[];
  };
  ai: {
    usdToInr: number;
    tokens: Periods<TokenTotals>;
    byModel: { model: string; runs: number; inputTokens: number; outputTokens: number; costInr: number | null; priced: boolean }[];
    byTask: { task: "classify" | "draft"; runs: number; inputTokens: number; outputTokens: number; costInr: number }[];
    avgCostPerTicketInr: number | null;
    unpricedModels: string[];
  };
  quality: {
    avgConfidence: number | null;
    classified: number;
    overridden: { category: number; priority: number; either: number; rate: number | null };
    drafts: { total: number; flagged: number; rate: number | null };
    recentFlagged: { ticketId: string; publicId: string; subject: string; flaggedAt: string }[];
  };
};
