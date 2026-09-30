"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clapperboard,
  FolderOpen,
  Gauge,
  Info as InfoIcon,
  Lightbulb,
  MessageSquareHeart,
  Minus,
  PenLine,
  Plus,
  Repeat2,
  Sparkles,
  StickyNote,
  Tag,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { addDays, GRADE_LABEL, hoursLabel, shiftMonth, shortDay, type Grade, type Part, type PeriodKind, type Scoring } from "@/lib/editorKpi";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { ConfirmButton } from "../ConfirmButton";
import { ADD_BUTTON, PlusBadge } from "../AddButton";
import { chip } from "../chip";
import { topLayer, useCloseOnScroll, usePopover } from "../popover";
import { deleteEntry, logEntry, setTaskExcluded, setTaskType, sortWithAi, updateEntry, type EntryInput } from "./actions";

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
  { kind: "all", label: "All time" },
  { kind: "range", label: "Custom" },
];

// Week | Month | All time | Custom, and which one. Everything on the page
// follows it.
export function PeriodBar({ period, today }: { period: PeriodQuery; today: string }) {
  const router = useRouter();
  const path = usePathname();
  const go = (q: Record<string, string>) => router.push(`${path}?${new URLSearchParams(q)}`);
  const step = "grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-foreground";

  const switchTo = (kind: PeriodKind) => {
    if (kind === period.kind) return;
    if (kind === "week") go({ view: "week", week: period.to });
    else if (kind === "month") go({ view: "month", month: period.to.slice(0, 7) });
    else if (kind === "all") go({ view: "all" });
    else go({ view: "range", from: addDays(today, -29), to: today });
  };
  const move = (by: 1 | -1) => (period.kind === "week" ? go({ view: "week", week: addDays(period.from, 7 * by) }) : go({ view: "month", month: shiftMonth(period.from.slice(0, 7), by) }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg bg-surface-2/60 p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v.kind}
            onClick={() => switchTo(v.kind)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${period.kind === v.kind ? "bg-surface-2 text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {period.kind === "range" && (
        <div className="flex items-center gap-1.5">
          <DatePicker pill={{}} value={period.from} clearable={false} onChange={(v) => v && go({ view: "range", from: v, to: period.to })} />
          <span className="text-sm text-muted">to</span>
          <DatePicker pill={{}} value={period.to} clearable={false} onChange={(v) => v && go({ view: "range", from: period.from, to: v > today ? today : v })} />
        </div>
      )}
      {(period.kind === "week" || period.kind === "month") && (
        <div className="flex items-center rounded-lg bg-surface-2/60 p-0.5">
          <button onClick={() => move(-1)} aria-label="Before" className={step}>
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-28 px-1 text-center text-sm font-medium whitespace-nowrap">{period.current ? (period.kind === "week" ? "This week" : "This month") : period.label}</span>
          <button onClick={() => move(1)} aria-label="After" disabled={period.current} className={period.current ? `${step} pointer-events-none opacity-30` : step}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- what something means ----------

// An (i) beside a mistake or feedback type: what it means, on hover or a tap
export function Info({ label, text }: { label: string; text: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const { position, place } = usePopover(110);
  const close = useCallback(() => setOpen(false), []);
  useCloseOnScroll(open, close);
  if (!text) return null;
  const show = () => {
    place(ref.current, { width: 272 });
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
        className="grid size-5 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-foreground"
      >
        <InfoIcon size={13} />
      </button>
      {open && position && (
        <div {...topLayer} role="tooltip" style={{ top: position.top, bottom: position.bottom, left: position.left, width: position.width }} className="pop-in pointer-events-none fixed z-50 m-0 rounded-xl popover px-3.5 py-2.5 text-sm shadow-lg">
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

// The grade as a letter in a tile
export function GradeBadge({ grade, size = "md" }: { grade: Grade | null; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "size-8 text-sm rounded-lg", md: "size-12 text-xl rounded-xl", lg: "size-16 text-3xl rounded-2xl" }[size];
  return <span className={`grid shrink-0 place-items-center font-semibold tracking-tight ${box} ${grade ? GRADE_STYLE[grade] : "bg-foreground/[0.05] text-muted"}`}>{grade ?? "–"}</span>;
}

// "8.4 / 10", and what the grade means
export function Total({ total, grade, size = "md" }: { total: number | null; grade?: Grade | null; size?: "md" | "lg" }) {
  return (
    <span className="flex flex-col">
      <span className="flex items-baseline gap-1 tabular-nums">
        <span className={`font-semibold tracking-tight ${size === "lg" ? "text-4xl" : "text-3xl"} ${total === null ? "text-muted" : ""}`}>{total ?? "–"}</span>
        {total !== null && <span className="text-base text-muted">/ 10</span>}
      </span>
      {grade !== undefined && <span className="text-sm text-muted">{grade ? GRADE_LABEL[grade] : "No score yet"}</span>}
    </span>
  );
}

// Up or down on the period before
export function Delta({ now, before, against }: { now: number | null; before: number | null; against: string }) {
  if (now === null || before === null) return null;
  const d = round1(now - before);
  if (d === 0) return <span className="text-sm text-muted">Same as {against}</span>;
  const up = d > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm whitespace-nowrap ${up ? "text-accent" : "text-rose-300"}`}>
      <Icon size={14} />
      {up ? "+" : ""}
      {d}
      <span className="max-sm:hidden">&nbsp;on {against}</span>
    </span>
  );
}

// the three parts: fixed colours, checked for colour-blind separation on this surface
export const PART_COLOR: Record<Part, string> = { quantity: "#4b95e6", quality: "#199e70", feedback: "#d95926" };
export const PART: Record<Part, { label: string; Icon: LucideIcon }> = {
  quantity: { label: "Quantity", Icon: Gauge },
  quality: { label: "Quality", Icon: Sparkles },
  feedback: { label: "Feedback", Icon: MessageSquareHeart },
};

// One part: its name, "3.2 / 4", a bar, and the one thing behind it
export function PartScore({ part, value, max, fact }: { part: Part; value: number | null; max: number; fact?: string }) {
  const { label, Icon } = PART[part];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
        <Icon size={14} className="shrink-0 max-sm:hidden" />
        <span className="truncate">{label}</span>
      </span>
      <span className="tabular-nums whitespace-nowrap">
        <span className={`text-2xl font-semibold ${value === null ? "text-muted" : ""}`}>{value ?? "–"}</span>
        <span className="text-sm text-muted"> / {max}</span>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${((value ?? 0) / max) * 100}%`, background: PART_COLOR[part] }} />
      </span>
      {fact && <span className="truncate text-sm text-muted">{fact}</span>}
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

const describe = (categories: CategoryView[], name: string | null) => categories.find((c) => c.name === name)?.description;

// The picture of the frame, small; bigger on a click
function Snapshot({ id }: { id: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const src = `/api/performance/snapshot/${id}`;
  return (
    <>
      <button onClick={() => ref.current?.showModal()} className="h-11 w-14 shrink-0 self-start overflow-hidden rounded-lg bg-black/40 ring-1 ring-border transition-opacity hover:opacity-80 sm:h-14 sm:w-20" aria-label="See the frame">
        {/* eslint-disable-next-line @next/next/no-img-element -- a few-kilobyte snapshot served by our own route */}
        <img src={src} alt="" loading="lazy" className="size-full object-contain" />
      </button>
      <dialog ref={ref} onClick={(e) => e.target === e.currentTarget && ref.current?.close()} className="glass fixed top-1/2 left-1/2 m-0 -translate-x-1/2 -translate-y-1/2 rounded-2xl p-2 backdrop:bg-black/60">
        {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
        <img src={src} alt="The frame this was said about" className="max-h-[80vh] w-auto rounded-xl" style={{ minWidth: 320 }} />
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

// what's being written: feedback carries points (+ adds, − takes off), a
// tip carries none, a mistake has a type and a count
type Kind = "feedback" | "guidance" | "mistake" | "note";
const KINDS: { key: Kind; label: string; Icon: LucideIcon; placeholder: string }[] = [
  { key: "feedback", label: "Feedback", Icon: MessageSquareHeart, placeholder: "What did they do well, or not so well?" },
  { key: "guidance", label: "Tip", Icon: Lightbulb, placeholder: "A pointer for next time" },
  { key: "mistake", label: "Mistake", Icon: CircleAlert, placeholder: "What was wrong?" },
];
const NOTE = { key: "note" as Kind, label: "Not feedback", Icon: StickyNote, placeholder: "" };

// a chip's way back to nothing, offered once something's picked (so an
// empty chip shows its own name, not "No video")
const clearable = (value: string, label: string) => (value ? [{ value: "", label }] : []);

// − 1 + : a number stepped by `step`
function StepChip({ value, onChange, step, min, max, show, tone }: { value: number; onChange: (n: number) => void; step: number; min: number; max: number; show: string; tone?: string }) {
  const btn = "grid size-7 place-items-center rounded-full text-muted transition-colors hover:bg-white/[0.08] hover:text-foreground disabled:opacity-30";
  return (
    <span className={`${chip(true)} gap-0 px-1 py-0.5`}>
      <button type="button" onClick={() => onChange(Math.max(min, round1(value - step)))} disabled={value <= min} aria-label="Less" className={btn}>
        <Minus size={13} />
      </button>
      <span className={`min-w-16 text-center text-sm font-medium tabular-nums ${tone ?? ""}`}>{show}</span>
      <button type="button" onClick={() => onChange(Math.min(max, round1(value + step)))} disabled={value >= max} aria-label="More" className={btn}>
        <Plus size={13} />
      </button>
    </span>
  );
}

// Adding or putting right anything said about their work, built like New
// task: what happened, then a row of chips. Every field can be changed,
// Frame.io and Notion ones included.
function EntryDialog({ open, onClose, entry, editorId, tasks, clients, categories, scoring, today }: DialogProps & { open: boolean; onClose: () => void; entry: FeedbackView | null }) {
  const { run, error } = useRun();
  const ref = useRef<HTMLDialogElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const kindOf = (k?: string): Kind => (k === "positive" || k === "negative" ? "feedback" : k === "guidance" || k === "mistake" || k === "note" ? k : "feedback");
  const [f, setF] = useState(() => ({
    kind: kindOf(entry?.kind),
    // signed: + praise, − a concern; 0 until they're given
    points: entry?.kind === "positive" ? (entry.points ?? scoring.praisePoints) : entry?.kind === "negative" ? -(entry.points ?? 0) : 0,
    category: entry?.category ?? "",
    body: entry?.body ?? "",
    count: entry?.count ?? 1,
    day: entry?.day ?? today,
    taskId: entry?.taskId ?? "",
    clientId: entry?.clientId ?? "",
    projectId: entry?.projectId ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // straight into writing, as New task does
      text.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const kinds = entry && entry.source !== "manual" ? [...KINDS, NOTE] : KINDS;
  const kind = kinds.find((k) => k.key === f.kind) ?? kinds[0];
  const types = categories.filter((c) => c.group === (f.kind === "mistake" ? "mistake" : "feedback"));
  const client = clients.find((c) => c.id === f.clientId);
  const missing = !f.body.trim() ? "Write what it's about." : f.kind === "feedback" && f.points === 0 ? "Give it points: + adds, − takes off." : null;

  async function save() {
    const input: EntryInput = {
      editorId,
      kind: f.kind === "feedback" ? (f.points > 0 ? "positive" : "negative") : f.kind,
      category: f.kind === "note" ? "" : f.category,
      body: f.body,
      count: f.count,
      points: f.kind === "feedback" ? Math.abs(f.points) : null,
      day: f.day,
      taskId: f.taskId,
      clientId: f.clientId,
      projectId: f.projectId,
    };
    setSaving(true);
    const ok = await run(() => (entry ? updateEntry(entry.id, input) : logEntry(input)));
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <dialog ref={ref} onClose={onClose} className="glass fixed top-1/2 left-1/2 m-0 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground">
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="flex flex-wrap gap-1 rounded-lg bg-surface-2/60 p-0.5">
          {kinds.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => set({ kind: k.key, category: k.key === f.kind ? f.category : "" })}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${f.kind === k.key ? "bg-surface-2 text-foreground shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              <k.Icon size={14} />
              {k.label}
            </button>
          ))}
        </div>
        <button onClick={onClose} aria-label="Close" className="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
          <X size={16} />
        </button>
      </div>

      {/* borderless, like New task: the caret says where you are */}
      <textarea
        value={f.body}
        onChange={(e) => set({ body: e.target.value })}
        placeholder={kind.placeholder}
        ref={text}
        aria-label="What happened"
        rows={2}
        className="field-sizing-content mt-3 max-h-60 min-h-16 w-full resize-none bg-transparent px-5 text-lg text-foreground outline-none! placeholder:text-muted/60"
      />

      <div className="flex flex-wrap items-center gap-1.5 px-5 pt-3 pb-4">
        {f.kind === "feedback" && (
          <>
            <StepChip
              value={f.points}
              onChange={(n) => set({ points: n })}
              step={0.5}
              min={-5}
              max={5}
              show={f.points === 0 ? "Points" : `${f.points > 0 ? "+" : "−"}${Math.abs(f.points)}`}
              tone={f.points > 0 ? "text-accent" : f.points < 0 ? "text-rose-300" : "text-muted"}
            />
            <Dropdown pill={{ icon: <Tag size={12} className="text-amber-400" /> }} value={f.category} placeholder="About" onChange={(v) => set({ category: v })} options={[...clearable(f.category, "Nothing in particular"), ...types.map((c) => ({ value: c.name, label: c.name }))]} />
          </>
        )}
        {f.kind === "guidance" && (
          <Dropdown pill={{ icon: <Tag size={12} className="text-amber-400" /> }} value={f.category} placeholder="About" onChange={(v) => set({ category: v })} options={[...clearable(f.category, "Nothing in particular"), ...types.map((c) => ({ value: c.name, label: c.name }))]} />
        )}
        {f.kind === "mistake" && (
          <>
            <Dropdown pill={{ icon: <Tag size={12} className="text-rose-400" /> }} value={f.category} placeholder="Type" onChange={(v) => set({ category: v })} options={types.map((c) => ({ value: c.name, label: c.name }))} />
            <StepChip value={f.count} onChange={(n) => set({ count: n })} step={1} min={1} max={99} show={`×${f.count}`} />
          </>
        )}
        <DatePicker pill={{}} value={f.day} onChange={(v) => set({ day: v || today })} clearable={false} />
        <Dropdown
          pill={{ icon: <Clapperboard size={12} className="text-violet-400" /> }}
          value={f.taskId}
          placeholder="Video"
          search={{ recent: 8, placeholder: "Find a video…" }}
          onChange={(v) => set({ taskId: v })}
          options={[...clearable(f.taskId, "No video"), ...tasks.map((t) => ({ value: t.id, label: t.title }))]}
        />
        {f.kind !== "note" && clients.length > 0 && (
          <Dropdown
            pill={{ icon: <Building2 size={12} className="text-sky-400" /> }}
            value={f.clientId}
            placeholder="Client"
            search={{ recent: 8, placeholder: "Find a client…" }}
            onChange={(v) => set({ clientId: v, projectId: "" })}
            options={[...clearable(f.clientId, "No client"), ...clients.map((c) => ({ value: c.id, label: c.name }))]}
          />
        )}
        {f.kind !== "note" && client && (
          <Dropdown
            pill={{ icon: <FolderOpen size={12} className="text-violet-400" /> }}
            value={f.projectId}
            placeholder="Project"
            onChange={(v) => set({ projectId: v })}
            options={[...clearable(f.projectId, "No project"), ...client.projects.map((p) => ({ value: p.id, label: p.name }))]}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
        <p className="min-w-0 truncate text-sm text-red-300">{error}</p>
        <div className="flex shrink-0 gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={saving || !!missing} title={missing ?? undefined} className="btn btn-glow disabled:opacity-50">
            {saving ? "Saving…" : entry ? "Save" : "Add"}
          </button>
        </div>
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
        className={ADD_BUTTON}
      >
        <PlusBadge /> Add feedback
      </button>
      <EntryDialog key={n} open={open} onClose={() => setOpen(false)} entry={null} {...props} />
    </>
  );
}

type ListProps = DialogProps & { entries: FeedbackView[]; canEdit: boolean };

// All · Repeats · …: which of a list to show, with how many each
function Filters<K extends string>({ options, value, onChange }: { options: { key: K; label: string; count: number }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${value === o.key ? "bg-hover text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
        >
          {o.label}
          <span className="tabular-nums text-muted">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted">{children}</p>;

// edit and remove, for core
function Actions({ e, onEdit, run, className }: { e: FeedbackView; onEdit: () => void; run: ReturnType<typeof useRun>["run"]; className: string }) {
  return (
    <div className={`flex shrink-0 gap-0.5 ${className}`}>
      <button onClick={onEdit} aria-label="Edit" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground">
        <PenLine size={14} />
      </button>
      <ConfirmButton
        confirm="Remove"
        message="Remove this? It stops counting straight away."
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-red-400"
        onConfirm={() => run(() => deleteEntry(e.id))}
      >
        <Trash2 size={14} />
      </ConfirmButton>
    </div>
  );
}

// One thing said about their work: the frame (or an icon), what was said,
// and a line of what it is, when, and on what. Core can edit or remove it:
// on hover at the end of the row, or on a phone, at the end of its line.
function Row({ e, lead, tags, canEdit, onEdit, run }: { e: FeedbackView; lead: React.ReactNode; tags: React.ReactNode; canEdit: boolean; onEdit: () => void; run: ReturnType<typeof useRun>["run"] }) {
  const on = e.taskTitle ?? ([e.clientName, e.projectName].filter(Boolean).join(" · ") || null);
  return (
    <li className="group flex gap-3 px-3.5 py-3.5 transition-colors hover:bg-white/[0.02] sm:gap-3.5 sm:px-4">
      {e.snapshot ? <Snapshot id={e.id} /> : lead}
      <div className="min-w-0 flex-1">
        <p className="text-base leading-snug break-words whitespace-pre-line">{e.body}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {tags}
          <span className="whitespace-nowrap">{shortDay(e.day)}</span>
          {on && <span className="max-w-full truncate sm:max-w-72">{on}</span>}
          {canEdit && <Actions e={e} onEdit={onEdit} run={run} className="-my-1 ml-auto sm:hidden" />}
        </div>
      </div>
      {canEdit && <Actions e={e} onEdit={onEdit} run={run} className="self-start opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-sm:hidden" />}
    </li>
  );
}

// an icon where there's no frame, in the frame's width so the text lines up
const Tile = ({ Icon, tone }: { Icon: LucideIcon; tone: string }) => (
  <span className="flex w-14 shrink-0 justify-center self-start sm:w-20 sm:pt-1">
    <span className={`grid size-10 place-items-center rounded-lg ${tone}`}>
      <Icon size={15} />
    </span>
  </span>
);

// The mistakes found in their work, each Frame.io comment with its frame.
export function MistakeList({ entries, canEdit, ...dialog }: ListProps) {
  const { run, error } = useRun();
  const [filter, setFilter] = useState<"all" | "repeats" | "other">("all");
  const [type, setType] = useState("");
  const [editing, setEditing] = useState<FeedbackView | null>(null);
  const [sorting, setSorting] = useState(false);
  const mistakes = entries.filter((e) => e.kind === "mistake");
  const shown = (filter === "other" ? entries.filter((e) => e.kind === "note") : filter === "repeats" ? mistakes.filter((e) => e.repeat) : mistakes).filter((e) => !type || e.category === type);
  const used = [...new Set(mistakes.map((e) => e.category ?? "Others"))];
  // what Sort with AI would touch: Frame.io comments nobody has sorted by hand
  const unsorted = entries.filter((e) => e.source === "frameio" && !e.reviewed);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Filters
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "All", count: mistakes.length },
            { key: "repeats", label: "Repeats", count: mistakes.filter((e) => e.repeat).length },
            { key: "other", label: "Not feedback", count: entries.length - mistakes.length },
          ]}
        />
        <div className="flex items-center gap-2">
          {canEdit && unsorted.length > 0 && (
            <button
              onClick={async () => {
                setSorting(true);
                await run(() => sortWithAi(unsorted.map((e) => e.id)));
                setSorting(false);
              }}
              disabled={sorting}
              title="Only runs when you click it"
              className="btn btn-sm btn-ghost flex items-center gap-1.5 disabled:opacity-60"
            >
              <Sparkles size={13} /> {sorting ? "Sorting…" : "Sort with AI"}
            </button>
          )}
          {used.length > 1 && filter !== "other" && (
            <div className="w-44">
              <Dropdown value={type} placeholder="Every type" onChange={setType} options={[{ value: "", label: "Every type" }, ...used.map((c) => ({ value: c, label: c }))]} />
            </div>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty>No mistakes here.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
          {shown.map((e) => (
            <Row
              key={e.id}
              e={e}
              canEdit={canEdit}
              onEdit={() => setEditing(e)}
              run={run}
              lead={<Tile Icon={e.kind === "mistake" ? CircleAlert : StickyNote} tone="bg-surface-2/70 text-muted" />}
              tags={
                e.kind === "mistake" ? (
                  <>
                    <span className="flex items-center gap-1 text-foreground/85">
                      {e.category ?? "Others"}
                      {e.count > 1 && <span className="text-muted">×{e.count}</span>}
                      <Info label={e.category ?? "Others"} text={describe(dialog.categories, e.category ?? "Others")} />
                    </span>
                    {e.repeat && (
                      <span className="flex items-center gap-1 text-rose-300">
                        <Repeat2 size={13} /> Repeat
                      </span>
                    )}
                    {!e.counted && <span title="From before their work was tracked here">Not counted</span>}
                  </>
                ) : (
                  <span>Not feedback</span>
                )
              }
            />
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
      {editing && <EntryDialog key={editing.id} open onClose={() => setEditing(null)} entry={editing} {...dialog} />}
    </div>
  );
}

// Everything core has said to them: praise and concerns with their points,
// and tips, which carry none.
export function FeedbackList({ entries, canEdit, ...dialog }: ListProps) {
  const { run, error } = useRun();
  const [filter, setFilter] = useState<"all" | "positive" | "negative" | "guidance">("all");
  const [type, setType] = useState("");
  const [editing, setEditing] = useState<FeedbackView | null>(null);
  const shown = entries.filter((e) => (filter === "all" || e.kind === filter) && (!type || e.category === type));
  const count = (k: string) => entries.filter((e) => e.kind === k).length;
  const used = [...new Set(entries.map((e) => e.category).filter((c): c is string => !!c))];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Filters
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "All", count: entries.length },
            { key: "positive", label: "Praise", count: count("positive") },
            { key: "negative", label: "Concerns", count: count("negative") },
            { key: "guidance", label: "Tips", count: count("guidance") },
          ]}
        />
        {used.length > 0 && (
          <div className="w-44">
            <Dropdown value={type} placeholder="Every type" onChange={setType} options={[{ value: "", label: "Every type" }, ...used.map((c) => ({ value: c, label: c }))]} />
          </div>
        )}
      </div>
      {shown.length === 0 ? (
        <Empty>No feedback here.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
          {shown.map((e) => {
            const tip = e.kind === "guidance";
            const up = e.kind === "positive";
            return (
              <Row
                key={e.id}
                e={e}
                canEdit={canEdit}
                onEdit={() => setEditing(e)}
                run={run}
                lead={<Tile Icon={tip ? Lightbulb : MessageSquareHeart} tone={tip ? "bg-amber-300/10 text-amber-300" : up ? "bg-accent/15 text-accent" : "bg-rose-300/10 text-rose-300"} />}
                tags={
                  <>
                    {tip ? (
                      <span className="text-amber-300">Tip</span>
                    ) : (
                      <span className={`font-medium tabular-nums ${up ? "text-accent" : "text-rose-300"}`}>
                        {up ? "+" : "−"}
                        {e.points ?? dialog.scoring.praisePoints}
                      </span>
                    )}
                    {e.category && (
                      <span className="flex items-center gap-1 text-foreground/85">
                        {e.category}
                        <Info label={e.category} text={describe(dialog.categories, e.category)} />
                      </span>
                    )}
                  </>
                }
              />
            );
          })}
        </ul>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
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

// What they completed: each video's type (core can set it), its time from
// Editing to Sent for approval against its standard, and its revisions.
// One that shouldn't count can be left out.
export function VideoTable({ rows, types, canEdit }: { rows: VideoRow[]; types: string[]; canEdit: boolean }) {
  const { run, error } = useRun();
  if (rows.length === 0) return <Empty>No videos finished here.</Empty>;
  const ROW = "grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-4 px-4 md:grid-cols-[minmax(0,1fr)_10rem_5rem_7.5rem_5.5rem_5.5rem]";
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface/40 text-sm">
        <div className={`${ROW} py-3 text-muted`}>
          <span>Video</span>
          <span className="hidden md:block">Type</span>
          <span className="hidden md:block">Done</span>
          <span className="text-right">Time</span>
          <span className="hidden text-right md:block">Revisions</span>
          <span className="hidden md:block" />
        </div>
        {rows.map((v) => (
          <div key={v.id} className={`${ROW} border-t border-border/60 py-3 ${v.excluded ? "opacity-45" : ""}`}>
            <span className="min-w-0">
              <span className="block truncate text-base">{v.title}</span>
              <span className="block truncate text-muted">{v.where}</span>
            </span>
            <span className="hidden min-w-0 md:block">
              {canEdit ? (
                <Dropdown value={v.guessed ? "" : v.type} placeholder={`${v.type}?`} onChange={(t) => t && run(() => setTaskType(v.id, t))} options={types.map((t) => ({ value: t, label: t }))} />
              ) : (
                <span className="text-muted">{v.type}</span>
              )}
            </span>
            <span className="hidden text-muted md:block">{v.completed ? shortDay(v.completed) : "–"}</span>
            <span className="text-right tabular-nums whitespace-nowrap" title={`Editing to Sent for approval, against ${hoursLabel(v.standardHours)}`}>
              <span className={v.withinStandard === false ? "text-rose-300" : v.withinStandard ? "text-foreground" : "text-muted"}>{v.editHours === null ? "–" : hoursLabel(v.editHours)}</span>
              <span className="text-muted"> / {hoursLabel(v.standardHours)}</span>
            </span>
            <span className="hidden text-right tabular-nums md:block">{v.revisions}</span>
            {canEdit ? (
              <button onClick={() => run(() => setTaskExcluded(v.id, !v.excluded))} className="hidden justify-self-end text-muted hover:text-foreground md:block">
                {v.excluded ? "Count it" : "Leave out"}
              </button>
            ) : (
              <span className="hidden md:block" />
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

// ---------- fields ----------

// a number field that takes decimals (0.5), no spinners; empty is null
export function Num({ value, onChange, suffix, prefix, placeholder }: { value: number | null; onChange: (n: number | null) => void; suffix?: string; prefix?: string; placeholder?: string }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {prefix && <span className="text-sm text-muted">{prefix}</span>}
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
        className="w-16 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-right text-sm tabular-nums text-foreground placeholder:text-muted/70"
      />
      {suffix && <span className="text-sm whitespace-nowrap text-muted">{suffix}</span>}
    </span>
  );
}
