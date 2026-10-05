"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { shortDay } from "@/lib/editorKpi";
import { ordinal } from "@/lib/overdue";
import type { ToAnswer } from "@/lib/taskTrack";
import { DatePicker } from "./DatePicker";
import { answerOverdue } from "./actions";
import { closeOnBackdrop } from "./dialog";

const Frozen = createContext<Set<string>>(new Set());

// What a task card spreads on itself: frozen, it's marked so a click, a drag
// or Enter on it asks for a new date instead (FrozenTasks)
export function useFrozen() {
  const ids = useContext(Frozen);
  return (id: string) => (ids.has(id) ? { "data-frozen-task": id, title: "Set a new due date to continue" } : {});
}

// Work a Level 2 or 3 left overdue, its notice more than a day old and
// unanswered (lib/taskTrack overdueToAnswer), is frozen wherever it shows:
// dimmed, and any click, drag or Enter on it opens a prompt for a new due
// date and a reason instead. Everything else in the app works as usual, and
// the task thaws once its date is in. The server refuses to move a frozen
// task too. A Level 1 looking as them sees their frozen work and can set
// the dates for them.
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
              <h2 className="text-base font-semibold">Set a new due date</h2>
            </div>
            <p className="text-sm text-muted">This task passed its due date and the notice is more than a day old. Give it a new date and a short reason to work on it again.</p>
            <Answer key={asking.id} t={asking} onDone={() => setAsking(null)} />
          </div>
        )}
      </dialog>
    </Frozen.Provider>
  );
}

function Answer({ t, onDone }: { t: ToAnswer; onDone: () => void }) {
  const router = useRouter();
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await answerOverdue(t.kind, t.id, day, reason).catch(() => ({ error: "That couldn't be saved. Check your connection and try again." }));
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
      <DatePicker value={day} onChange={setDay} placeholder="New due date" clearable={false} />
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why it slipped, and what changes now"
        aria-label="Reason"
        className="field field-sizing-content min-h-16 resize-none rounded-xl px-3 py-2 text-sm"
      />
      {error && (
        <p role="alert" className="fade-in text-xs text-rose-300">
          {error}
        </p>
      )}
      <button type="button" onClick={save} disabled={busy || !day || !reason.trim()} className="btn btn-sm btn-glow self-end disabled:opacity-50">
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
