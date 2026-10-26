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
        description="Tickets and AI usage"
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

// The one sentence an admin should read before the four figures. A rate of 0%
// is left out: on a handful of tickets it means nobody has corrected anything
// yet, not that the model is never wrong.
function aiFinding(stats: AdminStats): string | null {
  const { avgConfidence, classified, overridden, drafts } = stats.quality;
  if (classified === 0 && drafts.total === 0) return null;
  if (drafts.flagged > 0) {
    return `${drafts.flagged} of ${drafts.total} drafts flagged as not good enough.`;
  }
  if (overridden.either > 0) {
    return `Admins changed ${overridden.either} of ${classified} classifications.`;
  }
  if (avgConfidence !== null) {
    return `No corrections yet, so ${formatPercent(avgConfidence)} is only the model's own score.`;
  }
  return "No corrections yet.";
}

function AiAssistant({ stats }: { stats: AdminStats }) {
  const { tokens, byModel, byTask, avgCostPerTicketInr, usdToInr, unpricedModels } = stats.ai;
  const { avgConfidence, classified, overridden, drafts, recentFlagged } = stats.quality;
  const showDetails = useSyncExternalStore(subscribeDetails, readDetailsOpen, () => false);
  const finding = aiFinding(stats);

  return (
    <section aria-labelledby="ai" className={panelClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai" className={labelClass}>
          AI assistant
        </h2>
        <button
          type="button"
          aria-expanded={showDetails}
          aria-controls="ai-details"
          onClick={() => writeDetailsOpen(!showDetails)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {showDetails ? "Hide" : "Show"} cost breakdown
          <ChevronDown
            className={`size-4 transition motion-reduce:transition-none ${showDetails ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      {finding && <p className="mt-3 text-sm text-neutral-800">{finding}</p>}

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-neutral-200 pt-5 xl:grid-cols-4 xl:gap-0 xl:divide-x xl:divide-neutral-200">
        <div className="xl:pr-5">
          <dt className="min-h-10 text-sm text-neutral-600 xl:min-h-0">Overridden by an admin</dt>
          <dd className="mt-1 text-3xl font-semibold leading-none tabular-nums">{overridden.either}</dd>
          <dd className="mt-1.5 text-xs text-neutral-600">
            {overridden.either > 0
              ? `${overridden.category} category, ${overridden.priority} priority`
              : `of ${classified} classified`}
          </dd>
        </div>
        <div className="xl:px-5">
          <dt className="min-h-10 text-sm text-neutral-600 xl:min-h-0">Drafts flagged</dt>
          <dd
            className={`mt-1 text-3xl font-semibold leading-none tabular-nums ${drafts.flagged > 0 ? "text-red-700" : ""}`}
          >
            {drafts.flagged}
          </dd>
          <dd className="mt-1.5 text-xs text-neutral-600">of {drafts.total} drafts</dd>
        </div>
        <div className="xl:px-5">
          <dt className="min-h-10 text-sm text-neutral-600 xl:min-h-0">Average confidence</dt>
          <dd className="mt-1 text-3xl font-semibold leading-none tabular-nums">
            {avgConfidence === null ? <Dash /> : formatPercent(avgConfidence)}
          </dd>
          <dd className="mt-1.5 text-xs text-neutral-600">
            {avgConfidence === null ? "not scored yet" : "model's own score"}
          </dd>
        </div>
        <div className="xl:pl-5">
          <dt className="min-h-10 text-sm text-neutral-600 xl:min-h-0">Cost per ticket</dt>
          <dd className="mt-1 text-3xl font-semibold leading-none tabular-nums">
            {avgCostPerTicketInr === null ? <Dash /> : formatCostInr(avgCostPerTicketInr)}
          </dd>
          <dd className="mt-1.5 text-xs text-neutral-600">
            {avgCostPerTicketInr === null ? "no runs yet" : `${formatCostInr(tokens.all.costInr)} in all`}
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
        <div id="ai-details" className="mt-5 border-t border-neutral-200 pt-5">
          <AiSpend byModel={byModel} byTask={byTask} total={tokens.all} />
          <p className="mt-3 text-xs text-neutral-600">
            Estimated from stored token counts at each model&apos;s list price, converted at ₹{usdToInr} per US$.
            {unpricedModels.length > 0 && ` No price set for ${unpricedModels.join(", ")}.`}
          </p>
        </div>
      )}
    </section>
  );
}

// One table for both cuts of the same runs. Tasks show where the money went;
// a second model list appears only when more than one model was used, so a
// single model is not repeated as its own table beside the tasks.
function AiSpend({
  byModel,
  byTask,
  total,
}: {
  byModel: AdminStats["ai"]["byModel"];
  byTask: AdminStats["ai"]["byTask"];
  total: AdminStats["ai"]["tokens"]["all"];
}) {
  const tasks = [...byTask].sort((a, b) => b.costInr - a.costInr || b.runs - a.runs);
  const maxCost = Math.max(0, ...tasks.map((row) => row.costInr));
  const leadingCost = tasks.filter((row) => row.costInr === maxCost).length === 1 ? maxCost : null;
  const runs = byModel.reduce((sum, row) => sum + row.runs, 0);
  const oneModel = byModel.length === 1 ? byModel[0] : null;

  if (tasks.length === 0 && byModel.length === 0) {
    return <p className="text-sm text-neutral-600">No AI runs yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-neutral-600">
            <th scope="col" className="pb-2 text-left font-medium">
              Task
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Runs
            </th>
            <th scope="col" className="hidden pb-2 text-right font-medium sm:table-cell">
              Tokens
            </th>
            <th scope="col" className="pb-2 pl-3 text-right font-medium">
              Cost
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((row) => (
            <tr key={row.task} className="border-t border-neutral-100">
              <th scope="row" className="w-[46%] py-2.5 pr-3 text-left font-normal">
                <span className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <span>{TASK_LABELS[row.task]}</span>
                  <CostShare cost={row.costInr} max={maxCost} lead={row.costInr === leadingCost} />
                </span>
                <TokenLine input={row.inputTokens} output={row.outputTokens} />
              </th>
              <td className="py-2.5 text-right tabular-nums">{formatCount(row.runs)}</td>
              <TokenCell input={row.inputTokens} output={row.outputTokens} />
              <td className="py-2.5 pl-3 text-right tabular-nums">{formatCostInr(row.costInr)}</td>
            </tr>
          ))}
          {byModel.length > 1 && (
            <>
              <tr>
                <th colSpan={4} scope="colgroup" className="pt-4 pb-1 text-left text-xs font-medium text-neutral-600">
                  Models
                </th>
              </tr>
              {byModel.map((row) => (
                <tr key={row.model} className="border-t border-neutral-100">
                  <th scope="row" className="py-2.5 pr-3 text-left font-mono text-xs font-normal">
                    {row.model}
                    <TokenLine input={row.inputTokens} output={row.outputTokens} />
                  </th>
                  <td className="py-2.5 text-right tabular-nums">{formatCount(row.runs)}</td>
                  <TokenCell input={row.inputTokens} output={row.outputTokens} />
                  <td className="py-2.5 pl-3 text-right tabular-nums">
                    {row.costInr === null ? <Dash /> : formatCostInr(row.costInr)}
                  </td>
                </tr>
              ))}
            </>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-neutral-200 font-medium">
            <th scope="row" className="py-2.5 pr-3 text-left font-medium">
              All runs
              {oneModel && (
                <span className="mt-0.5 block font-mono text-xs font-normal text-neutral-600">{oneModel.model}</span>
              )}
              <TokenLine input={total.inputTokens} output={total.outputTokens} />
            </th>
            <td className="py-2.5 text-right tabular-nums">{formatCount(runs)}</td>
            <TokenCell input={total.inputTokens} output={total.outputTokens} />
            <td className="py-2.5 pl-3 text-right tabular-nums">{formatCostInr(total.costInr)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TokenLine({ input, output }: { input: number; output: number }) {
  return (
    <span className="mt-0.5 block text-xs font-normal text-neutral-600 sm:hidden">
      {formatCount(input)} in · {formatCount(output)} out
    </span>
  );
}

function TokenCell({ input, output }: { input: number; output: number }) {
  return (
    <td className="hidden py-2.5 text-right leading-5 tabular-nums sm:table-cell">
      <span className="block whitespace-nowrap">
        {formatCount(input)} <span className="text-neutral-600">in</span>
      </span>
      <span className="block whitespace-nowrap text-xs text-neutral-600">
        {formatCount(output)} <span>out</span>
      </span>
    </td>
  );
}

// The longest bar is the dearest task, in ink. A tie stays grey, and a zero
// draws no stub, so the bar never invents a winner or a sliver of cost.
function CostShare({ cost, max, lead }: { cost: number; max: number; lead: boolean }) {
  if (max <= 0 || cost <= 0) return null;
  return (
    <span className="block h-1 w-28 shrink-0 rounded-full bg-neutral-200" aria-hidden>
      <span
        className={`block h-full rounded-full ${lead ? "bg-ink" : "bg-neutral-400"}`}
        style={{ width: `${(cost / max) * 100}%` }}
      />
    </span>
  );
}
