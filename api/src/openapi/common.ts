import { z } from "zod";

// Schemas shared by several modules. Request schemas carry the user-facing
// error message on each rule; the first failing rule becomes the 400 message.

export const uuid = (field: string) => z.guid({ error: `Enter a valid ${field}.` });

export const pageQuery = {
  page: z.coerce
    .number({ error: "Use a page of 1 or greater." })
    .int({ error: "Use a page of 1 or greater." })
    .min(1, { error: "Use a page of 1 or greater." })
    .default(1),
  limit: z.coerce
    .number({ error: "Use a limit between 1 and 100." })
    .int({ error: "Use a limit between 1 and 100." })
    .min(1, { error: "Use a limit between 1 and 100." })
    .max(100, { error: "Use a limit between 1 and 100." })
    .default(20),
};

export const ticketStatus = z.enum(["open", "in_progress", "resolved", "closed"], {
  error: "Choose open, in_progress, resolved, or closed.",
});

export const ticketCategory = z.enum(
  [
    "royalty_payments",
    "isbn_metadata",
    "printing_quality",
    "distribution_availability",
    "production_status",
    "general_inquiry",
  ],
  { error: "Choose a known category." },
);

export const ticketPriority = z.enum(["critical", "high", "medium", "low"], {
  error: "Choose critical, high, medium, or low.",
});

export const aiState = z.enum(["pending", "processing", "completed", "failed"]);
export const draftState = z.enum(["none", "pending", "suggested", "failed"]);

// Response shapes (documentation only; services own the real types).

export const pageMeta = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
});

export const book = z.object({
  id: z.uuid(),
  sourceId: z.string().meta({ example: "BK001" }),
  title: z.string(),
  isbn: z.string().nullable(),
  genre: z.string().nullable(),
  publicationDate: z.string().nullable().meta({ description: "YYYY-MM-DD" }),
  status: z.string().meta({ example: "Published & Live" }),
  mrp: z.string().nullable().meta({ description: "Decimal string, INR" }),
  royaltyPerCopy: z.string().nullable(),
  totalCopiesSold: z.number().int(),
  totalRoyaltyEarned: z.string().nullable(),
  royaltyPaid: z.string().nullable(),
  royaltyPending: z.string().nullable(),
  lastRoyaltyPayoutDate: z.string().nullable(),
  printPartner: z.string().nullable(),
  availableOn: z.array(z.string()),
});

export const message = z.object({
  id: z.uuid(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});

export const attachment = z.object({
  id: z.uuid(),
  name: z.string(),
  url: z.url(),
  mime: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  sizeBytes: z.number().int(),
});

export const errorEnvelope = z.object({
  error: z.object({
    code: z.string().meta({ example: "VALIDATION_ERROR" }),
    message: z.string().meta({ example: "Use between 5 and 160 characters." }),
    fields: z
      .record(z.string(), z.string())
      .optional()
      .meta({ description: "The field the message is about.", example: { subject: "Use between 5 and 160 characters." } }),
  }),
});
