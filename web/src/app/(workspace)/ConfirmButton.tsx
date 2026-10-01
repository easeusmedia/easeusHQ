"use client";

import { useRef, useState } from "react";
import { closeOnBackdrop } from "./dialog";

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
        className="glass fixed top-1/2 left-1/2 m-0 w-72 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        <p className="text-sm">{message}</p>
        {reason && (
          <textarea
            autoFocus
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            rows={3}
            placeholder={reason}
            className="mt-3 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus:border-hover"
          />
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="btn btn-sm btn-ghost"
          >
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
      </dialog>
    </>
  );
}
