"use client";

import { Lock, Paperclip } from "lucide-react";
import { formatAge, formatDateTime } from "@/lib/format";
import type { AdminTicketDetail } from "@/lib/types";

// The whole conversation in one column: the author's message, then every
// reply and internal note in the order they happened. Notes are tinted and
// tagged so they can never be mistaken for something the author can read.
type Item =
  | { kind: "reply"; id: string; body: string; createdAt: string }
  | { kind: "note"; id: string; body: string; createdAt: string; authorName: string };

export function Thread({ ticket }: { ticket: AdminTicketDetail }) {
  const items: Item[] = [
    ...ticket.replies.map((reply) => ({ kind: "reply" as const, ...reply })),
    ...ticket.notes.map((note) => ({ kind: "note" as const, ...note })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <ol className="space-y-3">
      <li className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-700"
          >
            {initials(ticket.authorName)}
          </span>
          <span className="text-sm font-semibold">{ticket.authorName}</span>
          <span className="text-sm text-neutral-500">
            Author ·{" "}
            <time dateTime={ticket.createdAt} title={formatDateTime(ticket.createdAt)}>
              {formatAge(ticket.createdAt)}
            </time>
          </span>
        </div>
        {/* Plain text only: never render stored text as HTML. */}
        <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed">{ticket.description}</p>
        {ticket.attachments.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
            {ticket.attachments.map((file) => (
              <li key={file.id}>
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-brand-deep hover:bg-neutral-50"
                >
                  <Paperclip className="size-3.5" aria-hidden />
                  {file.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </li>

      {items.map((item) =>
        item.kind === "reply" ? (
          <li key={`reply-${item.id}`} className="rounded-2xl border border-brand-line bg-brand-wash p-5">
            <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
              <span
                aria-hidden
                className="flex size-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-ink"
              >
                BL
              </span>
              <span className="text-sm font-semibold">BookLeaf support</span>
              <span className="text-sm text-neutral-600">
                Reply · posted to the ticket ·{" "}
                <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
                  {formatAge(item.createdAt)}
                </time>
              </span>
            </div>
            <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed">{item.body}</p>
            <p className="mt-3 border-t border-brand-line pt-2.5 text-xs text-neutral-700">
              {ticket.authorName} sees this on their ticket in the author portal.
            </p>
          </li>
        ) : (
          <li key={`note-${item.id}`} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2.5">
              <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-amber-200">
                <Lock className="size-3.5 text-amber-900" aria-hidden />
              </span>
              <span className="text-sm font-semibold">{item.authorName}</span>
              <span className="text-sm text-neutral-600">
                Note ·{" "}
                <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
                  {formatAge(item.createdAt)}
                </time>
              </span>
              <span className="rounded-full bg-amber-200 px-2.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-amber-900">
                Team only
              </span>
            </div>
            <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed text-neutral-800">
              {item.body}
            </p>
          </li>
        ),
      )}
    </ol>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
