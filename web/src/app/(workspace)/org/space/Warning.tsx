"use client";

import { ShieldAlert } from "lucide-react";

// Why something can't be done, over the page until it's dismissed or clicked
// away: a move the board refuses, or the lead window's "Move to Ready to
// reach out" before everything is approved (the same warning in both)
// lines: a heading and what's left, one per line ("Approve Day 2 · Instagram DM 1")
export function Warning({ text, lines, label = "Couldn't save", onClose }: { text: string | null; lines?: string[]; label?: string; onClose: () => void }) {
  if (!text) return null;
  return (
    <div onClick={onClose} className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div role="alertdialog" aria-label={label} onClick={(e) => e.stopPropagation()} className="glass pop-in flex max-w-sm flex-col items-center gap-4 rounded-2xl p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-red-400/15">
          <ShieldAlert size={22} className="text-red-300" />
        </div>
        <p className="text-sm text-foreground">{text}</p>
        {lines && lines.length > 0 && (
          <ul className="flex max-h-60 w-full flex-col gap-1 overflow-y-auto text-left text-xs text-muted">
            {lines.map((l) => (
              <li key={l} className="flex gap-2">
                <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-muted/60" />
                {l}
              </li>
            ))}
          </ul>
        )}
        <button type="button" autoFocus onClick={onClose} className="btn btn-sm btn-glow">
          Dismiss
        </button>
      </div>
    </div>
  );
}
