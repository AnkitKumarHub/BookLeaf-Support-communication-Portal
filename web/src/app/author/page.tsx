"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import useSWR from "swr";
import { ErrorState, Money, PageHeader, Skeleton, StatusPill } from "@/components/ui";
import type { Envelope } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { formatAge, GENERAL_TICKET_LABEL, isInProduction, sumMoney, TICKET_STATUSES, TICKET_STATUS_LABELS } from "@/lib/format";
import { AUTHOR_BOOKS_KEY, AUTHOR_TICKETS_KEY } from "@/lib/keys";
import type { AuthorTicketRow, Book } from "@/lib/types";
import { NewTicketButton } from "@/components/new-ticket-dialog";

// The same panel and label styling as the rest of the app, so the author and
// admin portals read as one product.
const panelClass = "rounded-2xl border border-neutral-200 bg-white p-5";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-neutral-600";

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
        <div className="mb-6">
          <ErrorState message="Some of your overview could not be loaded." onRetry={refresh} />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <BooksCard books={books.data?.data} />
        <RoyaltyCard books={books.data?.data} />
        <TicketsCard tickets={tickets.data?.data} />
      </div>

      <RecentTickets tickets={tickets.data?.data} />
    </>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className={panelClass}>{children}</div>;
}

function StatLabel({ children }: { children: ReactNode }) {
  return <p className={labelClass}>{children}</p>;
}

// A whole card that opens a page: the entire box is the link.
function LinkCard({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`group block transition-[border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink motion-safe:active:scale-[0.98] [@media(hover:hover)_and_(pointer:fine)]:hover:border-ink ${panelClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <StatLabel>{label}</StatLabel>
        <ArrowUpRight
          className="size-4 text-neutral-500 transition-colors duration-150 [@media(hover:hover)_and_(pointer:fine)]:group-hover:text-ink"
          aria-hidden
        />
      </div>
      {children}
    </Link>
  );
}

function BooksCard({ books }: { books: Book[] | undefined }) {
  if (!books) return <CardSkeleton />;
  const inProduction = books.filter((book) => isInProduction(book.status)).length;
  return (
    <LinkCard href="/author/books" label="Books">
      <p className="mt-2 text-3xl font-semibold leading-none tabular-nums">{books.length}</p>
      <p className="mt-2 text-sm text-neutral-600">
        {books.length - inProduction} published · {inProduction} in production
      </p>
    </LinkCard>
  );
}

// Sums of the stored per-book amounts. Nothing is recomputed from MRP.
function RoyaltyCard({ books }: { books: Book[] | undefined }) {
  if (!books) return <CardSkeleton />;
  const rows = [
    { label: "Earned", value: sumMoney(books.map((b) => b.totalRoyaltyEarned)) },
    { label: "Paid", value: sumMoney(books.map((b) => b.royaltyPaid)) },
    { label: "Pending", value: sumMoney(books.map((b) => b.royaltyPending)) },
  ];
  return (
    <Panel>
      <StatLabel>Royalties, all books</StatLabel>
      <dl className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-neutral-600">{row.label}</dt>
            <dd className={row.label === "Pending" ? "text-lg font-semibold" : "text-sm"}>
              <Money value={row.value} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-neutral-600">Paid quarterly, within 45 days of quarter end.</p>
    </Panel>
  );
}

function TicketsCard({ tickets }: { tickets: AuthorTicketRow[] | undefined }) {
  if (!tickets) return <CardSkeleton />;
  return (
    <LinkCard href="/author/tickets" label="Support tickets">
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        {TICKET_STATUSES.map((status) => (
          <div key={status}>
            <dt className="text-xs text-neutral-600">{TICKET_STATUS_LABELS[status]}</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">
              {tickets.filter((ticket) => ticket.status === status).length}
            </dd>
          </div>
        ))}
      </dl>
    </LinkCard>
  );
}

function RecentTickets({ tickets }: { tickets: AuthorTicketRow[] | undefined }) {
  // The list API sorts by updatedAt, newest first.
  const recent = tickets?.slice(0, 5);
  return (
    <section aria-labelledby="recent-heading" className="mt-8">
      <h2 id="recent-heading" className={`mb-3 ${labelClass}`}>
        Recent tickets
      </h2>
      {!recent ? (
        <Panel>
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        </Panel>
      ) : recent.length === 0 ? (
        <Panel>
          <p className="text-sm text-neutral-600">
            No tickets yet. Questions about royalties, ISBNs, printing, or your book&apos;s status?{" "}
            <NewTicketButton variant="link" label="Raise a ticket" />
            .
          </p>
        </Panel>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {recent.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/author/tickets/${ticket.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-[background-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink motion-safe:active:scale-[0.98] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-neutral-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{ticket.subject}</span>
                  <span className="mt-0.5 block text-xs text-neutral-600">
                    {ticket.publicId} · {ticket.book?.title ?? GENERAL_TICKET_LABEL}
                  </span>
                </span>
                <span className="text-xs text-neutral-600">Updated {formatAge(ticket.updatedAt)}</span>
                <StatusPill status={ticket.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CardSkeleton() {
  return (
    <Panel>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-20" />
      <Skeleton className="mt-3 h-4 w-40" />
    </Panel>
  );
}
