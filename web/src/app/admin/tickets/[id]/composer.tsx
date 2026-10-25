"use client";

import { Flag, Lock } from "lucide-react";
import { useState } from "react";
import { buttonClass, ErrorState, inputClass, primaryButtonClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useAction } from "@/lib/use-action";
import type { AdminTicketDetail } from "@/lib/types";

const MAX_BODY = 10_000;
const TEXTAREA_ROWS = 8;

// Both tabs share these slots so switching does not grow or shrink the card.
const contextRowClass = "mb-3 flex min-h-10 flex-wrap items-center justify-between gap-2";
const footerClass = "mt-4 flex min-h-11 flex-wrap items-center gap-2";
const noteInputClass =
  "block w-full rounded-md border border-amber-300 bg-amber-50/50 px-3 py-2 text-sm leading-relaxed outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20";

type Tab = "reply" | "note";

// Reply and internal note share one box with two tabs, so there is one place
// to type and the current audience is always on screen. The reply text is
// local state: it is filled from the AI draft once, when the draft arrives and
// the box is empty, and a later refetch never overwrites what the admin typed.
// Send posts exactly what is in the box. The panel stays mounted; the tab only
// changes which text is bound and which context and actions are shown.
export function Composer({ ticket, refresh }: { ticket: AdminTicketDetail; refresh: () => Promise<unknown> }) {
  const [tab, setTab] = useState<Tab>("reply");
  const [text, setText] = useState("");
  // The draft the box was last filled from, so the same draft is not filled twice.
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [sent, setSent] = useState(false);
  const [note, setNote] = useState("");
  const send = useAction(refresh);
  const regenerate = useAction(refresh);
  const flag = useAction(refresh);
  const addNote = useAction(refresh);

  const draft = ticket.draftState === "suggested" ? ticket.draftBody : null;

  // Adjusting state during render (React's documented pattern for "a prop
  // changed") so the box fills in the same render the draft arrives.
  if (draft && draft !== filledFrom && text.trim() === "") {
    setText(draft);
    setFilledFrom(draft);
  }

  const reply = tab === "reply";
  const edited = text.trim() !== "" && text !== draft;
  const body = text.trim();
  const replyPlaceholder =
    ticket.draftState === "pending" ||
    (ticket.draftState === "none" && (ticket.aiState === "pending" || ticket.aiState === "processing"))
      ? "The AI draft will appear here. You can also start typing."
      : "Write your reply to the author.";

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

  async function onAddNote() {
    const ok = await addNote.run(() => api.post(`/admin/tickets/${ticket.id}/notes`, { body: note.trim() }));
    if (ok) setNote("");
  }

  const tabClass = (active: boolean) =>
    `-mb-px border-b-2 px-1 py-3 text-sm ${
      active
        ? "border-emerald-700 font-semibold text-emerald-900"
        : "border-transparent font-medium text-neutral-600 hover:text-neutral-900"
    }`;

  return (
    <section aria-labelledby="composer-heading" className="rounded-2xl border border-neutral-200 bg-white">
      <h2 id="composer-heading" className="sr-only">
        Add to this ticket
      </h2>

      <div role="tablist" aria-label="Add to this ticket" className="flex gap-6 border-b border-neutral-200 px-5">
        <button
          type="button"
          role="tab"
          id="tab-reply"
          aria-selected={reply}
          aria-controls="panel-composer"
          className={tabClass(reply)}
          onClick={() => setTab("reply")}
        >
          Reply to author
        </button>
        <button
          type="button"
          role="tab"
          id="tab-note"
          aria-selected={!reply}
          aria-controls="panel-composer"
          className={tabClass(!reply)}
          onClick={() => setTab("note")}
        >
          Internal note{ticket.notes.length > 0 ? ` (${ticket.notes.length})` : ""}
        </button>
      </div>

      <div
        role="tabpanel"
        id="panel-composer"
        aria-labelledby={reply ? "tab-reply" : "tab-note"}
        className="p-5"
      >
        <div id="composer-context" className={contextRowClass}>
          {reply ? (
            <ReplyContext
              ticket={ticket}
              draft={draft}
              flagBusy={flag.busy}
              onFlag={() =>
                void flag.run(() =>
                  api.post(`/admin/tickets/${ticket.id}/draft/flag`, { flagged: !ticket.draftFlagged }),
                )
              }
            />
          ) : (
            <NoteContext />
          )}
        </div>

        {reply && flag.error ? (
          <div className="mb-3">
            <ErrorState message={flag.error} />
          </div>
        ) : null}

        {reply && sent && !text ? (
          <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Reply posted. {ticket.authorName} sees it on their ticket now.
          </p>
        ) : null}

        <textarea
          value={reply ? text : note}
          onChange={(e) => {
            if (reply) {
              setText(e.target.value);
              setSent(false);
            } else {
              setNote(e.target.value);
            }
          }}
          rows={TEXTAREA_ROWS}
          placeholder={reply ? replyPlaceholder : "What should the next person on this ticket know?"}
          aria-label={reply ? "Reply to the author" : "Internal note"}
          aria-describedby="composer-context"
          className={reply ? `${inputClass} leading-relaxed` : noteInputClass}
        />
        <p className="mt-1 min-h-4 text-right text-xs text-neutral-500" aria-hidden={reply ? undefined : true}>
          {reply ? `${body.length.toLocaleString("en-IN")}/${MAX_BODY.toLocaleString("en-IN")}` : "\u00a0"}
        </p>

        {reply && (send.error || regenerate.error) ? (
          <div className="mt-2">
            <ErrorState message={(send.error ?? regenerate.error) as string} />
          </div>
        ) : null}

        {!reply && addNote.error ? (
          <div className="mt-2">
            <ErrorState message={addNote.error} />
          </div>
        ) : null}

        {reply ? (
          confirmReplace ? (
            <ConfirmReplace onReplace={() => void onRegenerate()} onKeep={() => setConfirmReplace(false)} />
          ) : (
            <ReplyFooter
              sendBusy={send.busy}
              regenerateBusy={regenerate.busy}
              bodyLength={body.length}
              edited={edited}
              hasDraft={Boolean(draft)}
              onSend={() => void onSend()}
              onRegenerate={() => void onRegenerate()}
              onRequestReplace={() => setConfirmReplace(true)}
            />
          )
        ) : (
          <NoteFooter
            busy={addNote.busy}
            empty={note.trim().length === 0}
            noteCount={ticket.notes.length}
            onAdd={() => void onAddNote()}
          />
        )}
      </div>
    </section>
  );
}

function ReplyContext({
  ticket,
  draft,
  flagBusy,
  onFlag,
}: {
  ticket: AdminTicketDetail;
  draft: string | null;
  flagBusy: boolean;
  onFlag: () => void;
}) {
  return (
    <>
      <DraftStatus state={ticket.draftState} aiState={ticket.aiState} hasDraft={Boolean(draft)} />
      {draft ? (
        // Feedback on AI quality: counted on the dashboard. Click again to clear.
        <button
          type="button"
          disabled={flagBusy}
          onClick={onFlag}
          aria-pressed={ticket.draftFlagged}
          title={ticket.draftFlagged ? "Flagged as a poor draft. Click to clear." : "Flag this draft as not good enough"}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${
            ticket.draftFlagged
              ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100"
              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          }`}
        >
          <Flag className={`size-3.5 ${ticket.draftFlagged ? "fill-current" : ""}`} aria-hidden />
          {ticket.draftFlagged ? "Flagged" : "Flag draft"}
        </button>
      ) : null}
    </>
  );
}

function NoteContext() {
  return (
    <p className="flex items-center gap-2 text-sm text-amber-900">
      <Lock className="size-3.5 shrink-0" aria-hidden />
      Stays with the team. Authors never see notes.
    </p>
  );
}

function ConfirmReplace({ onReplace, onKeep }: { onReplace: () => void; onKeep: () => void }) {
  return (
    <div className="mt-3 flex min-h-11 flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="min-w-60 flex-1">Replace your current text with a new AI draft?</span>
      <button type="button" className={buttonClass} onClick={onReplace}>
        Replace
      </button>
      <button type="button" className={buttonClass} onClick={onKeep}>
        Keep my text
      </button>
    </div>
  );
}

function ReplyFooter({
  sendBusy,
  regenerateBusy,
  bodyLength,
  edited,
  hasDraft,
  onSend,
  onRegenerate,
  onRequestReplace,
}: {
  sendBusy: boolean;
  regenerateBusy: boolean;
  bodyLength: number;
  edited: boolean;
  hasDraft: boolean;
  onSend: () => void;
  onRegenerate: () => void;
  onRequestReplace: () => void;
}) {
  return (
    <div className={footerClass}>
      <button
        type="button"
        className={primaryButtonClass}
        disabled={sendBusy || bodyLength === 0 || bodyLength > MAX_BODY}
        onClick={onSend}
      >
        {sendBusy ? "Posting…" : "Post reply"}
      </button>
      <button
        type="button"
        className={buttonClass}
        // Allowed while pending too, so a draft whose job was never delivered can be requested again.
        disabled={regenerateBusy}
        onClick={edited ? onRequestReplace : onRegenerate}
      >
        {regenerateBusy ? "Requesting…" : hasDraft ? "Regenerate draft" : "Generate draft"}
      </button>
      <span className="text-xs text-neutral-600">Nothing reaches the author until you post.</span>
    </div>
  );
}

function NoteFooter({
  busy,
  empty,
  noteCount,
  onAdd,
}: {
  busy: boolean;
  empty: boolean;
  noteCount: number;
  onAdd: () => void;
}) {
  return (
    <div className={footerClass}>
      <button type="button" className={primaryButtonClass} disabled={busy || empty} onClick={onAdd}>
        {busy ? "Adding…" : "Add note"}
      </button>
      <span className="text-xs text-neutral-600">
        {noteCount === 0
          ? "No notes on this ticket yet."
          : `${noteCount} note${noteCount === 1 ? "" : "s"} on this ticket.`}
      </span>
    </div>
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
    return <span className="animate-pulse text-sm text-neutral-600">Waiting for triage before drafting…</span>;
  }
  if (state === "pending") {
    return <span className="animate-pulse text-sm text-neutral-600">Drafting a reply with AI…</span>;
  }
  if (state === "failed") {
    return <span className="text-sm text-red-700">AI draft unavailable. Write the reply yourself.</span>;
  }
  // After a reply is sent the stored draft is cleared, so there is nothing to label.
  if (state === "suggested" && hasDraft) {
    return <span className="text-sm text-neutral-600">AI draft. Review and edit before posting.</span>;
  }
  return <span className="text-sm text-neutral-600">Posted to the ticket, where the author can read it.</span>;
}
