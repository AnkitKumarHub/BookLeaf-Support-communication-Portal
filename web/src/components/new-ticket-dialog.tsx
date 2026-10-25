"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Modal } from "@/components/modal";
import { buttonClass, ErrorState, Field, inputClass, primaryButtonClass } from "@/components/ui";
import { api, toApiError, type ApiError, type Envelope } from "@/lib/api";
import { GENERAL_TICKET_LABEL } from "@/lib/format";
import { AUTHOR_BOOKS_KEY, AUTHOR_TICKETS_KEY } from "@/lib/keys";
import type { Book, CreatedTicket } from "@/lib/types";
import { ACCEPT_ATTRIBUTE, checkFile, formatBytes, MAX_FILES, uploadFiles, type UploadResult } from "@/lib/uploads";

// Same bounds the API enforces; checking here saves a round trip.
const SUBJECT = { min: 5, max: 160 };
const DESCRIPTION = { min: 10, max: 10_000 };

function validate(subject: string, description: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const s = subject.trim().length;
  const d = description.trim().length;
  if (s < SUBJECT.min || s > SUBJECT.max) {
    fields.subject = `Use between ${SUBJECT.min} and ${SUBJECT.max} characters.`;
  }
  if (d < DESCRIPTION.min || d > DESCRIPTION.max) {
    fields.description = `Use between ${DESCRIPTION.min} and ${DESCRIPTION.max.toLocaleString("en-IN")} characters.`;
  }
  return fields;
}

// The "New ticket" button and its dialog. `variant="link"` renders an inline
// text link, for empty states.
export function NewTicketButton({ variant = "primary", label = "New ticket" }: { variant?: "primary" | "link"; label?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "link"
            ? "font-medium text-emerald-700 hover:underline"
            : "rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
        }
      >
        {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        title="New support ticket"
        description="Tell us what you need. The BookLeaf team reads every ticket and replies here."
      >
        <NewTicketForm onBusyChange={setBusy} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function NewTicketForm({ onBusyChange, onClose }: { onBusyChange: (busy: boolean) => void; onClose: () => void }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const books = useSWR<Envelope<Book[]>>(AUTHOR_BOOKS_KEY);
  const [bookId, setBookId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  // Set when the ticket was created but at least one file did not upload.
  const [partial, setPartial] = useState<{ ticket: CreatedTicket; results: UploadResult[] } | null>(null);

  function setBusy(value: boolean) {
    setSubmitting(value);
    onBusyChange(value);
  }

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    const next = [...files, ...picked];
    if (next.length > MAX_FILES) {
      setFileError(`You can attach up to ${MAX_FILES} files.`);
      return;
    }
    for (const file of picked) {
      const problem = checkFile(file);
      if (problem) {
        setFileError(`${file.name}: ${problem}`);
        return;
      }
    }
    setFileError(null);
    setFiles(next);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = validate(subject, description);
    if (Object.keys(fields).length > 0) {
      setError({ status: 400, code: "VALIDATION_ERROR", message: "Please correct the highlighted fields.", fields });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<Envelope<CreatedTicket>>("/author/tickets", {
        bookId: bookId || null,
        subject: subject.trim(),
        description: description.trim(),
      });
      const ticket = response.data.data;
      await mutate(AUTHOR_TICKETS_KEY);
      // Files go up only after the ticket exists, so a failed upload never loses the ticket.
      const results = files.length > 0 ? await uploadFiles(ticket.id, files) : [];
      setBusy(false);
      if (results.some((result) => result.error)) {
        setPartial({ ticket, results });
        return;
      }
      onClose();
      router.push(`/author/tickets/${ticket.id}`);
    } catch (err) {
      setError(toApiError(err));
      setBusy(false);
    }
  }

  if (partial) {
    return (
      <div className="space-y-4">
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {partial.ticket.publicId} was created and the BookLeaf team can see it.
        </p>
        <div>
          <p className="text-sm font-medium">Some files did not upload:</p>
          <ul className="mt-2 space-y-1 text-sm">
            {partial.results.map((result) => (
              <li key={result.file.name} className={result.error ? "text-red-700" : "text-neutral-600"}>
                {result.file.name}: {result.error ?? "uploaded"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-neutral-500">You can attach them again from the ticket page while it is open.</p>
        </div>
        <Link href={`/author/tickets/${partial.ticket.id}`} onClick={onClose} className={`${primaryButtonClass} inline-block`}>
          View ticket
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error && error.code !== "VALIDATION_ERROR" && <ErrorState message={error.message} />}

      <Field label="Which book is this about?" error={error?.fields.bookId}>
        <select
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          aria-invalid={Boolean(error?.fields.bookId)}
          className={inputClass}
        >
          <option value="">{GENERAL_TICKET_LABEL}</option>
          {books.data?.data.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Subject" error={error?.fields.subject} hint={`${subject.trim().length}/${SUBJECT.max}`}>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={SUBJECT.max + 20}
          placeholder="For example: Royalty for last quarter not received"
          aria-invalid={Boolean(error?.fields.subject)}
          className={inputClass}
        />
      </Field>

      <Field
        label="Describe the issue"
        error={error?.fields.description}
        hint="Include dates, order numbers, or platform names if you have them."
      >
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          aria-invalid={Boolean(error?.fields.description)}
          className={inputClass}
        />
      </Field>

      {/* Not a <label>: it holds buttons, and a label click would press the first one. */}
      <div>
        <span className="text-sm font-medium">Attachments (optional)</span>
        <div className="mt-1 space-y-2">
          {files.map((file) => (
            <div key={file.name} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-sm">
              <span className="truncate">
                {file.name} <span className="text-neutral-500">· {formatBytes(file.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => setFiles(files.filter((f) => f !== file))}
                className="text-xs text-neutral-500 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ))}
          {files.length < MAX_FILES && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                multiple
                onChange={onPickFiles}
                className="sr-only"
                aria-label="Choose files to attach"
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
              >
                + Add file
              </button>
            </>
          )}
        </div>
        {fileError ? (
          <span className="mt-1 block text-xs text-red-600">{fileError}</span>
        ) : (
          <span className="mt-1 block text-xs text-neutral-500">
            Up to {MAX_FILES} files, JPEG, PNG, WebP, or PDF, 2 MB each. Photos of a print defect help.
          </span>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-4">
        <button type="button" onClick={onClose} disabled={submitting} className={buttonClass}>
          Cancel
        </button>
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? (files.length > 0 ? "Submitting and uploading…" : "Submitting…") : "Submit ticket"}
        </button>
      </div>
    </form>
  );
}
