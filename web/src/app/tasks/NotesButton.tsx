"use client";

import { useRef } from "react";

// Flat, filled note-card glyph (solid yellow, folded corner) instead of a
// thin-line icon — matches the macOS/Google-Keep style note icon: a solid
// shape, not an outline.
export function NotesGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path d="M4 5a2 2 0 0 1 2-2h8l6 6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z" fill="#facc15" />
      <path d="M14 3v4a2 2 0 0 0 2 2h4" fill="#fde68a" />
    </svg>
  );
}

// Small icon that just marks "this task has editing notes" — click opens a
// dialog on top of the dashboard so editors (who can't edit tasks) can still
// read them.
export function NotesButton({ notes }: { notes: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} title="Editing notes">
        <NotesGlyph />
      </button>
      <dialog
        ref={ref}
        // Tailwind's reset zeroes out margin, which is what the browser
        // normally uses to center a <dialog> — so we center it explicitly.
        className="glass fixed top-1/2 left-1/2 m-0 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        <div className="mb-2 flex items-center gap-2">
          <NotesGlyph />
          <p className="text-sm font-medium">Editing notes</p>
        </div>
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
