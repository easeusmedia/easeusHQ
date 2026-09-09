"use client";

import { useRef } from "react";
import { StickyNote } from "lucide-react";

// Small icon that just marks "this task has editing notes" — click opens a
// dialog on top of the dashboard so editors (who can't edit tasks) can still
// read them.
export function NotesButton({ notes }: { notes: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        title="Editing notes"
        className="shrink-0 text-muted hover:text-foreground"
      >
        <StickyNote size={14} />
      </button>
      <dialog
        ref={ref}
        // Tailwind's reset zeroes out margin, which is what the browser
        // normally uses to center a <dialog> — so we center it explicitly.
        className="fixed top-1/2 left-1/2 m-0 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-4 text-foreground backdrop:bg-black/60"
      >
        <p className="mb-2 text-sm font-medium">Editing notes</p>
        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm text-muted">{notes}</p>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="btn-glow mt-3 w-full rounded-md px-3 py-2 text-xs font-medium"
        >
          Close
        </button>
      </dialog>
    </>
  );
}
