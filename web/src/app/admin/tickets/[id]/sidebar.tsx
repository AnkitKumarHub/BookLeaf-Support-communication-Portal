"use client";

import { useState } from "react";
import { buttonClass, Card, ErrorState, inputClass, Money, Text } from "@/components/ui";
import { api } from "@/lib/api";
import {
  ALLOWED_TRANSITIONS,
  CATEGORY_LABELS,
  formatAge,
  formatDate,
  formatDateTime,
  PRIORITY_LABELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUS_LABELS,
} from "@/lib/format";
import { useAction } from "@/lib/use-action";
import type { AdminEvent, AdminTicketDetail, TicketStatus } from "@/lib/types";

type Props = { ticket: AdminTicketDetail; refresh: () => Promise<unknown> };

export function Sidebar({ ticket, refresh }: Props) {
  return (
    <aside className="space-y-4">
      <StatusCard ticket={ticket} refresh={refresh} />
      <AssigneeCard ticket={ticket} refresh={refresh} />
      <TriageCard ticket={ticket} refresh={refresh} />
      <AuthorCard ticket={ticket} />
      <ActivityCard events={ticket.events} />
    </aside>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">{children}</h2>;
}

function StatusCard({ ticket, refresh }: Props) {
  const action = useAction(refresh);
  const [confirmClose, setConfirmClose] = useState(false);
  const next = ALLOWED_TRANSITIONS[ticket.status];

  const setStatus = (status: TicketStatus) =>
    action.run(() => api.patch(`/admin/tickets/${ticket.id}`, { status }));

  return (
    <Card>
      <CardTitle>Status</CardTitle>
      <select
        value={ticket.status}
        disabled={action.busy}
        onChange={(e) => {
          const status = e.target.value as TicketStatus;
          // Closing is the one move that asks first.
          if (status === "closed") setConfirmClose(true);
          else void setStatus(status);
        }}
        aria-label="Ticket status"
        className={inputClass}
      >
        <option value={ticket.status}>{TICKET_STATUS_LABELS[ticket.status]}</option>
        {next.map((status) => (
          <option key={status} value={status}>
            {status === "in_progress" && ticket.status === "closed" ? "Reopen (In Progress)" : TICKET_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      {confirmClose && (
        <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          <p>Close this ticket? The author will see it as Closed. You can reopen it later.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                setConfirmClose(false);
                void setStatus("closed");
              }}
            >
              Close ticket
            </button>
            <button type="button" className={buttonClass} onClick={() => setConfirmClose(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {action.error && (
        <div className="mt-2">
          <ErrorState message={action.error} />
        </div>
      )}
    </Card>
  );
}

function AssigneeCard({ ticket, refresh }: Props) {
  const action = useAction(refresh);
  return (
    <Card>
      <CardTitle>Assignee</CardTitle>
      <p className="mb-3 text-sm">
        {ticket.assignedToMe ? "You" : (ticket.assigneeName ?? <span className="text-neutral-500">Unassigned</span>)}
      </p>
      {ticket.assignedToMe ? (
        <button
          type="button"
          className={buttonClass}
          disabled={action.busy}
          onClick={() => void action.run(() => api.post(`/admin/tickets/${ticket.id}/unassign`))}
        >
          Unassign
        </button>
      ) : (
        <button
          type="button"
          className={buttonClass}
          disabled={action.busy}
          onClick={() => void action.run(() => api.post(`/admin/tickets/${ticket.id}/assign-to-me`))}
        >
          Assign to me
        </button>
      )}
      {action.error && (
        <div className="mt-2">
          <ErrorState message={action.error} />
        </div>
      )}
    </Card>
  );
}

// The AI suggestion next to the admin's override. Overrides survive a retry.
function TriageCard({ ticket, refresh }: Props) {
  const override = useAction(refresh);
  const retry = useAction(refresh);
  const running = ticket.aiState === "pending" || ticket.aiState === "processing";
  const confidence = ticket.aiConfidence === null ? null : Math.round(Number(ticket.aiConfidence) * 100);

  const patch = (body: Record<string, string | null>) =>
    override.run(() => api.patch(`/admin/tickets/${ticket.id}`, body));

  return (
    <Card>
      <CardTitle>AI triage</CardTitle>

      {running && (
        <p className="mb-3 text-sm text-neutral-500">
          <span className="animate-pulse">Classifying…</span> If this stays here, the job was likely never
          delivered. Retry triage sends it again.
        </p>
      )}
      {ticket.aiState === "failed" && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          AI unavailable for this ticket. Set the category and priority yourself, or retry.
        </p>
      )}
      {ticket.aiState === "completed" && (
        <dl className="mb-3 space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Suggested category</dt>
            <dd className="text-right">{ticket.aiCategory ? CATEGORY_LABELS[ticket.aiCategory] : "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-500">Suggested priority</dt>
            <dd>{ticket.aiPriority ? PRIORITY_LABELS[ticket.aiPriority] : "—"}</dd>
          </div>
          {confidence !== null && (
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-500">Confidence</dt>
              <dd className="tabular-nums">{confidence}%</dd>
            </div>
          )}
          {ticket.aiRationale && (
            <p className="mt-2 rounded-md bg-neutral-50 p-2 text-xs leading-relaxed text-neutral-700">
              {ticket.aiRationale}
            </p>
          )}
        </dl>
      )}

      <div className="space-y-3 border-t border-neutral-100 pt-3">
        <label className="block text-xs text-neutral-500">
          Category
          <select
            value={ticket.categoryOverride ?? ""}
            disabled={override.busy}
            onChange={(e) => void patch({ categoryOverride: e.target.value || null })}
            className={`${inputClass} mt-1`}
          >
            <option value="">
              {ticket.aiCategory ? `AI: ${CATEGORY_LABELS[ticket.aiCategory]}` : "No category yet"}
            </option>
            {TICKET_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-neutral-500">
          Priority
          <select
            value={ticket.priorityOverride ?? ""}
            disabled={override.busy}
            onChange={(e) => void patch({ priorityOverride: e.target.value || null })}
            className={`${inputClass} mt-1`}
          >
            <option value="">
              {ticket.aiPriority ? `AI: ${PRIORITY_LABELS[ticket.aiPriority]}` : "No priority yet"}
            </option>
            {TICKET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </label>
        {override.error && <ErrorState message={override.error} />}

        <button
          type="button"
          className={buttonClass}
          // Allowed while pending too: that is how a lost Inngest send is recovered.
          disabled={retry.busy}
          onClick={() => void retry.run(() => api.post(`/admin/tickets/${ticket.id}/retry-triage`))}
        >
          {retry.busy ? "Requesting…" : ticket.aiState === "completed" ? "Re-run triage" : "Retry triage"}
        </button>
        {retry.error && <ErrorState message={retry.error} />}
      </div>
    </Card>
  );
}

function AuthorCard({ ticket }: { ticket: AdminTicketDetail }) {
  const book = ticket.book;
  return (
    <Card>
      <CardTitle>Author</CardTitle>
      <p className="text-sm font-medium">{ticket.authorName}</p>
      <div className="mt-1 space-y-0.5 text-xs text-neutral-600">
        <p>{ticket.authorEmail}</p>
        <p>
          <Text value={ticket.phone} /> · <Text value={ticket.city} />
        </p>
      </div>
      {book && (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <p className="text-sm font-medium">{book.title}</p>
          <p className="text-xs text-neutral-500">
            {book.sourceId} · {book.status}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-neutral-500">Royalty paid</dt>
            <dd className="text-right">
              <Money value={book.royaltyPaid} />
            </dd>
            <dt className="text-neutral-500">Royalty pending</dt>
            <dd className="text-right">
              <Money value={book.royaltyPending} />
            </dd>
            <dt className="text-neutral-500">Last payout</dt>
            <dd className="text-right">
              <Text value={formatDate(book.lastRoyaltyPayoutDate)} />
            </dd>
            <dt className="text-neutral-500">Copies sold</dt>
            <dd className="text-right tabular-nums">{book.totalCopiesSold}</dd>
          </dl>
        </div>
      )}
    </Card>
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
  "ticket.replied": "Reply sent",
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
    <Card>
      <CardTitle>Activity</CardTitle>
      <ol className="space-y-1.5 text-xs">
        {recent.map((event) => (
          <li key={event.id} className="flex justify-between gap-3">
            <span>{describe(event)}</span>
            <time className="shrink-0 text-neutral-500" dateTime={event.createdAt} title={formatDateTime(event.createdAt)}>
              {formatAge(event.createdAt)}
            </time>
          </li>
        ))}
      </ol>
    </Card>
  );
}
