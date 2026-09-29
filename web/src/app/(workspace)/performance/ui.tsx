"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CalendarOff,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Crosshair,
  MessageSquare,
  PenLine,
  Plus,
  RotateCcw,
  StickyNote,
  Target,
  ThumbsUp,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { addDays, ENTRY_KINDS, MISTAKE_CATEGORIES, PART_LABEL, PART_ORDER, shiftMonth, shortDay, type Grade, type PeriodKind, type Targets } from "@/lib/editorKpi";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { Reveal } from "../Reveal";
import { Stepper } from "../Stepper";
import { ConfirmButton } from "../ConfirmButton";
import {
  acceptAll,
  addFocusArea,
  addLeave,
  deleteEntry,
  deleteFocusArea,
  logEntry,
  removeLeave,
  reviewEntry,
  saveKpiTargets,
  setEntryResolved,
  setFocusImproved,
  setTaskExcluded,
  setTaskType,
  updateEntry,
  type EntryInput,
} from "./actions";

type Run = () => Promise<{ error?: string }>;
// a server action, then the page again; its error, if any, for the caller to show
function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: Run) => {
    const res = await fn();
    setError(res.error ?? null);
    if (!res.error) router.refresh();
    return !res.error;
  };
  return { run, error };
}

// ---------- the period ----------

export type PeriodQuery = { kind: PeriodKind; from: string; to: string; label: string; current: boolean };

const VIEWS: { kind: PeriodKind; label: string }[] = [
  { kind: "week", label: "Weekly" },
  { kind: "month", label: "Monthly" },
  { kind: "range", label: "Custom range" },
];

// Weekly | Monthly | Custom range, and which one: a week or month stepped
// back and forth, or any two days. Everything on the page follows it.
export function PeriodBar({ period, today }: { period: PeriodQuery; today: string }) {
  const router = useRouter();
  const path = usePathname();
  const go = (q: Record<string, string>) => router.push(`${path}?${new URLSearchParams(q)}`);
  const step = "grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground";
  const off = `${step} pointer-events-none opacity-30`;

  const switchTo = (kind: PeriodKind) => {
    if (kind === period.kind) return;
    if (kind === "week") go({ view: "week", week: period.to });
    else if (kind === "month") go({ view: "month", month: period.to.slice(0, 7) });
    else go({ view: "range", from: period.from, to: period.to });
  };

  const month = period.from.slice(0, 7);
  const back: Record<string, string> = period.kind === "week" ? { view: "week", week: addDays(period.from, -7) } : { view: "month", month: shiftMonth(month, -1) };
  const next: Record<string, string> = period.kind === "week" ? { view: "week", week: addDays(period.from, 7) } : { view: "month", month: shiftMonth(month, 1) };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg bg-surface-2/60 p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.kind}
            onClick={() => switchTo(v.kind)}
            className={`rounded-md px-3 py-1 text-xs transition-colors ${period.kind === v.kind ? "bg-surface-2 text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {period.kind === "range" ? (
        <div className="flex items-center gap-1.5">
          <div className="w-36">
            <DatePicker value={period.from} clearable={false} onChange={(v) => v && go({ view: "range", from: v, to: period.to })} />
          </div>
          <span className="text-xs text-muted">to</span>
          <div className="w-36">
            <DatePicker value={period.to} clearable={false} onChange={(v) => v && go({ view: "range", from: period.from, to: v > today ? today : v })} />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 rounded-lg bg-surface-2/60 p-0.5">
          <button onClick={() => go(back)} aria-label="Before" className={step}>
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-32 px-1 text-center text-sm font-medium">
            {period.current ? (period.kind === "week" ? "This week" : "This month") : period.label}
          </span>
          <button onClick={() => go(next)} aria-label="After" className={period.current ? off : step} disabled={period.current}>
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- marks ----------

const GRADE_TONE: Record<Grade, string> = { A: "text-accent", B: "text-foreground", C: "text-foreground/75", D: "text-rose-300" };

// The grade, big, with its score under it. Not graded: a dash, and why.
export function GradeBadge({ score, grade, size = "md", light }: { score: number | null; grade: Grade | null; size?: "sm" | "md" | "lg"; light?: boolean }) {
  const box = { sm: "size-10 text-lg", md: "size-12 text-xl", lg: "size-[4.5rem] text-4xl" }[size];
  return (
    <span
      title={grade ? `Grade ${grade}, score ${score} out of 100` : light ? "Fewer than two videos completed: not enough to grade" : "Nothing to grade yet"}
      className={`inline-flex shrink-0 flex-col items-center justify-center rounded-2xl bg-surface-2 ring-1 ring-border ${box}`}
    >
      <span className={`font-semibold leading-none ${grade ? GRADE_TONE[grade] : "text-muted"}`}>{grade ?? "–"}</span>
      <span className={`mt-1 leading-none text-muted tabular-nums ${size === "lg" ? "text-xs" : "text-[10px]"}`}>{score ?? (light ? "light" : "")}</span>
    </span>
  );
}

// Up or down on the period before, when both were graded
export function Delta({ delta, against }: { delta: number | null; against: string }) {
  if (delta === null) return <span className="text-xs text-muted">No grade {against} to compare</span>;
  if (delta === 0) return <span className="text-xs text-muted">Level with {against}</span>;
  const up = delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${up ? "text-accent" : "text-rose-300"}`}>
      <Icon size={13} />
      {up ? "+" : ""}
      {delta} on {against}
    </span>
  );
}

// One part of the score: its name, the number, and how close it is to its
// target as a thin bar (full at the target or better).
export function PartBar({ label, text, points, note }: { label: string; text: string; points: number | null; note?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-muted">{label}</span>
        <span className={`text-sm font-medium tabular-nums ${points === null ? "text-muted" : ""}`}>{text}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/[0.07]">
        <div className={`h-full rounded-full transition-[width] duration-500 ${points !== null && points < 60 ? "bg-rose-300/80" : "bg-accent"}`} style={{ width: `${points ?? 0}%` }} />
      </div>
      {note && <p className="mt-1 truncate text-[11px] text-muted">{note}</p>}
    </div>
  );
}

// Scores over time, oldest on the left, the one shown lit
export function TrendStrip({ scores, labels, height = 36 }: { scores: (number | null)[]; labels: string[]; height?: number }) {
  return (
    <div className="flex items-end gap-1" style={{ height }} title={scores.map((w, i) => `${labels[i]}: ${w ?? "–"}`).join(" · ")}>
      {scores.map((w, i) => (
        <span
          key={i}
          className={`w-2.5 rounded-t-[3px] ${w === null ? "bg-foreground/[0.07]" : i === scores.length - 1 ? "bg-accent" : "bg-accent/35"}`}
          style={{ height: w === null ? 3 : Math.max(3, (w / 100) * height) }}
        />
      ))}
    </div>
  );
}


// ---------- issues ----------

export type IssueView = {
  id: string;
  title: string;
  category: string | null;
  note: string | null;
  auto: boolean;
  openedDay: string;
  resolvedDay: string | null;
  reopens: number;
  count: number;
  videos: number;
  lastSeen: string | null;
  looksFixed: boolean;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The editor's queue: what they keep getting wrong, each kept in view until
// it stops. Recurring mistakes open here on their own; core can raise one
// by hand. One that's been quiet three weeks is offered for resolving, and
// a resolved one that comes back reopens by itself.
export function IssueQueue({ editorId, issues, canEdit }: { editorId: string; issues: IssueView[]; canEdit: boolean }) {
  const { run, error } = useRun();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", category: "", note: "" });
  const [showResolved, setShowResolved] = useState(false);
  const open = issues.filter((i) => !i.resolvedDay);
  const resolved = issues.filter((i) => i.resolvedDay);

  async function add() {
    if (await run(() => addFocusArea({ editorId, ...form }))) {
      setForm({ title: "", category: "", note: "" });
      setAdding(false);
    }
  }

  const status = (i: IssueView) =>
    i.category
      ? i.count
        ? `${plural(i.count, "time")} on ${plural(i.videos, "video")} since ${shortDay(i.openedDay)} · last ${shortDay(i.lastSeen!)}`
        : `Open since ${shortDay(i.openedDay)} · not seen since`
      : `Raised ${shortDay(i.openedDay)}${i.note ? ` · ${i.note}` : ""}`;

  return (
    <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Issue queue {open.length > 0 && <span className="ml-1 font-normal text-muted">{open.length} open</span>}</h2>
          <p className="mt-0.5 text-xs text-muted">What keeps coming back. Each stays here until it stops.</p>
        </div>
        {canEdit && !adding && (
          <button onClick={() => setAdding(true)} className="btn btn-xs btn-ghost flex items-center gap-1">
            <Plus size={12} /> Raise an issue
          </button>
        )}
      </div>

      {canEdit && (
        <Reveal open={adding}>
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Checking subtitles against the audio"
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            />
            <Dropdown
              value={form.category}
              placeholder="Track a kind of mistake"
              onChange={(v) => setForm({ ...form, category: v })}
              options={[{ value: "", label: "Don't track one" }, ...MISTAKE_CATEGORIES.map((c) => ({ value: c, label: c }))]}
            />
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && form.title.trim() && add()}
              placeholder="How we'll help, optional"
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm sm:col-span-2"
            />
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button onClick={() => setAdding(false)} className="btn btn-sm btn-ghost">
                Cancel
              </button>
              <button onClick={add} disabled={!form.title.trim()} className="btn btn-sm btn-glow disabled:opacity-50">
                Raise it
              </button>
            </div>
          </div>
        </Reveal>
      )}

      {open.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <CircleCheck size={14} className="text-accent" /> Nothing open. No mistake is repeating right now.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {open.map((i) => (
            <li key={i.id} className="group flex items-center gap-3 bg-surface/40 px-4 py-3">
              <Crosshair size={14} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {i.title}
                  {i.category && i.category !== i.title && <span className="ml-2 text-xs font-normal text-muted">{i.category}</span>}
                  {i.reopens > 0 && <span className="ml-2 rounded bg-rose-300/10 px-1.5 py-px text-[10px] font-normal text-rose-300">Came back</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {status(i)}
                  {i.looksFixed && <span className="text-foreground/80"> · Quiet for three weeks. Fixed?</span>}
                </p>
              </div>
              {canEdit && (
                <>
                  <ConfirmButton
                    confirm="Remove"
                    message="Remove this issue? If its mistake keeps recurring, it will open again."
                    className="grid size-7 shrink-0 place-items-center rounded-md text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
                    onConfirm={() => run(() => deleteFocusArea(i.id))}
                  >
                    <Trash2 size={13} />
                  </ConfirmButton>
                  <button onClick={() => run(() => setFocusImproved(i.id, true))} className={`btn btn-xs flex shrink-0 items-center gap-1 ${i.looksFixed ? "btn-glow" : "btn-ghost"}`}>
                    <Check size={12} /> Resolved
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowResolved((v) => !v)} className="flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <ChevronDown size={12} className={`transition-transform duration-200 ${showResolved ? "rotate-180" : ""}`} />
            Resolved ({resolved.length})
          </button>
          <Reveal open={showResolved}>
            <ul className="mt-2 flex flex-col gap-1.5">
              {resolved.map((i) => (
                <li key={i.id} className="flex items-center gap-3 text-sm text-muted">
                  <Check size={12} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate">
                    {i.title} <span className="text-xs">· resolved {shortDay(i.resolvedDay!)}</span>
                  </span>
                  {canEdit && (
                    <button onClick={() => run(() => setFocusImproved(i.id, false))} className="flex items-center gap-1 text-xs hover:text-foreground">
                      <RotateCcw size={11} /> Reopen
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </section>
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
  resolved: boolean;
  stale: boolean;
  taskId: string | null;
  taskTitle: string | null;
};
export type TaskOption = { id: string; title: string };

const KIND_ICON: Record<string, LucideIcon> = { mistake: CircleAlert, creative: MessageSquare, praise: ThumbsUp, note: StickyNote };
function KindIcon({ kind, size, className }: { kind: string; size: number; className?: string }) {
  const Icon = KIND_ICON[kind] ?? StickyNote;
  return <Icon size={size} className={className} />;
}
const SOURCE_LABEL: Record<string, string> = { frameio: "Frame.io", notion: "Notion", manual: "Logged" };

function EntryDialog({ open, onClose, editorId, tasks, entry, today }: { open: boolean; onClose: () => void; editorId: string; tasks: TaskOption[]; entry: EntryRow | null; today: string }) {
  const { run, error } = useRun();
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<EntryInput>(() => ({
    editorId,
    kind: entry?.kind ?? "mistake",
    category: entry?.category ?? "",
    body: entry?.body ?? "",
    count: entry?.count ?? 1,
    day: entry?.day ?? today,
    taskId: entry?.taskId ?? "",
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const set = <K extends keyof EntryInput>(k: K, v: EntryInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    const ok = await run(() => (entry ? updateEntry(entry.id, form) : logEntry(form)));
    setSaving(false);
    if (ok) onClose();
  }

  const mistake = form.kind === "mistake";
  const label = "flex min-w-0 flex-col gap-1 text-xs text-muted";
  return (
    <dialog ref={ref} onClose={onClose} className="glass fixed top-1/2 left-1/2 m-0 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-5 text-foreground">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{entry ? "Edit feedback" : "Add feedback"}</h2>
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
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${form.kind === k ? "bg-surface-2 text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            <KindIcon kind={k} size={12} />
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
                <Dropdown value={form.category} placeholder="Pick one" create onChange={(v) => set("category", v)} options={MISTAKE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
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
          {saving ? "Saving…" : entry ? "Save changes" : "Add it"}
        </button>
      </div>
    </dialog>
  );
}

export function AddFeedbackButton({ editorId, tasks, today }: { editorId: string; tasks: TaskOption[]; today: string }) {
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
        <Plus size={14} /> Add feedback
      </button>
      <EntryDialog key={n} open={open} onClose={() => setOpen(false)} editorId={editorId} tasks={tasks} entry={null} today={today} />
    </>
  );
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "review", label: "To confirm" },
  { key: "open", label: "Unresolved" },
  { key: "mistake", label: "Mistakes" },
  { key: "creative", label: "Creative" },
  { key: "praise", label: "Praise" },
  { key: "note", label: "Notes" },
] as const;

// Everything said about their work in the period, where it came from,
// whether it's been dealt with, and (for core) a way to put any of it
// right. Automatic mistakes nobody has confirmed yet are marked, with the
// one-click verdicts beside them.
export function FeedbackPanel({ editorId, entries, tasks, today, canEdit }: { editorId: string; entries: EntryRow[]; tasks: TaskOption[]; today: string; canEdit: boolean }) {
  const { run } = useRun();
  const waiting = (e: EntryRow) => !e.reviewed && e.kind === "mistake";
  const pending = canEdit ? entries.filter(waiting).length : 0;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>(pending ? "review" : "all");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<EntryRow | null>(null);
  const match = (e: EntryRow) => (filter === "all" ? true : filter === "review" ? waiting(e) : filter === "open" ? !e.resolved : e.kind === filter) && (!category || e.category === category);
  const shown = entries.filter(match);
  const count = (key: string) => (key === "all" ? entries.length : key === "review" ? pending : key === "open" ? entries.filter((e) => !e.resolved).length : entries.filter((e) => e.kind === key).length);
  const categories = [...new Set(entries.filter((e) => e.kind === "mistake").map((e) => e.category ?? "Others"))];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1">
        {FILTERS.map((f) => {
          const n = count(f.key);
          if ((f.key === "review" && !pending) || (f.key !== "all" && !n)) return null;
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
        {categories.length > 1 && (
          <div className="ml-auto w-48">
            <Dropdown value={category} size="sm" placeholder="Every kind" onChange={setCategory} options={[{ value: "", label: "Every kind" }, ...categories.map((c) => ({ value: c, label: c }))]} />
          </div>
        )}
      </div>

      {filter === "review" && shown.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accent/[0.06] px-4 py-2.5 text-xs">
          <span className="text-muted">Frame.io comments Claude sorted as mistakes. Each counts once you confirm it.</span>
          <button onClick={() => run(() => acceptAll(shown.map((e) => e.id)))} className="btn btn-xs btn-glow flex items-center gap-1">
            <Check size={11} /> Confirm all
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">Nothing here for this period.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {shown.map((e) => (
            <li key={e.id} className={`group flex items-start gap-3 px-4 py-3 ${canEdit && waiting(e) ? "bg-accent/[0.04]" : "bg-surface/40"}`}>
              <KindIcon kind={e.kind} size={14} className="mt-0.5 shrink-0 text-muted" />
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
                  {(e.kind === "mistake" || e.kind === "creative") &&
                    (e.resolved ? (
                      <span className="flex items-center gap-1 text-accent/90">
                        <CircleCheck size={11} /> Resolved
                      </span>
                    ) : (
                      <span className={`flex items-center gap-1 ${e.stale ? "text-rose-300" : ""}`}>
                        <CircleDashed size={11} /> {e.stale ? "Passed over" : "Open"}
                      </span>
                    ))}
                  {!e.reviewed && !canEdit && <span>Waiting for review</span>}
                </p>
                {canEdit && !e.reviewed && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted">Sorted as a mistake.</span>
                    <button onClick={() => run(() => reviewEntry(e.id, "creative"))} className="btn btn-xs btn-ghost flex items-center gap-1">
                      <CircleSlash size={11} /> Not a mistake
                    </button>
                    <button onClick={() => run(() => reviewEntry(e.id, null))} className="btn btn-xs btn-ghost flex items-center gap-1">
                      <Check size={11} /> Confirm
                    </button>
                  </div>
                )}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {(e.kind === "mistake" || e.kind === "creative") && (
                    <button
                      onClick={() => run(() => setEntryResolved(e.id, !e.resolved))}
                      title={e.resolved ? "Mark as open again" : "Mark as resolved"}
                      className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground"
                    >
                      {e.resolved ? <RotateCcw size={13} /> : <CircleCheck size={13} />}
                    </button>
                  )}
                  <button onClick={() => setEditing(e)} aria-label="Edit" className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground">
                    <PenLine size={13} />
                  </button>
                  <ConfirmButton
                    confirm="Remove"
                    message="Remove this feedback? It stops counting straight away."
                    className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-red-400"
                    onConfirm={() => run(() => deleteEntry(e.id))}
                  >
                    <Trash2 size={13} />
                  </ConfirmButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <EntryDialog key={editing.id} open onClose={() => setEditing(null)} editorId={editorId} tasks={tasks} entry={editing} today={today} />}
    </div>
  );
}

// ---------- videos ----------

export type VideoRow = {
  id: string;
  title: string;
  where: string;
  type: string;
  guessed: boolean;
  units: number;
  assigned: string;
  completed: string | null;
  edit: string;
  standard: string;
  onStandard: boolean | null;
  revisions: number;
  due: string | null;
  excluded: boolean;
};

const DUE_TEXT: Record<string, string> = { met: "Met", late: "Late", overdue: "Overdue", today: "Due today", upcoming: "Upcoming" };

// What they completed in the period, each with the numbers it feeds: its
// type (guessed ones marked, and core can set it), the time it took against
// its standard, how often it came back, and its due date. One that
// shouldn't count for or against them can be left out.
export function VideoTable({ rows, types, canEdit }: { rows: VideoRow[]; types: string[]; canEdit: boolean }) {
  const { run, error } = useRun();
  if (rows.length === 0) return <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">Nothing completed in this period.</p>;
  const ROW = "grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-4 px-4 md:grid-cols-[minmax(0,1.6fr)_9rem_4.5rem_7rem_4.5rem_4.5rem_4.5rem]";
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-2xl border border-border text-sm">
        <div className={`${ROW} py-2.5 text-xs text-muted`}>
          <span>Video</span>
          <span className="hidden md:block">Type</span>
          <span className="hidden md:block">Completed</span>
          <span className="text-right">Edit time</span>
          <span className="hidden text-right md:block">Revisions</span>
          <span className="hidden md:block">Due date</span>
          <span className="hidden md:block" />
        </div>
        {rows.map((v) => (
          <div key={v.id} className={`${ROW} border-t border-border/50 py-2.5 ${v.excluded ? "opacity-45" : ""}`}>
            <span className="min-w-0">
              <span className="block truncate">{v.title}</span>
              <span className="block truncate text-xs text-muted">{v.where}</span>
            </span>
            <span className="hidden min-w-0 md:block">
              {canEdit ? (
                <Dropdown
                  value={v.guessed ? "" : v.type}
                  size="sm"
                  placeholder={`${v.type}?`}
                  onChange={(t) => t && run(() => setTaskType(v.id, t))}
                  options={types.map((t) => ({ value: t, label: t }))}
                />
              ) : (
                <span className="text-xs text-muted">{v.type}</span>
              )}
            </span>
            <span className="hidden text-xs text-muted md:block">{v.completed ? shortDay(v.completed) : "–"}</span>
            <span className="text-right tabular-nums" title={`Standard for a ${v.type.toLowerCase()}: ${v.standard}`}>
              <span className={v.onStandard === false ? "text-rose-300" : ""}>{v.edit}</span>
              <span className="text-xs text-muted"> / {v.standard}</span>
            </span>
            <span className="hidden text-right tabular-nums md:block">{v.revisions}</span>
            <span className={`hidden text-xs md:block ${v.due === "late" ? "text-rose-300" : "text-muted"}`}>{v.due ? DUE_TEXT[v.due] : "None set"}</span>
            {canEdit ? (
              <button
                onClick={() => run(() => setTaskExcluded(v.id, !v.excluded))}
                title={v.excluded ? "Count this video again" : "Leave this video out of their numbers"}
                className="hidden justify-self-end text-xs text-muted hover:text-foreground md:block"
              >
                {v.excluded ? "Count it" : "Leave out"}
              </button>
            ) : (
              <span className="hidden md:block" />
            )}
          </div>
        ))}
      </div>
      {rows.some((r) => r.guessed) && <p className="text-xs text-muted">A type ending in &ldquo;?&rdquo; was guessed from the title. {canEdit ? "Set it to be sure." : ""}</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

// ---------- leave ----------

// Days an editor was away, so their output is judged on the days they
// worked. Core only.
export function LeavePanel({ editorId, days, today }: { editorId: string; days: { id: string; day: string; note: string | null }[]; today: string }) {
  const { run, error } = useRun();
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-40">
          <DatePicker value={day} onChange={(v) => setDay(v || today)} clearable={false} />
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why, optional" className="min-w-40 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm" />
        <button
          onClick={async () => {
            if (await run(() => addLeave(editorId, day, note))) setNote("");
          }}
          className="btn btn-sm btn-glow flex items-center gap-1"
        >
          <CalendarOff size={13} /> Add leave
        </button>
      </div>
      {days.length === 0 ? (
        <p className="text-sm text-muted">No leave recorded.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {days.map((d) => (
            <li key={d.id} className="group flex items-center gap-3 bg-surface/40 px-4 py-2.5 text-sm">
              <CalendarOff size={13} className="shrink-0 text-muted" />
              <span className="w-24 shrink-0">{shortDay(d.day)}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{d.note}</span>
              <button onClick={() => run(() => removeLeave(d.id))} aria-label="Remove" className="grid size-7 place-items-center rounded-md text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400">
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

// ---------- targets ----------

// a number field that takes decimals (0.5 mistakes a video), no spinners
function Num({ value, onChange, suffix }: { value: number; onChange: (n: number) => void; suffix?: string }) {
  const [text, setText] = useState(String(value));
  return (
    <span className="flex items-center gap-1.5">
      <input
        value={text}
        inputMode="decimal"
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() && Number.isFinite(n)) onChange(n);
        }}
        className="w-16 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm tabular-nums text-foreground"
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </span>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// How editors are measured, set by the admin, opening under the page title:
// the working week, each type's standard, what each part aims for and
// counts, and where the grades fall.
export function TargetsEditor({ targets, kinds }: { targets: Targets; kinds: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(targets);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = Object.values(draft.weights).reduce((a, b) => a + b, 0);
  const unlisted = kinds.filter((k) => !(k in draft.typeDays));

  async function save() {
    setSaving(true);
    const res = await saveKpiTargets(draft);
    setSaving(false);
    if (res.error) return setError(res.error);
    setError(null);
    setOpen(false);
    router.refresh();
  }

  const row = "flex items-center justify-between gap-3 text-sm";
  const head = "text-sm font-medium";
  return (
    <>
      <button onClick={() => setOpen((o) => !o)} className="btn btn-ghost flex items-center gap-1.5">
        <Target size={14} /> Targets
      </button>
      <div className="order-last basis-full">
        <Reveal open={open}>
          <div className="mt-1 grid gap-6 rounded-2xl border border-border bg-surface-2/30 p-5 lg:grid-cols-3">
            <div className="flex flex-col gap-3">
              <p className={head}>The working week</p>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((d, i) => {
                  const on = draft.workDays.includes(i);
                  return (
                    <button
                      key={d}
                      onClick={() => setDraft({ ...draft, workDays: on ? draft.workDays.filter((x) => x !== i) : [...draft.workDays, i].sort() })}
                      className={`rounded-md px-2 py-1 text-xs ${on ? "bg-hover text-foreground" : "bg-surface text-muted"}`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              <div className={row}>
                <span className="text-muted">Working day</span>
                <span className="flex items-center gap-1.5">
                  <Num value={draft.dayStart} onChange={(n) => setDraft({ ...draft, dayStart: n })} />
                  <span className="text-xs text-muted">to</span>
                  <Num value={draft.dayEnd} onChange={(n) => setDraft({ ...draft, dayEnd: n })} suffix="h" />
                </span>
              </div>
              <div className={row}>
                <span className="text-muted">Output a day</span>
                <Num value={draft.dailyUnits} onChange={(n) => setDraft({ ...draft, dailyUnits: n })} suffix="reels" />
              </div>
              <p className={`${head} mt-2`}>Standard time by type</p>
              {Object.entries(draft.typeDays).map(([kind, d]) => (
                <div key={kind} className={row}>
                  <span className="truncate text-muted">{kind}</span>
                  <span className="flex items-center gap-1">
                    <Num value={d} onChange={(n) => setDraft({ ...draft, typeDays: { ...draft.typeDays, [kind]: n } })} suffix="days" />
                    <button
                      onClick={() => {
                        const next = { ...draft.typeDays };
                        delete next[kind];
                        setDraft({ ...draft, typeDays: next });
                      }}
                      aria-label={`Remove ${kind}`}
                      className="grid size-7 place-items-center rounded-md text-muted hover:text-foreground"
                    >
                      <X size={13} />
                    </button>
                  </span>
                </div>
              ))}
              {unlisted.length > 0 && (
                <Dropdown value="" placeholder="Add a type" size="sm" options={unlisted.map((k) => ({ value: k, label: k }))} onChange={(k) => k && setDraft({ ...draft, typeDays: { ...draft.typeDays, [k]: 1 } })} />
              )}
              <p className="text-xs text-muted">A type not listed is taken as a reel.</p>
            </div>

            <div className="flex flex-col gap-3">
              <p className={head}>Targets</p>
              <div className={row}>
                <span className="text-muted">Mistakes a video, at most</span>
                <Num value={draft.mistakesPerVideo} onChange={(n) => setDraft({ ...draft, mistakesPerVideo: n })} />
              </div>
              <div className={row}>
                <span className="text-muted">A client&apos;s catch counts as</span>
                <Num value={draft.clientMistakeWeight} onChange={(n) => setDraft({ ...draft, clientMistakeWeight: n })} suffix="mistakes" />
              </div>
              <div className={row}>
                <span className="text-muted">Times sent back a video, at most</span>
                <Num value={draft.revisions} onChange={(n) => setDraft({ ...draft, revisions: n })} />
              </div>
              <div className={row}>
                <span className="text-muted">Edited within standard</span>
                <Num value={draft.onStandardPct} onChange={(n) => setDraft({ ...draft, onStandardPct: n })} suffix="%" />
              </div>
              <p className={`${head} mt-2`}>Grades from</p>
              {(["A", "B", "C"] as const).map((g) => (
                <div key={g} className={row}>
                  <span className="text-muted">{g}</span>
                  <Num value={draft.grades[g]} onChange={(n) => setDraft({ ...draft, grades: { ...draft.grades, [g]: n } })} />
                </div>
              ))}
              <p className="text-xs text-muted">Below C is a D.</p>
            </div>

            <div className="flex flex-col gap-3">
              <p className={head}>How much each part counts</p>
              {PART_ORDER.map((part) => (
                <div key={part} className={row}>
                  <span className="text-muted">{PART_LABEL[part]}</span>
                  <Num value={draft.weights[part]} onChange={(n) => setDraft({ ...draft, weights: { ...draft.weights, [part]: n } })} suffix="%" />
                </div>
              ))}
              <p className={`text-xs ${total === 100 ? "text-muted" : "text-foreground"}`}>Total {total}%{total === 100 ? "" : ". The score scales them either way."}</p>
            </div>

            <div className="flex items-center justify-end gap-2 lg:col-span-3">
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

// a link that keeps the period the page is on
export function PeriodLink({ href, query, className, children }: { href: string; query: string; className?: string; children: React.ReactNode }) {
  return (
    <Link href={query ? `${href}?${query}` : href} className={className}>
      {children}
    </Link>
  );
}
