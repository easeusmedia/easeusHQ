"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { closeOnBackdrop } from "./dialog";

// one tap for the usual reasons
const QUICK_REASONS = ["Made by mistake", "Duplicate", "Client cancelled", "No longer needed"];

// Native window.confirm() renders as the browser's own unstyled popup (grey
// box, "site says") — this is a glass dialog instead, consistent with the
// rest of the app. `formId` lets the dialog's own submit button trigger the
// surrounding <form>, since the dialog isn't nested inside it in the DOM.
export function ConfirmButton({
  message,
  className,
  children,
  formId,
  onConfirm,
  confirm = "Delete",
  danger = confirm === "Delete" || confirm === "Remove" || confirm === "Reset",
  reason,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
  // Two ways to confirm, because callers arrive both ways: a server-action
  // <form> elsewhere on the page submits by id, and a client component that
  // already holds the call passes onConfirm. Exactly one is required.
  formId?: string;
  // gets the reason too, when one is asked for
  onConfirm?: (reason: string) => void;
  // ask why first ("Why is this being deleted?"): confirming waits for an answer
  reason?: string;
  // the confirming button's word — "Delete" unless it's something else
  // ("Send", "Mark signed"); red only for what loses something
  confirm?: string;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [why, setWhy] = useState("");

  const buttons = (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={() => ref.current?.close()} className="btn btn-sm btn-ghost">
        Cancel
      </button>
      <button
        type={formId ? "submit" : "button"}
        form={formId}
        disabled={!!reason && !why.trim()}
        onClick={() => {
          ref.current?.close();
          onConfirm?.(why.trim());
        }}
        className={`btn btn-sm disabled:opacity-50 ${danger ? "btn-danger" : "btn-glow"}`}
      >
        {confirm}
      </button>
    </div>
  );

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          setWhy("");
          ref.current?.showModal();
        }}
      >
        {children}
      </button>
      <dialog
        ref={ref}
        {...closeOnBackdrop}
        className={`glass fixed top-1/2 left-1/2 m-0 -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground ${reason ? "w-[min(24rem,calc(100vw-2rem))]" : "w-72"}`}
      >
        {reason ? (
          // a delete that asks why: the reason stays with the task in History
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start gap-3">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-rose-400/10 text-rose-300" : "bg-accent/10 text-accent"}`}>
                <Trash2 size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{message}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">It&apos;s kept in History with your reason, and Level 1 can bring it back.</p>
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.08] transition-shadow focus-within:ring-accent/50">
              <textarea
                autoFocus
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                rows={3}
                placeholder={reason}
                className="block w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm text-foreground outline-none! placeholder:text-muted/60"
              />
              <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                {QUICK_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setWhy(r)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] transition-colors ${why === r ? "bg-accent/15 text-accent" : "bg-white/[0.05] text-muted hover:text-foreground"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            {buttons}
          </div>
        ) : (
          <div className="p-4">
            <p className="text-sm">{message}</p>
            <div className="mt-3">
              {buttons}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
