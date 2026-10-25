"use client";

import { Flag } from "lucide-react";
import { useState } from "react";
import { buttonClass, ErrorState, inputClass, primaryButtonClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useAction } from "@/lib/use-action";
import type { AdminTicketDetail } from "@/lib/types";

const MAX_BODY = 10_000;

// The reply box. Its text is local state: it is filled from the AI draft once,
// when the draft arrives and the box is empty, and a later refetch never
// overwrites what the admin typed. Send posts exactly what is in the box.
export function Composer({ ticket, refresh }: { ticket: AdminTicketDetail; refresh: () => Promise<unknown> }) {
  const [text, setText] = useState("");
  // The draft the box was last filled from, so the same draft is not filled twice.
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [sent, setSent] = useState(false);
  const send = useAction(refresh);
  const regenerate = useAction(refresh);
  const flag = useAction(refresh);

  const draft = ticket.draftState === "suggested" ? ticket.draftBody : null;

  // Adjusting state during render (React's documented pattern for "a prop
  // changed") so the box fills in the same render the draft arrives.
  if (draft && draft !== filledFrom && text.trim() === "") {
    setText(draft);
    setFilledFrom(draft);
  }

  const edited = text.trim() !== "" && text !== draft;
  const body = text.trim();

  async function onSend() {
    const ok = await send.run(() => api.post(`/admin/tickets/${ticket.id}/replies`, { body }));
    if (ok) {
      setText("");
      setSent(true);
    }
  }

  async function onRegenerate() {
    setConfirmReplace(false);
    const ok = await regenerate.run(() =>
      api.post(`/admin/tickets/${ticket.id}/draft`, { confirmDiscardEdits: true }),
    );
    if (ok) {
      // Empty the box so the new draft fills it when it arrives.
      setText("");
      setSent(false);
    }
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-700">Reply to the author</h2>
        <div className="flex items-center gap-2">
          <DraftStatus state={ticket.draftState} aiState={ticket.aiState} hasDraft={Boolean(draft)} />
          {draft && (
            // Feedback on AI quality: counted on the dashboard. Click again to clear.
            <button
              type="button"
              disabled={flag.busy}
              onClick={() =>
                void flag.run(() =>
                  api.post(`/admin/tickets/${ticket.id}/draft/flag`, { flagged: !ticket.draftFlagged }),
                )
              }
              aria-pressed={ticket.draftFlagged}
              title={ticket.draftFlagged ? "Flagged as a poor draft. Click to clear." : "Flag this draft as not good enough"}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                ticket.draftFlagged
                  ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100"
                  : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
              }`}
            >
              <Flag className={`size-3.5 ${ticket.draftFlagged ? "fill-current" : ""}`} aria-hidden />
              {ticket.draftFlagged ? "Flagged" : "Flag draft"}
            </button>
          )}
        </div>
      </div>
      {flag.error && (
        <div className="mb-2">
          <ErrorState message={flag.error} />
        </div>
      )}
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        {sent && !text && (
          <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Reply sent. The author sees it on their ticket now.
          </p>
        )}
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSent(false);
          }}
          rows={10}
          placeholder={
            ticket.draftState === "pending" ||
            (ticket.draftState === "none" && (ticket.aiState === "pending" || ticket.aiState === "processing"))
              ? "The AI draft will appear here. You can also start typing."
              : "Write your reply to the author."
          }
          aria-label="Reply to the author"
          className={inputClass}
        />
        <p className="mt-1 text-right text-xs text-neutral-400">
          {body.length.toLocaleString("en-IN")}/{MAX_BODY.toLocaleString("en-IN")}
        </p>

        {(send.error || regenerate.error) && (
          <div className="mt-2">
            <ErrorState message={(send.error ?? regenerate.error) as string} />
          </div>
        )}

        {confirmReplace ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="flex-1">Replace your current text with a new AI draft?</span>
            <button type="button" className={buttonClass} onClick={() => void onRegenerate()}>
              Replace
            </button>
            <button type="button" className={buttonClass} onClick={() => setConfirmReplace(false)}>
              Keep my text
            </button>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={primaryButtonClass}
              disabled={send.busy || body.length === 0 || body.length > MAX_BODY}
              onClick={() => void onSend()}
            >
              {send.busy ? "Sending…" : "Send reply"}
            </button>
            <button
              type="button"
              className={buttonClass}
              // Allowed while pending too, so a draft whose job was never delivered can be requested again.
              disabled={regenerate.busy}
              onClick={() => (edited ? setConfirmReplace(true) : void onRegenerate())}
            >
              {regenerate.busy ? "Requesting…" : draft ? "Regenerate draft" : "Generate draft"}
            </button>
            <span className="text-xs text-neutral-500">Nothing is sent until you press Send.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function DraftStatus({
  state,
  aiState,
  hasDraft,
}: {
  state: AdminTicketDetail["draftState"];
  aiState: AdminTicketDetail["aiState"];
  hasDraft: boolean;
}) {
  // The API starts the draft only after triage, so it uses the ticket's category.
  if (state === "none" && (aiState === "pending" || aiState === "processing")) {
    return <span className="animate-pulse text-xs text-neutral-500">Waiting for triage before drafting…</span>;
  }
  if (state === "pending") {
    return <span className="animate-pulse text-xs text-neutral-500">Drafting a reply with AI…</span>;
  }
  if (state === "failed") {
    return <span className="text-xs text-red-700">AI draft unavailable. Write the reply yourself.</span>;
  }
  // After a reply is sent the stored draft is cleared, so there is nothing to label.
  if (state === "suggested" && hasDraft) {
    return <span className="text-xs text-neutral-500">AI draft. Review and edit before sending.</span>;
  }
  return null;
}
