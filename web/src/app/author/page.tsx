"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";
import { ErrorState, Money, PageHeader, Skeleton, StatusPill } from "@/components/ui";
import type { Envelope } from "@/lib/api";
import { useMe } from "@/lib/auth";
import {
  formatAge,
  GENERAL_TICKET_LABEL,
  isInProduction,
  isUnresolved,
  sumMoney,
} from "@/lib/format";
import { AUTHOR_BOOKS_KEY, AUTHOR_TICKETS_KEY } from "@/lib/keys";
import type { AuthorTicketRow, Book } from "@/lib/types";
import { NewTicketButton } from "@/components/new-ticket-dialog";

// The same panel, label and tile styling as the admin bento, so the author and
// admin portals read as one product.
const panelClass = "rounded-2xl border border-neutral-200 bg-white p-5";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-neutral-600";
const tileClass = `${panelClass} flex min-h-36 flex-col justify-between`;

export default function AuthorOverviewPage() {
  const { me } = useMe();
  const books = useSWR<Envelope<Book[]>>(AUTHOR_BOOKS_KEY);
  const tickets = useSWR<Envelope<AuthorTicketRow[]>>(AUTHOR_TICKETS_KEY);

  const refresh = () => {
    void books.mutate();
    void tickets.mutate();
  };

  return (
    <>
      <PageHeader
        title={me ? `Welcome, ${me.name}` : "Welcome"}
        description="Your books, royalties, and support requests at a glance."
        onRefresh={refresh}
        refreshing={books.isValidating || tickets.isValidating}
        actions={<NewTicketButton />}
      />

      {(books.error || tickets.error) && (
        <div className="mb-4">
          <ErrorState message="Some of your overview could not be loaded." onRetry={refresh} />
        </div>
      )}

      {/* Same bento as the admin dashboard: two small tiles, a wide one beside
          them, then the list underneath across the full width. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BooksTile books={books.data?.data} />
        <TicketsTile tickets={tickets.data?.data} />
        <RoyaltiesTile books={books.data?.data} />
        <RecentTickets tickets={tickets.data?.data} />
      </div>
    </>
  );
}

// A whole tile that opens a page: the entire box is the link.
function LinkTile({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <Link
      href={href}
      aria-labelledby={id}
      className={`group transition-[border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-safe:active:scale-[0.98] [@media(hover:hover)_and_(pointer:fine)]:hover:border-ink ${tileClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span id={id} className={labelClass}>
          {label}
        </span>
        <ArrowUpRight
          className="size-4 text-neutral-500 transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:group-hover:text-ink"
          aria-hidden
        />
      </div>
      {children}
    </Link>
  );
}

function BooksTile({ books }: { books: Book[] | undefined }) {
  if (!books) return <TileSkeleton />;
  const inProduction = books.filter((book) => isInProduction(book.status)).length;
  return (
    <LinkTile href="/author/books" label="Books">
      <div>
        <p className="text-4xl font-semibold leading-none tabular-nums">{books.length}</p>
        <p className="mt-2 text-sm text-neutral-600">
          {books.length - inProduction} published · {inProduction} in production
        </p>
      </div>
    </LinkTile>
  );
}

function TicketsTile({ tickets }: { tickets: AuthorTicketRow[] | undefined }) {
  if (!tickets) return <TileSkeleton />;
  const open = tickets.filter((ticket) => isUnresolved(ticket.status)).length;
  return (
    <LinkTile href="/author/tickets" label="Support tickets">
      <div>
        <p className="text-4xl font-semibold leading-none tabular-nums">{tickets.length}</p>
        <p className="mt-2 text-sm text-neutral-600">
          {open} still open · {tickets.length - open} resolved or closed
        </p>
      </div>
    </LinkTile>
  );
}

// Sums of the stored per-book amounts. Nothing is recomputed from MRP. The bar
// is the same shape as the admin "All tickets" split: explicit widths, so a
// zero total draws an empty track rather than a full bar.
function RoyaltiesTile({ books }: { books: Book[] | undefined }) {
  if (!books) return <TileSkeleton className="sm:col-span-2" />;
  const earned = sumMoney(books.map((book) => book.totalRoyaltyEarned));
  const paid = sumMoney(books.map((book) => book.royaltyPaid));
  const pending = sumMoney(books.map((book) => book.royaltyPending));
  const paidShare = earned > 0 ? (paid / earned) * 100 : 0;
  const pendingShare = earned > 0 ? (pending / earned) * 100 : 0;

  return (
    <section aria-labelledby="royalties" className={`${tileClass} sm:col-span-2`}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="royalties" className={labelClass}>
          Royalties, all books
        </h2>
        <span className="text-3xl font-semibold leading-none tabular-nums">
          <Money value={pending} />
        </span>
      </div>
      <div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-neutral-200" aria-hidden>
          <div style={{ width: `${paidShare}%`, backgroundColor: "var(--color-accent-done)" }} />
          <div style={{ width: `${pendingShare}%`, backgroundColor: "var(--color-accent-volume)" }} />
        </div>
        <p className="mt-3 flex flex-wrap justify-between gap-x-3 text-sm text-neutral-600">
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ backgroundColor: "var(--color-accent-done)" }} aria-hidden />
            <Money value={paid} /> paid
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: "var(--color-accent-volume)" }}
              aria-hidden
            />
            <Money value={pending} /> pending
          </span>
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          <Money value={earned} /> earned in all. Paid quarterly, within 45 days of quarter end.
        </p>
      </div>
    </section>
  );
}

// The list API sorts by updatedAt, newest first. Rows carry the same shape as
// the admin queue: a line of chips, the subject, then the detail underneath.
function RecentTickets({ tickets }: { tickets: AuthorTicketRow[] | undefined }) {
  const recent = tickets?.slice(0, 5);

  return (
    <section aria-labelledby="recent-heading" className={`${panelClass} sm:col-span-2 xl:col-span-4`}>
      <h2 id="recent-heading" className={`${labelClass} mb-3`}>
        Recent tickets
      </h2>

      {!recent ? (
        <div className="space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-3/5" />
        </div>
      ) : recent.length === 0 ? (
        <p className="text-sm text-neutral-600">
          No tickets yet. Questions about royalties, ISBNs, printing, or your book&apos;s status?{" "}
          <NewTicketButton variant="link" label="Raise a ticket" />.
        </p>
      ) : (
        <ul className="-mx-2 divide-y divide-neutral-100">
          {recent.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/author/tickets/${ticket.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 transition-[background-color] duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink [@media(hover:hover)_and_(pointer:fine)]:hover:bg-neutral-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{ticket.subject}</span>
                  <span className="mt-0.5 block truncate text-xs text-neutral-600">
                    {ticket.publicId} · {ticket.book?.title ?? GENERAL_TICKET_LABEL} · updated{" "}
                    {formatAge(ticket.updatedAt)}
                  </span>
                </span>
                <StatusPill status={ticket.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TileSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`${tileClass} ${className}`}>
      <Skeleton className="h-3 w-24" />
      <div>
        <Skeleton className="h-9 w-20" />
        <Skeleton className="mt-3 h-4 w-40" />
      </div>
    </div>
  );
}
