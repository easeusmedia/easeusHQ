"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Target } from "lucide-react";
import { hoursLabel, meets, monthName, shiftMonth, type KpiKey, type Kpis, type Targets } from "@/lib/editorKpi";
import { Avatar } from "../TaskCard";
import { Reveal } from "../Reveal";
import { Stepper } from "../Stepper";
import { saveKpiTargets } from "./actions";

const TARGET_FIELDS: { key: KpiKey; label: string; unit: string; max: number; min?: number }[] = [
  { key: "delivered", label: "Videos a month", unit: "per editor", max: 500 },
  { key: "onTimePct", label: "On time", unit: "% or more", max: 100 },
  { key: "firstPassPct", label: "Approved first time", unit: "% or more", max: 100 },
  { key: "revisions", label: "Revisions", unit: "per video, at most", max: 20, min: 0 },
  { key: "draftHours", label: "First draft", unit: "hours, at most", max: 720 },
];

// The title, the month it's showing (stepped a month at a time), and for the
// admin, the team's targets, which open under the title.
export function PerformanceHeader({ month, thisMonth, targets, canEdit }: { month: string; thisMonth: string; targets: Targets; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(targets);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = "grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground";

  async function save() {
    setSaving(true);
    const res = await saveKpiTargets(draft);
    setSaving(false);
    if (res.error) return setError(res.error);
    setError(null);
    setOpen(false);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Editor performance</h1>
          <p className="mt-1.5 text-sm text-muted">Each editor&apos;s month against the team&apos;s targets.</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button onClick={() => setOpen((o) => !o)} className="btn btn-ghost flex items-center gap-1.5">
              <Target size={14} /> Targets
            </button>
          )}
          <div className="flex items-center gap-1 rounded-lg bg-surface-2/60 p-0.5">
            <Link href={`/performance?month=${shiftMonth(month, -1)}`} aria-label="Previous month" className={step}>
              <ChevronLeft size={15} />
            </Link>
            <span className="w-32 text-center text-sm font-medium">{monthName(month)}</span>
            {month < thisMonth ? (
              <Link href={`/performance?month=${shiftMonth(month, 1)}`} aria-label="Next month" className={step}>
                <ChevronRight size={15} />
              </Link>
            ) : (
              <span className={`${step} opacity-30`}>
                <ChevronRight size={15} />
              </span>
            )}
          </div>
        </div>
      </div>

      <Reveal open={open}>
        <div className="mt-5 card-surface rounded-2xl p-4 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {TARGET_FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">{f.label}</span>
                <span className="flex items-center gap-2">
                  <Stepper value={draft[f.key]} min={f.min ?? 1} max={f.max} onChange={(n) => setDraft((d) => ({ ...d, [f.key]: n }))} />
                  <span className="text-xs text-muted">{f.unit}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            {error && <span className="mr-auto text-xs text-red-300">{error}</span>}
            <button
              onClick={() => {
                setDraft(targets);
                setOpen(false);
              }}
              className="btn btn-sm btn-ghost"
            >
              Cancel
            </button>
            <button onClick={save} disabled={saving} className="btn btn-sm btn-glow disabled:opacity-60">
              {saving ? "Saving…" : "Save targets"}
            </button>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

type Row = { id: string; name: string; kpis: Kpis; open: number; overdue: number };

const ROW = "grid grid-cols-[minmax(0,1fr)_4rem_4rem_1rem] items-center gap-4 px-5 md:grid-cols-[minmax(0,1.4fr)_repeat(5,5.5rem)_1rem]";

// one number, with a dot for whether it meets its target
function Cell({ k, value, text, targets, wide }: { k: KpiKey; value: number | null; text: string; targets: Targets; wide?: boolean }) {
  const ok = meets(k, value, targets);
  return (
    <span className={`${wide ? "flex" : "hidden md:flex"} items-center justify-end gap-1.5 tabular-nums ${value === null ? "text-muted/50" : ""}`}>
      {ok !== null && <span className={`size-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} />}
      {value === null ? "–" : text}
    </span>
  );
}

export function EditorRows({ rows, targets }: { rows: Row[]; targets: Targets }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const pct = (n: number | null) => (n === null ? "" : `${n}%`);

  if (rows.length === 0)
    return <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">No editors on the team yet.</p>;

  return (
    <div className="panel overflow-hidden rounded-2xl text-sm">
      <div className={`${ROW} py-2.5 text-xs text-muted`}>
        <span>Editor</span>
        <span className="text-right">Delivered</span>
        <span className="text-right">On time</span>
        <span className="hidden text-right md:block">First time</span>
        <span className="hidden text-right md:block">Revisions</span>
        <span className="hidden text-right md:block">First draft</span>
        <span />
      </div>
      {rows.map((r) => {
        const k = r.kpis;
        const open = openId === r.id;
        return (
          <div key={r.id} className="border-t border-border/50">
            <button
              onClick={() => setOpenId(open ? null : r.id)}
              className={`${ROW} w-full py-3 text-left transition-colors hover:bg-foreground/[0.02]`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={r.name} size={30} presence={false} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {r.open} open now
                    {r.overdue > 0 && <span className="text-red-300"> · {r.overdue} overdue</span>}
                  </span>
                </span>
              </span>
              <Cell k="delivered" value={k.delivered} text={String(k.delivered)} targets={targets} wide />
              <Cell k="onTimePct" value={k.onTimePct} text={pct(k.onTimePct)} targets={targets} wide />
              <Cell k="firstPassPct" value={k.firstPassPct} text={pct(k.firstPassPct)} targets={targets} />
              <Cell k="revisions" value={k.revisions} text={String(k.revisions)} targets={targets} />
              <Cell k="draftHours" value={k.draftHours} text={k.draftHours === null ? "" : hoursLabel(k.draftHours)} targets={targets} />
              <ChevronDown size={14} className={`text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            </button>
            <Reveal open={open}>
              <div className="grid gap-5 bg-surface-2/30 px-5 py-4 text-xs sm:grid-cols-3">
                <div>
                  <p className="text-muted">Delivered by type</p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    {k.byType.length ? (
                      k.byType.map(([type, n]) => (
                        <span key={type} className="rounded-md bg-accent/10 px-2 py-0.5 text-accent">
                          {type} {n}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted/60">Nothing delivered this month</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-muted">Sent back</p>
                  <p className="mt-1.5 text-sm">
                    {k.internalRevisions} by our review · {k.clientRevisions} by clients
                  </p>
                </div>
                <div>
                  <p className="text-muted">Reached the client late</p>
                  {k.late.length ? (
                    <ul className="mt-1.5 flex flex-col gap-0.5 text-sm">
                      {k.late.map((t, i) => (
                        <li key={i} className="truncate">
                          {t}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-sm text-muted">None</p>
                  )}
                </div>
                <Link href={`/team?person=${r.id}`} className="flex items-center gap-1 text-muted hover:text-foreground sm:col-span-3">
                  Open their profile <ArrowUpRight size={12} />
                </Link>
              </div>
            </Reveal>
          </div>
        );
      })}
    </div>
  );
}
