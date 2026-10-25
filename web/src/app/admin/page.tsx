"use client";

import { Flag } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";
import { Dash, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import type { Envelope } from "@/lib/api";
import { formatAge, formatCostInr, formatCount, formatPercent } from "@/lib/format";
import { ADMIN_STATS_KEY } from "@/lib/keys";
import type { AdminStats } from "@/lib/types";

// The same panel and label styling as the ticket queue and ticket detail
// pages, so the three admin screens read as one surface.
const panelClass = "rounded-2xl border border-neutral-200 bg-white p-5";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-neutral-600";

// Kept live by the SSE stream: every ticket change refetches these numbers.
export default function AdminDashboardPage() {
  const { data, error, isValidating, mutate } = useSWR<Envelope<AdminStats>>(ADMIN_STATS_KEY);
  const stats = data?.data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Tickets and AI usage. Today and this week use India time; weeks start on Monday."
        onRefresh={() => void mutate()}
        refreshing={isValidating}
      />

      {error && <ErrorState message="The dashboard could not be loaded." onRetry={() => void mutate()} />}

      {!stats && !error && (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {stats && (
        <div className="space-y-10">
          <TicketsSection stats={stats} />
          <AiUsageSection stats={stats} />
          <AiQualitySection stats={stats} />
        </div>
      )}
    </>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${panelClass} ${className}`}>{children}</div>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className={`mb-3 ${labelClass}`}>{children}</h2>;
}

function Label({ children }: { children: ReactNode }) {
  return <p className={labelClass}>{children}</p>;
}

function Big({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-3xl font-semibold leading-none tabular-nums">{children}</p>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm text-neutral-600">{children}</p>;
}

function TicketsSection({ stats }: { stats: AdminStats }) {
  const { created, closed, open, total, daily } = stats.tickets;
  const openShare = total > 0 ? (open / total) * 100 : 0;
  return (
    <section>
      <SectionTitle>Tickets</SectionTitle>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel>
          <Label>Today</Label>
          <Big>{created.today}</Big>
          <Note>
            new · {closed.today} closed
          </Note>
        </Panel>
        <Panel>
          <Label>This week</Label>
          <Big>{created.week}</Big>
          <Note>
            new · {closed.week} closed
          </Note>
        </Panel>
        <Panel>
          <Label>All tickets</Label>
          <Big>{total}</Big>
          {/* Two solid segments separated by a surface gap, so the split reads
              at a glance; the counts below say the same thing in words. */}
          <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            <div className="rounded-full bg-amber-500" style={{ width: `${openShare}%` }} />
            <div className="flex-1 rounded-full bg-emerald-600" />
          </div>
          <p className="mt-2 flex flex-wrap justify-between gap-x-3 text-sm text-neutral-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500" aria-hidden />
              {open} open
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-600" aria-hidden />
              {closed.all} resolved or closed
            </span>
          </p>
        </Panel>
      </div>
      <DailyBars daily={daily} />
    </section>
  );
}

// New tickets per day for the last 14 days, as plain CSS bars. One series, so
// no legend; only the busiest day and the last day carry a printed value.
function DailyBars({ daily }: { daily: AdminStats["tickets"]["daily"] }) {
  const max = Math.max(1, ...daily.map((day) => day.created));
  const lastIndex = daily.length - 1;
  const label = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <Panel className="mt-4">
      <Label>New tickets, last 14 days</Label>
      <div
        className="mt-4 flex h-28 items-end gap-1.5"
        role="img"
        aria-label="New tickets per day for the last 14 days"
      >
        {daily.map((day, index) => {
          const labelled = day.created > 0 && (day.created === max || index === lastIndex);
          return (
            <div
              key={day.date}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
              title={`${label(day.date)}: ${day.created}`}
            >
              {labelled && <span className="text-[0.6875rem] tabular-nums text-neutral-600">{day.created}</span>}
              <div
                className={`w-full rounded-t ${day.created > 0 ? "bg-emerald-600" : "bg-neutral-200"}`}
                style={{ height: day.created > 0 ? `${(day.created / max) * 80}%` : "2px" }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-neutral-600">
        <span>{daily[0] && label(daily[0].date)}</span>
        <span>Today</span>
      </div>
    </Panel>
  );
}

const TASK_LABELS = { classify: "Classification", draft: "Reply drafts" } as const;

function AiUsageSection({ stats }: { stats: AdminStats }) {
  const { tokens, byModel, byTask, avgCostPerTicketInr, usdToInr, unpricedModels } = stats.ai;
  const periods = [
    ["Today", tokens.today],
    ["This week", tokens.week],
    ["All time", tokens.all],
  ] as const;
  return (
    <section>
      <SectionTitle>AI usage and cost</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {periods.map(([title, period]) => (
          <Panel key={title}>
            <Label>{title}</Label>
            <Big>{formatCostInr(period.costInr)}</Big>
            <Note>{formatCount(period.inputTokens + period.outputTokens)} tokens</Note>
          </Panel>
        ))}
        <Panel>
          <Label>Per ticket</Label>
          <Big>{avgCostPerTicketInr === null ? <Dash /> : formatCostInr(avgCostPerTicketInr)}</Big>
          <Note>average, classify + draft</Note>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel>
          <Label>Models in use</Label>
          {byModel.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-600">No AI runs yet.</p>
          ) : (
            <UsageTable rows={byModel.map((row) => ({ name: row.model, mono: true, ...row }))} />
          )}
        </Panel>
        <Panel>
          <Label>By task</Label>
          {byTask.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-600">No AI runs yet.</p>
          ) : (
            <UsageTable rows={byTask.map((row) => ({ name: TASK_LABELS[row.task], mono: false, ...row }))} />
          )}
        </Panel>
      </div>
      <p className="mt-3 text-xs text-neutral-600">
        Estimated from stored token counts at each model&apos;s list price, converted at ₹{usdToInr} per US$.
        {unpricedModels.length > 0 && ` No price set for ${unpricedModels.join(", ")}.`}
      </p>
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

function AiQualitySection({ stats }: { stats: AdminStats }) {
  const { avgConfidence, classified, overridden, drafts, recentFlagged } = stats.quality;
  return (
    <section>
      <SectionTitle>AI quality</SectionTitle>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel>
          <Label>Average confidence</Label>
          <Big>{avgConfidence === null ? <Dash /> : formatPercent(avgConfidence)}</Big>
          <Note>across {classified} classified tickets</Note>
        </Panel>
        <Panel>
          <Label>Overridden by an admin</Label>
          <Big>{overridden.rate === null ? <Dash /> : formatPercent(overridden.rate)}</Big>
          <Note>
            {overridden.either} of {classified} · {overridden.category} category, {overridden.priority} priority
          </Note>
        </Panel>
        <Panel>
          <Label>Drafts flagged</Label>
          <Big>{drafts.rate === null ? <Dash /> : formatPercent(drafts.rate)}</Big>
          <Note>
            {drafts.flagged} of {drafts.total} drafts marked not good enough
          </Note>
        </Panel>
      </div>

      {recentFlagged.length > 0 && (
        <Panel className="mt-4">
          <Label>Recently flagged drafts</Label>
          <ul className="mt-2 divide-y divide-neutral-100">
            {recentFlagged.map((item) => (
              <li key={`${item.ticketId}-${item.flaggedAt}`}>
                <Link
                  href={`/admin/tickets/${item.ticketId}`}
                  className="flex items-center gap-3 py-2.5 text-sm hover:text-emerald-800"
                >
                  <Flag className="size-3.5 shrink-0 fill-current text-red-600" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-neutral-600">{item.publicId}</span> {item.subject}
                  </span>
                  <time
                    className="shrink-0 text-xs text-neutral-600"
                    dateTime={item.flaggedAt}
                  >
                    {formatAge(item.flaggedAt)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </section>
  );
}
