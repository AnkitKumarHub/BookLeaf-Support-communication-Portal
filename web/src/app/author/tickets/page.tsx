"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { EmptyState, ErrorState, FilterTabs, PageHeader, Skeleton, StatusPill } from "@/components/ui";
import type { Envelope } from "@/lib/api";
import { formatAge, GENERAL_TICKET_LABEL, TICKET_STATUSES, TICKET_STATUS_LABELS } from "@/lib/format";
import { AUTHOR_TICKETS_KEY } from "@/lib/keys";
import type { AuthorTicketRow, TicketStatus } from "@/lib/types";
import { NewTicketButton } from "@/components/new-ticket-dialog";

export default function MyTicketsPage() {
  // One request for all tickets (shared with the overview); filtering is local.
  const { data, error, isValidating, mutate } = useSWR<Envelope<AuthorTicketRow[]>>(AUTHOR_TICKETS_KEY);
  const [status, setStatus] = useState<TicketStatus | "all">("all");

  const all = data?.data;
  const tickets = all?.filter((ticket) => status === "all" || ticket.status === status);

  return (
    <>
      <PageHeader
        title="My Tickets"
        description="Replies from the BookLeaf team appear here."
        onRefresh={() => void mutate()}
        refreshing={isValidating}
        actions={<NewTicketButton />}
      />

      <div className="mb-5">
        <FilterTabs
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={(["all", ...TICKET_STATUSES] as const).map((value) => ({
            value,
            label: value === "all" ? "All" : TICKET_STATUS_LABELS[value],
            count: value === "all" ? all?.length : all?.filter((ticket) => ticket.status === value).length,
          }))}
        />
      </div>

      {error && <ErrorState message="Your tickets could not be loaded." onRetry={() => void mutate()} />}

      {!data && !error && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {tickets && tickets.length === 0 && (
        <EmptyState title={status === "all" ? "No tickets" : "No tickets with this status"}>
          {status === "all" &&
            "A ticket belongs here only when a royalty, an ISBN, printing, or a book's status is a problem."}
        </EmptyState>
      )}

      {tickets && tickets.length > 0 && (
        <ul className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {tickets.map((ticket, index) => (
            <li key={ticket.id} className={index === 0 ? undefined : "border-t border-neutral-100"}>
              <Link
                href={`/author/tickets/${ticket.id}`}
                className="grid gap-x-5 gap-y-3 p-5 transition-[background-color] duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink sm:grid-cols-[minmax(0,1fr)_auto] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-neutral-50"
              >
                <span className="min-w-0">
                  <StatusPill status={ticket.status} />
                  <span className="mt-2.5 block truncate font-medium">{ticket.subject}</span>
                  <span className="mt-1.5 block truncate text-sm text-neutral-600">
                    {ticket.publicId} · {ticket.book?.title ?? GENERAL_TICKET_LABEL} · opened{" "}
                    {formatAge(ticket.createdAt)}
                  </span>
                </span>
                <span className="text-sm text-neutral-600 sm:self-end">
                  {ticket.replyCount === 0
                    ? "No reply yet"
                    : `${ticket.replyCount} ${ticket.replyCount === 1 ? "reply" : "replies"}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
