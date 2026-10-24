"use client";

import Link from "next/link";
import useSWR from "swr";
import { ButtonLink, Card, ErrorState, Money, PageHeader, Skeleton, StatusPill } from "@/components/ui";
import type { Envelope } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { formatAge, GENERAL_TICKET_LABEL, isInProduction, sumMoney, TICKET_STATUSES, TICKET_STATUS_LABELS } from "@/lib/format";
import { AUTHOR_BOOKS_KEY, AUTHOR_TICKETS_KEY } from "@/lib/keys";
import type { AuthorTicketRow, Book } from "@/lib/types";

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
        actions={<ButtonLink href="/author/tickets/new">New ticket</ButtonLink>}
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

function StatLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{children}</p>;
}

function BooksCard({ books }: { books: Book[] | undefined }) {
  if (!books) return <CardSkeleton />;
  const inProduction = books.filter((book) => isInProduction(book.status)).length;
  return (
    <Card>
      <StatLabel>Books</StatLabel>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{books.length}</p>
      <p className="mt-1 text-sm text-neutral-600">
        {books.length - inProduction} published · {inProduction} in production
      </p>
      <Link href="/author/books" className="mt-3 inline-block text-sm font-medium text-emerald-700 hover:underline">
        View my books
      </Link>
    </Card>
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
    <Card>
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
      <p className="mt-3 text-xs text-neutral-500">Paid quarterly, within 45 days of quarter end.</p>
    </Card>
  );
}

function TicketsCard({ tickets }: { tickets: AuthorTicketRow[] | undefined }) {
  if (!tickets) return <CardSkeleton />;
  return (
    <Card>
      <StatLabel>Support tickets</StatLabel>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        {TICKET_STATUSES.map((status) => (
          <div key={status}>
            <dt className="text-xs text-neutral-500">{TICKET_STATUS_LABELS[status]}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {tickets.filter((ticket) => ticket.status === status).length}
            </dd>
          </div>
        ))}
      </dl>
      <Link href="/author/tickets" className="mt-3 inline-block text-sm font-medium text-emerald-700 hover:underline">
        View my tickets
      </Link>
    </Card>
  );
}

function RecentTickets({ tickets }: { tickets: AuthorTicketRow[] | undefined }) {
  // The list API sorts by updatedAt, newest first.
  const recent = tickets?.slice(0, 5);
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-neutral-700">Recent tickets</h2>
      {!recent ? (
        <Card>
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        </Card>
      ) : recent.length === 0 ? (
        <Card>
          <p className="text-sm text-neutral-600">
            No tickets yet. Questions about royalties, ISBNs, printing, or your book&apos;s status?{" "}
            <Link href="/author/tickets/new" className="font-medium text-emerald-700 hover:underline">
              Raise a ticket
            </Link>
            .
          </p>
        </Card>
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {recent.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/author/tickets/${ticket.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-neutral-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{ticket.subject}</span>
                  <span className="block text-xs text-neutral-500">
                    {ticket.publicId} · {ticket.book?.title ?? GENERAL_TICKET_LABEL}
                  </span>
                </span>
                <span className="text-xs text-neutral-500">Updated {formatAge(ticket.updatedAt)}</span>
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
    <Card>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-20" />
      <Skeleton className="mt-3 h-4 w-40" />
    </Card>
  );
}
