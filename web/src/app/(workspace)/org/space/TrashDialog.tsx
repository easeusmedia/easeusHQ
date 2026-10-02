"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2, Undo2, X } from "lucide-react";
import { listTrash, restoreLead } from "./actions";
import { dateOf } from "./values";
import { closeOnBackdrop } from "../../dialog";
import type { TrashItem } from "@/lib/space";

const KIND_NAME: Record<string, string> = {
  lead: "Lead",
  stage: "Stage",
  field: "Property",
  option: "Tag",
  board: "Board",
  portal: "Portal",
  section: "Section",
};

// What was deleted from a board (or from under a page): who, when and why.
// Leads can be put back, history and all. Loaded each time it opens.
export function TrashDialog({ open, spaceId, title, onClose }: { open: boolean; spaceId: string; title: string; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  // tagged with the page it's for, so another page's list never shows here
  const [list, setList] = useState<{
    spaceId: string;
    items: TrashItem[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    listTrash(spaceId).then((r) => {
      if (!live) return;
      setError(r.error ?? null);
      if (!r.error) setList({ spaceId, items: r.items ?? [] });
    });
    return () => {
      live = false;
    };
  }, [open, spaceId]);

  const items = list?.spaceId === spaceId ? list.items : null;

  async function putBack(item: TrashItem) {
    setBusy(item.id);
    setFailed(null);
    const res = await restoreLead(item.id);
    setBusy(null);
    if (res.error) return setFailed({ id: item.id, text: res.error });
    const now = new Date().toISOString();
    setList(
      (l) =>
        l && {
          ...l,
          items: l.items.map((t) => (t.id === item.id ? { ...t, restoredAt: now } : t)),
        },
    );
    router.refresh();
  }

  return (
    <dialog
      ref={ref}
      {...closeOnBackdrop}
      // only its own closing, not a dialog's inside it
      onClose={(e) => e.target === e.currentTarget && open && onClose()}
      className="glass fixed top-1/2 left-1/2 m-0 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl p-0 text-foreground"
    >
      <div className="flex max-h-[80vh] flex-col">
        <div className="flex shrink-0 items-start gap-3 border-b border-border/50 px-5 py-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-muted">
            <Trash2 size={16} />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm font-medium">Deleted items</p>
            <p className="truncate text-xs text-muted">{title}</p>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            title="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error ? (
            <p role="alert" className="fade-in px-2 py-8 text-center text-xs text-red-300">
              {error}
            </p>
          ) : !items ? (
            <p className="px-2 py-8 text-center text-xs text-muted">Loading…</p>
          ) : !items.length ? (
            <div className="fade-in flex flex-col items-center gap-2 px-2 py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-white/[0.04] text-muted">
                <Trash2 size={16} />
              </span>
              <p className="text-sm text-muted">Nothing deleted here yet.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((t) => (
                <li key={t.id} className="panel-soft fade-in flex items-start gap-3 rounded-xl p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-1.5 text-[11px] leading-5 text-muted">
                        {KIND_NAME[t.kind] ?? t.kind}
                      </span>
                      <p className="min-w-0 truncate text-sm font-medium">{t.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Deleted by {t.byName} on {dateOf(t.deletedAt)}
                    </p>
                    {t.reason && (
                      <p className="mt-1.5 border-l-2 border-amber-400/40 pl-2 text-xs leading-relaxed break-words text-amber-200/85">
                        &ldquo;{t.reason}&rdquo;
                      </p>
                    )}
                    {failed?.id === t.id && (
                      <p role="alert" className="fade-in mt-1.5 text-xs text-red-300">
                        {failed.text}
                      </p>
                    )}
                  </div>
                  {t.kind === "lead" &&
                    (t.restoredAt ? (
                      <span className="fade-in flex shrink-0 items-center gap-1 pt-0.5 text-xs text-emerald-300/85">
                        <Check size={12} /> Put back {dateOf(t.restoredAt)}
                      </span>
                    ) : (
                      <button type="button" disabled={busy === t.id} onClick={() => putBack(t)} className="btn btn-xs btn-glow shrink-0 disabled:opacity-60">
                        <Undo2 size={12} /> {busy === t.id ? "Putting back…" : "Put back"}
                      </button>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  );
}
