"use client";

import { Flag } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";
import { Dash, ErrorState, PageHeader, PriorityBadge, Skeleton } from "@/components/ui";
import type { Envelope } from "@/lib/api";
import {
  formatAge,
  formatCostInr,
  formatCount,
  formatDate,
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
// Every tile in the bento starts at the same height, so a row of small ones
// lines up with the wider tile beside it.
const tileClass = `${panelClass} flex min-h-36 flex-col justify-between`;

// The top of the queue, in the queue's own order. A handful is enough: this
// is a way in, not a second copy of the queue.
const WAITING_KEY = "/admin/tickets?limit=8&page=1";
const WAITING_SHOWN = 5;

// Kept live by the SSE stream: every ticket change refetches these numbers.
export default function AdminDashboardPage() {
  const { data, error, isValidating, mutate } = useSWR<Envelope<AdminStats>>(ADMIN_STATS_KEY);
  const waiting = useSWR<Envelope<AdminQueueRow[]>>(WAITING_KEY);
  const stats = data?.data;

  const refresh = () => {
    void mutate();
    void waiting.mutate();
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Tickets and AI usage. Today and this week use India time."
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full sm:col-span-2" />
          <Skeleton className="h-80 w-full sm:col-span-2" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full sm:col-span-2" />
          <Skeleton className="h-64 w-full sm:col-span-2" />
        </div>
      )}

      {/* The bento, in reading order: the two periods and the standing total,
          then the week's shape as a tall anchor with what it cost beside it,
          then the model detail, then the work waiting. Each tile declares its
          own span. */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Flow label="Today" created={stats.tickets.created.today} closed={stats.tickets.closed.today} />
          <Flow label="This week" created={stats.tickets.created.week} closed={stats.tickets.closed.week} />
          <AllTickets tickets={stats.tickets} />
          <NewTickets daily={stats.tickets.daily} />
          <AiCost ai={stats.ai} />
          <PerTicket ai={stats.ai} />
          <Confidence quality={stats.quality} />
          <ModelsInUse ai={stats.ai} />
          <AiQuality stats={stats} />
          <WaitingOnUs rows={waiting.data?.data} failed={Boolean(waiting.error)} />
        </div>
      )}
    </>
  );
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z]+/g, "-");
}

// New tickets and closures for one period. Two of these sit side by side, so
// the label is the only thing that differs.
function Flow({ label, created, closed }: { label: string; created: number; closed: number }) {
  const id = slug(label);
  return (
    <section aria-labelledby={id} className={tileClass}>
      <h2 id={id} className={labelClass}>
        {label}
      </h2>
      <div>
        <p className="text-4xl font-semibold leading-none tabular-nums">{created}</p>
        <p className="mt-2 text-sm text-neutral-600">
          new &middot; {closed} closed
        </p>
      </div>
    </section>
  );
}

// A standing figure, not a flow: the two tiles beside it count what arrived in
// a window, this counts what is on the books right now.
function AllTickets({ tickets }: { tickets: AdminStats["tickets"] }) {
  const { open, total, closed } = tickets;
  // Explicit widths rather than a flexing remainder, so an empty queue draws
  // an empty track instead of a full bar of "resolved".
  const openShare = total > 0 ? (open / total) * 100 : 0;
  const closedShare = total > 0 ? (closed.all / total) * 100 : 0;

  return (
    <section aria-labelledby="all-tickets" className={`${tileClass} sm:col-span-2`}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="all-tickets" className={labelClass}>
          All tickets
        </h2>
        <span className="text-3xl font-semibold leading-none tabular-nums">{total}</span>
      </div>
      <div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-neutral-200" aria-hidden>
          <div style={{ width: `${openShare}%`, backgroundColor: "var(--color-accent-volume)" }} />
          <div style={{ width: `${closedShare}%`, backgroundColor: "var(--color-accent-done)" }} />
        </div>
        <p className="mt-3 flex flex-wrap justify-between gap-x-3 text-sm text-neutral-600">
          <span className="inline-flex items-center gap-2">
            <Dot color="var(--color-accent-volume)" />
            {open} open
          </span>
          <span className="inline-flex items-center gap-2">
            <Dot color="var(--color-accent-done)" />
            {closed.all} resolved or closed
          </span>
        </p>
      </div>
    </section>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />;
}

// New tickets per day over the window the API returns, as plain CSS bars. One
// series, so no legend; the ends of the range are named underneath.
function NewTickets({ daily }: { daily: AdminStats["tickets"]["daily"] }) {
  const total = daily.reduce((sum, day) => sum + day.created, 0);
  const max = Math.max(1, ...daily.map((day) => day.created));
  // Divisor for the recency fade below. Never zero, however short the series.
  const span = Math.max(1, daily.length - 1);
  const first = daily[0];

  return (
    <section aria-labelledby="new-tickets" className={`${panelClass} sm:col-span-2 xl:row-span-2`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="new-tickets" className={labelClass}>
          New tickets, last {daily.length} days
        </h2>
        <span className="text-xs text-neutral-500">older &rarr; today</span>
      </div>
      <p className="mt-3 text-3xl font-semibold leading-none tabular-nums">{total}</p>
      <p className="mt-2 text-sm text-neutral-600">in total across the window</p>

      {total === 0 ? (
        <p className="mt-5 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-600">
          No new tickets in the last {daily.length} days.
        </p>
      ) : (
        <>
          {/* Taller where the tile spans two bento rows, but a fixed height
              either way: letting it fill the row would stretch the bars to
              whatever the tiles beside it happen to add up to. */}
          <div
            className="mt-6 flex h-28 items-end gap-1 xl:h-60"
            role="img"
            aria-label={`${total} new tickets over the last ${daily.length} days`}
          >
            {daily.map((day, index) => {
              // Today is the strongest bar and each day further back is mixed
              // further into the track colour, so the window reads as a run-up
              // to now rather than a row of equal columns. color-mix keeps this
              // on the palette variables, so it follows both themes.
              const strength = 100 - ((daily.length - 1 - index) / span) * 70;
              const today = index === daily.length - 1;
              return (
                <div
                  key={day.date}
                  className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                  title={`${formatDate(day.date)}: ${day.created}`}
                >
                  {day.created > 0 && (
                    <span
                      className={`text-[0.625rem] tabular-nums ${
                        today ? "font-semibold text-neutral-900" : "text-neutral-500"
                      }`}
                    >
                      {day.created}
                    </span>
                  )}
                  <div
                    className="w-full rounded-t"
                    style={
                      day.created > 0
                        ? {
                            height: `${(day.created / max) * 86}%`,
                            backgroundColor: `color-mix(in oklab, var(--color-accent-volume) ${strength}%, var(--color-neutral-200))`,
                          }
                        : { height: "2px", backgroundColor: "var(--color-neutral-200)" }
                    }
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex justify-between text-xs">
            <span className="text-neutral-500">{first ? formatDate(first.date) : null}</span>
            <span className="font-medium text-neutral-800">Today</span>
          </div>
        </>
      )}
    </section>
  );
}

function AiCost({ ai }: { ai: AdminStats["ai"] }) {
  const { inputTokens, outputTokens, costInr } = ai.tokens.all;
  return (
    <section aria-labelledby="ai-cost" className={tileClass}>
      <h2 id="ai-cost" className={labelClass}>
        AI cost, all time
      </h2>
      <div>
        <p className="text-3xl font-semibold leading-none tabular-nums">{formatCostInr(costInr)}</p>
        <p className="mt-2 text-sm text-neutral-600">{formatCount(inputTokens + outputTokens)} tokens</p>
      </div>
    </section>
  );
}

function PerTicket({ ai }: { ai: AdminStats["ai"] }) {
  return (
    <section aria-labelledby="per-ticket" className={tileClass}>
      <h2 id="per-ticket" className={labelClass}>
        Per ticket
      </h2>
      <div>
        <p className="text-3xl font-semibold leading-none tabular-nums">
          {ai.avgCostPerTicketInr === null ? <Dash /> : formatCostInr(ai.avgCostPerTicketInr)}
        </p>
        <p className="mt-2 text-sm text-neutral-600">
          {ai.avgCostPerTicketInr === null ? "no runs yet" : "classify + draft"}
        </p>
      </div>
    </section>
  );
}

function Confidence({ quality }: { quality: AdminStats["quality"] }) {
  const { avgConfidence, classified } = quality;
  return (
    <section aria-labelledby="confidence" className={`${tileClass} sm:col-span-2`}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="confidence" className={labelClass}>
          Average AI confidence
        </h2>
        <span className="text-sm text-neutral-500">{classified} classified</span>
      </div>
      <div>
        <p className="text-3xl font-semibold leading-none tabular-nums">
          {avgConfidence === null ? <Dash /> : formatPercent(avgConfidence)}
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-200" aria-hidden>
          {avgConfidence !== null && (
            <div
              className="h-full rounded-full"
              style={{
                width: `${avgConfidence * 100}%`,
                backgroundColor: "var(--color-accent-quality)",
              }}
            />
          )}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          {avgConfidence === null ? "nothing scored yet" : "the model's own score, not a measure of accuracy"}
        </p>
      </div>
    </section>
  );
}

const TASK_LABELS = { classify: "Classification", draft: "Reply drafts" } as const;

// One table for both cuts of the same runs. Tasks show where the money went;
// a second model list appears only when more than one model was used, so a
// single model is not repeated as its own table beside the tasks.
function ModelsInUse({ ai }: { ai: AdminStats["ai"] }) {
  const { byModel, byTask, tokens, usdToInr, unpricedModels } = ai;
  const tasks = [...byTask].sort((a, b) => b.costInr - a.costInr || b.runs - a.runs);
  const runs = byModel.reduce((sum, row) => sum + row.runs, 0);
  const oneModel = byModel.length === 1 ? byModel[0] : null;

  return (
    <section aria-labelledby="models" className={`${panelClass} sm:col-span-2`}>
      <h2 id="models" className={labelClass}>
        Models in use
      </h2>

      {tasks.length === 0 && byModel.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-600">No AI runs yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
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
                  Input
                </th>
                <th scope="col" className="hidden pb-2 text-right font-medium sm:table-cell">
                  Output
                </th>
                <th scope="col" className="pb-2 pl-3 text-right font-medium">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((row) => (
                <tr key={row.task} className="border-t border-neutral-100">
                  <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                    {TASK_LABELS[row.task]}
                    <TokenLine input={row.inputTokens} output={row.outputTokens} />
                  </th>
                  <td className="py-2.5 text-right tabular-nums">{formatCount(row.runs)}</td>
                  <TokenCells input={row.inputTokens} output={row.outputTokens} />
                  <td className="py-2.5 pl-3 text-right tabular-nums">{formatCostInr(row.costInr)}</td>
                </tr>
              ))}
              {byModel.length > 1 &&
                byModel.map((row) => (
                  <tr key={row.model} className="border-t border-neutral-100">
                    <th scope="row" className="py-2.5 pr-3 text-left font-mono text-xs font-normal">
                      {row.model}
                      <TokenLine input={row.inputTokens} output={row.outputTokens} />
                    </th>
                    <td className="py-2.5 text-right tabular-nums">{formatCount(row.runs)}</td>
                    <TokenCells input={row.inputTokens} output={row.outputTokens} />
                    <td className="py-2.5 pl-3 text-right tabular-nums">
                      {row.costInr === null ? <Dash /> : formatCostInr(row.costInr)}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-200 font-medium">
                <th scope="row" className="py-2.5 pr-3 text-left font-medium">
                  All runs
                  {oneModel && (
                    <span className="mt-0.5 block font-mono text-xs font-normal text-neutral-600">
                      {oneModel.model}
                    </span>
                  )}
                  <TokenLine input={tokens.all.inputTokens} output={tokens.all.outputTokens} />
                </th>
                <td className="py-2.5 text-right tabular-nums">{formatCount(runs)}</td>
                <TokenCells input={tokens.all.inputTokens} output={tokens.all.outputTokens} />
                <td className="py-2.5 pl-3 text-right tabular-nums">{formatCostInr(tokens.all.costInr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-neutral-500">
        Estimated from stored token counts at each model&apos;s list price, converted at ₹{usdToInr} per US$.
        {unpricedModels.length > 0 && ` No price set for ${unpricedModels.join(", ")}.`}
      </p>
    </section>
  );
}

// Tokens get their own column on a wide table and a second line underneath on
// a narrow one, so the numbers never shrink to fit.
function TokenLine({ input, output }: { input: number; output: number }) {
  return (
    <span className="mt-0.5 block text-xs font-normal text-neutral-600 sm:hidden">
      {formatCount(input)} in &middot; {formatCount(output)} out
    </span>
  );
}

function TokenCells({ input, output }: { input: number; output: number }) {
  return (
    <>
      <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{formatCount(input)}</td>
      <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{formatCount(output)}</td>
    </>
  );
}

// The one sentence an admin should read before the figures. A rate of 0% is
// left out: on a handful of tickets it means nobody has corrected anything
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

function AiQuality({ stats }: { stats: AdminStats }) {
  const { classified, overridden, drafts, recentFlagged } = stats.quality;
  const finding = aiFinding(stats);

  return (
    <section aria-labelledby="ai-quality" className={`${panelClass} sm:col-span-2`}>
      <h2 id="ai-quality" className={labelClass}>
        AI quality
      </h2>
      {finding && <p className="mt-3 text-sm text-neutral-800">{finding}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-neutral-50 p-4">
          <dd className="text-2xl font-semibold leading-none tabular-nums">
            {overridden.rate === null ? <Dash /> : formatPercent(overridden.rate)}
          </dd>
          <dt className="mt-2 text-xs leading-relaxed text-neutral-600">
            Overridden by an admin
            <br />
            {overridden.either} of {classified} classified
          </dt>
        </div>
        <div className="rounded-xl bg-neutral-50 p-4">
          <dd
            className={`text-2xl font-semibold leading-none tabular-nums ${drafts.flagged > 0 ? "text-red-700" : ""}`}
          >
            {drafts.rate === null ? <Dash /> : formatPercent(drafts.rate)}
          </dd>
          <dt className="mt-2 text-xs leading-relaxed text-neutral-600">
            Drafts flagged
            <br />
            {drafts.flagged} of {drafts.total} drafts
          </dt>
        </div>
      </dl>

      {recentFlagged.length > 0 && (
        <div className="mt-5 border-t border-neutral-100 pt-4">
          <p className={labelClass}>Recently flagged drafts</p>
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
    <section aria-labelledby="waiting" className={`${panelClass} min-w-0 sm:col-span-2 xl:col-span-4`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="waiting" className={labelClass}>
          Waiting on us
        </h2>
        <Link
          href="/admin/ticket-queue"
          className="text-xs font-medium text-neutral-800 underline underline-offset-2 hover:text-ink"
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
                    <span
                      className={isOverdue(row.status, row.createdAt) ? "font-semibold text-red-700" : undefined}
                    >
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
