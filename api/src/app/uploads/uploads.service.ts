import { and, count, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { ticketAttachments, tickets } from "../../db/schema.js";
import { publishTicketChanged } from "../realtime/ticket-bus.js";
import { AppError } from "../shared/errors.js";
import { detectFileType } from "./file-type.js";
import { deleteFromImageKit, uploadsConfigured, uploadToImageKit } from "./imagekit.js";
import {
  ALLOWED_MIME_TYPES,
  FILE_COUNT_MESSAGE,
  FILE_TYPE_MESSAGE,
  MAX_FILES_PER_TICKET,
  type AllowedMime,
} from "./uploads.constants.js";

export type AttachmentJson = {
  id: string;
  name: string;
  url: string;
  mime: string;
  sizeBytes: number;
};

export type IncomingFile = {
  originalName: string;
  declaredMime: string;
  buffer: Buffer;
};

export async function addAttachment(input: {
  authorId: string;
  ticketId: string;
  file: IncomingFile;
}): Promise<AttachmentJson> {
  const mime = checkFileType(input.file);
  const name = displayName(input.file.originalName, mime);

  let uploadedFileId: string | null = null;
  try {
    const attachment = await db.transaction(async (tx) => {
      // Lock the ticket so two uploads at once cannot both pass the count check.
      const [ticket] = await tx
        .select({ id: tickets.id, status: tickets.status, publicId: tickets.publicId })
        .from(tickets)
        .where(and(eq(tickets.id, input.ticketId), eq(tickets.authorId, input.authorId)))
        .for("update")
        .limit(1);
      if (!ticket) throw AppError.notFound();
      if (ticket.status !== "open") {
        throw AppError.conflict("Attachments can only be added while the ticket is open.");
      }
      const [existing] = await tx
        .select({ total: count() })
        .from(ticketAttachments)
        .where(eq(ticketAttachments.ticketId, ticket.id));
      if (Number(existing?.total ?? 0) >= MAX_FILES_PER_TICKET) {
        throw AppError.conflict(FILE_COUNT_MESSAGE);
      }
      // After the ownership, status, and count checks, so those answers do not
      // depend on whether ImageKit is configured.
      if (!uploadsConfigured()) {
        throw new AppError(503, "UPLOADS_UNAVAILABLE", "File uploads are not available right now.");
      }

      let stored;
      try {
        stored = await uploadToImageKit({
          buffer: input.file.buffer,
          fileName: `${ticket.publicId}-${name}`,
          folder: `/bookleaf/tickets/${ticket.id}`,
        });
      } catch {
        console.error("imagekit upload failed", { ticketId: ticket.id });
        throw new AppError(502, "UPLOAD_FAILED", "The file could not be uploaded. Your ticket is saved; try again.");
      }
      uploadedFileId = stored.fileId;

      const [row] = await tx
        .insert(ticketAttachments)
        .values({
          ticketId: ticket.id,
          imagekitFileId: stored.fileId,
          url: stored.url,
          name,
          sizeBytes: input.file.buffer.length,
          mime,
        })
        .returning({
          id: ticketAttachments.id,
          name: ticketAttachments.name,
          url: ticketAttachments.url,
          mime: ticketAttachments.mime,
          sizeBytes: ticketAttachments.sizeBytes,
        });
      if (!row) throw AppError.internal();
      return row;
    });
    publishTicketChanged({ ticketId: input.ticketId, authorId: input.authorId, audience: "admin" });
    return attachment;
  } catch (err) {
    // The file reached ImageKit but the row was not saved: remove the orphan.
    if (uploadedFileId) await deleteFromImageKit(uploadedFileId);
    throw err;
  }
}

function checkFileType(file: IncomingFile): AllowedMime {
  const declared = file.declaredMime.toLowerCase();
  const detected = detectFileType(file.buffer);
  if (!ALLOWED_MIME_TYPES.includes(declared as AllowedMime) || detected !== declared) {
    throw AppError.validation("Please correct the highlighted fields.", { file: FILE_TYPE_MESSAGE });
  }
  return detected;
}

const EXTENSIONS: Record<AllowedMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

// Keeps a readable name, drops path parts and unsafe characters, and makes the
// extension match the checked type.
function displayName(originalName: string, mime: AllowedMime): string {
  const base = originalName.split(/[\\/]/).pop() ?? "";
  const stem = base
    .replace(/\.[^.]*$/, "")
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .slice(0, 80);
  return `${stem || "attachment"}.${EXTENSIONS[mime]}`;
}
