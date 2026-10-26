"use client";

import { Check, Circle, CircleDot, CircleOff, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Chip } from "@/components/ui/chip";
import { CATEGORY_LABELS, EM_DASH, formatMoney, PRIORITY_LABELS, TICKET_STATUS_LABELS } from "@/lib/format";
import type { AiState, TicketCategory, TicketPriority, TicketStatus } from "@/lib/types";

// Null renders as an em dash; zero and empty strings are real values.
export function Dash() {
  return (
    <span className="text-neutral-400" aria-label="Not available">
      {EM_DASH}
    </span>
  );
}

export function Money({ value }: { value: string | number | null }) {
  const text = formatMoney(value);
  return text === null ? <Dash /> : <span className="tabular-nums">{text}</span>;
}

export function Text({ value }: { value: string | null }) {
  return value === null || value === "" ? <Dash /> : <>{value}</>;
}

const STATUS_CHIP: Record<
  TicketStatus,
  { tone: "default" | "medium" | "success"; icon: typeof Circle }
> = {
  open: { tone: "default", icon: Circle },
  in_progress: { tone: "medium", icon: CircleDot },
  resolved: { tone: "success", icon: Check },
  closed: { tone: "default", icon: CircleOff },
};

export function StatusPill({ status }: { status: TicketStatus }) {
  const { tone, icon: Icon } = STATUS_CHIP[status];
  return (
    <Chip tone={tone}>
      <Icon className="size-3" aria-hidden />
      {TICKET_STATUS_LABELS[status]}
    </Chip>
  );
}

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-100 text-orange-900 ring-1 ring-inset ring-orange-300",
  medium: "bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200",
  low: "bg-neutral-100 text-neutral-600",
};

// A missing priority is never shown as a real one: it is "AI pending" while
// the model runs and "AI unavailable" when it failed.
export function PriorityBadge({
  priority,
  aiState,
  overridden = false,
}: {
  priority: TicketPriority | null;
  aiState: AiState;
  overridden?: boolean;
}) {
  if (!priority) {
    return aiState === "failed" ? (
      <span className="inline-flex whitespace-nowrap rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
        AI unavailable
      </span>
    ) : (
      <span className="inline-flex whitespace-nowrap rounded-md border border-dashed border-neutral-300 px-2 py-0.5 text-xs text-neutral-500">
        AI pending
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${PRIORITY_STYLES[priority]}`}>
      {PRIORITY_LABELS[priority]}
      {overridden && <span title="Set by an admin" className="font-normal opacity-75">· edited</span>}
    </span>
  );
}

export function CategoryLabel({
  category,
  aiState,
  overridden = false,
}: {
  category: TicketCategory | null;
  aiState: AiState;
  overridden?: boolean;
}) {
  if (!category) {
    return <span className="text-xs text-neutral-400">{aiState === "failed" ? "AI unavailable" : "AI pending"}</span>;
  }
  return (
    <span className="text-sm">
      {CATEGORY_LABELS[category]}
      {overridden && <span title="Set by an admin" className="ml-1 text-xs text-neutral-500">· edited</span>}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" }) {
  const tones = {
    neutral: "bg-neutral-100 text-neutral-700",
    green: "bg-brand-wash text-brand-deep",
    amber: "bg-amber-50 text-amber-800",
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  onRefresh,
  refreshing,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label={refreshing ? "Refreshing…" : "Refresh"}
            title="Refresh"
            className="rounded-md border border-neutral-300 bg-white p-2 text-neutral-600 transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-safe:active:scale-[0.98] disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}

export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-ink hover:bg-brand-strong"
    >
      {children}
    </Link>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-neutral-200 bg-white p-5 ${className}`}>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-neutral-500">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
      {message}
      {onRetry && (
        <button type="button" onClick={onRetry} className="ml-3 font-medium underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-neutral-200/70 ${className}`} aria-hidden />;
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>
      )}
    </label>
  );
}

export const buttonClass =
  "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50";

export const primaryButtonClass =
  "rounded-md bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50";

export const inputClass =
  "block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-brand/30 aria-[invalid=true]:border-red-400";

// Segmented filter buttons (author books and tickets). Same height as the
// form controls, so a row of them lines up with anything beside it.
export function filterTabClass(active: boolean): string {
  return `min-h-11 rounded-lg px-3.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
    active ? "bg-brand font-medium text-ink" : "text-neutral-700 hover:bg-neutral-100"
  }`;
}
