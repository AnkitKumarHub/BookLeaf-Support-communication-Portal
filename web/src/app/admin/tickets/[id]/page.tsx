"use client";

import Link from "next/link";
import { use } from "react";
import useSWR from "swr";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import { toApiError, type Envelope } from "@/lib/api";
import { formatAge, formatDateTime, GENERAL_TICKET_LABEL } from "@/lib/format";
import { adminTicketKey } from "@/lib/keys";
import type { AdminTicketDetail } from "@/lib/types";
import { Composer } from "./composer";
import { Controls } from "./controls";
import { Sidebar } from "./sidebar";
import { Thread } from "./thread";

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
        <Link href="/admin/ticket-queue" className="font-medium text-brand-deep hover:underline">
          Back to the queue
        </Link>
      </EmptyState>
    );
  }

  return (
    <>
      <Link
        href="/admin/ticket-queue"
        className="mb-3 inline-block text-sm text-neutral-600 hover:text-neutral-900"
      >
        ← Back to queue
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
              <span title={formatDateTime(ticket.createdAt)}>
                opened {formatAge(ticket.createdAt)} by {ticket.authorName}
              </span>
            </span>
          )
        }
        onRefresh={() => void refresh()}
        refreshing={isValidating}
      />

      {error && <ErrorState message="This ticket could not be loaded." onRetry={() => void refresh()} />}

      {!ticket && !error && (
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      )}

      {ticket && (
        <div className="space-y-6">
          <Controls ticket={ticket} refresh={refresh} />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            {/* Both columns open with a heading of the same height, so the
                first card on each side starts on the same line. */}
            <div className="min-w-0">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-600">Conversation</h2>
              <div className="space-y-5">
                <Thread ticket={ticket} />
                <Composer ticket={ticket} refresh={refresh} />
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-600">Author &amp; book</h2>
              <Sidebar ticket={ticket} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
