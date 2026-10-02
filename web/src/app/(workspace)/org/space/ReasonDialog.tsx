"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Trash2 } from "lucide-react";
import { closeOnBackdrop } from "../../dialog";

export const MOVE_REASONS = ["They replied early", "Skipped a channel", "Moved by mistake", "Starting over"];
export const DELETE_REASONS = ["Duplicate", "Not a fit", "Made by mistake", "No longer needed"];

// Asks why before something happens: a lead skipping a stage or going
// back, or anything being deleted. It stays open (saving…) until the save
// works, and shows the error if it doesn't. Open it by setting `open`.
export function ReasonDialog({
  open,
  title,
  hint,
  confirm,
  danger = false,
  quick = danger ? DELETE_REASONS : MOVE_REASONS,
  placeholder = "Why?",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  hint?: string;
  confirm: string;
  danger?: boolean;
  quick?: string[];
  placeholder?: string;
  onCancel: () => void;
  // the error to show, or nothing when it worked
  onConfirm: (reason: string) => Promise<string | undefined | void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setWhy("");
      setError(null);
      setBusy(false);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  async function submit() {
    if (!why.trim() || busy) return;
    setBusy(true);
    setError(null);
    const err = await onConfirm(why.trim());
    setBusy(false);
    if (err) setError(err);
  }

  const Icon = danger ? Trash2 : ArrowRightLeft;
  return (
    <dialog
      ref={ref}
      {...closeOnBackdrop}
      onClose={() => open && onCancel()}
      // clicks here must not reach a card or row it was opened from
      onClick={(e) => {
        closeOnBackdrop.onClick(e);
        e.stopPropagation();
      }}
      className="glass fixed top-1/2 left-1/2 m-0 w-[min(25rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground"
    >
      <form
        method="dialog"
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-start gap-3">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-rose-400/10 text-rose-300" : "bg-accent/10 text-accent"}`}>
            <Icon size={16} />
          </span>
          <div className="min-w-0 pt-0.5">
            <p className="text-sm font-medium">{title}</p>
            {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
          </div>
        </div>
        <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.08] transition-shadow focus-within:ring-accent/50">
          <textarea
            autoFocus
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            rows={3}
            placeholder={placeholder}
            className="block w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm text-foreground outline-none! placeholder:text-muted/60"
          />
          <div className="flex flex-wrap gap-1.5 px-3 pb-3">
            {quick.map((r) => (
              <button key={r} type="button" onClick={() => setWhy(r)} aria-pressed={why === r} className="chip rounded-full px-2.5 py-0.5 text-[11px]">
                {r}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p role="alert" className="fade-in text-xs text-red-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={!why.trim() || busy} className={`btn btn-sm disabled:opacity-50 ${danger ? "btn-danger" : "btn-glow"}`}>
            {busy ? "Saving…" : confirm}
          </button>
        </div>
      </form>
    </dialog>
  );
}
