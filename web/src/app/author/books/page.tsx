"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import useSWR from "swr";
import { Badge, Dash, EmptyState, ErrorState, FilterTabs, Money, PageHeader, Skeleton, Text } from "@/components/ui";
import type { Envelope } from "@/lib/api";
import { DEMO_SELF_SERVICE } from "@/lib/flags";
import { formatDate, isInProduction } from "@/lib/format";
import { AUTHOR_BOOKS_KEY } from "@/lib/keys";
import type { Book } from "@/lib/types";
import { AddBookButton } from "@/components/add-book-dialog";

const panelClass = "rounded-2xl border border-neutral-200 bg-white p-5";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-neutral-600";

type Filter = "all" | "published" | "production";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "production", label: "In production" },
];

export default function MyBooksPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      }
    >
      <Books />
    </Suspense>
  );
}

function Books() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("filter");
  const filter: Filter = raw === "published" || raw === "production" ? raw : "all";
  const { data, error, isValidating, mutate } = useSWR<Envelope<Book[]>>(AUTHOR_BOOKS_KEY);

  function setFilter(value: Filter) {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete("filter");
    else next.set("filter", value);
    const text = next.toString();
    router.replace(text ? `${pathname}?${text}` : pathname, { scroll: false });
  }

  const books = data?.data.filter((book) => {
    if (filter === "published") return !isInProduction(book.status);
    if (filter === "production") return isInProduction(book.status);
    return true;
  });

  return (
    <>
      <PageHeader
        title="My Books"
        description="Figures are as recorded by BookLeaf. Royalties are 80% of net profit, paid quarterly."
        onRefresh={() => void mutate()}
        refreshing={isValidating}
        actions={DEMO_SELF_SERVICE && <AddBookButton />}
      />

      <div className="mb-5">
        <FilterTabs
          label="Filter books"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((item) => ({
            ...item,
            count: data?.data.filter((book) =>
              item.value === "all"
                ? true
                : item.value === "production"
                  ? isInProduction(book.status)
                  : !isInProduction(book.status),
            ).length,
          }))}
        />
      </div>

      {error && <ErrorState message="Your books could not be loaded." onRetry={() => void mutate()} />}

      {!data && !error && (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {books && books.length === 0 && (
        <EmptyState title={filter === "all" ? "No books yet" : "No books match this filter"} />
      )}

      <div className="space-y-4">
        {books?.map((book) => <BookCard key={book.id} book={book} />)}
      </div>
    </>
  );
}

function BookCard({ book }: { book: Book }) {
  const producing = isInProduction(book.status);
  return (
    <article className={panelClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{book.title}</h2>
          <p className="mt-0.5 text-sm text-neutral-600">
            <Text value={book.genre} /> · {book.sourceId}
          </p>
        </div>
        <Badge tone={producing ? "amber" : "green"}>{book.status}</Badge>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-neutral-100 pt-5 text-sm sm:grid-cols-3 lg:grid-cols-4">
        <Item label="ISBN">
          <span className="font-mono text-xs">
            <Text value={book.isbn} />
          </span>
        </Item>
        <Item label="Publication date">
          <Text value={formatDate(book.publicationDate)} />
        </Item>
        <Item label="MRP">
          <Money value={book.mrp} />
        </Item>
        <Item label="Copies sold">
          <span className="tabular-nums">{book.totalCopiesSold.toLocaleString("en-IN")}</span>
        </Item>
        <Item label="Royalty earned">
          <Money value={book.totalRoyaltyEarned} />
        </Item>
        <Item label="Royalty paid">
          <Money value={book.royaltyPaid} />
        </Item>
        <Item label="Royalty pending">
          <span className="font-semibold">
            <Money value={book.royaltyPending} />
          </span>
        </Item>
        <Item label="Last payout">
          <Text value={formatDate(book.lastRoyaltyPayoutDate)} />
        </Item>
        <Item label="Royalty per copy">
          <Money value={book.royaltyPerCopy} />
        </Item>
        <Item label="Print partner">
          <Text value={book.printPartner} />
        </Item>
        <Item label="Available on" wide>
          {book.availableOn.length === 0 ? (
            <span className="text-neutral-600">None yet</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {book.availableOn.map((store) => (
                <Badge key={store}>{store}</Badge>
              ))}
            </span>
          )}
        </Item>
      </dl>
    </article>
  );
}

function Item({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className={labelClass}>{label}</dt>
      <dd className="mt-1">{children ?? <Dash />}</dd>
    </div>
  );
}
