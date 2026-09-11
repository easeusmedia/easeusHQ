"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CheckCircle2 } from "lucide-react";
import { moveTask } from "./actions";
import { STATUS_LABEL, EXTRA_FIELD } from "./TaskCard";
import type { Role, TaskStatus } from "@/lib/workflow";

// Replaces the old "→ Editing" arrow-buttons with one dropdown per card —
// picking a status calls the exact same moveTask() that dragging the card
// calls, so selecting and dragging really do "work the same".
export function StatusSelect({
  taskId,
  currentStatus,
  options,
  actingUserId,
  actingRole,
  links,
}: {
  taskId: string;
  currentStatus: TaskStatus;
  options: TaskStatus[];
  actingUserId: string;
  actingRole: Role;
  links: { frameioLink: string | null; driveLink: string | null };
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pendingTo, setPendingTo] = useState<TaskStatus | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  // shown instead of currentStatus — flips the instant you pick something,
  // rather than waiting on the round-trip + router.refresh() to come back.
  // Dragging a card already felt instant via Board's useOptimistic; this
  // dropdown was the one place status changes still had a beat of nothing
  // happening before the whole board jumped.
  const [optimisticStatus, setOptimisticStatus] = useState(currentStatus);
  useEffect(() => setOptimisticStatus(currentStatus), [currentStatus]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function commit(to: TaskStatus, extra: Record<string, string> = {}) {
    const previous = optimisticStatus;
    setOptimisticStatus(to);
    try {
      const result = await moveTask(taskId, to, actingUserId, actingRole, extra);
      if (result?.error) {
        setOptimisticStatus(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    } catch (err) {
      setOptimisticStatus(previous);
      setError(err instanceof Error ? err.message : "Couldn't update status.");
    }
  }

  function pick(to: TaskStatus) {
    setOpen(false);
    const extra = EXTRA_FIELD[to];
    if (extra) {
      setPendingTo(to);
      // already has this link on file (e.g. resubmitting after a revision)
      // — prefill it instead of forcing a retype of the same link
      const existing = extra.field === "frameioLink" || extra.field === "driveLink" ? links[extra.field] : null;
      setInputValue(existing ?? "");
      dialogRef.current?.showModal();
      return;
    }
    commit(to);
  }

  function confirmDialog() {
    if (!pendingTo) return;
    const extra = EXTRA_FIELD[pendingTo];
    if (!extra || !inputValue.trim()) return;
    commit(pendingTo, { [extra.field]: inputValue.trim() });
    dialogRef.current?.close();
    setPendingTo(null);
  }

  const extraField = pendingTo ? EXTRA_FIELD[pendingTo] : undefined;

  if (options.length === 0) {
    return (
      <span className="block rounded-md border border-border bg-surface-2 px-3 py-2 text-center text-xs text-muted">
        {STATUS_LABEL[optimisticStatus]}
      </span>
    );
  }

  // Once the client has signed off, "delivered" is the one action that
  // matters here — surface it as its own button instead of burying it in
  // the full status list (ops can still reach every other status below).
  const isFinalReady = optimisticStatus === "final_export_ready" && options.includes("delivered_and_uploaded");
  const dropdownOptions = isFinalReady ? options.filter((o) => o !== "delivered_and_uploaded") : options;

  return (
    <div ref={menuRef} className="relative flex flex-col gap-1.5">
      {isFinalReady && (
        <button
          type="button"
          onClick={() => pick("delivered_and_uploaded")}
          className="status-pop flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/15 px-3 py-2 text-xs font-medium text-emerald-300"
        >
          <CheckCircle2 size={13} /> Mark delivered to client
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-glow flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium"
      >
        {STATUS_LABEL[optimisticStatus]}
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 w-full rounded-md border border-border bg-surface-2 py-1 shadow-lg">
          {dropdownOptions.map((to) => (
            <button
              key={to}
              type="button"
              onClick={() => pick(to)}
              className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-hover"
            >
              {STATUS_LABEL[to]}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-[11px] text-red-300">{error}</p>}

      <dialog
        ref={dialogRef}
        onClose={() => setPendingTo(null)}
        className="glass fixed top-1/2 left-1/2 m-0 w-72 -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
      >
        {extraField && (
          <form
            method="dialog"
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              confirmDialog();
            }}
          >
            <p className="text-sm font-medium">{extraField.label}</p>
            <input
              autoFocus
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={extraField.placeholder}
              className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm"
            />
            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-md px-3 py-1 text-sm btn-ghost"
              >
                Cancel
              </button>
              <button type="submit" className="btn-glow rounded-md px-3 py-2 text-sm font-medium">
                Confirm
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
