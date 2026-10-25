import { z } from "zod";
import { pageQuery, uuid } from "../../openapi/common.js";

export const listBooksQuery = z.object({
  status: z.string({ error: "Enter a single text value." }).trim().optional().meta({
    description: "Exact status text, for example `Published & Live`. Omit for every status.",
  }),
  q: z.string({ error: "Enter a single text value." }).trim().optional().meta({ description: "Title contains." }),
  ...pageQuery,
});

export const bookParams = z.object({ bookId: uuid("book id") });

const money = (field: string) =>
  z
    .number({ error: `Enter ${field} as a number.` })
    .min(0, { error: `${field} cannot be negative.` })
    .max(100_000_000, { error: `${field} is too large.` })
    .nullable()
    .optional();

const optionalText = (max: number) => z.string().trim().max(max, { error: `Use at most ${max} characters.` }).optional();

// Demo self-service: an author adds a book with every catalogue field.
// Blank optional fields are stored as null, the same as the seed data.
export const addBookBody = z.object({
  title: z.string({ error: "Enter a title." }).trim().min(1, { error: "Enter a title." }).max(200, { error: "Use at most 200 characters." }),
  status: z
    .string({ error: "Enter a status." })
    .trim()
    .min(1, { error: "Enter a status." })
    .max(80, { error: "Use at most 80 characters." })
    .meta({ example: "Published & Live" }),
  isbn: optionalText(40),
  genre: optionalText(80),
  publicationDate: z.iso.date({ error: "Use a date as YYYY-MM-DD." }).nullable().optional(),
  mrp: money("MRP"),
  royaltyPerCopy: money("Royalty per copy"),
  totalCopiesSold: z
    .number({ error: "Enter copies sold as a whole number." })
    .int({ error: "Enter copies sold as a whole number." })
    .min(0, { error: "Copies sold cannot be negative." })
    .default(0),
  totalRoyaltyEarned: money("Royalty earned"),
  royaltyPaid: money("Royalty paid"),
  royaltyPending: money("Royalty pending"),
  lastRoyaltyPayoutDate: z.iso.date({ error: "Use a date as YYYY-MM-DD." }).nullable().optional(),
  printPartner: optionalText(80),
  availableOn: z.array(z.string().trim().min(1).max(60)).max(10, { error: "List at most 10 stores." }).default([]),
});
