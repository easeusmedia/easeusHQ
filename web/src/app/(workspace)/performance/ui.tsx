"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Check, ChevronLeft, ChevronRight, CircleSlash, PenLine, Plus, Target, Trash2, X } from "lucide-react";
import { ENTRY_KINDS, MISTAKE_CATEGORIES, monthName, shiftMonth, type Grade, type KpiKey, type Targets } from "@/lib/editorKpi";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { Reveal } from "../Reveal";
import { Stepper } from "../Stepper";
import { ConfirmButton } from "../ConfirmButton";
import { acceptAll, deleteEntry, logEntry, reviewEntry, saveKpiTargets, setTaskExcluded, updateEntry, type EntryInput } from "./actions";

// ---------- header ----------

const TARGET_FIELDS: { key: KpiKey; label: string; unit: string; max: number; min?: number }[] = [
  { key: "delivered", label: "Videos", unit: "a month, per editor", max: 500 },
  { key: "turnaroundHours", label: "Turnaround", unit: "hours, at most", max: 720 },
  { key: "mistakes", label: "Mistakes", unit: "a month, at most", max: 100, min: 0 },
  { key: "revisions", label: "Revisions", unit: "per video, at most", max: 20, min: 0 },
  { key: "onTimePct", label: "On time", unit: "% or more", max: 100 },
];

export function MonthSwitch({ month, thisMonth, base }: { month: string; thisMonth: string; base: string }) {
  const step = "grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground";
  const href = (ym: string) => `${base}${base.includes("?") ? "&" : "?"}month=${ym}`;
  return (
    <div className="flex items-center gap-1 rounded-lg bg-surface-2/60 p-0.5">
      <Link href={href(shiftMonth(month, -1))} aria-label="Previous month" className={step}>
        <ChevronLeft size={15} />
      </Link>
      <span className="w-32 text-center text-sm font-medium">{monthName(month)}</span>
      {month < thisMonth ? (
        <Link href={href(shiftMonth(month, 1))} aria-label="Next month" className={step}>
          <ChevronRight size={15} />
        </Link>
      ) : (
        <span className={`${step} pointer-events-none opacity-30`}>
          <ChevronRight size={15} />
        </span>
      )}
    </div>
  );
}

// The team's targets, set by the admin, opening under the page title.
export function TargetsEditor({ targets }: { targets: Targets }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(targets);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <>
      <button onClick={() => setOpen((o) => !o)} className="btn btn-ghost flex items-center gap-1.5">
        <Target size={14} /> Targets
      </button>
      {/* fixed under the header row, full width */}
      <div className="order-last basis-full">
        <Reveal open={open}>
          <div className="mt-1 card-surface rounded-2xl p-4 shadow-sm">
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
            <p className="mt-3 text-xs text-muted">The grade follows the Notion review: no mistakes is an A+, up to 2 an A, 4 a B, 6 a C, 8 a D, more an F.</p>
            <div className="mt-3 flex items-center justify-end gap-2">
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
    </>
  );
}

// ---------- marks ----------

const GRADE_TONE: Record<Grade, string> = {
  "A+": "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30",
  A: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
  B: "bg-accent/12 text-accent ring-accent/25",
  C: "bg-amber-400/12 text-amber-300 ring-amber-400/25",
  D: "bg-orange-400/12 text-orange-300 ring-orange-400/25",
  F: "bg-red-400/12 text-red-300 ring-red-400/25",
};

export function GradeBadge({ grade, size = "md" }: { grade: Grade | null; size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-14 text-2xl rounded-2xl" : "size-10 text-base rounded-xl";
  return (
    <span
      title={grade ? `Grade ${grade}, from the mistakes found this month` : "Nothing to grade yet this month"}
      className={`grid shrink-0 place-items-center font-semibold ring-1 ${box} ${grade ? GRADE_TONE[grade] : "bg-surface-2 text-muted ring-border"}`}
    >
      {grade ?? "–"}
    </span>
  );
}

// a dot for whether a number meets its target: green, amber, or nothing to judge
export function TargetDot({ ok }: { ok: boolean | null }) {
  if (ok === null) return null;
  return <span title={ok ? "Meets the target" : "Misses the target"} className={`size-1.5 shrink-0 rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} />;
}

// Columns over time, one series: past months muted, the current one in the
// accent with its value on the cap. Hover any column for its number.
export function TrendBars({ title, points, empty = "No data yet" }: { title: string; points: { label: string; value: number | null; text: string }[]; empty?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...points.map((p) => p.value ?? 0));
  const last = points.length - 1;
  const H = 84;
  return (
    <div className="rounded-2xl border border-border bg-surface-2/30 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-muted">{title}</p>
        <p className="text-xs tabular-nums text-muted">{hover !== null ? `${points[hover].label}: ${points[hover].text}` : ""}</p>
      </div>
      {max === 0 ? (
        <p className="grid h-[118px] place-items-center text-xs text-muted/60">{empty}</p>
      ) : (
        <div className="mt-3 flex items-end gap-2" onMouseLeave={() => setHover(null)}>
          {points.map((p, i) => {
            const h = p.value ? Math.max(3, (p.value / max) * H) : 0;
            return (
              <div key={p.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" onMouseEnter={() => setHover(i)}>
                <span className={`text-[11px] tabular-nums ${i === last && p.value !== null ? "text-foreground" : "invisible"}`}>{p.text}</span>
                <div className="flex w-full justify-center border-b border-border/70" style={{ height: H }}>
                  <div
                    className={`mt-auto w-full max-w-6 rounded-t-[4px] transition-colors ${i === last ? "bg-accent" : hover === i ? "bg-accent/60" : "bg-accent/30"}`}
                    style={{ height: h }}
                  />
                </div>
                <span className="text-[11px] text-muted">{p.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// how many of each kind of mistake, longest first
export function CategoryBars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return (
    <div className="rounded-2xl border border-border bg-surface-2/30 p-4">
      <p className="text-xs text-muted">Mistakes by kind</p>
      {rows.length === 0 ? (
        <p className="grid h-[118px] place-items-center text-xs text-muted/60">None this month</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map(([cat, n]) => (
            <li key={cat} className="grid grid-cols-[8rem_1fr_1.5rem] items-center gap-3 text-xs">
              <span className="truncate text-muted">{cat}</span>
              <span className="h-2 rounded-r-[4px] bg-amber-400/70" style={{ width: `${(n / max) * 100}%` }} />
              <span className="text-right tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- feedback ----------

export type EntryRow = {
  id: string;
  kind: string;
  category: string | null;
  body: string;
  count: number;
  day: string;
  source: string;
  by: string | null;
  fromClient: boolean;
  reviewed: boolean;
  taskId: string | null;
  taskTitle: string | null;
};
export type TaskOption = { id: string; title: string };

const KIND_DOT: Record<string, string> = {
  mistake: "bg-amber-400",
  creative: "bg-accent",
  praise: "bg-emerald-400",
  note: "bg-muted",
};
const SOURCE_LABEL: Record<string, string> = { frameio: "Frame.io", notion: "Notion", manual: "Logged" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDay = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;

function EntryDialog({
  open,
  onClose,
  editorId,
  tasks,
  entry,
  today,
}: {
  open: boolean;
  onClose: () => void;
  editorId: string;
  tasks: TaskOption[];
  entry: EntryRow | null;
  today: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const blank = (): EntryInput => ({
    editorId,
    kind: entry?.kind ?? "mistake",
    category: entry?.category ?? "",
    body: entry?.body ?? "",
    count: entry?.count ?? 1,
    day: entry?.day ?? today,
    taskId: entry?.taskId ?? "",
  });
  const [form, setForm] = useState<EntryInput>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const set = <K extends keyof EntryInput>(k: K, v: EntryInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    const res = entry ? await updateEntry(entry.id, form) : await logEntry(form);
    setSaving(false);
    if (res.error) return setError(res.error);
    setError(null);
    onClose();
    router.refresh();
  }

  const mistake = form.kind === "mistake";
  const label = "flex min-w-0 flex-col gap-1 text-xs text-muted";
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="glass fixed top-1/2 left-1/2 m-0 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-5 text-foreground"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{entry ? "Edit feedback" : "Log feedback"}</h2>
        <button onClick={onClose} aria-label="Close" className="text-muted hover:text-foreground">
          <X size={15} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1 rounded-lg bg-surface-2/60 p-0.5">
        {Object.entries(ENTRY_KINDS).map(([k, name]) => (
          <button
            key={k}
            type="button"
            onClick={() => set("kind", k)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${
              form.kind === k ? "bg-surface-2 text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            <span className={`size-1.5 rounded-full ${KIND_DOT[k]}`} />
            {name}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {/* only for a mistake; pulled up by a row gap so it takes no room while closed */}
        <div className="col-span-2 -mt-3">
          <Reveal open={mistake}>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className={label}>
                Kind of mistake
                <Dropdown
                  value={form.category}
                  placeholder="Pick one"
                  create
                  onChange={(v) => set("category", v)}
                  options={MISTAKE_CATEGORIES.map((c) => ({ value: c, label: c }))}
                />
              </div>
              <div className={label}>
                Times
                <Stepper value={form.count} max={99} onChange={(n) => set("count", n)} />
              </div>
            </div>
          </Reveal>
        </div>
        <div className={label}>
          Day
          <DatePicker value={form.day} onChange={(v) => set("day", v || today)} clearable={false} />
        </div>
        <div className={label}>
          Video
          <Dropdown
            value={form.taskId}
            placeholder="None in particular"
            search={{ recent: 8, placeholder: "Search their videos…" }}
            onChange={(v) => set("taskId", v)}
            options={[{ value: "", label: "None in particular" }, ...tasks.map((t) => ({ value: t.id, label: t.title }))]}
          />
        </div>
        <label className={`${label} col-span-2`}>
          What happened
          <textarea
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
            rows={3}
            placeholder={mistake ? "e.g. Subtitles don't match what's being said" : "What was said, and what it's about"}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>

      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-sm btn-ghost">
          Cancel
        </button>
        <button onClick={save} disabled={saving} className="btn btn-sm btn-glow disabled:opacity-60">
          {saving ? "Saving…" : entry ? "Save changes" : "Log it"}
        </button>
      </div>
    </dialog>
  );
}

export function LogFeedbackButton({ editorId, tasks, today }: { editorId: string; tasks: TaskOption[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(0);
  return (
    <>
      <button
        onClick={() => {
          setN((x) => x + 1);
          setOpen(true);
        }}
        className="btn btn-glow flex items-center gap-1.5"
      >
        <Plus size={14} /> Log feedback
      </button>
      <EntryDialog key={n} open={open} onClose={() => setOpen(false)} editorId={editorId} tasks={tasks} entry={null} today={today} />
    </>
  );
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "review", label: "To review" },
  { key: "mistake", label: "Mistakes" },
  { key: "creative", label: "Creative" },
  { key: "praise", label: "Praise" },
  { key: "note", label: "Notes" },
] as const;

// Everything said about their work this month, where it came from, and a
// way to put any of it right. Automatic entries nobody has looked at yet
// are marked, with the one-click verdicts beside them.
export function FeedbackPanel({ editorId, entries, tasks, today }: { editorId: string; entries: EntryRow[]; tasks: TaskOption[]; today: string }) {
  const router = useRouter();
  const pending = entries.filter((e) => !e.reviewed).length;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>(pending ? "review" : "all");
  const [editing, setEditing] = useState<EntryRow | null>(null);
  const shown = entries.filter((e) => (filter === "all" ? true : filter === "review" ? !e.reviewed : e.kind === filter));

  async function verdict(id: string, kind: "mistake" | "creative" | null) {
    await reviewEntry(id, kind);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const n = f.key === "all" ? entries.length : f.key === "review" ? pending : entries.filter((e) => e.kind === f.key).length;
          if (f.key === "review" && !pending) return null;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${filter === f.key ? "bg-hover text-foreground" : "bg-surface text-muted hover:text-foreground"}`}
            >
              {f.label}
              <span className="tabular-nums text-muted">{n}</span>
            </button>
          );
        })}
      </div>

      {filter === "review" && shown.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accent/[0.06] px-4 py-2.5 text-xs">
          <span className="text-muted">
            Sorted automatically from Frame.io. A mistake counts towards the grade once it&apos;s confirmed here.
          </span>
          <button
            onClick={async () => {
              await acceptAll(shown.map((e) => e.id));
              router.refresh();
            }}
            className="btn btn-xs btn-glow flex items-center gap-1"
          >
            <Check size={11} /> Accept all as sorted
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">Nothing here this month.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {shown.map((e) => (
            <li key={e.id} className={`group flex items-start gap-3 px-4 py-3 ${e.reviewed ? "bg-surface/40" : "bg-accent/[0.04]"}`}>
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${KIND_DOT[e.kind] ?? "bg-muted"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{e.body}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className="text-foreground/80">{e.kind === "mistake" ? `${e.category ?? "Others"}${e.count > 1 ? ` ×${e.count}` : ""}` : ENTRY_KINDS[e.kind as keyof typeof ENTRY_KINDS]}</span>
                  <span>{shortDay(e.day)}</span>
                  {e.taskTitle && <span className="max-w-60 truncate">{e.taskTitle}</span>}
                  {e.by && <span>{e.fromClient ? `${e.by} (client)` : e.by}</span>}
                  <span className="flex items-center gap-1 rounded border border-border px-1 py-px">
                    {e.source !== "manual" && <Bot size={10} />}
                    {SOURCE_LABEL[e.source] ?? e.source}
                  </span>
                </p>
                {!e.reviewed && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted">Sorted as {e.kind === "mistake" ? "a mistake" : "creative feedback"}.</span>
                    {e.kind === "mistake" ? (
                      <button onClick={() => verdict(e.id, "creative")} className="btn btn-xs btn-ghost flex items-center gap-1">
                        <CircleSlash size={11} /> Not a mistake
                      </button>
                    ) : (
                      <button onClick={() => verdict(e.id, "mistake")} className="btn btn-xs btn-ghost flex items-center gap-1">
                        It&apos;s a mistake
                      </button>
                    )}
                    <button onClick={() => verdict(e.id, null)} className="btn btn-xs btn-ghost flex items-center gap-1">
                      <Check size={11} /> Looks right
                    </button>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => setEditing(e)} aria-label="Edit" className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground">
                  <PenLine size={13} />
                </button>
                <ConfirmButton
                  confirm="Remove"
                  message="Remove this feedback? It stops counting straight away."
                  className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-red-400"
                  onConfirm={async () => {
                    await deleteEntry(e.id);
                    router.refresh();
                  }}
                >
                  <Trash2 size={13} />
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <EntryDialog key={editing.id} open onClose={() => setEditing(null)} editorId={editorId} tasks={tasks} entry={editing} today={today} />}
    </div>
  );
}

// ---------- tasks ----------

export type TaskRow = {
  id: string;
  title: string;
  where: string;
  type: string;
  assigned: string;
  reached: string | null;
  turnaround: string;
  revisions: number;
  onTime: boolean | null;
  excluded: boolean;
};

// What they delivered this month, each with the numbers it feeds. A task
// that shouldn't count for or against them can be left out.
export function TaskTable({ rows }: { rows: TaskRow[] }) {
  const router = useRouter();
  if (rows.length === 0) return <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">Nothing delivered this month.</p>;
  const ROW = "grid grid-cols-[minmax(0,1fr)_4rem_4.5rem] items-center gap-4 px-4 md:grid-cols-[minmax(0,1.6fr)_6rem_5rem_4.5rem_4rem_5rem_4.5rem]";
  return (
    <div className="overflow-hidden rounded-2xl border border-border text-sm">
      <div className={`${ROW} py-2.5 text-xs text-muted`}>
        <span>Video</span>
        <span className="hidden md:block">Type</span>
        <span className="hidden md:block">Assigned</span>
        <span className="text-right">Turnaround</span>
        <span className="hidden text-right md:block">Revisions</span>
        <span className="hidden md:block">Deadline</span>
        <span />
      </div>
      {rows.map((t) => (
        <div key={t.id} className={`${ROW} border-t border-border/50 py-2.5 ${t.excluded ? "opacity-45" : ""}`}>
          <span className="min-w-0">
            <span className="block truncate">{t.title}</span>
            <span className="block truncate text-xs text-muted">{t.where}</span>
          </span>
          <span className="hidden truncate text-xs text-muted md:block">{t.type}</span>
          <span className="hidden text-xs text-muted md:block">{shortDay(t.assigned)}</span>
          <span className="text-right tabular-nums">{t.turnaround}</span>
          <span className="hidden text-right tabular-nums md:block">{t.revisions}</span>
          <span className={`hidden text-xs md:block ${t.onTime === false ? "text-red-300" : "text-muted"}`}>{t.onTime === null ? "No due date" : t.onTime ? "On time" : "Late"}</span>
          <button
            onClick={async () => {
              await setTaskExcluded(t.id, !t.excluded);
              router.refresh();
            }}
            title={t.excluded ? "Count this video again" : "Leave this video out of their numbers"}
            className="justify-self-end text-xs text-muted hover:text-foreground"
          >
            {t.excluded ? "Count it" : "Leave out"}
          </button>
        </div>
      ))}
    </div>
  );
}
