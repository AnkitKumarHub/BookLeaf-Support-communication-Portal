"use client";

import Link from "next/link";
import { use } from "react";
import useSWR from "swr";
import { Card, EmptyState, ErrorState, PageHeader, PriorityBadge, Skeleton, StatusPill } from "@/components/ui";
import { toApiError, type Envelope } from "@/lib/api";
import { formatAge, formatDateTime, GENERAL_TICKET_LABEL } from "@/lib/format";
import { adminTicketKey } from "@/lib/keys";
import type { AdminTicketDetail } from "@/lib/types";
import { Composer } from "./composer";
import { Notes } from "./notes";
import { Sidebar } from "./sidebar";

export default function AdminTicketPage({ params }: PageProps<"/admin/tickets/[id]">) {
  const { id } = use(params);
  // The first open of a ticket with no draft starts one on the API side. The
  // SSE stream then refetches this key when the draft or triage finishes.
  const { data, error, isValidating, mutate } = useSWR<Envelope<AdminTicketDetail>>(adminTicketKey(id));
  const ticket = data?.data;
  const refresh = () => mutate();

  if (error && toApiError(error).status === 404) {
    return (
      <EmptyState title="Ticket not found">
        <Link href="/admin" className="font-medium text-emerald-700 hover:underline">
          Back to the queue
        </Link>
      </EmptyState>
    );
  }

  return (
    <>
      <Link href="/admin" className="mb-3 inline-block text-sm text-neutral-500 hover:text-neutral-800">
        ← Queue
      </Link>

      <PageHeader
        title={ticket ? ticket.subject : <Skeleton className="h-7 w-72" />}
        description={
          ticket && (
            <span className="flex flex-wrap items-center gap-2">
              <span>{ticket.publicId}</span>
              <span aria-hidden>·</span>
              <span>{ticket.bookTitle ?? GENERAL_TICKET_LABEL}</span>
              <span aria-hidden>·</span>
              <span title={formatDateTime(ticket.createdAt)}>Opened {formatAge(ticket.createdAt)}</span>
            </span>
          )
        }
        onRefresh={() => void refresh()}
        refreshing={isValidating}
        actions={
          ticket && (
            <span className="flex items-center gap-2">
              <PriorityBadge
                priority={ticket.effectivePriority}
                aiState={ticket.aiState}
                overridden={ticket.priorityOverride !== null}
              />
              <StatusPill status={ticket.status} />
            </span>
          )
        }
      />

      {error && <ErrorState message="This ticket could not be loaded." onRetry={() => void refresh()} />}

      {!ticket && !error && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      )}

      {ticket && (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-6">
            <section>
              <h2 className="mb-2 text-sm font-semibold text-neutral-700">
                Message from {ticket.authorName}
              </h2>
              <Card>
                {/* Plain text only: never render stored text as HTML. */}
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{ticket.description}</p>
                {ticket.attachments.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-3 text-sm">
                    {ticket.attachments.map((file) => (
                      <li key={file.id}>
                        <a href={file.url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
                          {file.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>

            {/* Shown only once a reply exists; an empty block would just be noise. */}
            {ticket.replies.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold text-neutral-700">
                  Replies sent to the author ({ticket.replies.length})
                </h2>
                <ol className="space-y-3">
                  {ticket.replies.map((reply) => (
                    <li key={reply.id} className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                      <time className="mb-1 block text-xs text-neutral-500" dateTime={reply.createdAt}>
                        {formatDateTime(reply.createdAt)}
                      </time>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{reply.body}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <Composer ticket={ticket} refresh={refresh} />
            <Notes ticket={ticket} refresh={refresh} />
          </div>

          <Sidebar ticket={ticket} refresh={refresh} />
        </div>
      )}
    </>
  );
}
