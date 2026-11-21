"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Redo2, Undo2 } from "lucide-react";
import type { UndoStep } from "@/lib/undo";
import { undoStep } from "./undo";

// the step a change just kept, as the server left it in a cookie (lib/undo)
function fromCookie(): UndoStep | null {
  const m = document.cookie.match(/(?:^|; )undo-step=([^;]*)/);
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(m[1])) as UndoStep;
  } catch {
    return null;
  }
}
const idOf = (s: UndoStep | null) => (s ? `${s.at}|${s.undone}` : null);

// Undo and redo on anything (Abhishek, 21 Nov 2026): after a change, what it
// did and Undo (after an undo, Redo) at the top of the page for a few
// seconds; ⌘Z and ⇧⌘Z any time, except in a field, where they undo typing.
// Pages with their own copy of what changed listen for "easeus:undo".
export function UndoRedo({ step: fromPage }: { step: UndoStep | null }) {
  const router = useRouter();
  const [step, setStep] = useState(fromPage);
  // the step the page opened with isn't news; a new one shows
  const seen = useRef(idOf(fromPage));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const show = useCallback((s: UndoStep | null) => {
    const id = idOf(s);
    if (!id || id === seen.current) return;
    seen.current = id;
    setStep(s);
    setError(null);
    setOpen(true);
  }, []);
  useEffect(() => show(fromPage), [fromPage, show]);
  useEffect(() => {
    // the cookie a change leaves, whether or not the page reloads its data
    let last = idOf(fromCookie());
    const t = setInterval(() => {
      const c = fromCookie();
      if (idOf(c) === last) return;
      last = idOf(c);
      show(c);
    }, 600);
    return () => clearInterval(t);
  }, [show]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setOpen(false), 6000);
    return () => clearTimeout(t);
  }, [open, step, error]);

  const run = useCallback(
    async (redo: boolean) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      const res = await undoStep(redo).catch(() => ({ error: "That couldn't be done. Check your connection and try again." }));
      setBusy(false);
      if (res.error) {
        setError(res.error);
        setOpen(true);
        return;
      }
      window.dispatchEvent(new Event("easeus:undo"));
      router.refresh();
    },
    [busy, router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "z" || !step) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])")) return;
      if (step.undone !== e.shiftKey) return;
      e.preventDefault();
      run(e.shiftKey);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, run]);

  const shown = open && !!step;
  return (
    <div
      aria-live="polite"
      className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 transition-all duration-200 ease-out max-md:top-[max(0.75rem,env(safe-area-inset-top))] ${shown ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"}`}
    >
      {step && (
        <div className="glass flex items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-sm text-foreground">
          <span className={`max-w-[min(28rem,65vw)] truncate ${error ? "text-red-300" : ""}`}>{error ?? (step.undone ? `Undone: ${step.label}` : step.label)}</span>
          <button type="button" disabled={busy} onClick={() => run(step.undone)} className="btn btn-xs flex shrink-0 items-center gap-1 rounded-full px-2.5 disabled:opacity-60">
            {step.undone ? <Redo2 size={13} /> : <Undo2 size={13} />}
            {step.undone ? "Redo" : "Undo"}
          </button>
        </div>
      )}
    </div>
  );
}
