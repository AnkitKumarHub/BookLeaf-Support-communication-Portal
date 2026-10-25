export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_FILES_PER_TICKET = 2;

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

export const FILE_TYPE_MESSAGE = "Attach a JPEG, PNG, WebP, or PDF file.";
export const FILE_SIZE_MESSAGE = "Each file must be 2 MB or smaller.";
export const FILE_COUNT_MESSAGE = "A ticket can have at most 2 attachments.";
