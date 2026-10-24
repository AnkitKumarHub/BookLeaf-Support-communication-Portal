"use client";

import { useState } from "react";
import { buttonClass, ErrorState, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAction } from "@/lib/use-action";
import type { AdminTicketDetail } from "@/lib/types";

export function Notes({ ticket, refresh }: { ticket: AdminTicketDetail; refresh: () => Promise<unknown> }) {
  const [text, setText] = useState("");
  const add = useAction(refresh);

  async function onAdd() {
    const ok = await add.run(() => api.post(`/admin/tickets/${ticket.id}/notes`, { body: text.trim() }));
    if (ok) setText("");
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-amber-900">Internal notes</h2>
        <span className="text-xs font-medium text-amber-800">Admin only. The author never sees these.</span>
      </div>

      {ticket.notes.length === 0 ? (
        <p className="mb-3 text-sm text-neutral-500">No notes yet.</p>
      ) : (
        <ol className="mb-3 space-y-2">
          {ticket.notes.map((note) => (
            <li key={note.id} className="rounded-md bg-white p-3 text-sm ring-1 ring-amber-100">
              <p className="mb-1 text-xs text-neutral-500">
                {note.authorName} · {formatDateTime(note.createdAt)}
              </p>
              <p className="whitespace-pre-wrap break-words">{note.body}</p>
            </li>
          ))}
        </ol>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Add a note for the team"
        aria-label="Internal note"
        className={inputClass}
      />
      {add.error && (
        <div className="mt-2">
          <ErrorState message={add.error} />
        </div>
      )}
      <button
        type="button"
        className={`${buttonClass} mt-2`}
        disabled={add.busy || text.trim().length === 0}
        onClick={() => void onAdd()}
      >
        {add.busy ? "Adding…" : "Add internal note"}
      </button>
    </section>
  );
}
