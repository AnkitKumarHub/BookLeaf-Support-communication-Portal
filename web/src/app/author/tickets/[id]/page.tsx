"use client";

import Link from "next/link";
import { use, useState } from "react";
import useSWR from "swr";
import { Badge, EmptyState, ErrorState, PageHeader, Skeleton, StatusPill } from "@/components/ui";
import { toApiError, type Envelope } from "@/lib/api";
import { formatAge, formatDateTime, GENERAL_TICKET_LABEL, isInProduction } from "@/lib/format";
import { authorTicketKey } from "@/lib/keys";
import type { AuthorTicketDetail } from "@/lib/types";
import { FileDropzone } from "@/components/file-dropzone";
import { checkFile, formatBytes, MAX_FILES, uploadFiles } from "@/lib/uploads";

const panelClass = "rounded-2xl border border-neutral-200 bg-white p-5";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-neutral-600";

export default function AuthorTicketPage({ params }: PageProps<"/author/tickets/[id]">) {
  const { id } = use(params);
  // Kept fresh by the SSE stream: a reply or status change refetches this key.
  const { data, error, isValidating, mutate } = useSWR<Envelope<AuthorTicketDetail>>(authorTicketKey(id));
  const ticket = data?.data;

  if (error && toApiError(error).status === 404) {
    return (
      <EmptyState title="Ticket not found">
        <Link href="/author/tickets" className="font-medium text-emerald-700 hover:underline">
          Back to my tickets
        </Link>
      </EmptyState>
    );
  }

  return (
    <>
      <Link href="/author/tickets" className="mb-3 inline-block text-sm text-neutral-600 hover:text-neutral-900">
        ← Back to my tickets
      </Link>

      <PageHeader
        title={ticket ? ticket.subject : <Skeleton className="h-7 w-72" />}
        description={
          ticket && (
            <span className="flex flex-wrap items-center gap-2">
              <span>{ticket.publicId}</span>
              <span aria-hidden>·</span>
              <span title={formatDateTime(ticket.createdAt)}>Opened {formatAge(ticket.createdAt)}</span>
            </span>
          )
        }
        onRefresh={() => void mutate()}
        refreshing={isValidating}
        actions={ticket && <StatusPill status={ticket.status} />}
      />

      {error && <ErrorState message="This ticket could not be loaded." onRetry={() => void mutate()} />}

      {!ticket && !error && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {ticket && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          {/* Both columns open with a heading of the same height, so the first
              card on each side starts on the same line. */}
          <div className="min-w-0">
            <h2 className={`mb-3 ${labelClass}`}>Conversation</h2>
            <Thread ticket={ticket} />
          </div>

          <div>
            <h2 className={`mb-3 ${labelClass}`}>About this ticket</h2>
            <div className="space-y-4">
              <div className={panelClass}>
                {ticket.book ? (
                  <>
                    <p className="text-[0.9375rem] font-semibold">{ticket.book.title}</p>
                    <div className="mt-2">
                      <Badge tone={isInProduction(ticket.book.status) ? "amber" : "green"}>{ticket.book.status}</Badge>
                    </div>
                  </>
                ) : (
                  <p className="text-[0.9375rem] font-semibold">{GENERAL_TICKET_LABEL}</p>
                )}
                <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-600">
                  Last updated {formatAge(ticket.updatedAt)}
                </p>
              </div>

              <Attachments ticket={ticket} refresh={() => mutate()} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Your message and every reply in one column, oldest first, so the ticket
// reads as a conversation rather than two separate lists.
function Thread({ ticket }: { ticket: AuthorTicketDetail }) {
  return (
    <ol className="space-y-3" aria-live="polite">
      <li className={panelClass}>
        <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
          <span className="text-sm font-semibold">You</span>
          <span className="text-sm text-neutral-600">
            Opened this ticket ·{" "}
            <time dateTime={ticket.createdAt} title={formatDateTime(ticket.createdAt)}>
              {formatAge(ticket.createdAt)}
            </time>
          </span>
        </div>
        {/* Plain text only: never render stored text as HTML. */}
        <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed">{ticket.description}</p>
      </li>

      {ticket.replies.map((reply) => (
        <li key={reply.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
          <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-8 items-center justify-center rounded-full bg-emerald-700 text-xs font-semibold text-white"
            >
              BL
            </span>
            <span className="text-sm font-semibold">BookLeaf support</span>
            <span className="text-sm text-neutral-600">
              Reply ·{" "}
              <time dateTime={reply.createdAt} title={formatDateTime(reply.createdAt)}>
                {formatAge(reply.createdAt)}
              </time>
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed">{reply.body}</p>
        </li>
      ))}

      {ticket.replies.length === 0 && (
        <li className="rounded-2xl border border-dashed border-neutral-300 bg-white p-5">
          <p className="text-sm text-neutral-600">
            No reply yet. When the BookLeaf team answers it appears here, and this page updates on its own.
          </p>
        </li>
      )}
    </ol>
  );
}

// Files on the ticket, plus an upload control while the ticket is open and
// below the cap. This is also where a file that failed at create time is retried.
function Attachments({ ticket, refresh }: { ticket: AuthorTicketDetail; refresh: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAdd = ticket.status === "open" && ticket.attachments.length < MAX_FILES;

  if (ticket.attachments.length === 0 && !canAdd) return null;

  async function onFiles([file]: File[]) {
    if (!file) return;
    const problem = checkFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const [result] = await uploadFiles(ticket.id, [file]);
    setBusy(false);
    if (result?.error) setError(result.error);
    await refresh();
  }

  return (
    <section aria-labelledby="attachments-heading" className={panelClass}>
      <h3 id="attachments-heading" className={labelClass}>
        Attachments
      </h3>
      {ticket.attachments.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {ticket.attachments.map((file) => (
            <li key={file.id} className="flex justify-between gap-2">
              <a href={file.url} target="_blank" rel="noreferrer" className="truncate text-emerald-800 hover:underline">
                {file.name}
              </a>
              <span className="shrink-0 text-xs text-neutral-600">{formatBytes(file.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <div className="mt-3">
          <FileDropzone
            onFiles={(files) => void onFiles(files)}
            disabled={busy}
            label={busy ? "Uploading…" : "Drop a file"}
            hint={`JPEG, PNG, WebP, or PDF · 2 MB · up to ${MAX_FILES}`}
          />
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </section>
  );
}
