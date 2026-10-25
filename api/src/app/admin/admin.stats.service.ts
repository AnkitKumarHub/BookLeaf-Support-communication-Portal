import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { aiRuns, ticketEvents, tickets } from "../../db/schema.js";
import { costInr, MODEL_PRICES_USD_PER_MILLION, usdToInr } from "../ai/pricing.js";

// "Today" and "this week" are India time: a ticket at 11pm IST counts as today.
// Weeks start on Monday (Postgres date_trunc).
const TZ = "Asia/Kolkata";
const todayStart = sql`(date_trunc('day', now() at time zone ${sql.raw(`'${TZ}'`)}) at time zone ${sql.raw(`'${TZ}'`)})`;
const weekStart = sql`(date_trunc('week', now() at time zone ${sql.raw(`'${TZ}'`)}) at time zone ${sql.raw(`'${TZ}'`)})`;

const DAILY_DAYS = 14;

type Period = "today" | "week" | "all";
type TokenTotals = { inputTokens: number; outputTokens: number; costInr: number };

export type AdminStatsJson = {
  generatedAt: string;
  tickets: {
    created: Record<Period, number>;
    closed: Record<Period, number>;
    open: number;
    total: number;
    daily: { date: string; created: number }[];
  };
  ai: {
    usdToInr: number;
    tokens: Record<Period, TokenTotals>;
    byModel: { model: string; runs: number; inputTokens: number; outputTokens: number; costInr: number | null; priced: boolean }[];
    byTask: { task: "classify" | "draft"; runs: number; inputTokens: number; outputTokens: number; costInr: number }[];
    avgCostPerTicketInr: number | null;
    unpricedModels: string[];
  };
  quality: {
    avgConfidence: number | null;
    classified: number;
    overridden: { category: number; priority: number; either: number; rate: number | null };
    drafts: { total: number; flagged: number; rate: number | null };
    recentFlagged: { ticketId: string; publicId: string; subject: string; flaggedAt: string }[];
  };
};

const num = (value: unknown) => Number(value ?? 0);
const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

export async function getAdminStats(): Promise<AdminStatsJson> {
  const [ticketCounts, closedCounts, daily, runRows, aiTickets, quality, drafts, recentFlagged] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)`,
        open: sql<number>`count(*) filter (where ${tickets.status} in ('open', 'in_progress'))`,
        closed: sql<number>`count(*) filter (where ${tickets.status} in ('resolved', 'closed'))`,
        createdToday: sql<number>`count(*) filter (where ${tickets.createdAt} >= ${todayStart})`,
        createdWeek: sql<number>`count(*) filter (where ${tickets.createdAt} >= ${weekStart})`,
      })
      .from(tickets),

    // Closed in a period = the ticket moved to resolved or closed in that period.
    db
      .select({
        today: sql<number>`count(distinct ${ticketEvents.ticketId}) filter (where ${ticketEvents.createdAt} >= ${todayStart})`,
        week: sql<number>`count(distinct ${ticketEvents.ticketId}) filter (where ${ticketEvents.createdAt} >= ${weekStart})`,
      })
      .from(ticketEvents)
      .where(
        and(
          eq(ticketEvents.eventType, "ticket.status_changed"),
          sql`${ticketEvents.payload}->>'to' in ('resolved', 'closed')`,
        ),
      ),

    db.execute<{ date: string; created: number }>(sql`
      select to_char(d, 'YYYY-MM-DD') as date, count(t.id)::int as created
      from generate_series(
        (now() at time zone ${sql.raw(`'${TZ}'`)})::date - ${DAILY_DAYS - 1}::int,
        (now() at time zone ${sql.raw(`'${TZ}'`)})::date,
        interval '1 day'
      ) as d
      left join ${tickets} t on (t.created_at at time zone ${sql.raw(`'${TZ}'`)})::date = d::date
      group by d
      order by d
    `),

    db
      .select({
        model: aiRuns.model,
        task: aiRuns.taskType,
        runs: sql<number>`count(*)`,
        inAll: sql<number>`coalesce(sum(${aiRuns.inputTokens}), 0)`,
        outAll: sql<number>`coalesce(sum(${aiRuns.outputTokens}), 0)`,
        inToday: sql<number>`coalesce(sum(${aiRuns.inputTokens}) filter (where ${aiRuns.startedAt} >= ${todayStart}), 0)`,
        outToday: sql<number>`coalesce(sum(${aiRuns.outputTokens}) filter (where ${aiRuns.startedAt} >= ${todayStart}), 0)`,
        inWeek: sql<number>`coalesce(sum(${aiRuns.inputTokens}) filter (where ${aiRuns.startedAt} >= ${weekStart}), 0)`,
        outWeek: sql<number>`coalesce(sum(${aiRuns.outputTokens}) filter (where ${aiRuns.startedAt} >= ${weekStart}), 0)`,
      })
      .from(aiRuns)
      .groupBy(aiRuns.model, aiRuns.taskType),

    db.select({ n: sql<number>`count(distinct ${aiRuns.ticketId})` }).from(aiRuns),

    // Override rate: of the tickets the AI classified, how many an admin changed.
    db
      .select({
        classified: sql<number>`count(*)`,
        avgConfidence: sql<string | null>`avg(${tickets.aiConfidence})`,
        category: sql<number>`count(*) filter (where ${tickets.categoryOverride} is not null and ${tickets.categoryOverride} <> ${tickets.aiCategory})`,
        priority: sql<number>`count(*) filter (where ${tickets.priorityOverride} is not null and ${tickets.priorityOverride} <> ${tickets.aiPriority})`,
        either: sql<number>`count(*) filter (where (${tickets.categoryOverride} is not null and ${tickets.categoryOverride} <> ${tickets.aiCategory}) or (${tickets.priorityOverride} is not null and ${tickets.priorityOverride} <> ${tickets.aiPriority}))`,
      })
      .from(tickets)
      .where(eq(tickets.aiState, "completed")),

    db
      .select({
        total: sql<number>`count(*)`,
        flagged: sql<number>`count(*) filter (where ${aiRuns.flaggedAt} is not null)`,
      })
      .from(aiRuns)
      .where(and(eq(aiRuns.taskType, "draft"), eq(aiRuns.state, "completed"), isNull(aiRuns.errorCode))),

    db
      .select({
        ticketId: tickets.id,
        publicId: tickets.publicId,
        subject: tickets.subject,
        flaggedAt: aiRuns.flaggedAt,
      })
      .from(aiRuns)
      .innerJoin(tickets, eq(aiRuns.ticketId, tickets.id))
      .where(isNotNull(aiRuns.flaggedAt))
      .orderBy(desc(aiRuns.flaggedAt))
      .limit(5),
  ]);

  const tokens: Record<Period, TokenTotals> = {
    today: { inputTokens: 0, outputTokens: 0, costInr: 0 },
    week: { inputTokens: 0, outputTokens: 0, costInr: 0 },
    all: { inputTokens: 0, outputTokens: 0, costInr: 0 },
  };
  const models = new Map<string, AdminStatsJson["ai"]["byModel"][number]>();
  const tasks = new Map<"classify" | "draft", AdminStatsJson["ai"]["byTask"][number]>();

  for (const row of runRows) {
    const periods: [Period, number, number][] = [
      ["today", num(row.inToday), num(row.outToday)],
      ["week", num(row.inWeek), num(row.outWeek)],
      ["all", num(row.inAll), num(row.outAll)],
    ];
    for (const [period, input, output] of periods) {
      tokens[period].inputTokens += input;
      tokens[period].outputTokens += output;
      tokens[period].costInr += costInr(row.model, input, output) ?? 0;
    }

    const allCost = costInr(row.model, num(row.inAll), num(row.outAll));
    const model = models.get(row.model) ?? {
      model: row.model,
      runs: 0,
      inputTokens: 0,
      outputTokens: 0,
      costInr: 0,
      priced: row.model in MODEL_PRICES_USD_PER_MILLION,
    };
    model.runs += num(row.runs);
    model.inputTokens += num(row.inAll);
    model.outputTokens += num(row.outAll);
    model.costInr = model.priced ? (model.costInr ?? 0) + (allCost ?? 0) : null;
    models.set(row.model, model);

    const task = tasks.get(row.task) ?? { task: row.task, runs: 0, inputTokens: 0, outputTokens: 0, costInr: 0 };
    task.runs += num(row.runs);
    task.inputTokens += num(row.inAll);
    task.outputTokens += num(row.outAll);
    task.costInr += allCost ?? 0;
    tasks.set(row.task, task);
  }

  const counts = ticketCounts[0];
  const closed = closedCounts[0];
  const q = quality[0];
  const d = drafts[0];
  const ticketsWithAi = num(aiTickets[0]?.n);
  const classified = num(q?.classified);
  const either = num(q?.either);

  return {
    generatedAt: new Date().toISOString(),
    tickets: {
      created: { today: num(counts?.createdToday), week: num(counts?.createdWeek), all: num(counts?.total) },
      closed: { today: num(closed?.today), week: num(closed?.week), all: num(counts?.closed) },
      open: num(counts?.open),
      total: num(counts?.total),
      daily: daily.map((row) => ({ date: row.date, created: num(row.created) })),
    },
    ai: {
      usdToInr: usdToInr(),
      tokens,
      byModel: [...models.values()].sort((a, b) => b.runs - a.runs),
      byTask: [...tasks.values()],
      avgCostPerTicketInr: ticketsWithAi > 0 ? tokens.all.costInr / ticketsWithAi : null,
      unpricedModels: [...models.values()].filter((m) => !m.priced).map((m) => m.model),
    },
    quality: {
      avgConfidence: q?.avgConfidence == null ? null : Number(q.avgConfidence),
      classified,
      overridden: { category: num(q?.category), priority: num(q?.priority), either, rate: ratio(either, classified) },
      drafts: { total: num(d?.total), flagged: num(d?.flagged), rate: ratio(num(d?.flagged), num(d?.total)) },
      recentFlagged: recentFlagged.map((row) => ({
        ticketId: row.ticketId,
        publicId: row.publicId,
        subject: row.subject,
        flaggedAt: row.flaggedAt!.toISOString(),
      })),
    },
  };
}
