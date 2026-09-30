"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Gauge,
  MessageSquareHeart,
  PenLine,
  Plus,
  Repeat2,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
  Tags,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { addDays, hoursLabel, shiftMonth, shortDay, stepWorkDay, type PeriodKind, type Scoring } from "@/lib/editorKpi";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { Reveal } from "../Reveal";
import { Stepper } from "../Stepper";
import { ConfirmButton } from "../ConfirmButton";
import {
  addCategory,
  addLeave,
  deleteCategory,
  deleteEntry,
  logEntry,
  removeLeave,
  saveScoring,
  setTaskExcluded,
  setTaskType,
  sortEntry,
  sortWithAi,
  updateCategory,
  updateEntry,
  type EntryInput,
} from "./actions";

// a server action, then the page again; its error, if any, for the caller to show
function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ error?: string }>) => {
    const res = await fn();
    setError(res.error ?? null);
    if (!res.error) router.refresh();
    return !res.error;
  };
  return { run, error };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------- the period ----------

export type PeriodQuery = { kind: PeriodKind; from: string; to: string; label: string; current: boolean };

const VIEWS: { kind: PeriodKind; label: string }[] = [
  { kind: "day", label: "Day" },
  { kind: "week", label: "Week" },
  { kind: "month", label: "Month" },
  { kind: "range", label: "Custom range" },
];

// Day | Week | Month | Custom range, and which one: stepped back and forth,
// or any two days. Everything on the page follows it.
export function PeriodBar({ period, today, workDays }: { period: PeriodQuery; today: string; workDays: number[] }) {
  const router = useRouter();
  const path = usePathname();
  const go = (q: Record<string, string>) => router.push(`${path}?${new URLSearchParams(q)}`);
  const step = "grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground";

  const switchTo = (kind: PeriodKind) => {
    if (kind === period.kind) return;
    if (kind === "day") go({ view: "day", day: period.to });
    else if (kind === "week") go({ view: "week", week: period.to });
    else if (kind === "month") go({ view: "month", month: period.to.slice(0, 7) });
    else go({ view: "range", from: period.from, to: period.to });
  };

  const month = period.from.slice(0, 7);
  const move = (by: 1 | -1): Record<string, string> =>
    period.kind === "day"
      ? { view: "day", day: stepWorkDay(period.from, by, workDays) }
      : period.kind === "week"
        ? { view: "week", week: addDays(period.from, 7 * by) }
        : { view: "month", month: shiftMonth(month, by) };
  const now = { day: "Today", week: "This week", month: "This month", range: "" }[period.kind];

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
          <button onClick={() => go(move(-1))} aria-label="Before" className={step}>
            <ChevronLeft size={15} />
          </button>
          <span className="min-w-32 px-1 text-center text-sm font-medium">{period.current ? now : period.label}</span>
          <button onClick={() => go(move(1))} aria-label="After" disabled={period.current} className={period.current ? `${step} pointer-events-none opacity-30` : step}>
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- scores ----------

// "11.5 / 15": the total, big, and what it's out of
export function Total({ total, max, size = "md" }: { total: number | null; max: number; size?: "md" | "lg" }) {
  return (
    <span className="flex items-baseline gap-1 tabular-nums">
      <span className={`font-semibold tracking-tight ${size === "lg" ? "text-5xl" : "text-3xl"} ${total === null ? "text-muted" : ""}`}>{total ?? "–"}</span>
      {total !== null && <span className={`text-muted ${size === "lg" ? "text-lg" : "text-sm"}`}>/ {max}</span>}
    </span>
  );
}

type Scored = { total: number | null; max: number; pct: number | null };

// Up or down on the period before: in points when both are out of the
// same, otherwise as a share
export function Delta({ now, before, against }: { now: Scored; before: Scored; against: string }) {
  if (now.total === null || before.total === null) return <span className="text-xs text-muted">Nothing {against} to compare</span>;
  const same = now.max === before.max;
  const d = same ? round1(now.total - before.total) : now.pct! - before.pct!;
  if (d === 0) return <span className="text-xs text-muted">Level with {against}</span>;
  const up = d > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${up ? "text-accent" : "text-rose-300"}`}>
      <Icon size={13} />
      {up ? "+" : ""}
      {d}
      {same ? "" : "%"} on {against}
    </span>
  );
}

const PART: Record<"quantity" | "quality" | "feedback", { label: string; Icon: LucideIcon }> = {
  quantity: { label: "Quantity", Icon: Gauge },
  quality: { label: "Quality", Icon: Sparkles },
  feedback: { label: "Feedback", Icon: MessageSquareHeart },
};

// One of the three scores: its name, "4.2 / 5", a bar, and what's behind it
export function PartScore({ part, value, lines }: { part: keyof typeof PART; value: number | null; lines: string[] }) {
  const { label, Icon } = PART[part];
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <Icon size={13} /> {label}
        </span>
        <span className="tabular-nums">
          <span className={`text-lg font-semibold ${value === null ? "text-muted" : ""}`}>{value ?? "–"}</span>
          <span className="text-xs text-muted"> / 5</span>
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/[0.07]">
        <div className={`h-full rounded-full transition-[width] duration-500 ${value !== null && value < 2.5 ? "bg-rose-300/80" : "bg-accent"}`} style={{ width: `${((value ?? 0) / 5) * 100}%` }} />
      </div>
      <div className="mt-2 flex flex-col gap-0.5">
        {lines.map((l) => (
          <p key={l} className="truncate text-[11px] text-muted">
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

// Scores over time as a share, oldest on the left, the one shown lit
export function TrendStrip({ values, labels, height = 36 }: { values: (number | null)[]; labels: string[]; height?: number }) {
  return (
    <div className="flex items-end gap-1" style={{ height }} title={values.map((v, i) => `${labels[i]}: ${v === null ? "–" : `${v}%`}`).join(" · ")}>
      {values.map((v, i) => (
        <span
          key={i}
          className={`w-2.5 rounded-t-[3px] ${v === null ? "bg-foreground/[0.07]" : i === values.length - 1 ? "bg-accent" : "bg-accent/35"}`}
          style={{ height: v === null ? 3 : Math.max(3, (v / 100) * height) }}
        />
      ))}
    </div>
  );
}

// ---------- feedback ----------

export type FeedbackView = {
  id: string;
  kind: string;
  category: string | null;
  body: string;
  count: number;
  points: number | null;
  day: string;
  taskId: string | null;
  taskTitle: string | null;
  fromClient: boolean;
  source: string;
  by: string | null;
  repeat: boolean;
  snapshot: boolean;
  // sorted by hand, so Sort with AI leaves it alone
  reviewed: boolean;
  counted: boolean;
};
export type TaskOption = { id: string; title: string };
export type CategoryView = { id: string; name: string; weight: number; keywords: string | null; repeats: boolean };

const SOURCE: Record<string, string> = { frameio: "Frame.io", notion: "Notion", manual: "Added" };
const TOPICS = ["Communication", "Deadlines", "Work", "Behaviour", "Other"];

// The picture of the frame, small; bigger on a click
function Snapshot({ id }: { id: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const src = `/api/performance/snapshot/${id}`;
  return (
    <>
      <button onClick={() => ref.current?.showModal()} className="shrink-0 overflow-hidden rounded-md ring-1 ring-border transition-opacity hover:opacity-80" aria-label="See the frame">
        {/* eslint-disable-next-line @next/next/no-img-element -- a few-kilobyte snapshot served by our own route */}
        <img src={src} alt="" loading="lazy" className="h-16 w-auto" />
      </button>
      <dialog ref={ref} onClick={(e) => e.target === e.currentTarget && ref.current?.close()} className="glass fixed top-1/2 left-1/2 m-0 -translate-x-1/2 -translate-y-1/2 rounded-2xl p-2 backdrop:bg-black/60">
        {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
        <img src={src} alt="The frame this feedback was left on" className="max-h-[80vh] w-auto rounded-xl" style={{ minWidth: 320 }} />
      </dialog>
    </>
  );
}

type DialogProps = {
  editorId: string;
  tasks: TaskOption[];
  categories: CategoryView[];
  scoring: Scoring;
  today: string;
};

function EntryDialog({ open, onClose, entry, editorId, tasks, categories, scoring, today }: DialogProps & { open: boolean; onClose: () => void; entry: FeedbackView | null }) {
  const { run, error } = useRun();
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<EntryInput>(() => ({
    editorId,
    kind: entry?.kind ?? "positive",
    category: entry?.category ?? "",
    body: entry?.body ?? "",
    count: entry?.count ?? 1,
    points: entry?.points ?? scoring.praisePoints,
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
  const kinds: { key: string; label: string; Icon: LucideIcon }[] = [
    { key: "positive", label: "Praise", Icon: ThumbsUp },
    { key: "negative", label: "Negative feedback", Icon: ThumbsDown },
    { key: "mistake", label: "A mistake", Icon: CircleAlert },
  ];

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

      <div className="mt-4 flex gap-1 rounded-lg bg-surface-2/60 p-0.5">
        {kinds.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setForm((f) => ({ ...f, kind: k.key, category: "", points: k.key === "negative" ? scoring.concernPoints : scoring.praisePoints }))}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${form.kind === k.key ? "bg-surface-2 text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            <k.Icon size={12} />
            {k.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {mistake ? "Counts against Quality, like a Frame.io comment." : form.kind === "positive" ? "Adds to their Feedback score." : "Takes away from their Feedback score."}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {mistake ? (
          <>
            <div className={label}>
              Category
              <Dropdown value={form.category} placeholder="Pick one" onChange={(v) => set("category", v)} options={categories.map((c) => ({ value: c.name, label: c.name }))} />
            </div>
            <div className={label}>
              Times
              <Stepper value={form.count} max={99} onChange={(n) => set("count", n)} />
            </div>
          </>
        ) : (
          <>
            <div className={label}>
              About
              <Dropdown value={form.category} placeholder="Pick one" onChange={(v) => set("category", v)} options={TOPICS.map((c) => ({ value: c, label: c }))} />
            </div>
            <div className={label}>
              Points {form.kind === "positive" ? "added" : "taken off"}
              <Num key={form.kind} value={form.points} onChange={(n) => set("points", n)} />
            </div>
          </>
        )}
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
            placeholder={mistake ? "e.g. US spelling in the subtitles again" : form.kind === "positive" ? "e.g. Turned the trailer round a day early" : "e.g. Not replying in the group"}
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

export function AddFeedbackButton(props: DialogProps) {
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
      <EntryDialog key={n} open={open} onClose={() => setOpen(false)} entry={null} {...props} />
    </>
  );
}

type ListProps = DialogProps & { entries: FeedbackView[]; canEdit: boolean };

// What was said about their work: every Frame.io comment (with a picture
// of its frame), mistakes core added, and praise and notes from Frame.io.
// Core can move any of it to another category, or out of the score.
export function MistakeList({ entries, canEdit, ...dialog }: ListProps) {
  const { run, error } = useRun();
  const [filter, setFilter] = useState<"points" | "repeats" | "other">("points");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<FeedbackView | null>(null);
  const counts = {
    points: entries.filter((e) => e.kind === "mistake").length,
    repeats: entries.filter((e) => e.kind === "mistake" && e.repeat).length,
    other: entries.filter((e) => e.kind !== "mistake").length,
  };
  const shown = entries.filter(
    (e) => (filter === "points" ? e.kind === "mistake" : filter === "repeats" ? e.kind === "mistake" && e.repeat : e.kind !== "mistake") && (!category || e.category === category)
  );
  const used = [...new Set(entries.filter((e) => e.kind === "mistake").map((e) => e.category ?? "Others"))];
  // what Sort with AI would touch: Frame.io comments nobody has sorted by hand
  const unsorted = entries.filter((e) => e.source === "frameio" && !e.reviewed);
  const [sorting, setSorting] = useState(false);
  const sortOptions = [...dialog.categories.map((c) => ({ value: c.name, label: c.name })), { value: "praise", label: "Praise, not counted" }, { value: "note", label: "Not feedback" }];
  const TABS = [
    ["points", "Feedback points"],
    ["repeats", "Repeats"],
    ["other", "Praise and notes"],
  ] as const;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1">
        {TABS.map(([key, name]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${filter === key ? "bg-hover text-foreground" : "bg-surface text-muted hover:text-foreground"}`}
          >
            {name}
            <span className="tabular-nums text-muted">{counts[key]}</span>
          </button>
        ))}
        {canEdit && unsorted.length > 0 && (
          <button
            onClick={async () => {
              setSorting(true);
              await run(() => sortWithAi(unsorted.map((e) => e.id)));
              setSorting(false);
            }}
            disabled={sorting}
            title="Ask Claude to re-sort the Frame.io comments here that nobody has sorted by hand. Only runs when you click it."
            className="btn btn-xs btn-ghost ml-auto flex items-center gap-1 disabled:opacity-60"
          >
            <Sparkles size={12} /> {sorting ? "Sorting…" : `Sort ${unsorted.length} with AI`}
          </button>
        )}
        {used.length > 1 && filter !== "other" && (
          <div className={`${canEdit && unsorted.length > 0 ? "" : "ml-auto "}w-48`}>
            <Dropdown value={category} size="sm" placeholder="Every category" onChange={setCategory} options={[{ value: "", label: "Every category" }, ...used.map((c) => ({ value: c, label: c }))]} />
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">Nothing here for this period.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {shown.map((e) => (
            <li key={e.id} className="group flex items-start gap-3 bg-surface/40 px-4 py-3">
              {e.snapshot ? (
                <Snapshot id={e.id} />
              ) : (
                <span className="grid h-16 w-9 shrink-0 place-items-center rounded-md bg-surface-2/60 text-muted">
                  {e.kind === "mistake" ? <CircleAlert size={14} /> : e.kind === "praise" ? <ThumbsUp size={14} /> : <StickyNote size={14} />}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm">{e.body}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  {canEdit ? (
                    <div className="w-44">
                      <Dropdown value={e.kind === "mistake" ? (e.category ?? "Others") : e.kind} size="sm" onChange={(v) => v && run(() => sortEntry(e.id, v))} options={sortOptions} />
                    </div>
                  ) : (
                    <span className="text-foreground/80">{e.kind === "mistake" ? (e.category ?? "Others") : e.kind === "praise" ? "Praise" : "Not feedback"}</span>
                  )}
                  {e.count > 1 && <span>×{e.count}</span>}
                  {!e.counted && <span className="rounded border border-border px-1.5 py-px" title="From before their work was tracked here, so it isn't weighed against their videos">Not counted</span>}
                  {e.repeat && (
                    <span className="flex items-center gap-1 rounded bg-rose-300/10 px-1.5 py-px text-rose-300">
                      <Repeat2 size={11} /> Repeat
                    </span>
                  )}
                  <span>{shortDay(e.day)}</span>
                  {e.taskTitle && <span className="max-w-60 truncate">{e.taskTitle}</span>}
                  {e.by && <span>{e.fromClient ? `${e.by} (client)` : e.by}</span>}
                  <span className="flex items-center gap-1 rounded border border-border px-1 py-px">
                    {e.source !== "manual" && <Bot size={10} />}
                    {SOURCE[e.source] ?? e.source}
                  </span>
                </div>
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {e.source === "manual" && (
                    <button onClick={() => setEditing(e)} aria-label="Edit" className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground">
                      <PenLine size={13} />
                    </button>
                  )}
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
      {error && <p className="text-xs text-red-300">{error}</p>}
      {editing && <EntryDialog key={editing.id} open onClose={() => setEditing(null)} entry={editing} {...dialog} />}
    </div>
  );
}

// Core's own feedback: praise and negative feedback, with their points
export function PraiseList({ entries, canEdit, ...dialog }: ListProps) {
  const { run, error } = useRun();
  const [editing, setEditing] = useState<FeedbackView | null>(null);
  if (entries.length === 0)
    return <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">No praise or negative feedback in this period, so it&apos;s scored out of 10.</p>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {entries.map((e) => {
          const up = e.kind === "positive";
          return (
            <li key={e.id} className="group flex items-start gap-3 bg-surface/40 px-4 py-3">
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${up ? "bg-accent/15 text-accent" : "bg-rose-300/10 text-rose-300"}`}>{up ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">{e.body}</p>
                <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
                  <span className={up ? "text-accent" : "text-rose-300"}>
                    {up ? "+" : "−"}
                    {e.points ?? (up ? dialog.scoring.praisePoints : dialog.scoring.concernPoints)}
                  </span>
                  {e.category && <span className="text-foreground/80">{e.category}</span>}
                  <span>{shortDay(e.day)}</span>
                  {e.taskTitle && <span className="max-w-60 truncate">{e.taskTitle}</span>}
                  {e.by && <span>{e.by}</span>}
                </p>
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
          );
        })}
      </ul>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {editing && <EntryDialog key={editing.id} open onClose={() => setEditing(null)} entry={editing} {...dialog} />}
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
  completed: string | null;
  editHours: number | null;
  standardHours: number;
  withinStandard: boolean | null;
  revisions: number;
  excluded: boolean;
};

// What they completed in the period, each with the numbers it feeds: its
// type (guessed ones marked, and core can set it), the time from Editing to
// Sent for approval against its standard, and how often it came back. One
// that shouldn't count for or against them can be left out.
export function VideoTable({ rows, types, canEdit }: { rows: VideoRow[]; types: string[]; canEdit: boolean }) {
  const { run, error } = useRun();
  if (rows.length === 0) return <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">Nothing completed in this period.</p>;
  const ROW = "grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-4 px-4 md:grid-cols-[minmax(0,1.6fr)_9rem_5rem_8rem_4.5rem_4.5rem]";
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-2xl border border-border text-sm">
        <div className={`${ROW} py-2.5 text-xs text-muted`}>
          <span>Video</span>
          <span className="hidden md:block">Type</span>
          <span className="hidden md:block">Completed</span>
          <span className="text-right">Editing to approval</span>
          <span className="hidden text-right md:block">Revisions</span>
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
                <Dropdown value={v.guessed ? "" : v.type} size="sm" placeholder={`${v.type}?`} onChange={(t) => t && run(() => setTaskType(v.id, t))} options={types.map((t) => ({ value: t, label: t }))} />
              ) : (
                <span className="text-xs text-muted">{v.type}</span>
              )}
            </span>
            <span className="hidden text-xs text-muted md:block">{v.completed ? shortDay(v.completed) : "–"}</span>
            <span className="text-right tabular-nums">
              <span className={v.withinStandard === false ? "text-rose-300" : ""}>{v.editHours === null ? "Not timed" : hoursLabel(v.editHours)}</span>
              <span className="text-xs text-muted"> / {hoursLabel(v.standardHours)}</span>
            </span>
            <span className="hidden text-right tabular-nums md:block">{v.revisions}</span>
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
      <p className="text-xs text-muted">
        Timed from moving it to Editing until Sent for approval, Sundays skipped. &ldquo;Not timed&rdquo; means it never went through Editing here.
        {rows.some((r) => r.guessed) ? ` A type ending in "?" was guessed from the title${canEdit ? "; set it to be sure" : ""}.` : ""}
      </p>
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

// ---------- settings ----------

// a number field that takes decimals (0.5), no spinners
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

// The settings panels open under the page title, one at a time: the
// categories for core, the scoring for the admin.
export function Settings({ scoring, kinds, categories, canScore }: { scoring: Scoring; kinds: string[]; categories: CategoryView[]; canScore: boolean }) {
  const [open, setOpen] = useState<"scoring" | "categories" | null>(null);
  const toggle = (p: "scoring" | "categories") => setOpen((o) => (o === p ? null : p));
  return (
    <>
      <button onClick={() => toggle("categories")} className={`btn btn-ghost flex items-center gap-1.5 ${open === "categories" ? "text-foreground" : ""}`}>
        <Tags size={14} /> Categories
      </button>
      {canScore && (
        <button onClick={() => toggle("scoring")} className={`btn btn-ghost flex items-center gap-1.5 ${open === "scoring" ? "text-foreground" : ""}`}>
          <SlidersHorizontal size={14} /> Scoring
        </button>
      )}
      <div className="order-last basis-full">
        <Reveal open={open === "categories"}>
          <CategoriesPanel categories={categories} />
        </Reveal>
        {canScore && (
          <Reveal open={open === "scoring"}>
            <ScoringPanel key={JSON.stringify(scoring)} scoring={scoring} kinds={kinds} onDone={() => setOpen(null)} />
          </Reveal>
        )}
      </div>
    </>
  );
}

// Every number the score is built from, set by the admin
function ScoringPanel({ scoring, kinds, onDone }: { scoring: Scoring; kinds: string[]; onDone: () => void }) {
  const { run, error } = useRun();
  const [d, setD] = useState(scoring);
  const [saving, setSaving] = useState(false);
  const unlisted = kinds.filter((k) => !(k in d.types));
  const row = "flex items-center justify-between gap-3 text-sm";
  const head = "text-sm font-medium";

  return (
    <div className="mt-1 grid gap-6 rounded-2xl border border-border bg-surface-2/30 p-5 lg:grid-cols-3">
      <div className="flex flex-col gap-3">
        <p className={head}>Quantity</p>
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((name, i) => {
            const on = d.workDays.includes(i);
            return (
              <button key={name} onClick={() => setD({ ...d, workDays: on ? d.workDays.filter((x) => x !== i) : [...d.workDays, i].sort() })} className={`rounded-md px-2 py-1 text-xs ${on ? "bg-hover text-foreground" : "bg-surface text-muted"}`}>
                {name}
              </button>
            );
          })}
        </div>
        <div className={row}>
          <span className="text-muted">Reels a working day</span>
          <Num value={d.reelsPerDay} onChange={(n) => setD({ ...d, reelsPerDay: n })} />
        </div>
        <div className={row}>
          <span className="text-muted">Points for output</span>
          <Num value={d.volumePoints} onChange={(n) => setD({ ...d, volumePoints: n })} suffix={`of 5 · speed ${round1(5 - d.volumePoints)}`} />
        </div>
        <p className={`${head} mt-2`}>Each type: time and what it counts for</p>
        {Object.entries(d.types).map(([kind, rule]) => (
          <div key={kind} className={row}>
            <span className="min-w-0 truncate text-muted">{kind}</span>
            <span className="flex items-center gap-1">
              <Num value={rule.hours} onChange={(n) => setD({ ...d, types: { ...d.types, [kind]: { ...rule, hours: n } } })} suffix="h" />
              <Num value={rule.units} onChange={(n) => setD({ ...d, types: { ...d.types, [kind]: { ...rule, units: n } } })} suffix="reels" />
              <button
                onClick={() => {
                  const next = { ...d.types };
                  delete next[kind];
                  setD({ ...d, types: next });
                }}
                aria-label={`Remove ${kind}`}
                className="grid size-7 place-items-center rounded-md text-muted hover:text-foreground"
              >
                <X size={13} />
              </button>
            </span>
          </div>
        ))}
        {unlisted.length > 0 && <Dropdown value="" placeholder="Add a type" size="sm" options={unlisted.map((k) => ({ value: k, label: k }))} onChange={(k) => k && setD({ ...d, types: { ...d.types, [k]: { hours: 3.5, units: 1 } } })} />}
        <p className="text-xs text-muted">Time is from Editing to Sent for approval. A type not listed counts as a reel.</p>
      </div>

      <div className="flex flex-col gap-3">
        <p className={head}>Quality</p>
        <div className={row}>
          <span className="text-muted">Points off for each mistake a video</span>
          <Num value={d.mistakePoints} onChange={(n) => setD({ ...d, mistakePoints: n })} />
        </div>
        <div className={row}>
          <span className="text-muted">A revision counts as</span>
          <Num value={d.revisionWeight} onChange={(n) => setD({ ...d, revisionWeight: n })} suffix="mistakes" />
        </div>
        <div className={row}>
          <span className="text-muted">A repeated mistake counts as</span>
          <Num value={d.repeatWeight} onChange={(n) => setD({ ...d, repeatWeight: n })} suffix="mistakes" />
        </div>
        <p className="text-xs text-muted">Each category has its own weight too, under Categories.</p>
      </div>

      <div className="flex flex-col gap-3">
        <p className={head}>Feedback</p>
        <div className={row}>
          <span className="text-muted">Starts at</span>
          <Num value={d.feedbackStart} onChange={(n) => setD({ ...d, feedbackStart: n })} suffix="of 5" />
        </div>
        <div className={row}>
          <span className="text-muted">Praise adds, usually</span>
          <Num value={d.praisePoints} onChange={(n) => setD({ ...d, praisePoints: n })} />
        </div>
        <div className={row}>
          <span className="text-muted">Negative feedback takes off, usually</span>
          <Num value={d.concernPoints} onChange={(n) => setD({ ...d, concernPoints: n })} />
        </div>
        <p className="text-xs text-muted">With no feedback in a period, the score is out of 10.</p>
      </div>

      <div className="flex items-center justify-end gap-2 lg:col-span-3">
        {error && <span className="mr-auto text-xs text-red-300">{error}</span>}
        <button
          onClick={() => {
            setD(scoring);
            onDone();
          }}
          className="btn btn-sm btn-ghost"
        >
          Cancel
        </button>
        <button
          onClick={async () => {
            setSaving(true);
            if (await run(() => saveScoring(d))) onDone();
            setSaving(false);
          }}
          disabled={saving}
          className="btn btn-sm btn-glow disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save scoring"}
        </button>
      </div>
    </div>
  );
}

// Whether the same kind again, on another video, counts as a repeat
function RepeatsToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      title={on ? "The same kind again, on another video, counts as a repeat" : "Repeats of this kind aren't counted"}
      className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs transition-colors ${on ? "bg-rose-300/10 text-rose-300" : "bg-surface text-muted"}`}
    >
      <Repeat2 size={12} /> {on ? "Repeats" : "No repeats"}
    </button>
  );
}

// One category, editable in place
function CategoryRow({ c }: { c: CategoryView }) {
  const { run, error } = useRun();
  const [d, setD] = useState({ name: c.name, weight: c.weight, keywords: c.keywords ?? "", repeats: c.repeats });
  const changed = d.name !== c.name || d.weight !== c.weight || d.keywords !== (c.keywords ?? "") || d.repeats !== c.repeats;
  return (
    <li className="grid items-center gap-2 px-4 py-2.5 sm:grid-cols-[12rem_7rem_minmax(0,1fr)_6.5rem_4.5rem]">
      <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm" />
      <Num value={d.weight} onChange={(n) => setD({ ...d, weight: n })} suffix="counts" />
      <input value={d.keywords} onChange={(e) => setD({ ...d, keywords: e.target.value })} placeholder="Keywords, comma-separated" className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm" />
      <RepeatsToggle on={d.repeats} onChange={(repeats) => setD({ ...d, repeats })} />
      <span className="flex items-center justify-end gap-1">
        {changed && (
          <button onClick={() => run(() => updateCategory(c.id, d))} className="btn btn-xs btn-glow">
            Save
          </button>
        )}
        {c.name !== "Others" && (
          <ConfirmButton
            confirm="Remove"
            message={`Remove ${c.name}? Its feedback moves to Others.`}
            className="grid size-7 place-items-center rounded-md text-muted hover:text-red-400"
            onConfirm={() => run(() => deleteCategory(c.id))}
          >
            <Trash2 size={13} />
          </ConfirmButton>
        )}
      </span>
      {error && <p className="text-xs text-red-300 sm:col-span-5">{error}</p>}
    </li>
  );
}

// The categories Frame.io comments are sorted into: their names, how much
// one counts against Quality (1 a full mistake, 0.5 half, 0 not at all),
// and the keywords that put a comment in each. Core edits.
function CategoriesPanel({ categories }: { categories: CategoryView[] }) {
  const { run, error } = useRun();
  const [d, setD] = useState({ name: "", weight: 1, keywords: "", repeats: true });
  const [n, setN] = useState(0);
  return (
    <div className="mt-1 rounded-2xl border border-border bg-surface-2/30 p-5">
      <p className="text-sm font-medium">Feedback categories</p>
      <p className="mt-0.5 text-xs text-muted">
        Every Frame.io comment goes to the category whose keywords it uses most, or to Others. &ldquo;Counts&rdquo; is how many mistakes one is worth against Quality; &ldquo;Repeats&rdquo; means the same kind again, on another video, counts as a repeat.
      </p>
      <ul className="mt-4 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface/40">
        {categories.map((c) => (
          <CategoryRow key={`${c.id}:${c.name}:${c.weight}:${c.keywords}`} c={c} />
        ))}
        <li key={n} className="grid items-center gap-2 px-4 py-2.5 sm:grid-cols-[12rem_7rem_minmax(0,1fr)_6.5rem_4.5rem]">
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="New category" className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm" />
          <Num value={d.weight} onChange={(w) => setD({ ...d, weight: w })} suffix="counts" />
          <input value={d.keywords} onChange={(e) => setD({ ...d, keywords: e.target.value })} placeholder="Keywords, comma-separated" className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm" />
          <RepeatsToggle on={d.repeats} onChange={(repeats) => setD({ ...d, repeats })} />
          <button
            onClick={async () => {
              if (await run(() => addCategory(d))) {
                setD({ name: "", weight: 1, keywords: "", repeats: true });
                setN((x) => x + 1);
              }
            }}
            disabled={!d.name.trim()}
            className="btn btn-xs btn-glow flex items-center gap-1 disabled:opacity-50"
          >
            <Plus size={12} /> Add
          </button>
        </li>
      </ul>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
