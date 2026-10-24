"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Card, ErrorState, Field, inputClass, PageHeader } from "@/components/ui";
import { api, toApiError, type ApiError, type Envelope } from "@/lib/api";
import { GENERAL_TICKET_LABEL } from "@/lib/format";
import { AUTHOR_BOOKS_KEY, AUTHOR_TICKETS_KEY } from "@/lib/keys";
import type { Book, CreatedTicket } from "@/lib/types";

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

export default function NewTicketPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const books = useSWR<Envelope<Book[]>>(AUTHOR_BOOKS_KEY);
  const [bookId, setBookId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = validate(subject, description);
    if (Object.keys(fields).length > 0) {
      setError({ status: 400, code: "VALIDATION_ERROR", message: "Please correct the highlighted fields.", fields });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.post<Envelope<CreatedTicket>>("/author/tickets", {
        bookId: bookId || null,
        subject: subject.trim(),
        description: description.trim(),
      });
      await mutate(AUTHOR_TICKETS_KEY);
      router.push(`/author/tickets/${response.data.data.id}`);
    } catch (err) {
      setError(toApiError(err));
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New support ticket"
        description="Tell us what you need. The BookLeaf team reads every ticket and replies here."
      />

      <Card className="max-w-2xl">
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

          <Field
            label="Subject"
            error={error?.fields.subject}
            hint={`${subject.trim().length}/${SUBJECT.max}`}
          >
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
              rows={8}
              aria-invalid={Boolean(error?.fields.description)}
              className={inputClass}
            />
          </Field>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit ticket"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}
