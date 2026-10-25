"use client";

import { Flag } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";
import { Card, Dash, ErrorState, PageHeader, Skeleton } from "@/components/ui";
import type { Envelope } from "@/lib/api";
import { formatAge, formatCostInr, formatCount, formatPercent } from "@/lib/format";
import { ADMIN_STATS_KEY } from "@/lib/keys";
import type { AdminStats } from "@/lib/types";

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
        <div className="space-y-8">
          <TicketsSection stats={stats} />
          <AiUsageSection stats={stats} />
          <AiQualitySection stats={stats} />
        </div>
      )}
    </>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold text-neutral-700">{children}</h2>;
}

function Label({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{children}</p>;
}

function Big({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-3xl font-semibold tabular-nums">{children}</p>;
}

function TicketsSection({ stats }: { stats: AdminStats }) {
  const { created, closed, open, total, daily } = stats.tickets;
  const openShare = total > 0 ? (open / total) * 100 : 0;
  return (
    <section>
      <SectionTitle>Tickets</SectionTitle>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <Label>Today</Label>
          <Big>{created.today}</Big>
          <p className="mt-1 text-sm text-neutral-600">new · {closed.today} closed</p>
        </Card>
        <Card>
          <Label>This week</Label>
          <Big>{created.week}</Big>
          <p className="mt-1 text-sm text-neutral-600">new · {closed.week} closed</p>
        </Card>
        <Card>
          <Label>All tickets</Label>
          <Big>{total}</Big>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-emerald-100" aria-hidden>
            <div className="bg-amber-400" style={{ width: `${openShare}%` }} />
          </div>
          <p className="mt-2 flex justify-between text-sm text-neutral-600">
            <span>
              <span className="mr-1 inline-block size-2 rounded-full bg-amber-400" aria-hidden />
              {open} open
            </span>
            <span>
              <span className="mr-1 inline-block size-2 rounded-full bg-emerald-300" aria-hidden />
              {closed.all} resolved or closed
            </span>
          </p>
        </Card>
      </div>
      <DailyBars daily={daily} />
    </section>
  );
}

// New tickets per day for the last 14 days, as plain CSS bars.
function DailyBars({ daily }: { daily: AdminStats["tickets"]["daily"] }) {
  const max = Math.max(1, ...daily.map((day) => day.created));
  const label = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <Card className="mt-4">
      <Label>New tickets, last 14 days</Label>
      <div className="mt-4 flex h-28 items-end gap-1.5" role="img" aria-label="New tickets per day for the last 14 days">
        {daily.map((day) => (
          <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${label(day.date)}: ${day.created}`}>
            {day.created > 0 && <span className="text-[10px] tabular-nums text-neutral-500">{day.created}</span>}
            <div
              className={`w-full rounded-t ${day.created > 0 ? "bg-emerald-600" : "bg-neutral-200"}`}
              style={{ height: day.created > 0 ? `${(day.created / max) * 80}%` : "2px" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-neutral-500">
        <span>{daily[0] && label(daily[0].date)}</span>
        <span>Today</span>
      </div>
    </Card>
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
      <div className="grid gap-4 md:grid-cols-4">
        {periods.map(([title, period]) => (
          <Card key={title}>
            <Label>{title}</Label>
            <Big>{formatCostInr(period.costInr)}</Big>
            <p className="mt-1 text-sm text-neutral-600">{formatCount(period.inputTokens + period.outputTokens)} tokens</p>
          </Card>
        ))}
        <Card>
          <Label>Per ticket</Label>
          <Big>{avgCostPerTicketInr === null ? <Dash /> : formatCostInr(avgCostPerTicketInr)}</Big>
          <p className="mt-1 text-sm text-neutral-600">average, classify + draft</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <Label>Models in use</Label>
          {byModel.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No AI runs yet.</p>
          ) : (
            <UsageTable
              rows={byModel.map((row) => ({ name: row.model, mono: true, ...row }))}
            />
          )}
        </Card>
        <Card>
          <Label>By task</Label>
          {byTask.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No AI runs yet.</p>
          ) : (
            <UsageTable rows={byTask.map((row) => ({ name: TASK_LABELS[row.task], mono: false, ...row }))} />
          )}
        </Card>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
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
    <table className="mt-3 w-full text-sm">
      <thead className="text-left text-xs text-neutral-500">
        <tr>
          <th className="pb-2 font-medium" />
          <th className="pb-2 text-right font-medium">Runs</th>
          <th className="pb-2 text-right font-medium">Input</th>
          <th className="pb-2 text-right font-medium">Output</th>
          <th className="pb-2 text-right font-medium">Cost</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {rows.map((row) => (
          <tr key={row.name}>
            <td className={`py-2 ${row.mono ? "font-mono text-xs" : ""}`}>{row.name}</td>
            <td className="py-2 text-right tabular-nums">{formatCount(row.runs)}</td>
            <td className="py-2 text-right tabular-nums">{formatCount(row.inputTokens)}</td>
            <td className="py-2 text-right tabular-nums">{formatCount(row.outputTokens)}</td>
            <td className="py-2 text-right tabular-nums">{row.costInr === null ? <Dash /> : formatCostInr(row.costInr)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AiQualitySection({ stats }: { stats: AdminStats }) {
  const { avgConfidence, classified, overridden, drafts, recentFlagged } = stats.quality;
  return (
    <section>
      <SectionTitle>AI quality</SectionTitle>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <Label>Average confidence</Label>
          <Big>{avgConfidence === null ? <Dash /> : formatPercent(avgConfidence)}</Big>
          <p className="mt-1 text-sm text-neutral-600">across {classified} classified tickets</p>
        </Card>
        <Card>
          <Label>Overridden by an admin</Label>
          <Big>{overridden.rate === null ? <Dash /> : formatPercent(overridden.rate)}</Big>
          <p className="mt-1 text-sm text-neutral-600">
            {overridden.either} of {classified} · {overridden.category} category, {overridden.priority} priority
          </p>
        </Card>
        <Card>
          <Label>Drafts flagged</Label>
          <Big>{drafts.rate === null ? <Dash /> : formatPercent(drafts.rate)}</Big>
          <p className="mt-1 text-sm text-neutral-600">
            {drafts.flagged} of {drafts.total} drafts marked not good enough
          </p>
        </Card>
      </div>

      {recentFlagged.length > 0 && (
        <Card className="mt-4">
          <Label>Recently flagged drafts</Label>
          <ul className="mt-3 divide-y divide-neutral-100">
            {recentFlagged.map((item) => (
              <li key={`${item.ticketId}-${item.flaggedAt}`}>
                <Link
                  href={`/admin/tickets/${item.ticketId}`}
                  className="flex items-center gap-3 py-2 text-sm hover:text-emerald-800"
                >
                  <Flag className="size-3.5 shrink-0 fill-current text-red-600" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-neutral-500">{item.publicId}</span> {item.subject}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">{formatAge(item.flaggedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
