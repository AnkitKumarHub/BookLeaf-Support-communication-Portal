"use client";

import { Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { ACCEPT_ATTRIBUTE } from "@/lib/uploads";

// Drop files here or click to browse. Checking the files (type, size, count)
// is the caller's job, so both the new-ticket form and the ticket page share it.
export function FileDropzone({
  onFiles,
  multiple = false,
  disabled = false,
  label,
  hint,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  label: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple={multiple}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          dragging ? "border-emerald-600 bg-emerald-50" : "border-neutral-300 hover:border-emerald-500 hover:bg-neutral-50"
        }`}
      >
        <Upload className="size-5 text-neutral-500" aria-hidden />
        <span className="text-sm text-neutral-700">
          {label} or <span className="font-medium text-emerald-700">browse</span>
        </span>
        {hint && <span className="text-xs text-neutral-500">{hint}</span>}
      </button>
    </>
  );
}
