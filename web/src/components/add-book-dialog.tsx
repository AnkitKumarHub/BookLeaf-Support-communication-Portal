"use client";

import { useState, type FormEvent } from "react";
import { useSWRConfig } from "swr";
import { Modal } from "@/components/modal";
import { buttonClass, ErrorState, Field, inputClass, primaryButtonClass } from "@/components/ui";
import { api, toApiError, type ApiError } from "@/lib/api";
import { AUTHOR_BOOKS_KEY } from "@/lib/keys";

// The statuses used in the BookLeaf catalogue (production stages from the knowledge base).
const STATUSES = [
  "Published & Live",
  "In Production - Manuscript Received",
  "In Production - Editing",
  "In Production - Cover Design",
  "In Production - Typesetting",
  "In Production - Proofreading",
  "In Production - ISBN Assignment",
  "In Production - Printing",
  "In Production - Distribution Setup",
];

const STORES = ["Amazon India", "Flipkart", "Amazon US", "Amazon UK", "BookLeaf Store"];

const MONEY_FIELDS = [
  ["mrp", "MRP (₹)"],
  ["royaltyPerCopy", "Royalty per copy (₹)"],
  ["totalRoyaltyEarned", "Royalty earned (₹)"],
  ["royaltyPaid", "Royalty paid (₹)"],
  ["royaltyPending", "Royalty pending (₹)"],
] as const;

type Form = Record<
  | "title"
  | "status"
  | "isbn"
  | "genre"
  | "publicationDate"
  | "totalCopiesSold"
  | "lastRoyaltyPayoutDate"
  | "printPartner"
  | (typeof MONEY_FIELDS)[number][0],
  string
>;

const EMPTY_FORM: Form = {
  title: "",
  status: STATUSES[0]!,
  isbn: "",
  genre: "",
  publicationDate: "",
  totalCopiesSold: "0",
  lastRoyaltyPayoutDate: "",
  printPartner: "",
  mrp: "",
  royaltyPerCopy: "",
  totalRoyaltyEarned: "",
  royaltyPaid: "",
  royaltyPending: "",
};

// Demo only (NEXT_PUBLIC_DEMO_SELF_SERVICE=true): the "Add book" button and its dialog.
export function AddBookButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-on-brand hover:bg-brand-strong"
      >
        Add book
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        busy={busy}
        size="lg"
        title="Add a book"
        description="For trying the portal. Leave a field blank if it does not apply yet."
      >
        <AddBookForm onBusyChange={setBusy} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

// Blank optional fields are sent as null, so the book shows em dashes exactly like seeded books.
function AddBookForm({ onBusyChange, onClose }: { onBusyChange: (busy: boolean) => void; onClose: () => void }) {
  const { mutate } = useSWRConfig();
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [stores, setStores] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const set = (key: keyof Form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));

  function setBusy(value: boolean) {
    setSubmitting(value);
    onBusyChange(value);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/author/books", {
        title: form.title,
        status: form.status,
        ...(form.isbn.trim() ? { isbn: form.isbn } : {}),
        ...(form.genre.trim() ? { genre: form.genre } : {}),
        ...(form.printPartner.trim() ? { printPartner: form.printPartner } : {}),
        publicationDate: form.publicationDate || null,
        lastRoyaltyPayoutDate: form.lastRoyaltyPayoutDate || null,
        totalCopiesSold: Number(form.totalCopiesSold || 0),
        ...Object.fromEntries(MONEY_FIELDS.map(([key]) => [key, numberOrNull(form[key])])),
        availableOn: stores,
      });
      await mutate(AUTHOR_BOOKS_KEY);
      setBusy(false);
      onClose();
    } catch (err) {
      setError(toApiError(err));
      setBusy(false);
    }
  }

  const text = (key: keyof Form, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} error={error?.fields[key]}>
      <input
        value={form[key]}
        onChange={(e) => set(key)(e.target.value)}
        aria-invalid={Boolean(error?.fields[key])}
        className={inputClass}
        {...props}
      />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error && !Object.keys(error.fields).length && <ErrorState message={error.message} />}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">{text("title", "Title", { required: true, autoFocus: true })}</div>
        <Field label="Status" error={error?.fields.status}>
          <select value={form.status} onChange={(e) => set("status")(e.target.value)} className={inputClass}>
            {STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </Field>
        {text("genre", "Genre")}
        {text("isbn", "ISBN")}
        {text("publicationDate", "Publication date", { type: "date" })}
        {text("printPartner", "Print partner", { placeholder: "In-House, Repro India, Epitome Books" })}
        {text("totalCopiesSold", "Copies sold", { type: "number", min: 0, step: 1 })}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-neutral-700">Royalties</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {MONEY_FIELDS.map(([key, label]) => (
            <div key={key}>{text(key, label, { type: "number", min: 0, step: "0.01", inputMode: "decimal" })}</div>
          ))}
          {text("lastRoyaltyPayoutDate", "Last payout date", { type: "date" })}
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-neutral-700">Available on</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {STORES.map((store) => (
            <label key={store} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={stores.includes(store)}
                onChange={(e) =>
                  setStores((current) => (e.target.checked ? [...current, store] : current.filter((s) => s !== store)))
                }
              />
              {store}
            </label>
          ))}
        </div>
        {error?.fields.availableOn && <p className="mt-1 text-xs text-red-600">{error.fields.availableOn}</p>}
      </fieldset>

      <div className="flex items-center justify-end gap-3 border-t border-neutral-100 pt-4">
        <button type="button" onClick={onClose} disabled={submitting} className={buttonClass}>
          Cancel
        </button>
        <button type="submit" disabled={submitting || !form.title.trim()} className={primaryButtonClass}>
          {submitting ? "Adding…" : "Add book"}
        </button>
      </div>
    </form>
  );
}
