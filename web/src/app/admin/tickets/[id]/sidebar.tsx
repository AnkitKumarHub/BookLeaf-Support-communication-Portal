"use client";

import { Money, Text } from "@/components/ui";
import { formatAge, formatDate, formatDateTime, TICKET_STATUS_LABELS } from "@/lib/format";
import type { AdminEvent, AdminTicketDetail, TicketStatus } from "@/lib/types";

// Context only: who wrote in and what their book is doing. Everything that
// changes the ticket lives in the controls above the conversation.
export function Sidebar({ ticket }: { ticket: AdminTicketDetail }) {
  return (
    <aside className="space-y-4">
      <AuthorCard ticket={ticket} />
      <ActivityCard events={ticket.events} />
    </aside>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-600">{children}</h3>;
}

function AuthorCard({ ticket }: { ticket: AdminTicketDetail }) {
  const book = ticket.book;
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <CardTitle>Author</CardTitle>
      <p className="text-[0.9375rem] font-semibold">{ticket.authorName}</p>
      <p className="mt-0.5 break-words text-sm">
        <a href={`mailto:${ticket.authorEmail}`} className="text-emerald-800 hover:underline">
          {ticket.authorEmail}
        </a>
      </p>
      <p className="mt-0.5 text-sm text-neutral-600">
        <Text value={ticket.phone} /> · <Text value={ticket.city} />
      </p>

      {book && (
        <div className="mt-5 border-t border-neutral-100 pt-4">
          <CardTitle>Book</CardTitle>
          <p className="text-[0.9375rem] font-semibold">{book.title}</p>
          <p className="mt-0.5 text-sm text-neutral-600">
            {book.sourceId} · {book.status}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs text-neutral-600">Copies sold</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">{book.totalCopiesSold}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-600">Last payout</dt>
              <dd className="mt-0.5 text-sm font-semibold">
                <Text value={formatDate(book.lastRoyaltyPayoutDate)} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-600">Royalty paid</dt>
              <dd className="mt-0.5 text-sm font-semibold">
                <Money value={book.royaltyPaid} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-600">Royalty pending</dt>
              <dd className="mt-0.5 text-sm font-semibold">
                <Money value={book.royaltyPending} />
              </dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}

const EVENT_LABELS: Record<string, string> = {
  "ticket.created": "Ticket created",
  "ticket.status_changed": "Status changed",
  "ticket.category_override_changed": "Category set",
  "ticket.priority_override_changed": "Priority set",
  "ticket.assigned": "Assigned",
  "ticket.unassigned": "Unassigned",
  "ticket.note_added": "Internal note added",
  "ticket.replied": "Reply posted",
};

function describe(event: AdminEvent): string {
  const label = EVENT_LABELS[event.eventType] ?? event.eventType;
  const payload = event.payload as { from?: string | null; to?: string | null } | null;
  if (event.eventType === "ticket.status_changed" && payload?.to) {
    return `${label}: ${TICKET_STATUS_LABELS[payload.to as TicketStatus] ?? payload.to}`;
  }
  return label;
}

function ActivityCard({ events }: { events: AdminEvent[] }) {
  if (events.length === 0) return null;
  // Newest first, last eight.
  const recent = [...events].reverse().slice(0, 8);
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <CardTitle>Activity</CardTitle>
      <ol className="space-y-2 text-sm">
        {recent.map((event) => (
          <li key={event.id} className="flex justify-between gap-3">
            <span className="text-neutral-700">{describe(event)}</span>
            <time
              className="shrink-0 text-neutral-500"
              dateTime={event.createdAt}
              title={formatDateTime(event.createdAt)}
            >
              {formatAge(event.createdAt)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
