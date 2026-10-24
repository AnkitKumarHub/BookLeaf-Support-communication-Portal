"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { ButtonLink, EmptyState, ErrorState, PageHeader, Skeleton, StatusPill } from "@/components/ui";
import type { Envelope } from "@/lib/api";
import { formatAge, GENERAL_TICKET_LABEL, TICKET_STATUSES, TICKET_STATUS_LABELS } from "@/lib/format";
import { AUTHOR_TICKETS_KEY } from "@/lib/keys";
import type { AuthorTicketRow, TicketStatus } from "@/lib/types";

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
        description="Replies from the BookLeaf team appear here as soon as they are sent."
        onRefresh={() => void mutate()}
        refreshing={isValidating}
        actions={<ButtonLink href="/author/tickets/new">New ticket</ButtonLink>}
      />

      <div className="mb-4 flex flex-wrap gap-1" role="tablist" aria-label="Filter by status">
        {(["all", ...TICKET_STATUSES] as const).map((value) => {
          const count = value === "all" ? all?.length : all?.filter((t) => t.status === value).length;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={status === value}
              onClick={() => setStatus(value)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                status === value ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {value === "all" ? "All" : TICKET_STATUS_LABELS[value]}
              {count !== undefined && <span className="ml-1.5 tabular-nums opacity-70">{count}</span>}
            </button>
          );
        })}
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
        <EmptyState title={status === "all" ? "You have not raised any tickets" : "No tickets with this status"}>
          {status === "all" && (
            <Link href="/author/tickets/new" className="font-medium text-emerald-700 hover:underline">
              Raise your first ticket
            </Link>
          )}
        </EmptyState>
      )}

      {tickets && tickets.length > 0 && (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/author/tickets/${ticket.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-neutral-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{ticket.subject}</span>
                  <span className="block text-xs text-neutral-500">
                    {ticket.publicId} · {ticket.book?.title ?? GENERAL_TICKET_LABEL} · opened{" "}
                    {formatAge(ticket.createdAt)}
                  </span>
                </span>
                <span className="text-xs text-neutral-500">
                  {ticket.replyCount === 0
                    ? "No reply yet"
                    : `${ticket.replyCount} ${ticket.replyCount === 1 ? "reply" : "replies"}`}
                </span>
                <StatusPill status={ticket.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
