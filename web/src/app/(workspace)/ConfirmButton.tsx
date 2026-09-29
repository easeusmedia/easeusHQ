"use client";

import { useRef } from "react";
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
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
  // Two ways to confirm, because callers arrive both ways: a server-action
  // <form> elsewhere on the page submits by id, and a client component that
  // already holds the call passes onConfirm. Exactly one is required.
  formId?: string;
  onConfirm?: () => void;
  // the confirming button's word — "Delete" unless it's something else
  // ("Send", "Mark signed"); red only for what loses something
  confirm?: string;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.showModal()}>
        {children}
      </button>
      <dialog
        ref={ref}
        {...closeOnBackdrop}
        className="glass fixed top-1/2 left-1/2 m-0 w-72 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        <p className="text-sm">{message}</p>
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
            onClick={() => {
              ref.current?.close();
              onConfirm?.();
            }}
            className={`btn btn-sm ${danger ? "btn-danger" : "btn-glow"}`}
          >
            {confirm}
          </button>
        </div>
      </dialog>
    </>
  );
}
