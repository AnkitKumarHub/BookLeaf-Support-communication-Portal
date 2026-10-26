"use client";

import { useState } from "react";
import { buttonClass, ErrorState, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import {
  ALLOWED_TRANSITIONS,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUS_LABELS,
} from "@/lib/format";
import { useAction } from "@/lib/use-action";
import type { AdminTicketDetail, TicketStatus } from "@/lib/types";

type Props = { ticket: AdminTicketDetail; refresh: () => Promise<unknown> };

// One row of four fields, all the same height, over the AI triage strip. The
// label row is a fixed height in every cell so an extra action next to a label
// cannot push one field out of line with the others.
const labelRowClass = "mb-1.5 flex min-h-7 items-center justify-between gap-2";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-neutral-600";
const quietActionClass =
  "rounded px-1 py-1 text-xs font-medium text-neutral-800 underline underline-offset-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50";

export function Controls({ ticket, refresh }: Props) {
  const status = useAction(refresh);
  const override = useAction(refresh);
  const assign = useAction(refresh);
  const [confirmClose, setConfirmClose] = useState(false);

  const setStatus = (next: TicketStatus) =>
    status.run(() => api.patch(`/admin/tickets/${ticket.id}`, { status: next }));
  const patch = (body: Record<string, string | null>) =>
    override.run(() => api.patch(`/admin/tickets/${ticket.id}`, body));

  const error = status.error ?? override.error ?? assign.error;

  return (
    <section aria-labelledby="controls-heading" className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 id="controls-heading" className="sr-only">
        Ticket controls
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <div className={labelRowClass}>
            <label htmlFor="ticket-status" className={labelClass}>
              Status
            </label>
          </div>
          <select
            id="ticket-status"
            value={ticket.status}
            disabled={status.busy}
            onChange={(e) => {
              const next = e.target.value as TicketStatus;
              // Closing is the one move that asks first.
              if (next === "closed") setConfirmClose(true);
              else void setStatus(next);
            }}
            className={inputClass}
          >
            <option value={ticket.status}>{TICKET_STATUS_LABELS[ticket.status]}</option>
            {ALLOWED_TRANSITIONS[ticket.status].map((next) => (
              <option key={next} value={next}>
                {next === "in_progress" && ticket.status === "closed"
                  ? "Reopen (In Progress)"
                  : TICKET_STATUS_LABELS[next]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className={labelRowClass}>
            <label htmlFor="ticket-priority" className={labelClass}>
              Priority
            </label>
            {ticket.priorityOverride !== null && (
              <button
                type="button"
                className={quietActionClass}
                disabled={override.busy}
                onClick={() => void patch({ priorityOverride: null })}
              >
                Use AI value
              </button>
            )}
          </div>
          <select
            id="ticket-priority"
            value={ticket.priorityOverride ?? ""}
            disabled={override.busy}
            onChange={(e) => void patch({ priorityOverride: e.target.value || null })}
            className={inputClass}
          >
            <option value="">
              {ticket.aiPriority ? `${PRIORITY_LABELS[ticket.aiPriority]} (AI)` : "No priority yet"}
            </option>
            {TICKET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className={labelRowClass}>
            <label htmlFor="ticket-category" className={labelClass}>
              Category
            </label>
            {ticket.categoryOverride !== null && (
              <button
                type="button"
                className={quietActionClass}
                disabled={override.busy}
                onClick={() => void patch({ categoryOverride: null })}
              >
                Use AI value
              </button>
            )}
          </div>
          <select
            id="ticket-category"
            value={ticket.categoryOverride ?? ""}
            disabled={override.busy}
            onChange={(e) => void patch({ categoryOverride: e.target.value || null })}
            className={inputClass}
          >
            <option value="">
              {ticket.aiCategory ? `${CATEGORY_LABELS[ticket.aiCategory]} (AI)` : "No category yet"}
            </option>
            {TICKET_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className={labelRowClass}>
            <span className={labelClass}>Assignee</span>
            {ticket.assignedToMe ? (
              <button
                type="button"
                className={quietActionClass}
                disabled={assign.busy}
                onClick={() => void assign.run(() => api.post(`/admin/tickets/${ticket.id}/unassign`))}
              >
                Unassign
              </button>
            ) : (
              <button
                type="button"
                className={quietActionClass}
                disabled={assign.busy}
                onClick={() => void assign.run(() => api.post(`/admin/tickets/${ticket.id}/assign-to-me`))}
              >
                Assign to me
              </button>
            )}
          </div>
          {/* A value, not an input: no border, but the same height as the three
              selects beside it so the row reads as one band. */}
          <p className="flex min-h-[2.375rem] items-center gap-2 text-sm">
            {ticket.assigneeName ? (
              <>
                <span
                  aria-hidden
                  className="flex size-6 items-center justify-center rounded-full bg-neutral-100 text-[0.625rem] font-semibold text-neutral-700"
                >
                  {initials(ticket.assigneeName)}
                </span>
                <span className="truncate">{ticket.assignedToMe ? `${ticket.assigneeName} (you)` : ticket.assigneeName}</span>
              </>
            ) : (
              <>
                <span aria-hidden className="size-6 rounded-full border border-dashed border-neutral-300" />
                <span className="text-neutral-500">Unassigned</span>
              </>
            )}
          </p>
        </div>
      </div>

      {confirmClose && (
        <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p>Close this ticket? The author will see it as Closed. You can reopen it later.</p>
          <div className="mt-3 flex flex-wrap gap-2">
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

      {error && (
        <div className="mt-4">
          <ErrorState message={error} />
        </div>
      )}

      <Triage ticket={ticket} refresh={refresh} />
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

// The AI's suggestion, its score and its stored rationale — shown as read, not
// rewritten. The fields above stay the admin's to set.
function Triage({ ticket, refresh }: Props) {
  const retry = useAction(refresh);
  const running = ticket.aiState === "pending" || ticket.aiState === "processing";
  const percent = ticket.aiConfidence === null ? null : Math.round(Number(ticket.aiConfidence) * 100);

  const retryButton = (
    <button
      type="button"
      className={buttonClass}
      // Allowed while pending too: that is how a lost Inngest send is recovered.
      disabled={retry.busy}
      onClick={() => void retry.run(() => api.post(`/admin/tickets/${ticket.id}/retry-triage`))}
    >
      {retry.busy ? "Requesting…" : ticket.aiState === "completed" ? "Re-run triage" : "Retry triage"}
    </button>
  );

  return (
    <div className="mt-5 border-t border-neutral-100 pt-5">
      {running && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-neutral-600">
            <span className="animate-pulse">AI triage is running.</span> Priority and category stay yours to set in
            the meantime. If this does not finish, the job was likely never delivered — send it again.
          </p>
          {retryButton}
        </div>
      )}

      {ticket.aiState === "failed" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-200">
          <p className="min-w-60 flex-1 text-sm text-amber-900">
            No AI suggestion for this ticket. Set priority and category yourself, or try again.
          </p>
          {retryButton}
        </div>
      )}

      {ticket.aiState === "completed" && (
        <div className="flex flex-wrap gap-x-10 gap-y-5">
          {percent !== null && (
            <div className="w-56 shrink-0">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">AI confidence</p>
              <p className="mb-2 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums leading-none">{percent}%</span>
                <span className="text-sm text-neutral-500"></span>
              </p>
              <span className="flex gap-1" role="img" aria-label={`${percent} percent confidence`}>
                {[0, 1, 2, 3, 4].map((tile) => (
                  <Tile key={tile} fill={Math.min(1, Math.max(0, percent / 20 - tile))} />
                ))}
              </span>
            
            </div>
          )}

          <div className="min-w-72 flex-[999_1_24rem]">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">
              Why the AI suggested{" "}
              {ticket.aiPriority ? PRIORITY_LABELS[ticket.aiPriority] : "no priority"}
              {" · "}
              {ticket.aiCategory ? CATEGORY_LABELS[ticket.aiCategory] : "no category"}
            </p>
            {ticket.aiRationale ? (
              <blockquote className="rounded-xl bg-neutral-50 p-3.5 text-sm leading-relaxed text-neutral-800 ring-1 ring-inset ring-neutral-200">
                {ticket.aiRationale}
              </blockquote>
            ) : (
              <p className="text-sm text-neutral-500">The model returned no rationale for this ticket.</p>
            )}
            {/* <p className="mt-2 text-xs text-neutral-600">A suggestion — the fields above are yours to set.</p> */}
            <div className="mt-3">{retryButton}</div>
          </div>
        </div>
      )}

      {retry.error && (
        <div className="mt-3">
          <ErrorState message={retry.error} />
        </div>
      )}
    </div>
  );
}

// One fifth of the scale: full, part-filled or empty.
function Tile({ fill }: { fill: number }) {
  return (
    <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-sm bg-neutral-200">
      <span
        className="block h-full"
        style={{ width: `${fill * 100}%`, backgroundColor: "var(--color-accent-quality)" }}
      />
    </span>
  );
}
