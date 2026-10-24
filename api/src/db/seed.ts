import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { loadSeedEnv } from "../env.js";
import { closeDb, db } from "./index.js";
import { admins, authors, books, users } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.resolve(
  __dirname,
  "../../../FULLSTACK-SAMPLEDATA (1) (1) (1).json",
);

type SampleBook = {
  book_id: string;
  title: string;
  isbn: string | null;
  genre: string | null;
  publication_date: string | null;
  status: string;
  mrp: number | null;
  author_royalty_per_copy: number | null;
  total_copies_sold: number;
  total_royalty_earned: number | null;
  royalty_paid: number | null;
  royalty_pending: number | null;
  last_royalty_payout_date: string | null;
  print_partner: string | null;
  available_on: string[];
};

type SampleAuthor = {
  author_id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  joined_date: string | null;
  books: SampleBook[];
};

type SampleFile = {
  authors: SampleAuthor[];
};

function money(value: number | null): string | null {
  if (value === null) return null;
  return value.toFixed(2);
}

async function main() {
  loadSeedEnv();
  const authorPasswordHash = await bcrypt.hash(
    process.env.SEED_AUTHOR_PASSWORD!,
    12,
  );
  const adminPasswordHash = await bcrypt.hash(
    process.env.SEED_ADMIN_PASSWORD!,
    12,
  );

  const raw = await readFile(SAMPLE_PATH, "utf8");
  const data = JSON.parse(raw) as SampleFile;

  for (const row of data.authors) {
    const [author] = await db
      .insert(authors)
      .values({
        sourceId: row.author_id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        city: row.city,
        joinedDate: row.joined_date,
      })
      .onConflictDoUpdate({
        target: authors.sourceId,
        set: {
          name: row.name,
          email: row.email,
          phone: row.phone,
          city: row.city,
          joinedDate: row.joined_date,
        },
      })
      .returning();

    if (!author) {
      throw new Error(`Failed to upsert author ${row.author_id}`);
    }
    const authorId = author.id;

    for (const book of row.books) {
      await db
        .insert(books)
        .values({
          sourceId: book.book_id,
          authorId,
          title: book.title,
          isbn: book.isbn,
          genre: book.genre,
          publicationDate: book.publication_date,
          status: book.status,
          mrp: money(book.mrp),
          royaltyPerCopy: money(book.author_royalty_per_copy),
          totalCopiesSold: book.total_copies_sold ?? 0,
          totalRoyaltyEarned: money(book.total_royalty_earned),
          royaltyPaid: money(book.royalty_paid),
          royaltyPending: money(book.royalty_pending),
          lastRoyaltyPayoutDate: book.last_royalty_payout_date,
          printPartner: book.print_partner,
          availableOn: book.available_on ?? [],
        })
        .onConflictDoUpdate({
          target: books.sourceId,
          set: {
            authorId,
            title: book.title,
            isbn: book.isbn,
            genre: book.genre,
            publicationDate: book.publication_date,
            status: book.status,
            mrp: money(book.mrp),
            royaltyPerCopy: money(book.author_royalty_per_copy),
            totalCopiesSold: book.total_copies_sold ?? 0,
            totalRoyaltyEarned: money(book.total_royalty_earned),
            royaltyPaid: money(book.royalty_paid),
            royaltyPending: money(book.royalty_pending),
            lastRoyaltyPayoutDate: book.last_royalty_payout_date,
            printPartner: book.print_partner,
            availableOn: book.available_on ?? [],
          },
        });
    }

    const email = row.email.trim().toLowerCase();
    await db
      .insert(users)
      .values({
        email,
        passwordHash: authorPasswordHash,
        role: "author",
        authorId,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          passwordHash: authorPasswordHash,
          role: "author",
          authorId,
        },
      });
  }

  const adminEmail = "admin@bookleaf.dev";
  const [existingAdmin] = await db
    .select({ adminId: users.adminId })
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);

  let adminProfileId = existingAdmin?.adminId ?? null;
  if (adminProfileId) {
    await db
      .update(admins)
      .set({ name: "BookLeaf Admin" })
      .where(eq(admins.id, adminProfileId));
  } else {
    const [profile] = await db
      .insert(admins)
      .values({ name: "BookLeaf Admin" })
      .returning({ id: admins.id });
    if (!profile) {
      throw new Error("Failed to insert admin profile");
    }
    adminProfileId = profile.id;
  }

  await db
    .insert(users)
    .values({
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: "admin",
      authorId: null,
      adminId: adminProfileId,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        passwordHash: adminPasswordHash,
        role: "admin",
        authorId: null,
        adminId: adminProfileId,
      },
    });

  const authorCount = (await db.select({ n: count() }).from(authors))[0]?.n ?? 0;
  const bookCount = (await db.select({ n: count() }).from(books))[0]?.n ?? 0;
  const userCount = (await db.select({ n: count() }).from(users))[0]?.n ?? 0;
  const adminCount =
    (await db.select({ n: count() }).from(users).where(eq(users.role, "admin")))[0]
      ?.n ?? 0;

  console.log(
    `Seed complete: authors=${authorCount}, books=${bookCount}, users=${userCount}, admins=${adminCount}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
