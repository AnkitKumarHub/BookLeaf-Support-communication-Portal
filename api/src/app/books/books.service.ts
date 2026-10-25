import { randomUUID } from "node:crypto";
import { and, asc, count, eq, sql, type SQL } from "drizzle-orm";
import { books } from "../../db/schema.js";
import { db } from "../../db/index.js";
import { AppError } from "../shared/errors.js";
import { likePattern } from "../shared/like.js";

export type BookJson = {
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

type BookRow = {
  id: string;
  sourceId: string;
  title: string;
  isbn: string | null;
  genre: string | null;
  publicationDate: string | Date | null;
  status: string;
  mrp: string | null;
  royaltyPerCopy: string | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: string | null;
  royaltyPaid: string | null;
  royaltyPending: string | null;
  lastRoyaltyPayoutDate: string | Date | null;
  printPartner: string | null;
  availableOn: string[] | null;
};

const bookColumns = {
  id: books.id,
  sourceId: books.sourceId,
  title: books.title,
  isbn: books.isbn,
  genre: books.genre,
  publicationDate: books.publicationDate,
  status: books.status,
  mrp: books.mrp,
  royaltyPerCopy: books.royaltyPerCopy,
  totalCopiesSold: books.totalCopiesSold,
  totalRoyaltyEarned: books.totalRoyaltyEarned,
  royaltyPaid: books.royaltyPaid,
  royaltyPending: books.royaltyPending,
  lastRoyaltyPayoutDate: books.lastRoyaltyPayoutDate,
  printPartner: books.printPartner,
  availableOn: books.availableOn,
};

export function toBookJson(row: BookRow): BookJson {
  return {
    id: row.id,
    sourceId: row.sourceId,
    title: row.title,
    isbn: row.isbn,
    genre: row.genre,
    publicationDate: formatDate(row.publicationDate),
    status: row.status,
    mrp: formatMoney(row.mrp),
    royaltyPerCopy: formatMoney(row.royaltyPerCopy),
    totalCopiesSold: row.totalCopiesSold,
    totalRoyaltyEarned: formatMoney(row.totalRoyaltyEarned),
    royaltyPaid: formatMoney(row.royaltyPaid),
    royaltyPending: formatMoney(row.royaltyPending),
    lastRoyaltyPayoutDate: formatDate(row.lastRoyaltyPayoutDate),
    printPartner: row.printPartner,
    availableOn: row.availableOn ?? [],
  };
}

export async function listBooks(input: {
  authorId: string;
  page: number;
  limit: number;
  status?: string | undefined;
  q?: string | undefined;
}): Promise<{ rows: BookJson[]; total: number }> {
  const where = bookFilters(input.authorId, input.status, input.q);
  const [counted] = await db
    .select({ total: count() })
    .from(books)
    .where(where);
  const rows = await db
    .select(bookColumns)
    .from(books)
    .where(where)
    .orderBy(asc(books.title), asc(books.sourceId))
    .limit(input.limit)
    .offset((input.page - 1) * input.limit);

  return {
    rows: rows.map((row) => toBookJson(row)),
    total: asCount(counted?.total),
  };
}

export async function getBook(authorId: string, bookId: string): Promise<BookJson> {
  const [row] = await db
    .select(bookColumns)
    .from(books)
    .where(and(eq(books.authorId, authorId), eq(books.id, bookId)))
    .limit(1);
  if (!row) throw AppError.notFound();
  return toBookJson(row);
}

export async function authorOwnsBook(
  authorId: string,
  bookId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: books.id })
    .from(books)
    .where(and(eq(books.authorId, authorId), eq(books.id, bookId)))
    .limit(1);
  return Boolean(row);
}

function bookFilters(
  authorId: string,
  status: string | undefined,
  q: string | undefined,
): SQL | undefined {
  const conditions: SQL[] = [eq(books.authorId, authorId)];
  if (status) conditions.push(eq(books.status, status));
  if (q) {
    const pattern = likePattern(q);
    conditions.push(
      sql`(${books.title} ILIKE ${pattern} ESCAPE '\\' OR ${books.isbn} ILIKE ${pattern} ESCAPE '\\' OR ${books.sourceId} ILIKE ${pattern} ESCAPE '\\')`,
    );
  }
  return and(...conditions);
}

function formatMoney(value: string | null): string | null {
  if (value === null) return null;
  const negative = value.startsWith("-");
  const raw = negative ? value.slice(1) : value;
  const [whole, frac = ""] = raw.split(".");
  if (!whole || !/^\d+$/.test(whole) || (frac !== "" && !/^\d+$/.test(frac))) {
    return value;
  }
  return `${negative ? "-" : ""}${whole}.${(frac + "00").slice(0, 2)}`;
}

function formatDate(value: string | Date | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value;
}

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return 0;
}

function moneyText(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toFixed(2);
}

// Demo self-service only (DEMO_SELF_SERVICE=true).
export async function addBook(
  authorId: string,
  input: {
    title: string;
    status: string;
    isbn?: string | undefined;
    genre?: string | undefined;
    publicationDate?: string | null | undefined;
    mrp?: number | null | undefined;
    royaltyPerCopy?: number | null | undefined;
    totalCopiesSold: number;
    totalRoyaltyEarned?: number | null | undefined;
    royaltyPaid?: number | null | undefined;
    royaltyPending?: number | null | undefined;
    lastRoyaltyPayoutDate?: string | null | undefined;
    printPartner?: string | undefined;
    availableOn: string[];
  },
): Promise<BookJson> {
  const [row] = await db
    .insert(books)
    .values({
      sourceId: `BK-U${randomUUID().slice(0, 6).toUpperCase()}`,
      authorId,
      title: input.title,
      status: input.status,
      isbn: input.isbn || null,
      genre: input.genre || null,
      publicationDate: input.publicationDate ?? null,
      mrp: moneyText(input.mrp),
      royaltyPerCopy: moneyText(input.royaltyPerCopy),
      totalCopiesSold: input.totalCopiesSold,
      totalRoyaltyEarned: moneyText(input.totalRoyaltyEarned),
      royaltyPaid: moneyText(input.royaltyPaid),
      royaltyPending: moneyText(input.royaltyPending),
      lastRoyaltyPayoutDate: input.lastRoyaltyPayoutDate ?? null,
      printPartner: input.printPartner || null,
      availableOn: input.availableOn,
    })
    .returning(bookColumns);
  if (!row) throw AppError.internal();
  return toBookJson(row);
}
