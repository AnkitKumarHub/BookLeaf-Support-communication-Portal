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
