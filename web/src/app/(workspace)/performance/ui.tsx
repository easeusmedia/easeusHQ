"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Gauge,
  Info as InfoIcon,
  Lightbulb,
  PenLine,
  Plus,
  Repeat2,
  Sparkles,
  Star,
  StickyNote,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { addDays, GRADE_LABEL, hoursLabel, shiftMonth, shortDay, type Grade, type Part, type PeriodKind, type Scoring } from "@/lib/editorKpi";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { Stepper } from "../Stepper";
import { ConfirmButton } from "../ConfirmButton";
import { topLayer, useCloseOnScroll, usePopover } from "../popover";
import { deleteEntry, logEntry, setTaskExcluded, setTaskType, sortEntry, sortWithAi, updateEntry, type EntryInput } from "./actions";

// a server action, then the page again; its error, if any, for the caller to show
export function useRun() {
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
  { kind: "week", label: "Week" },
  { kind: "month", label: "Month" },
  { kind: "range", label: "Custom range" },
];

// Week | Month | Custom range, and which one: stepped back and forth,
// or any two days. Everything on the page follows it.
export function PeriodBar({ period, today }: { period: PeriodQuery; today: string }) {
  const router = useRouter();
  const path = usePathname();
  const go = (q: Record<string, string>) => router.push(`${path}?${new URLSearchParams(q)}`);
  const step = "grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground";

  const switchTo = (kind: PeriodKind) => {
    if (kind === period.kind) return;
    if (kind === "week") go({ view: "week", week: period.to });
    else if (kind === "month") go({ view: "month", month: period.to.slice(0, 7) });
    else go({ view: "range", from: period.from, to: period.to });
  };

  const month = period.from.slice(0, 7);
  const move = (by: 1 | -1): Record<string, string> =>
    period.kind === "week" ? { view: "week", week: addDays(period.from, 7 * by) } : { view: "month", month: shiftMonth(month, by) };
  const now = { week: "This week", month: "This month", range: "" }[period.kind];

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

// ---------- what something means ----------

// An (i) beside a name: what it means, on hover or a tap
export function Info({ label, text }: { label: string; text: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const { position, place } = usePopover(110);
  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);
  if (!text) return null;
  const show = () => {
    place(ref.current, { width: 264 });
    setOpen(true);
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`What ${label} means`}
        onMouseEnter={show}
        onMouseLeave={close}
        onFocus={show}
        onBlur={close}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) close();
          else show();
        }}
        className="grid size-4 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-foreground"
      >
        <InfoIcon size={12} />
      </button>
      {open && position && (
        <div {...topLayer} role="tooltip" style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width }} className="pop-in pointer-events-none fixed z-50 m-0 rounded-xl popover px-3 py-2 text-xs shadow-lg">
          <p className="font-medium text-foreground">{label}</p>
          <p className="mt-0.5 leading-relaxed text-muted">{text}</p>
        </div>
      )}
    </>
  );
}

// ---------- scores ----------

const GRADE_STYLE: Record<Grade, string> = {
  "A+": "bg-accent/20 text-accent ring-1 ring-accent/40",
  A: "bg-accent/12 text-accent",
  B: "bg-foreground/[0.07] text-foreground/85",
  C: "bg-amber-300/10 text-amber-300",
  D: "bg-rose-300/10 text-rose-300",
};

// The grade as a letter in a tile, and what it means
export function GradeBadge({ grade, size = "md", label = false }: { grade: Grade | null; size?: "sm" | "md" | "lg"; label?: boolean }) {
  const box = { sm: "size-7 text-xs rounded-lg", md: "size-11 text-lg rounded-xl", lg: "size-16 text-3xl rounded-2xl" }[size];
  return (
    <span className="flex items-center gap-2">
      <span className={`grid shrink-0 place-items-center font-semibold tracking-tight ${box} ${grade ? GRADE_STYLE[grade] : "bg-foreground/[0.05] text-muted"}`}>{grade ?? "–"}</span>
      {label && grade && <span className="text-sm text-muted">{GRADE_LABEL[grade]}</span>}
    </span>
  );
}

// "8.4 / 10": the total, big
export function Total({ total, size = "md" }: { total: number | null; size?: "md" | "lg" }) {
  return (
    <span className="flex items-baseline gap-1 tabular-nums">
      <span className={`font-semibold tracking-tight ${size === "lg" ? "text-5xl" : "text-3xl"} ${total === null ? "text-muted" : ""}`}>{total ?? "–"}</span>
      {total !== null && <span className={`text-muted ${size === "lg" ? "text-lg" : "text-sm"}`}>/ 10</span>}
    </span>
  );
}

// Up or down on the period before, in points out of 10
export function Delta({ now, before, against }: { now: number | null; before: number | null; against: string }) {
  if (now === null || before === null) return <span className="text-xs text-muted">Nothing {against} to compare</span>;
  const d = round1(now - before);
  if (d === 0) return <span className="text-xs text-muted">Level with {against}</span>;
  const up = d > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${up ? "text-accent" : "text-rose-300"}`}>
      <Icon size={13} />
      {up ? "+" : ""}
      {d} on {against}
    </span>
  );
}

// the three parts: fixed colours, checked for colour-blind separation on this surface
export const PART_COLOR: Record<Part, string> = { quantity: "#4b95e6", quality: "#199e70", rating: "#d95926" };
export const PART: Record<Part, { label: string; Icon: LucideIcon; means: string }> = {
  quantity: { label: "Quantity", Icon: Gauge, means: "Output, reels completed against the target for their working days, and speed, how many went from Editing to Sent for approval within their standard time." },
  quality: { label: "Quality", Icon: Sparkles, means: "Starts full and loses points for every mistake per video, on average. Revisions count as mistakes, repeats count double, and each mistake type has its own weight." },
  rating: { label: "Rating", Icon: Star, means: "Core's word on them. Starts halfway each week; praise adds its points and a concern takes its points off." },
};

// One of the three scores: its name, "3.2 / 4", a bar, and what's behind it
export function PartScore({ part, value, max, lines }: { part: Part; value: number | null; max: number; lines: string[] }) {
  const { label, Icon, means } = PART[part];
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <Icon size={13} /> {label}
          <Info label={label} text={means} />
        </span>
        <span className="tabular-nums">
          <span className={`text-lg font-semibold ${value === null ? "text-muted" : ""}`}>{value ?? "–"}</span>
          <span className="text-xs text-muted"> / {max}</span>
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/[0.07]">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${((value ?? 0) / max) * 100}%`, background: PART_COLOR[part] }} />
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
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
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
export type ClientOption = { id: string; name: string; projects: { id: string; name: string }[] };
export type CategoryView = { id: string; name: string; group: string; description: string | null; weight: number; keywords: string | null; repeats: boolean };

const SOURCE: Record<string, string> = { frameio: "Frame.io", notion: "Notion", manual: "Added" };
const describe = (categories: CategoryView[], name: string | null) => categories.find((c) => c.name === name)?.description;

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
  clients: ClientOption[];
  categories: CategoryView[];
  scoring: Scoring;
  today: string;
};

const KINDS: { key: string; label: string; Icon: LucideIcon; says: string }[] = [
  { key: "positive", label: "Praise", Icon: ThumbsUp, says: "Adds its points to their Rating." },
  { key: "negative", label: "Concern", Icon: ThumbsDown, says: "Takes its points off their Rating." },
  { key: "guidance", label: "Feedback", Icon: Lightbulb, says: "A pointer to help them grow. Shown to them, never scored." },
  { key: "mistake", label: "Mistake", Icon: CircleAlert, says: "Counts against Quality, by its type's weight." },
];

// Adding or putting right any feedback: praise or a concern (points
// required), feedback (never scored), a mistake, or, when correcting a
// Frame.io comment, not feedback at all. Every field can be changed.
function EntryDialog({ open, onClose, entry, editorId, tasks, clients, categories, today }: DialogProps & { open: boolean; onClose: () => void; entry: FeedbackView | null }) {
  const { run, error } = useRun();
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<EntryInput>(() => ({
    editorId,
    kind: entry?.kind ?? "positive",
    category: entry?.category ?? "",
    body: entry?.body ?? "",
    count: entry?.count ?? 1,
    points: entry?.points ?? null,
    day: entry?.day ?? today,
    taskId: entry?.taskId ?? "",
    clientId: entry?.clientId ?? "",
    projectId: entry?.projectId ?? "",
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const set = <K extends keyof EntryInput>(k: K, v: EntryInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const kinds = entry && entry.source !== "manual" ? [...KINDS, { key: "note", label: "Not feedback", Icon: StickyNote, says: "Not feedback at all: a question or a fragment. Not scored." }] : KINDS;
  const kind = kinds.find((k) => k.key === form.kind) ?? kinds[0];
  const scored = form.kind === "positive" || form.kind === "negative";
  const mistake = form.kind === "mistake";
  const types = categories.filter((c) => c.group === (mistake ? "mistake" : "feedback"));
  const client = clients.find((c) => c.id === form.clientId);
  // Frame.io praise may stay at the usual amount
  const usualPraise = entry?.source === "frameio" && form.kind === "positive";

  async function save() {
    setSaving(true);
    const ok = await run(() => (entry ? updateEntry(entry.id, form) : logEntry(form)));
    setSaving(false);
    if (ok) onClose();
  }

  const label = "flex min-w-0 flex-col gap-1 text-xs text-muted";
  return (
    <dialog ref={ref} onClose={onClose} className="glass fixed top-1/2 left-1/2 m-0 max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-5 text-foreground">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{entry ? "Edit feedback" : "Add feedback"}</h2>
        <button onClick={onClose} aria-label="Close" className="text-muted hover:text-foreground">
          <X size={15} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-1 rounded-lg bg-surface-2/60 p-0.5">
        {kinds.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setForm((f) => ({ ...f, kind: k.key, category: k.key === f.kind ? f.category : "", points: k.key === f.kind ? f.points : null }))}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs whitespace-nowrap transition-colors ${form.kind === k.key ? "bg-surface-2 text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            <k.Icon size={12} />
            {k.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{kind.says}</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {scored && (
          <>
            <div className={label}>
              Points {form.kind === "positive" ? "it adds" : "it takes off"}
              <span className="flex items-center gap-1.5">
                <span className={`w-3 text-center text-sm ${form.kind === "positive" ? "text-accent" : "text-rose-300"}`}>{form.kind === "positive" ? "+" : "−"}</span>
                <Num key={form.kind} value={form.points} placeholder={usualPraise ? "Usual" : "Required"} onChange={(n) => set("points", n)} />
              </span>
            </div>
            <div className={label}>
              About
              <Dropdown value={form.category} placeholder="Nothing in particular" onChange={(v) => set("category", v)} options={[{ value: "", label: "Nothing in particular" }, ...types.map((c) => ({ value: c.name, label: c.name }))]} />
            </div>
          </>
        )}
        {mistake && (
          <>
            <div className={label}>
              Mistake type
              <Dropdown value={form.category} placeholder="Pick one" onChange={(v) => set("category", v)} options={types.map((c) => ({ value: c.name, label: c.name }))} />
            </div>
            <div className={label}>
              Times
              <Stepper value={form.count} max={99} onChange={(n) => set("count", n)} />
            </div>
            {describe(categories, form.category) && <p className="col-span-2 -mt-1 text-xs text-muted">{describe(categories, form.category)}</p>}
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
        {form.kind !== "note" && clients.length > 0 && (
          <>
            <div className={label}>
              Client
              <Dropdown
                value={form.clientId}
                placeholder="None"
                search={{ recent: 8, placeholder: "Search clients…" }}
                onChange={(v) => setForm((f) => ({ ...f, clientId: v, projectId: "" }))}
                options={[{ value: "", label: "None" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
              />
            </div>
            <div className={label}>
              Project
              <Dropdown
                value={form.projectId}
                placeholder={client ? "None" : "Pick a client first"}
                onChange={(v) => set("projectId", v)}
                options={[{ value: "", label: "None" }, ...(client?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))]}
              />
            </div>
          </>
        )}
        <label className={`${label} col-span-2`}>
          {form.kind === "guidance" ? "The feedback" : "What happened"}
          <textarea
            value={form.body}
            onChange={(e) => set("body", e.target.value)}
            rows={3}
            placeholder={
              { positive: "e.g. Turned the trailer round a day early", negative: "e.g. Didn't reply in the group for two days", guidance: "e.g. Hold the title a beat longer, so it can be read", mistake: "e.g. US spelling in the subtitles again" }[form.kind] ?? ""
            }
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground"
          />
        </label>
      </div>

      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-sm btn-ghost">
          Cancel
        </button>
        <button onClick={save} disabled={saving || (scored && form.points === null && !usualPraise)} className="btn btn-sm btn-glow disabled:opacity-60">
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

// the edit and remove buttons at the end of a row, for core
function RowActions({ entry, onEdit, run }: { entry: FeedbackView; onEdit: () => void; run: ReturnType<typeof useRun>["run"] }) {
  return (
    <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <button onClick={onEdit} aria-label="Edit" className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground">
        <PenLine size={13} />
      </button>
      <ConfirmButton
        confirm="Remove"
        message="Remove this feedback? It stops counting straight away."
        className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-red-400"
        onConfirm={() => run(() => deleteEntry(entry.id))}
      >
        <Trash2 size={13} />
      </ConfirmButton>
    </div>
  );
}

// the day, the video, the client or project, who said it and where
function Meta({ e }: { e: FeedbackView }) {
  return (
    <>
      <span>{shortDay(e.day)}</span>
      {e.taskTitle && <span className="max-w-60 truncate">{e.taskTitle}</span>}
      {!e.taskTitle && (e.projectName || e.clientName) && <span className="max-w-60 truncate">{[e.clientName, e.projectName].filter(Boolean).join(" · ")}</span>}
      {e.by && <span>{e.fromClient ? `${e.by} (client)` : e.by}</span>}
      <span className="flex items-center gap-1 rounded border border-border px-1 py-px">
        {e.source !== "manual" && <Bot size={10} />}
        {SOURCE[e.source] ?? e.source}
      </span>
    </>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">{children}</p>;

// The mistakes found in their work: every Frame.io comment that asks for a
// fix (with a picture of its frame), and mistakes core added. Core can move
// any to another type, or out of Quality, or edit it outright.
export function MistakeList({ entries, canEdit, ...dialog }: ListProps) {
  const { run, error } = useRun();
  const [filter, setFilter] = useState<"all" | "repeats" | "other">("all");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<FeedbackView | null>(null);
  const counts = {
    all: entries.filter((e) => e.kind === "mistake").length,
    repeats: entries.filter((e) => e.kind === "mistake" && e.repeat).length,
    other: entries.filter((e) => e.kind === "note").length,
  };
  const shown = entries.filter((e) => (filter === "all" ? e.kind === "mistake" : filter === "repeats" ? e.kind === "mistake" && e.repeat : e.kind === "note") && (!category || e.category === category));
  const used = [...new Set(entries.filter((e) => e.kind === "mistake").map((e) => e.category ?? "Others"))];
  // what Sort with AI would touch: Frame.io comments nobody has sorted by hand
  const unsorted = entries.filter((e) => e.source === "frameio" && !e.reviewed);
  const [sorting, setSorting] = useState(false);
  const sortOptions = [
    ...dialog.categories.filter((c) => c.group === "mistake").map((c) => ({ value: c.name, label: c.name })),
    { value: "positive", label: "Praise, adds to Rating" },
    { value: "guidance", label: "Feedback, not scored" },
    { value: "note", label: "Not feedback" },
  ];
  const TABS = [
    ["all", "Mistakes"],
    ["repeats", "Repeats"],
    ["other", "Not feedback"],
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
            <Dropdown value={category} size="sm" placeholder="Every type" onChange={setCategory} options={[{ value: "", label: "Every type" }, ...used.map((c) => ({ value: c, label: c }))]} />
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <Empty>Nothing here for this period.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {shown.map((e) => (
            <li key={e.id} className="group flex items-start gap-3 bg-surface/40 px-4 py-3">
              {e.snapshot ? (
                <Snapshot id={e.id} />
              ) : (
                <span className="grid h-16 w-9 shrink-0 place-items-center rounded-md bg-surface-2/60 text-muted">{e.kind === "mistake" ? <CircleAlert size={14} /> : <StickyNote size={14} />}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm whitespace-pre-line">{e.body}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    {canEdit ? (
                      <span className="w-44">
                        <Dropdown value={e.kind === "mistake" ? (e.category ?? "Others") : e.kind} size="sm" onChange={(v) => v && run(() => sortEntry(e.id, v))} options={sortOptions} />
                      </span>
                    ) : (
                      <span className="text-foreground/80">{e.kind === "mistake" ? (e.category ?? "Others") : "Not feedback"}</span>
                    )}
                    {e.kind === "mistake" && <Info label={e.category ?? "Others"} text={describe(dialog.categories, e.category ?? "Others")} />}
                  </span>
                  {e.count > 1 && <span>×{e.count}</span>}
                  {!e.counted && (
                    <span className="rounded border border-border px-1.5 py-px" title="From before their work was tracked here, so it isn't weighed against their videos">
                      Not counted
                    </span>
                  )}
                  {e.repeat && (
                    <span className="flex items-center gap-1 rounded bg-rose-300/10 px-1.5 py-px text-rose-300">
                      <Repeat2 size={11} /> Repeat
                    </span>
                  )}
                  <Meta e={e} />
                </div>
              </div>
              {canEdit && <RowActions entry={e} onEdit={() => setEditing(e)} run={run} />}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
      {editing && <EntryDialog key={editing.id} open onClose={() => setEditing(null)} entry={editing} {...dialog} />}
    </div>
  );
}

// Feedback to help them grow: Frame.io comments that say "feedback", and
// core's own. Shown with the frame it was left on; never scored.
export function GuidanceList({ entries, canEdit, from, ...dialog }: ListProps & { from: string }) {
  const { run, error } = useRun();
  const [editing, setEditing] = useState<FeedbackView | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">Pointers from {from} to help {canEdit ? "them" : "you"} grow. These are never scored. On Frame.io, any comment that says &ldquo;feedback&rdquo; lands here.</p>
      {entries.length === 0 ? (
        <Empty>No feedback in this period.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {entries.map((e) => (
            <li key={e.id} className="group flex items-start gap-3 bg-surface/40 px-4 py-3">
              {e.snapshot ? (
                <Snapshot id={e.id} />
              ) : (
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
                  <Lightbulb size={14} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm whitespace-pre-line">{e.body}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <Meta e={e} />
                </div>
              </div>
              {canEdit && <RowActions entry={e} onEdit={() => setEditing(e)} run={run} />}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
      {editing && <EntryDialog key={editing.id} open onClose={() => setEditing(null)} entry={editing} {...dialog} />}
    </div>
  );
}

// Praise and concerns, each with its points: what moves their Rating
export function PraiseList({ entries, canEdit, ...dialog }: ListProps) {
  const { run, error } = useRun();
  const [editing, setEditing] = useState<FeedbackView | null>(null);
  if (entries.length === 0)
    return <Empty>No praise or concerns in this period, so Rating holds at {dialog.scoring.ratingStart} of {dialog.scoring.ratingPoints}.</Empty>;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {entries.map((e) => {
          const up = e.kind === "positive";
          return (
            <li key={e.id} className="group flex items-start gap-3 bg-surface/40 px-4 py-3">
              {e.snapshot ? (
                <Snapshot id={e.id} />
              ) : (
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${up ? "bg-accent/15 text-accent" : "bg-rose-300/10 text-rose-300"}`}>{up ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm whitespace-pre-line">{e.body}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className={`font-medium tabular-nums ${up ? "text-accent" : "text-rose-300"}`}>
                    {up ? "+" : "−"}
                    {e.points ?? dialog.scoring.praisePoints}
                  </span>
                  {e.category && (
                    <span className="flex items-center gap-1 text-foreground/80">
                      {e.category}
                      <Info label={e.category} text={describe(dialog.categories, e.category)} />
                    </span>
                  )}
                  <Meta e={e} />
                </div>
              </div>
              {canEdit && <RowActions entry={e} onEdit={() => setEditing(e)} run={run} />}
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
  if (rows.length === 0) return <Empty>Nothing completed in this period.</Empty>;
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

// ---------- fields ----------

// a number field that takes decimals (0.5), no spinners; empty is null
export function Num({ value, onChange, suffix, placeholder }: { value: number | null; onChange: (n: number | null) => void; suffix?: string; placeholder?: string }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  return (
    <span className="flex items-center gap-1.5">
      <input
        value={text}
        inputMode="decimal"
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (!e.target.value.trim()) onChange(null);
          else if (Number.isFinite(n)) onChange(n);
        }}
        className="w-16 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm tabular-nums text-foreground placeholder:text-muted/70"
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </span>
  );
}
