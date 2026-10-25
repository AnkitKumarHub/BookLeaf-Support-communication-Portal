import { api, toApiError, type Envelope } from "./api";
import type { TicketAttachment } from "./types";

// Same rules the API enforces; checking here gives instant feedback.
export const MAX_FILES = 2;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const ACCEPT_ATTRIBUTE = ".jpg,.jpeg,.png,.webp,.pdf";

export function checkFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Use a JPEG, PNG, WebP, or PDF file.";
  if (file.size > MAX_FILE_BYTES) return "Each file must be 2 MB or smaller.";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type UploadResult = { file: File; error: string | null };

// One request per file, one after another, so the API's 2-file cap is checked in order.
export async function uploadFiles(ticketId: string, files: File[]): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  for (const file of files) {
    const body = new FormData();
    body.append("file", file);
    try {
      await api.post<Envelope<TicketAttachment>>(`/author/tickets/${ticketId}/attachments`, body);
      results.push({ file, error: null });
    } catch (err) {
      const apiError = toApiError(err);
      results.push({ file, error: apiError.fields.file ?? apiError.message });
    }
  }
  return results;
}
