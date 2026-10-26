"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import {
  buttonClass,
  CategoryLabel,
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

// Shared with the ticket detail page: a fixed-height label row above every
// field, so a field with an action beside its label still lines up with the
// fields next to it.
const labelRowClass = "mb-1.5 flex min-h-7 items-center justify-between gap-2";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-neutral-600";

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

  return (
    <>
      <PageHeader
        title="Ticket queue"
        description="All tickets in the queue"
        onRefresh={() => void mutate()}
        refreshing={isValidating}
      />

      <div className="space-y-6">
        <Filters
          params={params}
          onChange={setFilter}
          onClear={() => router.replace(pathname, { scroll: false })}
          hasFilters={hasFilters}
        />

        {error && <ErrorState message="The queue could not be loaded." onRetry={() => void mutate()} />}

        {!data && !error && (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {rows && rows.length === 0 && (
          <EmptyState title={hasFilters ? "No tickets match these filters" : "No tickets yet"}>
            {hasFilters && (
              <button
                type="button"
                onClick={() => router.replace(pathname)}
                className="font-medium text-brand-deep hover:underline"
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

            <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                  <tr>
                    <th scope="col" className="py-3 pl-5 pr-4">
                      Priority
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Ticket
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Category
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Assignee
                    </th>
                    <th scope="col" className="py-3 pl-4 pr-5">
                      Age
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map((row) => (
                    <QueueRow key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
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

function QueueRow({ row }: { row: AdminQueueRow }) {
  const stale = isOverdue(row.status, row.createdAt);
  const urgent = isUnresolved(row.status) && row.effectivePriority === "critical";
  return (
    <tr
      className={`relative cursor-pointer hover:bg-neutral-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ink ${urgent ? "bg-red-50/40" : ""} ${row.status === "closed" ? "text-neutral-500" : ""}`}
    >
      {/* The rail marks an unresolved critical ticket; the badge beside it says
          the same thing in words, so the colour is never the only signal. */}
      <td className={`py-3.5 pl-5 pr-4 ${urgent ? "border-l-4 border-red-500 pl-4" : ""}`}>
        <PriorityBadge
          priority={row.effectivePriority}
          aiState={row.aiState}
          overridden={row.priorityOverride !== null}
        />
      </td>
      <td className="max-w-md px-4 py-3.5">
        <Link
          href={`/admin/tickets/${row.id}`}
          className="block font-medium text-neutral-900 after:absolute after:inset-0 after:z-10 after:content-[''] hover:text-ink hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {row.subject}
        </Link>
        <span className="mt-0.5 block truncate text-xs text-neutral-600">
          {row.publicId} · {row.authorName} · {row.bookTitle ?? GENERAL_TICKET_LABEL}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <CategoryLabel
          category={row.effectiveCategory}
          aiState={row.aiState}
          overridden={row.categoryOverride !== null}
        />
      </td>
      <td className="px-4 py-3.5">
        <StatusPill status={row.status} />
      </td>
      <td className="px-4 py-3.5 text-sm">
        {row.assignedToMe ? (
          <span className="font-medium text-brand-deep">You</span>
        ) : (
          (row.assigneeName ?? <span className="text-neutral-500">Unassigned</span>)
        )}
      </td>
      <td className="py-3.5 pl-4 pr-5 text-sm" title={formatDateTime(row.createdAt)}>
        <span className={stale ? "font-semibold text-red-700" : "text-neutral-600"}>{formatAge(row.createdAt)}</span>
      </td>
    </tr>
  );
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

  const select = (key: FilterKey, label: string, options: { value: string; label: string }[]) => (
    <div>
      <div className={labelRowClass}>
        <label htmlFor={`filter-${key}`} className={labelClass}>
          {label}
        </label>
      </div>
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

  const date = (key: "from" | "to", label: string) => (
    <div>
      <div className={labelRowClass}>
        <label htmlFor={`filter-${key}`} className={labelClass}>
          {label}
        </label>
      </div>
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
    <section aria-labelledby="filters-heading" className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="filters-heading" className={labelClass}>
          Filters
        </h2>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              onClear();
            }}
            className="rounded px-1 py-1 text-xs font-medium text-brand-deep underline underline-offset-2 hover:text-ink"
          >
            Clear all filters
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="xl:col-span-2">
          <div className={labelRowClass}>
            <label htmlFor="filter-q" className={labelClass}>
              Search
            </label>
          </div>
          <input
            id="filter-q"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ticket id, subject, author name or email"
            className={inputClass}
          />
        </div>
        {select("status", "Status", TICKET_STATUSES.map((value) => ({ value, label: TICKET_STATUS_LABELS[value] })))}
        {select("priority", "Priority", TICKET_PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })))}
        {select("category", "Category", TICKET_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })))}
        {select("assignee", "Assignee", [
          { value: "me", label: "Assigned to me" },
          { value: "unassigned", label: "Unassigned" },
        ])}
        {date("from", "Created from")}
        {date("to", "Created to")}
      </div>
    </section>
  );
}
