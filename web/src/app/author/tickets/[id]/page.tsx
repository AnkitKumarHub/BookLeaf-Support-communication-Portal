"use client";

import Link from "next/link";
import { use } from "react";
import useSWR from "swr";
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusPill } from "@/components/ui";
import { toApiError, type Envelope } from "@/lib/api";
import { formatAge, formatDateTime, GENERAL_TICKET_LABEL, isInProduction } from "@/lib/format";
import { authorTicketKey } from "@/lib/keys";
import type { AuthorTicketDetail } from "@/lib/types";

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
      <Link href="/author/tickets" className="mb-3 inline-block text-sm text-neutral-500 hover:text-neutral-800">
        ← My tickets
      </Link>

      <PageHeader
        title={ticket ? ticket.subject : <Skeleton className="h-7 w-72" />}
        description={
          ticket && (
            <span className="flex flex-wrap items-center gap-2">
              <span>{ticket.publicId}</span>
              <span aria-hidden>·</span>
              <span>Opened {formatDateTime(ticket.createdAt)}</span>
            </span>
          )
        }
        onRefresh={() => void mutate()}
        refreshing={isValidating}
        actions={ticket && <StatusPill status={ticket.status} />}
      />

      {error && <ErrorState message="This ticket could not be loaded." onRetry={() => void mutate()} />}

      {!ticket && !error && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {ticket && (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-6">
            <section>
              <h2 className="mb-2 text-sm font-semibold text-neutral-700">Your message</h2>
              <Card>
                {/* Plain text only: never render stored text as HTML. */}
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{ticket.description}</p>
              </Card>
            </section>

            <section aria-live="polite">
              <h2 className="mb-2 text-sm font-semibold text-neutral-700">
                Replies from BookLeaf {ticket.replies.length > 0 && `(${ticket.replies.length})`}
              </h2>
              {ticket.replies.length === 0 ? (
                <Card>
                  <p className="text-sm text-neutral-600">
                    No reply yet. When the team responds it will appear here, and this page updates on its own.
                  </p>
                </Card>
              ) : (
                <ol className="space-y-3">
                  {ticket.replies.map((reply) => (
                    <li key={reply.id} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-emerald-900">BookLeaf Support</span>
                        <time dateTime={reply.createdAt} className="text-xs text-neutral-500" title={formatDateTime(reply.createdAt)}>
                          {formatAge(reply.createdAt)}
                        </time>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{reply.body}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            <Card>
              <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">About</h2>
              {ticket.book ? (
                <>
                  <p className="mt-2 font-medium">{ticket.book.title}</p>
                  <div className="mt-2">
                    <Badge tone={isInProduction(ticket.book.status) ? "amber" : "green"}>{ticket.book.status}</Badge>
                  </div>
                </>
              ) : (
                <p className="mt-2 font-medium">{GENERAL_TICKET_LABEL}</p>
              )}
              <p className="mt-4 text-xs text-neutral-500">Last updated {formatAge(ticket.updatedAt)}</p>
            </Card>

            {ticket.attachments.length > 0 && (
              <Card>
                <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Attachments</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {ticket.attachments.map((file) => (
                    <li key={file.id}>
                      <a href={file.url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                        {file.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
