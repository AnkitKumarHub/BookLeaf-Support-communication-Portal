"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";
import {
  buttonClass,
  DraftPill,
  EmptyState,
  ErrorState,
  inputClass,
  PageHeader,
  PriorityBadge,
  Skeleton,
  StatusPill,
} from "@/components/ui";
import type { Envelope } from "@/lib/api";
import {
  CATEGORY_LABELS,
  formatAge,
  formatDateTime,
  formatPercent,
  GENERAL_TICKET_LABEL,
  isOverdue,
  isUnresolved,
  PRIORITY_LABELS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
} from "@/lib/format";
import type { AdminQueueRow } from "@/lib/types";

const PAGE_SIZE = 50;
const FILTER_KEYS = ["status", "category", "priority", "assignee", "from", "to", "q"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

// Shared with the dashboard and the ticket detail page, so the three admin
// screens read as one surface.
const panelClass = "rounded-2xl border border-neutral-200 bg-white p-5";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-neutral-600";
// Ticket, assignee, AI draft. Declared once so the header and the rows below
// it can never drift out of alignment.
const ROW_COLUMNS = "lg:grid-cols-[minmax(0,1fr)_11rem_11rem]";

export default function AdminQueuePage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Queue />
    </Suspense>
  );
}

function Queue() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  // The URL is the source of truth for filters, so refresh and shared links keep them.
  const query = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  const { data, error, isValidating, mutate } = useSWR<Envelope<AdminQueueRow[]>>(`/admin/tickets?${query}`);

  const setFilter = useCallback(
    (key: FilterKey | "page", value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "page") next.delete("page");
      const text = next.toString();
      router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const hasFilters = FILTER_KEYS.some((key) => params.get(key));
  const total = data?.meta?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = data?.data;
  // Counted by the API over everything the filters match, not just this page.
  const counts = data?.meta?.counts;

  return (
    <>
      <PageHeader
        title="Ticket queue"
        description="Critical first, then high, then medium — open work above anything resolved."
        onRefresh={() => void mutate()}
        refreshing={isValidating}
      />

      <div className="space-y-4">
        {/* The filters take most of the width and the two tallies sit beside
            them, stacked so the whole block is two rows deep either way. */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3.4fr)_minmax(0,1fr)]">
          <Filters
            params={params}
            onChange={setFilter}
            onClear={() => router.replace(pathname, { scroll: false })}
            hasFilters={hasFilters}
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Glance label="Needs a reply" value={counts?.needsReply} />
            <Glance label="Draft ready" value={counts?.draftReady} />
          </div>
        </div>

        {error && <ErrorState message="The queue could not be loaded." onRetry={() => void mutate()} />}

        {!data && !error && (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        )}

        {rows && rows.length === 0 && (
          <EmptyState title={hasFilters ? "No tickets match these filters" : "No tickets yet"}>
            {hasFilters && (
              <button
                type="button"
                onClick={() => router.replace(pathname)}
                className="font-medium text-neutral-800 underline underline-offset-2 hover:text-ink"
              >
                Clear filters
              </button>
            )}
          </EmptyState>
        )}

        {rows && rows.length > 0 && (
          <section aria-labelledby="queue-heading">
            <h2 id="queue-heading" className={`${labelClass} mb-3`}>
              {total} {total === 1 ? "ticket" : "tickets"}
              {hasFilters ? " matching these filters" : ""}
            </h2>

            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              {/* Column headers, so assignee and AI draft read as columns
                  rather than as two things stacked on the right. Hidden on
                  narrow screens, where each row stacks instead. */}
              <div
                aria-hidden
                className={`hidden gap-5 border-b border-neutral-200 bg-neutral-50 px-5 py-3 ${labelClass} lg:grid ${ROW_COLUMNS}`}
              >
                <span>Ticket</span>
                <span>Assignee</span>
                <span>AI draft</span>
              </div>
              <ul>
                {rows.map((row) => (
                  <QueueRow key={row.id} row={row} />
                ))}
              </ul>
            </div>

            {pages > 1 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={page <= 1}
                  onClick={() => setFilter("page", String(page - 1))}
                >
                  Previous
                </button>
                <span className="text-sm text-neutral-600">
                  Page {page} of {pages}
                </span>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={page >= pages}
                  onClick={() => setFilter("page", String(page + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}

// A tally over the current filters. Undefined while the first page loads, so
// the tile shows a dash rather than a zero it has not counted yet.
function Glance({ label, value }: { label: string; value: number | undefined }) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <section
      aria-labelledby={id}
      className={`${panelClass} flex items-center justify-between gap-3 py-4`}
    >
      <h2 id={id} className={labelClass}>
        {label}
      </h2>
      <span className="text-2xl font-semibold leading-none tabular-nums">
        {value === undefined ? <span className="text-neutral-400">—</span> : value}
      </span>
    </section>
  );
}

// Initials for the assignee bubble. Two letters at most, so every bubble is
// the same size whatever the name.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

function Assignee({ row }: { row: AdminQueueRow }) {
  const name = row.assignedToMe ? "You" : row.assigneeName;
  if (!name) {
    return (
      <span className="flex items-center gap-2 text-sm text-neutral-500">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-neutral-300 text-[0.625rem] text-neutral-400"
        >
          —
        </span>
        Unassigned
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-sm">
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[0.625rem] font-semibold text-neutral-700"
      >
        {initials(row.assigneeName ?? name)}
      </span>
      <span className={row.assignedToMe ? "font-medium text-neutral-800" : undefined}>{name}</span>
    </span>
  );
}

function QueueRow({ row }: { row: AdminQueueRow }) {
  const stale = isOverdue(row.status, row.createdAt);
  const urgent = isUnresolved(row.status) && row.effectivePriority === "critical";
  const confidence = row.aiConfidence === null ? null : formatPercent(Number(row.aiConfidence));

  return (
    <li
      className={`relative border-t border-neutral-100 first:border-t-0 ${urgent ? "bg-red-50/40" : ""} ${
        row.status === "closed" ? "text-neutral-500" : ""
      }`}
    >
      {/* The rail marks an unresolved critical ticket; the badge beside it says
          the same thing in words, so the colour is never the only signal. */}
      <div
        className={`grid gap-x-5 gap-y-4 p-5 ${ROW_COLUMNS} ${urgent ? "border-l-4 border-red-500 pl-4" : ""}`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge
              priority={row.effectivePriority}
              aiState={row.aiState}
              overridden={row.priorityOverride !== null}
            />
            <StatusPill status={row.status} />
            <span className="text-xs text-neutral-500">
              {row.effectiveCategory ? CATEGORY_LABELS[row.effectiveCategory] : "Not categorised"}
              {row.categoryOverride !== null && <span title="Set by an admin"> · edited</span>}
            </span>
          </div>

          <Link
            href={`/admin/tickets/${row.id}`}
            className="mt-2.5 block font-medium text-neutral-900 after:absolute after:inset-0 after:z-10 after:content-[''] hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {row.subject}
          </Link>

          <p className="mt-1.5 truncate text-sm text-neutral-600">
            {row.publicId} · {row.authorName} · {row.bookTitle ?? GENERAL_TICKET_LABEL} ·{" "}
            <span className={stale ? "font-semibold text-red-700" : undefined} title={formatDateTime(row.createdAt)}>
              {formatAge(row.createdAt)}
            </span>
          </p>
        </div>

        <div className="lg:self-center">
          <ColumnLabel>Assignee</ColumnLabel>
          <Assignee row={row} />
        </div>

        <div className="lg:self-center">
          <ColumnLabel>AI draft</ColumnLabel>
          <span className="flex flex-wrap items-center gap-2">
            <DraftPill draftState={row.draftState} flagged={row.draftFlagged} />
            {confidence && (
              <span className="text-xs tabular-nums text-neutral-500" title="The model's own confidence">
                {confidence}
              </span>
            )}
          </span>
        </div>
      </div>
    </li>
  );
}

// The header row only exists on wide screens, so each cell names itself when
// the row stacks.
function ColumnLabel({ children }: { children: ReactNode }) {
  return <span className={`${labelClass} mb-1.5 block lg:hidden`}>{children}</span>;
}

function Filters({
  params,
  onChange,
  onClear,
  hasFilters,
}: {
  params: URLSearchParams | ReturnType<typeof useSearchParams>;
  onChange: (key: FilterKey, value: string) => void;
  onClear: () => void;
  hasFilters: boolean;
}) {
  const [search, setSearch] = useState(params.get("q") ?? "");
  const urlSearch = params.get("q") ?? "";

  // Debounce typing so each keystroke does not refetch the queue.
  useEffect(() => {
    if (search.trim() === urlSearch) return;
    const timer = setTimeout(() => onChange("q", search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search, urlSearch, onChange]);

  const select = (key: FilterKey, label: string, span: string, options: { value: string; label: string }[]) => (
    <div className={span}>
      <label htmlFor={`filter-${key}`} className={`${labelClass} mb-1.5 block`}>
        {label}
      </label>
      <select
        id={`filter-${key}`}
        value={params.get(key) ?? ""}
        onChange={(e) => onChange(key, e.target.value)}
        className={inputClass}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );

  const date = (key: "from" | "to", label: string, span: string) => (
    <div className={span}>
      <label htmlFor={`filter-${key}`} className={`${labelClass} mb-1.5 block`}>
        {label}
      </label>
      <input
        id={`filter-${key}`}
        type="date"
        value={params.get(key) ?? ""}
        onChange={(e) => onChange(key, e.target.value)}
        className={inputClass}
      />
    </div>
  );

  return (
    <section aria-labelledby="filters-heading" className={panelClass}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="filters-heading" className={labelClass}>
          Search and filters
        </h2>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              onClear();
            }}
            className="rounded px-1 py-1 text-xs font-medium text-neutral-800 underline underline-offset-2 hover:text-ink"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Two deliberate rows on a twelve-column grid: what you are looking for
          and when it arrived on top, which bucket it belongs to underneath.
          Fixed spans rather than wrapping, so the rows never go ragged. */}
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-12">
        <div className="sm:col-span-6">
          <label htmlFor="filter-q" className={`${labelClass} mb-1.5 block`}>
            Search
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-500"
              aria-hidden
            />
            <input
              id="filter-q"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ticket id, subject, author name or email"
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>
        {date("from", "Created from", "sm:col-span-3")}
        {date("to", "Created to", "sm:col-span-3")}
        {select("status", "Status", "sm:col-span-3", TICKET_STATUSES.map((value) => ({ value, label: TICKET_STATUS_LABELS[value] })))}
        {select("priority", "Priority", "sm:col-span-3", TICKET_PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })))}
        {select("category", "Category", "sm:col-span-3", TICKET_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })))}
        {select("assignee", "Assignee", "sm:col-span-3", [
          { value: "me", label: "Assigned to me" },
          { value: "unassigned", label: "Unassigned" },
        ])}
      </div>
    </section>
  );
}
