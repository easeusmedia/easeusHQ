"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { topLayer, usePopover, useCloseOnScroll } from "./popover";
import { useRouter } from "next/navigation";
import { ChevronDown, CheckCircle2, Copy } from "lucide-react";
import { moveTask } from "./actions";
import { linkProblem, pickLink } from "@/lib/links";
import { STATUS_LABEL, STATUS_STYLE, EXTRA_FIELD } from "./TaskCard";
import { copyFrameioFileToDrive, frameioFileForTask, type DeliverableFile } from "./actions";
import type { TaskStatus } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";

// every stage, wherever it's listed, carries its colour
const Dot = ({ status }: { status: TaskStatus }) => (
  <span className={`size-2 shrink-0 rounded-full ${STAGE[status].dot}`} />
);

// Replaces the old "→ Editing" arrow-buttons with one dropdown per card —
// picking a status calls the exact same moveTask() that dragging the card
// calls, so selecting and dragging really do "work the same".
export function StatusSelect({
  taskId,
  currentStatus,
  options,
  links,
  variant = "block",
}: {
  taskId: string;
  currentStatus: TaskStatus;
  options: TaskStatus[];
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
  // what Frame.io has for this task, once the delivery prompt asks
  const [fio, setFio] = useState<{
    state: "idle" | "loading" | "ready" | "copying" | "copied" | "unavailable";
    files?: DeliverableFile[];
    where?: string;
    why?: string;
  }>({ state: "idle" });
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
      const result = await moveTask(taskId, to, extra);
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

  // Offered only on delivery, and only when this task has a review link to
  // copy from. Loaded when the prompt opens rather than up front — it's a
  // round trip to Frame.io, and most status changes aren't deliveries.
  async function offerFrameio() {
    setFio({ state: "loading" });
    const res = await frameioFileForTask(taskId);
    if (res.error || !res.files?.length) return setFio({ state: "unavailable", why: res.error ?? "Nothing in that share." });
    setFio({ state: "ready", files: res.files });
  }

  // One press does the whole delivery: copy the file across, then move the
  // task with the link that copy produced. Splitting it into "copy" and then
  // "confirm" made the person do the app's filing for it.
  async function copyAndDeliver(fileId: string) {
    if (!pendingTo) return;
    setFio((f) => ({ ...f, state: "copying", why: undefined }));
    const res = await copyFrameioFileToDrive(taskId, fileId);
    if (res.error || !res.url) return setFio((f) => ({ ...f, state: "ready", why: res.error ?? "No link came back." }));
    setInputValue(res.url);
    setFio({ state: "copied", where: res.path });
    const reason = await commit(pendingTo, { driveLink: res.url });
    if (reason) return setFio((f) => ({ ...f, state: "ready", why: reason }));
    dialogRef.current?.close();
  }

  function pick(to: TaskStatus) {
    setOpen(false);
    setError(null);
    const extra = EXTRA_FIELD[to];
    if (extra) {
      setPendingTo(to);
      setFio({ state: "idle" });
      if (to === "delivered_and_uploaded" && links.frameioLink) offerFrameio();
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
  // whether Frame.io is offering to do this delivery for them
  const hasOffer = fio.state !== "idle" && fio.state !== "unavailable" && !!fio.files?.length;

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
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(21rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl p-4 text-foreground"
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

            {/* The file Frame.io already has, offered as the whole answer:
                one press copies it and delivers. The team often re-renders
                at full quality instead of shipping what's on Frame.io, so
                it stays an offer — the size on screen is what gives away a
                low-quality proxy — and pasting a link by hand is always
                right there underneath. */}
            {fio.state === "loading" && <p className="text-xs text-muted">Looking on Frame.io…</p>}
            {(fio.state === "ready" || fio.state === "copying" || fio.state === "copied") &&
              fio.files?.map((f) => (
                <div key={f.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2/60 p-2.5">
                  <div>
                    <p className="text-xs leading-snug">
                      <span className="font-medium">{f.name}</span>
                      <span className="text-muted">{f.size ? ` · ${(f.size / 1048576).toFixed(0)}MB` : ""}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted">
                      {f.ready ? `Creative Exports / ${f.destination}` : "Frame.io is still processing this one."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyAndDeliver(f.id)}
                    disabled={!f.ready || fio.state === "copying" || fio.state === "copied"}
                    className="btn btn-sm btn-primary w-full disabled:opacity-60"
                  >
                    <Copy size={12} />
                    {fio.state === "copying"
                      ? "Copying to Drive…"
                      : fio.state === "copied"
                        ? "Delivering…"
                        : "Copy to Drive and deliver"}
                  </button>
                  {fio.why && <p className="text-[11px] text-red-300">{fio.why}</p>}
                </div>
              ))}
            {hasOffer && <p className="text-[11px] text-muted">Or, if you re-rendered it yourself:</p>}
            <input
              autoFocus={!hasOffer}
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
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`btn disabled:opacity-60 ${hasOffer ? "btn-ghost" : "btn-primary"}`}
              >
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
              <button type="button" onClick={() => dialogRef.current?.close()} className="btn btn-glow">
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
            {...topLayer}
            // right-aligned to the pill: the menu (11rem) is wider than the
            // pill it hangs off, so left-aligning pushed it past the edge
            style={{ top: position.top, bottom: position.bottom, left: Math.max(8, position.left + position.width - 176) }}
            className="pop-in fixed z-50 w-44 rounded-md border border-border bg-surface-2 py-1 shadow-lg"
          >
            {options.map((to) => (
              <button
                key={to}
                type="button"
                onClick={() => pick(to)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-hover"
              >
                <Dot status={to} />
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
          className="btn btn-sm status-pop flex w-full min-w-0 items-center justify-center gap-1.5 border border-transparent bg-emerald-400/15 text-center text-emerald-300"
        >
          <CheckCircle2 size={13} className="shrink-0" /> Mark delivered
        </button>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className="btn btn-sm btn-glow flex w-full min-w-0 items-center justify-between gap-1"
      >
        {/* where it is now, in its colour — the button is how it moves on */}
        <span className="flex min-w-0 items-center gap-2">
          <Dot status={optimisticStatus} />
          <span className="truncate">{STATUS_LABEL[optimisticStatus]}</span>
        </span>
        <ChevronDown size={13} className="shrink-0 text-muted" />
      </button>
      {open && position && (
        <div
          {...topLayer}
          // never narrower than the longest stage name, and kept on screen
          style={{
            top: position.top,
            bottom: position.bottom,
            left: Math.max(8, Math.min(position.left, window.innerWidth - Math.max(position.width, 176) - 8)),
            width: Math.max(position.width, 176),
          }}
          className="pop-in fixed z-50 rounded-md border border-border bg-surface-2 py-1 shadow-lg"
        >
          {dropdownOptions.map((to) => (
            <button
              key={to}
              type="button"
              onClick={() => pick(to)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-hover"
            >
              <Dot status={to} />
              {STATUS_LABEL[to]}
            </button>
          ))}
        </div>
      )}
      {extraDialog}
    </div>
  );
}
