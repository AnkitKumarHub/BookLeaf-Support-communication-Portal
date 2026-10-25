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
        description="Unresolved first, then priority (Critical, High, Needs triage, Medium, Low), then open before in progress, then oldest."
        onRefresh={() => void mutate()}
        refreshing={isValidating}
      />

      <Filters params={params} onChange={setFilter} onClear={() => router.replace(pathname, { scroll: false })} hasFilters={hasFilters} />

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
            <button type="button" onClick={() => router.replace(pathname)} className="font-medium text-emerald-700 hover:underline">
              Clear filters
            </button>
          )}
        </EmptyState>
      )}

      {rows && rows.length > 0 && (
        <>
          <p className="mb-2 text-xs text-neutral-500">
            {total} {total === 1 ? "ticket" : "tickets"}
          </p>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5">Priority</th>
                  <th className="px-4 py-2.5">Ticket</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Assignee</th>
                  <th className="px-4 py-2.5">Age</th>
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
            <div className="mt-4 flex items-center justify-between text-sm">
              <button type="button" className={buttonClass} disabled={page <= 1} onClick={() => setFilter("page", String(page - 1))}>
                Previous
              </button>
              <span className="text-neutral-500">
                Page {page} of {pages}
              </span>
              <button type="button" className={buttonClass} disabled={page >= pages} onClick={() => setFilter("page", String(page + 1))}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function QueueRow({ row }: { row: AdminQueueRow }) {
  const stale = isOverdue(row.status, row.createdAt);
  const urgent = isUnresolved(row.status) && row.effectivePriority === "critical";
  return (
    <tr className={`hover:bg-neutral-50 ${urgent ? "bg-red-50/40" : ""} ${row.status === "closed" ? "text-neutral-500" : ""}`}>
      <td className={`px-4 py-3 ${urgent ? "border-l-4 border-red-500" : "border-l-4 border-transparent"}`}>
        <PriorityBadge priority={row.effectivePriority} aiState={row.aiState} overridden={row.priorityOverride !== null} />
      </td>
      <td className="max-w-md px-4 py-3">
        <Link href={`/admin/tickets/${row.id}`} className="block font-medium text-neutral-900 hover:text-emerald-800 hover:underline">
          {row.subject}
        </Link>
        <span className="block truncate text-xs text-neutral-500">
          {row.publicId} · {row.authorName} · {row.bookTitle ?? GENERAL_TICKET_LABEL}
        </span>
      </td>
      <td className="px-4 py-3">
        <CategoryLabel category={row.effectiveCategory} aiState={row.aiState} overridden={row.categoryOverride !== null} />
      </td>
      <td className="px-4 py-3">
        <StatusPill status={row.status} />
      </td>
      <td className="px-4 py-3 text-xs">
        {row.assignedToMe ? (
          <span className="font-medium text-emerald-800">You</span>
        ) : (
          (row.assigneeName ?? <span className="text-neutral-400">Unassigned</span>)
        )}
      </td>
      <td className="px-4 py-3 text-xs" title={formatDateTime(row.createdAt)}>
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
    <label className="flex w-40 flex-col gap-1 text-xs text-neutral-500">
      {label}
      <select value={params.get(key) ?? ""} onChange={(e) => onChange(key, e.target.value)} className={`${inputClass} py-1.5`}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs text-neutral-500">
        Search
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ticket id, subject, author name or email"
          className={`${inputClass} py-1.5`}
        />
      </label>
      {select("status", "Status", TICKET_STATUSES.map((value) => ({ value, label: TICKET_STATUS_LABELS[value] })))}
      {select("priority", "Priority", TICKET_PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })))}
      {select("category", "Category", TICKET_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })))}
      {select("assignee", "Assignee", [
        { value: "me", label: "Assigned to me" },
        { value: "unassigned", label: "Unassigned" },
      ])}
      <div className="flex flex-col gap-1 text-xs text-neutral-500">
        Created between
        <div className="flex gap-1">
          <input
            type="date"
            aria-label="Created from"
            value={params.get("from") ?? ""}
            onChange={(e) => onChange("from", e.target.value)}
            className={`${inputClass} w-36 px-2 py-1.5`}
          />
          <input
            type="date"
            aria-label="Created to"
            value={params.get("to") ?? ""}
            onChange={(e) => onChange("to", e.target.value)}
            className={`${inputClass} w-36 px-2 py-1.5`}
          />
        </div>
      </div>
      {hasFilters && (
        <div className="flex w-full">
          <button
            type="button"
            onClick={() => {
              setSearch("");
              onClear();
            }}
            className="text-xs font-medium text-emerald-700 hover:underline"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
