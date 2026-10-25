"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

// A native <dialog> opened with showModal(): the browser traps focus, closes on
// Esc, and draws the backdrop. Content mounts only while open, so each opening
// starts with a fresh form.
export function Modal({
  open,
  onClose,
  title,
  description,
  busy = false,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  // While true (a request is running), Esc and backdrop clicks do not close it.
  busy?: boolean;
  // "lg" for wide forms such as add-book, so they fit without scrolling.
  size?: "md" | "lg";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onCancel={(event) => {
        // A file input also fires a bubbling "cancel" when its picker is
        // dismissed; only Esc on the dialog itself should close it.
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        // Only a click on the backdrop lands on the <dialog> itself.
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${size === "lg" ? "max-w-4xl" : "max-w-2xl"} rounded-xl bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-black/40`}
    >
      {open && (
        // Still scrolls on short screens, but without a visible scrollbar.
        <div className="max-h-[90vh] overflow-y-auto p-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="modal-title" className="text-lg font-semibold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
              className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
