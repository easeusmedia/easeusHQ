"use client";

import { useRef } from "react";

// Native window.confirm() renders as the browser's own unstyled popup (grey
// box, "site says") — this is a glass dialog instead, consistent with the
// rest of the app. `formId` lets the dialog's own submit button trigger the
// surrounding <form>, since the dialog isn't nested inside it in the DOM.
export function ConfirmButton({
  message,
  className,
  children,
  formId,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
  formId: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.showModal()}>
        {children}
      </button>
      <dialog
        ref={ref}
        className="glass fixed top-1/2 left-1/2 m-0 w-72 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        <p className="text-sm">{message}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded-md px-3 py-1 text-xs btn-ghost"
          >
            Cancel
          </button>
          <button
            type="submit"
            form={formId}
            onClick={() => ref.current?.close()}
            className="rounded-md border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/25"
          >
            Delete
          </button>
        </div>
      </dialog>
    </>
  );
}
