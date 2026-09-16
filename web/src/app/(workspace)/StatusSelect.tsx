"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePopover, useCloseOnScroll } from "./popover";
import { useRouter } from "next/navigation";
import { ChevronDown, CheckCircle2 } from "lucide-react";
import { moveTask } from "./actions";
import { linkProblem, pickLink } from "@/lib/links";
import { STATUS_LABEL, STATUS_STYLE, EXTRA_FIELD } from "./TaskCard";
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
  variant = "block",
}: {
  taskId: string;
  currentStatus: TaskStatus;
  options: TaskStatus[];
  actingUserId: string;
  actingRole: Role;
  links: { frameioLink: string | null; driveLink: string | null };
  // "block" is the full-width control on a board card. "pill" looks exactly
  // like the static StatusBadge it replaces in a list row — same colours,
  // same shape — so a row reads the same as before but the stage is now
  // something you can click and change in place.
  variant?: "block" | "pill";
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pendingTo, setPendingTo] = useState<TaskStatus | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // shown instead of currentStatus — flips the instant you pick something,
  // rather than waiting on the round-trip + router.refresh() to come back.
  // Dragging a card already felt instant via Board's useOptimistic; this
  // dropdown was the one place status changes still had a beat of nothing
  // happening before the whole board jumped.
  const [optimisticStatus, setOptimisticStatus] = useState(currentStatus);
  // Re-syncs to the server's value whenever it changes. This was briefly a
  // render-phase adjustment instead (to avoid painting the stale stage for
  // one frame) and that deadlocked: a board holds dozens of these, one
  // mousedown fires every instance's outside-click handler at once, and the
  // render-phase update turned that fan-out into "Maximum update depth
  // exceeded". The one-frame flash is not worth it.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing to a changed prop; see above for why the render-phase version is worse
  useEffect(() => setOptimisticStatus(currentStatus), [currentStatus]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Resolves to the reason it failed, or null. The caller decides how to
  // show it — always in the prompt below, never as loose text under the
  // pill, which spilled out of list rows and never went away.
  async function commit(to: TaskStatus, extra: Record<string, string> = {}): Promise<string | null> {
    const previous = optimisticStatus;
    setOptimisticStatus(to);
    try {
      const result = await moveTask(taskId, to, actingUserId, actingRole, extra);
      if (result?.error) {
        setOptimisticStatus(previous);
        return result.error;
      }
      router.refresh();
      return null;
    } catch (err) {
      setOptimisticStatus(previous);
      return err instanceof Error ? err.message : "Couldn't update status.";
    }
  }

  function pick(to: TaskStatus) {
    setOpen(false);
    setError(null);
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
    // a move that needs nothing extra can still be refused; say why in the
    // same prompt rather than leaving the pill to snap back unexplained
    commit(to).then((reason) => {
      if (!reason) return;
      setError(reason);
      dialogRef.current?.showModal();
    });
  }

  // Checked here, before anything is sent, and the prompt stays open until
  // the move actually saves — a bad link used to close the prompt and fail
  // afterwards, leaving nowhere to fix it.
  async function confirmDialog() {
    if (!pendingTo || submitting) return;
    const extra = EXTRA_FIELD[pendingTo];
    if (!extra) return;
    const value = pickLink(inputValue);
    if (!value) return setError(linkProblem(inputValue, extra.label, extra.placeholder));
    setError(null);
    setSubmitting(true);
    const reason = await commit(pendingTo, { [extra.field]: value });
    setSubmitting(false);
    if (reason) return setError(reason);
    dialogRef.current?.close();
  }

  // same escape as Dropdown: a board column scrolls its own cards, so an
  // absolute menu on a card near the bottom lost most of its options
  const { position, place } = usePopover(Math.min(320, options.length * 30 + 8));
  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);

  function toggle() {
    if (open) return setOpen(false);
    place(triggerRef.current);
    setOpen(true);
  }

  const extraField = pendingTo ? EXTRA_FIELD[pendingTo] : undefined;

  // The "one more thing before this move" prompt (a Frame.io link on submit,
  // the final Drive link on delivery), and the place a refused move explains
  // itself. Shared by both variants so a status changed from a list row
  // behaves exactly as the board card does.
  const extraDialog = (
      <dialog
        ref={dialogRef}
        onClose={() => {
          setPendingTo(null);
          setError(null);
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
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
            <p className="text-xs text-muted">
              Needed to move this to {STATUS_LABEL[pendingTo!]}.
            </p>
            <input
              autoFocus
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setError(null);
              }}
              placeholder={extraField.placeholder}
              aria-invalid={!!error}
              className={`rounded-md border bg-surface-2 px-2 py-1 text-sm ${error ? "border-red-400/60" : "border-border"}`}
            />
            {error && (
              <p role="alert" className="text-xs text-red-300">
                {error}
              </p>
            )}
            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-md px-3 py-1 text-sm btn-ghost"
              >
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="btn-glow rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60">
                {submitting ? "Saving…" : "Confirm"}
              </button>
            </div>
          </form>
        )}
        {!extraField && error && (
          <div role="alert" className="flex flex-col gap-2">
            <p className="text-sm font-medium">Couldn&apos;t change the status</p>
            <p className="text-sm text-muted">{error}</p>
            <div className="mt-1 flex justify-end">
              <button type="button" onClick={() => dialogRef.current?.close()} className="btn-glow rounded-md px-3 py-2 text-sm font-medium">
                OK
              </button>
            </div>
          </div>
        )}
      </dialog>
  );

  if (options.length === 0) {
    return variant === "pill" ? (
      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[optimisticStatus]}`}>
        {STATUS_LABEL[optimisticStatus]}
      </span>
    ) : (
      <span className="block rounded-md border border-border bg-surface-2 px-3 py-2 text-center text-xs text-muted">
        {STATUS_LABEL[optimisticStatus]}
      </span>
    );
  }

  if (variant === "pill") {
    return (
      <div ref={menuRef} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          className={`status-pop flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[optimisticStatus]}`}
        >
          {STATUS_LABEL[optimisticStatus]}
          <ChevronDown size={11} />
        </button>
        {open && position && (
          <div
            // right-aligned to the pill: the menu (11rem) is wider than the
            // pill it hangs off, so left-aligning pushed it past the edge
            style={{ top: position.top, left: Math.max(8, position.left + position.width - 176) }}
            className="pop-in fixed z-50 w-44 rounded-md border border-border bg-surface-2 py-1 shadow-lg"
          >
            {options.map((to) => (
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
        {extraDialog}
      </div>
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
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className="btn-glow flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium"
      >
        {STATUS_LABEL[optimisticStatus]}
        <ChevronDown size={13} />
      </button>
      {open && position && (
        <div
          style={{ top: position.top, left: position.left, width: position.width }}
          className="pop-in fixed z-50 rounded-md border border-border bg-surface-2 py-1 shadow-lg"
        >
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
      {extraDialog}
    </div>
  );
}
