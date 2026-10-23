"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { shortDay } from "@/lib/editorKpi";
import { ordinal } from "@/lib/overdue";
import type { ToAnswer } from "@/lib/taskTrack";
import { DatePicker } from "./DatePicker";
import { answerOverdue, finishOverdue } from "./actions";
import { dayOf } from "@/lib/editorKpi";
import { closeOnBackdrop } from "./dialog";

const Frozen = createContext<Set<string>>(new Set());

// What a task card spreads on itself: frozen, it's marked so a click, a drag
// or Enter on it asks for a new date instead (FrozenTasks)
export function useFrozen() {
  const ids = useContext(Frozen);
  return (id: string) => (ids.has(id) ? { "data-frozen-task": id, title: "Set a new due date to continue" } : {});
}

// Work left overdue, by anyone at any level (lib/taskTrack
// overdueToAnswer), is locked on the Production board and lists, in My
// tasks and in Home's own rows: any click, drag or Enter on it opens a
// prompt for a new due date and a reason instead. It shows a little darker
// (globals.css), except on Home (data-frozen-plain). The task unlocks once
// its date is in. A Level 1 looking as them sees their locked work and can
// set the dates for them.
export function FrozenTasks({ items, children }: { items: ToAnswer[]; children: React.ReactNode }) {
  const ids = useMemo(() => new Set(items.map((t) => t.id)), [items]);
  const [asking, setAsking] = useState<ToAnswer | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!ids.size) return;
    // caught on the way down, before the card's own handlers see it
    const frozenAt = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>("[data-frozen-task]") : null);
    const block = (e: Event) => {
      const el = frozenAt(e);
      if (!el) return null;
      e.preventDefault();
      e.stopPropagation();
      return el;
    };
    const ask = (e: Event) => {
      const el = block(e);
      const t = el && items.find((x) => x.id === el.dataset.frozenTask);
      if (t) setAsking(t);
    };
    const onKey = (e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && ask(e);
    const types: [string, EventListener][] = [
      ["click", ask],
      ["keydown", onKey as EventListener],
      ["pointerdown", block],
      ["dragstart", block],
    ];
    for (const [type, fn] of types) document.addEventListener(type, fn, true);
    return () => {
      for (const [type, fn] of types) document.removeEventListener(type, fn, true);
    };
  }, [ids, items]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (asking && !d.open) d.showModal();
    else if (!asking && d.open) d.close();
  }, [asking]);

  return (
    <Frozen.Provider value={ids}>
      {children}
      <dialog
        ref={ref}
        {...closeOnBackdrop}
        onClose={() => setAsking(null)}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground"
      >
        {asking && (
          <div className="flex flex-col gap-4 p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg badge-lit">
                <Clock size={16} />
              </span>
              <h2 className="text-base font-semibold">This task is overdue</h2>
            </div>
            <p className="text-sm text-muted">Give it a new date, or the day it was finished if it&apos;s done, and a short reason.</p>
            <Answer key={asking.id} t={asking} onDone={() => setAsking(null)} />
          </div>
        )}
      </dialog>
    </Frozen.Provider>
  );
}

// Still to do: a new due date, today or later. Already done, only not ticked
// off then: the day it was finished, today or earlier, and it's done
// (Abhishek, 23 Oct 2026).
function Answer({ t, onDone }: { t: ToAnswer; onDone: () => void }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await (done ? finishOverdue : answerOverdue)(t.kind, t.id, day, reason).catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }));
    setBusy(false);
    if (res.error) return setError(res.error);
    onDone();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2.5 panel-soft rounded-2xl p-4">
      <div>
        <p className="text-sm font-medium">{t.title}</p>
        <p className="mt-0.5 text-xs text-muted">
          {t.owner && `${t.owner} · `}Was due {shortDay(t.due)}
          {t.client && ` · ${t.client}`}
          {t.strikes > 1 && <span className="text-rose-300"> · late for the {ordinal(t.strikes)} time</span>}
        </p>
      </div>
      {t.finishable && (
        <div role="tablist" aria-label="Where it stands" className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
          {[
            { key: false, label: "New date" },
            { key: true, label: "Already done" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="tab"
              aria-selected={done === o.key}
              onClick={() => {
                setDone(o.key);
                // done: most often finished today and ticked late
                setDay(o.key ? dayOf(new Date()) : "");
                setError(null);
              }}
              className="seg flex-1 rounded-full px-3 py-1 text-xs font-medium"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      <DatePicker key={String(done)} value={day} onChange={setDay} placeholder={done ? "Finished on" : "New due date"} clearable={false} />
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={done ? "Why it wasn't ticked off that day" : "Why it slipped, and what changes now"}
        aria-label="Reason"
        className="field field-sizing-content min-h-16 resize-none rounded-xl px-3 py-2 text-sm"
      />
      {error && (
        <p role="alert" className="fade-in text-xs text-rose-300">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {/* not now: the task stays frozen until a date is in */}
        <button type="button" onClick={onDone} className="btn btn-sm btn-ghost">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={busy || !day || !reason.trim()} className="btn btn-sm btn-glow disabled:opacity-50">
          {busy ? "Saving…" : done ? "Mark done" : "Save"}
        </button>
      </div>
    </div>
  );
}
