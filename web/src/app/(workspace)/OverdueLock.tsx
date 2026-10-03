"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, LogOut } from "lucide-react";
import { shortDay } from "@/lib/editorKpi";
import { ordinal } from "@/lib/overdue";
import type { ToAnswer } from "@/lib/taskTrack";
import { DatePicker } from "./DatePicker";
import { answerOverdue } from "./actions";

// In place of the app for a Level 2 or 3 who left an overdue notice
// unanswered for over a day (lib/taskTrack overdueToAnswer): each task needs
// a new due date and a reason, and the app opens once the last one is in.
export function OverdueLock({ items, logout }: { items: ToAnswer[]; logout: () => Promise<void> }) {
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-4 py-12">
      <section className="rise-in relative w-full max-w-xl overflow-hidden panel rounded-3xl p-6 sm:p-8">
        <div className="glass-glow" />
        <span className="relative flex size-9 items-center justify-center rounded-lg badge-lit">
          <Clock size={16} />
        </span>
        <h1 className="relative mt-4 text-xl font-semibold tracking-tight">Set new dates for your overdue work</h1>
        <p className="relative mt-1.5 text-sm text-muted">
          {items.length === 1 ? "This task" : "These tasks"} passed {items.length === 1 ? "its" : "their"} due date, and the notice is more than a day old. Give{" "}
          {items.length === 1 ? "it" : "each"} a new due date and a short reason to continue.
        </p>
        <ul className="relative mt-6 flex flex-col gap-3">
          {items.map((t) => (
            <Item key={t.id} t={t} />
          ))}
        </ul>
        <form action={logout} className="relative mt-6 flex justify-end">
          <button type="submit" className="btn btn-sm btn-ghost">
            <LogOut size={13} /> Sign out
          </button>
        </form>
      </section>
    </div>
  );
}

function Item({ t }: { t: ToAnswer }) {
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
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-2.5 panel-soft rounded-2xl p-4">
      <div>
        <p className="text-sm font-medium">{t.title}</p>
        <p className="mt-0.5 text-xs text-muted">
          Was due {shortDay(t.due)}
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
    </li>
  );
}
