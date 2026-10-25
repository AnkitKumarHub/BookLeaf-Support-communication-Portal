import type { AllowedMime } from "./uploads.constants.js";

// The declared MIME type comes from the client and cannot be trusted alone,
// so the first bytes of the file must match it too.
export function detectFileType(buffer: Buffer): AllowedMime | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (buffer.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  return null;
}

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  return buffer.length >= bytes.length && bytes.every((byte, i) => buffer[i] === byte);
}
