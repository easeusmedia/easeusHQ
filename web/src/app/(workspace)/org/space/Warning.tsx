"use client";

import { ShieldAlert } from "lucide-react";

// Why something can't be done, over the page until it's dismissed or clicked
// away: a move the board refuses, or the lead window's "Move to Ready to
// reach out" before everything is approved (the same warning in both)
export function Warning({ text, label = "Couldn't save", onClose }: { text: string | null; label?: string; onClose: () => void }) {
  if (!text) return null;
  return (
    <div onClick={onClose} className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div role="alertdialog" aria-label={label} onClick={(e) => e.stopPropagation()} className="glass pop-in flex max-w-sm flex-col items-center gap-4 rounded-2xl p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-red-400/15">
          <ShieldAlert size={22} className="text-red-300" />
        </div>
        <p className="text-sm text-foreground">{text}</p>
        <button type="button" autoFocus onClick={onClose} className="btn btn-sm btn-glow">
          Dismiss
        </button>
      </div>
    </div>
  );
}
