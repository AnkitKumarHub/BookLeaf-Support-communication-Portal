"use client";

import { ChevronDown, Flag } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import useSWR from "swr";
import { Dash, ErrorState, PageHeader, PriorityBadge, Skeleton } from "@/components/ui";
import type { Envelope } from "@/lib/api";
import {
  formatAge,
  formatCostInr,
  formatCount,
  formatPercent,
  GENERAL_TICKET_LABEL,
  isOverdue,
  isUnresolved,
} from "@/lib/format";
import { ADMIN_STATS_KEY } from "@/lib/keys";
import type { AdminQueueRow, AdminStats } from "@/lib/types";

// The same panel and label styling as the ticket queue and ticket detail
// pages, so the three admin screens read as one surface.
const panelClass = "rounded-2xl border border-neutral-200 bg-white p-5";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-neutral-600";

// The API already returns all three periods, so switching costs no request.
type Period = "today" | "week" | "all";
const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "all", label: "All time" },
];

// The top of the queue, in the queue's own order. A handful is enough: this
// is a way in, not a second copy of the queue.
const WAITING_KEY = "/admin/tickets?limit=8&page=1";
const WAITING_SHOWN = 5;

// Kept live by the SSE stream: every ticket change refetches these numbers.
export default function AdminDashboardPage() {
  const { data, error, isValidating, mutate } = useSWR<Envelope<AdminStats>>(ADMIN_STATS_KEY);
  const waiting = useSWR<Envelope<AdminQueueRow[]>>(WAITING_KEY);
  const [period, setPeriod] = useState<Period>("today");
  const stats = data?.data;

  const refresh = () => {
    void mutate();
    void waiting.mutate();
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Tickets and AI usage. Today and this week use India time; weeks start on Monday."
        onRefresh={refresh}
        refreshing={isValidating || waiting.isValidating}
        actions={
          stats && (
            <span className="text-xs text-neutral-600">
              Updated <time dateTime={stats.generatedAt}>{formatAge(stats.generatedAt)}</time>
            </span>
          )
        }
      />

      {error && <ErrorState message="The dashboard could not be loaded." onRetry={refresh} />}

      {!stats && !error && (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      )}

      {stats && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
            <OpenNow stats={stats} />
            <Activity stats={stats} period={period} onPeriod={setPeriod} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <WaitingOnUs rows={waiting.data?.data} failed={Boolean(waiting.error)} />
            <NewTickets daily={stats.tickets.daily} />
          </div>

          <AiAssistant stats={stats} />
        </div>
      )}
    </>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className={labelClass}>{children}</p>;
}

// A standing figure, not a flow: it is deliberately outside the period
// switch, because "open now" is the same number whichever period is shown.
function OpenNow({ stats }: { stats: AdminStats }) {
  const { open, total, closed } = stats.tickets;
  const openShare = total > 0 ? (open / total) * 100 : 0;
  return (
    <section aria-labelledby="open-now" className={panelClass}>
      <h2 id="open-now" className={labelClass}>
        Open now
      </h2>
      <p className="mt-2 text-5xl font-semibold leading-none tabular-nums">{open}</p>
      <p className="mt-2 text-sm text-neutral-600">unresolved, of {total} ever raised</p>
      <div className="mt-4 flex h-2 gap-0.5" aria-hidden>
        <div className="rounded-full bg-amber-500" style={{ width: `${openShare}%` }} />
        <div className="flex-1 rounded-full bg-brand" />
      </div>
      <p className="mt-2 flex flex-wrap justify-between gap-x-3 text-xs text-neutral-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500" aria-hidden />
          {open} open
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-brand" aria-hidden />
          {closed.all} resolved or closed
        </span>
      </p>
    </section>
  );
}

// Everything that is a flow, under one period switch.
function Activity({
  stats,
  period,
  onPeriod,
}: {
  stats: AdminStats;
  period: Period;
  onPeriod: (period: Period) => void;
}) {
  const created = stats.tickets.created[period];
  const closed = stats.tickets.closed[period];
  const tokens = stats.ai.tokens[period];

  return (
    <section aria-labelledby="activity" className={panelClass}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="activity" className={labelClass}>
          Activity
        </h2>
        {/* Radios, so the group moves with the arrow keys the way a segmented
            control is expected to. */}
        <fieldset className="flex flex-wrap gap-1">
          <legend className="sr-only">Period</legend>
          {PERIODS.map((item) => (
            <label
              key={item.value}
              className={`inline-flex min-h-9 cursor-pointer items-center rounded-lg px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                period === item.value
                  ? "bg-brand font-medium text-ink"
                  : "text-neutral-700 hover:bg-neutral-100"
              }`}
            >
              <input
                type="radio"
                name="period"
                value={item.value}
                checked={period === item.value}
                onChange={() => onPeriod(item.value)}
                className="sr-only"
              />
              {item.label}
            </label>
          ))}
        </fieldset>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-neutral-600">New tickets</dt>
          <dd className="mt-1 text-3xl font-semibold leading-none tabular-nums">{created}</dd>
        </div>
        <div>
          <dt className="text-sm text-neutral-600">Closed</dt>
          <dd className="mt-1 text-3xl font-semibold leading-none tabular-nums">{closed}</dd>
        </div>
        <div>
          <dt className="text-sm text-neutral-600">AI cost</dt>
          <dd className="mt-1 text-3xl font-semibold leading-none tabular-nums">
            {formatCostInr(tokens.costInr)}
          </dd>
          <dd className="mt-1 text-xs text-neutral-600">
            {formatCount(tokens.inputTokens + tokens.outputTokens)} tokens
          </dd>
        </div>
      </dl>
    </section>
  );
}

// Why a ticket is in this list, in words. Never just a chip.
function reason(row: AdminQueueRow): string {
  const age = formatAge(row.createdAt).replace(" ago", "");
  if (isOverdue(row.status, row.createdAt)) return `Unresolved for ${age}`;
  if (!row.assigneeName) return "Nobody assigned";
  return `With ${row.assignedToMe ? "you" : row.assigneeName}`;
}

function WaitingOnUs({ rows, failed }: { rows: AdminQueueRow[] | undefined; failed: boolean }) {
  // Same order as the queue: unresolved first, then priority, then oldest.
  const shown = rows?.filter((row) => isUnresolved(row.status)).slice(0, WAITING_SHOWN);

  return (
    <section aria-labelledby="waiting" className={`${panelClass} min-w-0`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="waiting" className={labelClass}>
          Waiting on us
        </h2>
        <Link
          href="/admin/ticket-queue"
          className="text-xs font-medium text-brand-deep underline underline-offset-2 hover:text-ink"
        >
          Open the queue →
        </Link>
      </div>

      {failed && <p className="text-sm text-neutral-600">This list could not be loaded.</p>}

      {!shown && !failed && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {shown && shown.length === 0 && (
        <p className="text-sm text-neutral-600">Nothing unresolved. The queue is clear.</p>
      )}

      {shown && shown.length > 0 && (
        <ul className="-mx-2 divide-y divide-neutral-100">
          {shown.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/tickets/${row.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2.5 hover:bg-neutral-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.subject}</span>
                  <span className="mt-0.5 block truncate text-xs text-neutral-600">
                    {row.publicId} · {row.bookTitle ?? GENERAL_TICKET_LABEL} ·{" "}
                    <span className={isOverdue(row.status, row.createdAt) ? "font-semibold text-red-700" : undefined}>
                      {reason(row)}
                    </span>
                  </span>
                </span>
                <PriorityBadge
                  priority={row.effectivePriority}
                  aiState={row.aiState}
                  overridden={row.priorityOverride !== null}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// New tickets per day for the last seven days, as plain CSS bars. One series,
// so no legend; every bar is named by its weekday.
function NewTickets({ daily }: { daily: AdminStats["tickets"]["daily"] }) {
  const week = daily.slice(-7);
  const total = week.reduce((sum, day) => sum + day.created, 0);
  const max = Math.max(1, ...week.map((day) => day.created));
  const weekday = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
  const full = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <section aria-labelledby="new-tickets" className={panelClass}>
      <h2 id="new-tickets" className={labelClass}>
        New tickets, last 7 days
      </h2>
      <p className="mt-2 text-3xl font-semibold leading-none tabular-nums">{total}</p>
      <p className="mt-2 text-sm text-neutral-600">in total across the week</p>

      {total === 0 ? (
        <p className="mt-5 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-600">
          No new tickets in the last 7 days.
        </p>
      ) : (
        <>
          <div
            className="mt-5 flex h-24 items-end gap-1.5"
            role="img"
            aria-label={`${total} new tickets over the last 7 days`}
          >
            {week.map((day) => (
              <div
                key={day.date}
                className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                title={`${full(day.date)}: ${day.created}`}
              >
                {day.created > 0 && (
                  <span className="text-[0.6875rem] tabular-nums text-neutral-600">{day.created}</span>
                )}
                <div
                  className={`w-full rounded-t ${day.created > 0 ? "bg-brand" : "bg-neutral-200"}`}
                  style={{ height: day.created > 0 ? `${(day.created / max) * 80}%` : "2px" }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1.5">
            {week.map((day, index) => (
              <span
                key={day.date}
                className={`flex-1 text-center text-[0.6875rem] ${
                  index === week.length - 1 ? "font-semibold text-neutral-800" : "text-neutral-600"
                }`}
              >
                {index === week.length - 1 ? "Today" : weekday(day.date)}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const TASK_LABELS = { classify: "Classification", draft: "Reply drafts" } as const;

// Whether the model and task tables are open is remembered per browser. It
// lives outside React so the server render can answer "closed" without a
// hydration mismatch, and so the stored value is read once.
const DETAILS_STORAGE_KEY = "bookleaf.dashboard.aiDetails";
const detailsListeners = new Set<() => void>();
let detailsOpen: boolean | null = null;

function readDetailsOpen(): boolean {
  if (detailsOpen === null) {
    try {
      detailsOpen = localStorage.getItem(DETAILS_STORAGE_KEY) === "1";
    } catch {
      // Storage blocked: the panel just starts collapsed every visit.
      detailsOpen = false;
    }
  }
  return detailsOpen;
}

function writeDetailsOpen(open: boolean) {
  detailsOpen = open;
  try {
    localStorage.setItem(DETAILS_STORAGE_KEY, open ? "1" : "0");
  } catch {
    // Not worth telling anyone: the panel still opens for this visit.
  }
  for (const listener of detailsListeners) listener();
}

function subscribeDetails(listener: () => void) {
  detailsListeners.add(listener);
  return () => {
    detailsListeners.delete(listener);
  };
}

function AiAssistant({ stats }: { stats: AdminStats }) {
  const { tokens, byModel, byTask, avgCostPerTicketInr, usdToInr, unpricedModels } = stats.ai;
  const { avgConfidence, classified, overridden, drafts, recentFlagged } = stats.quality;
  const showDetails = useSyncExternalStore(subscribeDetails, readDetailsOpen, () => false);

  return (
    <section aria-labelledby="ai" className={panelClass}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai" className={labelClass}>
          AI assistant
        </h2>
        <button
          type="button"
          aria-expanded={showDetails}
          aria-controls="ai-details"
          onClick={() => writeDetailsOpen(!showDetails)}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {showDetails ? "Hide" : "Show"} models and tasks
          <ChevronDown className={`size-4 transition ${showDetails ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>

      {/* Counts first, rates second: "0%" on a handful of tickets means "nobody
          has corrected anything yet", not "the model is never wrong". */}
      <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <dt className="text-sm text-neutral-600">Overridden by an admin</dt>
          <dd className="mt-1 text-3xl font-semibold leading-none tabular-nums">{overridden.either}</dd>
          <dd className="mt-1.5 text-xs text-neutral-600">
            of {classified} classified
            {overridden.rate !== null && ` · ${formatPercent(overridden.rate)}`} · {overridden.category} category,{" "}
            {overridden.priority} priority
          </dd>
        </div>
        <div>
          <dt className="text-sm text-neutral-600">Drafts flagged</dt>
          <dd className="mt-1 text-3xl font-semibold leading-none tabular-nums">{drafts.flagged}</dd>
          <dd className="mt-1.5 text-xs text-neutral-600">
            of {drafts.total} drafts{drafts.rate !== null && ` · ${formatPercent(drafts.rate)}`} marked not good enough
          </dd>
        </div>
        <div>
          <dt className="text-sm text-neutral-600">Average confidence</dt>
          <dd className="mt-1 text-3xl font-semibold leading-none tabular-nums">
            {avgConfidence === null ? <Dash /> : formatPercent(avgConfidence)}
          </dd>
          <dd className="mt-1.5 text-xs text-neutral-600">
            the model&apos;s own score · read it against the overrides
          </dd>
        </div>
        <div>
          <dt className="text-sm text-neutral-600">Cost per ticket</dt>
          <dd className="mt-1 text-3xl font-semibold leading-none tabular-nums">
            {avgCostPerTicketInr === null ? <Dash /> : formatCostInr(avgCostPerTicketInr)}
          </dd>
          <dd className="mt-1.5 text-xs text-neutral-600">
            average of classify + draft · {formatCostInr(tokens.all.costInr)} all time
          </dd>
        </div>
      </dl>

      {recentFlagged.length > 0 && (
        <div className="mt-5 border-t border-neutral-100 pt-4">
          <Label>Recently flagged drafts</Label>
          <ul className="-mx-2 mt-1 divide-y divide-neutral-100">
            {recentFlagged.map((item) => (
              <li key={`${item.ticketId}-${item.flaggedAt}`}>
                <Link
                  href={`/admin/tickets/${item.ticketId}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm hover:bg-neutral-50"
                >
                  <Flag className="size-3.5 shrink-0 fill-current text-red-600" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-neutral-600">{item.publicId}</span> {item.subject}
                  </span>
                  <time className="shrink-0 text-xs text-neutral-600" dateTime={item.flaggedAt}>
                    {formatAge(item.flaggedAt)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showDetails && (
        <div id="ai-details" className="mt-5 border-t border-neutral-100 pt-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <Label>Models in use</Label>
              {byModel.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-600">No AI runs yet.</p>
              ) : (
                <UsageTable rows={byModel.map((row) => ({ name: row.model, mono: true, ...row }))} />
              )}
            </div>
            <div>
              <Label>By task</Label>
              {byTask.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-600">No AI runs yet.</p>
              ) : (
                <UsageTable rows={byTask.map((row) => ({ name: TASK_LABELS[row.task], mono: false, ...row }))} />
              )}
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral-600">
            Estimated from stored token counts at each model&apos;s list price, converted at ₹{usdToInr} per US$.
            {unpricedModels.length > 0 && ` No price set for ${unpricedModels.join(", ")}.`}
          </p>
        </div>
      )}
    </section>
  );
}

function UsageTable({
  rows,
}: {
  rows: { name: string; mono: boolean; runs: number; inputTokens: number; outputTokens: number; costInr: number | null }[];
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-md text-sm">
        <thead className={`text-left ${labelClass}`}>
          <tr>
            <th scope="col" className="pb-2.5 font-semibold" />
            <th scope="col" className="pb-2.5 text-right font-semibold">
              Runs
            </th>
            <th scope="col" className="pb-2.5 text-right font-semibold">
              Input
            </th>
            <th scope="col" className="pb-2.5 text-right font-semibold">
              Output
            </th>
            <th scope="col" className="pb-2.5 text-right font-semibold">
              Cost
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((row) => (
            <tr key={row.name}>
              <td className={`py-2.5 ${row.mono ? "font-mono text-xs" : ""}`}>{row.name}</td>
              <td className="py-2.5 text-right tabular-nums">{formatCount(row.runs)}</td>
              <td className="py-2.5 text-right tabular-nums">{formatCount(row.inputTokens)}</td>
              <td className="py-2.5 text-right tabular-nums">{formatCount(row.outputTokens)}</td>
              <td className="py-2.5 text-right tabular-nums">
                {row.costInr === null ? <Dash /> : formatCostInr(row.costInr)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
