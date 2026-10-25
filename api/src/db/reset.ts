import "dotenv/config";
import { getTableName, sql } from "drizzle-orm";
import { deleteUploadFolder, UPLOAD_ROOT_FOLDER } from "../app/uploads/imagekit.js";
import { closeDb, db } from "./index.js";
import {
  admins,
  aiRuns,
  authors,
  books,
  refreshTokens,
  ticketAttachments,
  ticketEvents,
  ticketMessages,
  tickets,
  users,
} from "./schema.js";
import { seedSampleData } from "./seed.js";

// `pnpm db:reset`: empties every table, restarts the ticket number at BL-1001,
// deletes uploaded files from ImageKit, then seeds the company's sample data.
// The database ends up exactly like a fresh install.
//
//   --yes         required for any database that is not on localhost, or when NODE_ENV=production
//   --keep-files  leave uploaded attachments in ImageKit (by default the /bookleaf folder is deleted)

const ALL_TABLES = [
  ticketAttachments,
  ticketMessages,
  ticketEvents,
  aiRuns,
  refreshTokens,
  tickets,
  users,
  books,
  authors,
  admins,
];

async function main() {
  const args = new Set(process.argv.slice(2));
  const url = new URL(process.env.DATABASE_URL ?? "");
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  console.log(`Database: ${url.hostname}${url.pathname}`);

  if ((!local || process.env.NODE_ENV === "production") && !args.has("--yes")) {
    console.error(
      "Refusing to wipe a non-local or production database without --yes.\n" +
        "Run: pnpm db:reset --yes",
    );
    process.exitCode = 1;
    return;
  }

  const names = ALL_TABLES.map((table) => `"${getTableName(table)}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));
  await db.execute(sql.raw("ALTER SEQUENCE ticket_public_id_seq RESTART WITH 1001"));
  console.log(`Emptied ${ALL_TABLES.length} tables; the next ticket is BL-1001.`);

  if (args.has("--keep-files")) {
    console.log("Kept ImageKit files (--keep-files).");
  } else {
    const result = await deleteUploadFolder();
    const message = {
      deleted: `Deleted ImageKit folder ${UPLOAD_ROOT_FOLDER}.`,
      empty: `ImageKit folder ${UPLOAD_ROOT_FOLDER} was already empty.`,
      "not-configured": "ImageKit keys not set; no files to delete.",
    }[result];
    console.log(message);
  }

  await seedSampleData();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
