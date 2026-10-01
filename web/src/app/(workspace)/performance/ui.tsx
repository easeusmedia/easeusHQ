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
  Handshake,
  Info as InfoIcon,
  Lightbulb,
  Minus,
  Palette,
  PenLine,
  Plus,
  Sparkles,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Timer,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { addDays, shiftMonth, shortDay, type PeriodKind } from "@/lib/editorKpi";
import { LETTER_LABEL, PART_LABEL, type Letter, type Part, type VideoScoring } from "@/lib/videoScore";
import { GRADE_STYLE } from "../gradeStyle";
import { TierMark, tierClass } from "../TaskCard";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { ConfirmButton } from "../ConfirmButton";
import { ADD_BUTTON, PlusBadge } from "../AddButton";
import { chip } from "../chip";
import { topLayer, useCloseOnScroll, usePopover } from "../popover";
import { deleteEntry, logEntry, setCreative, setGrade, sortWithAi, updateEntry, type EntryInput } from "./actions";
import { GradePicker } from "../GradePicker";

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

// A letter in a tile: gold for S, green for A+, down to D
export function GradeBadge({ grade, size = "md" }: { grade: Letter | null; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "size-8 text-sm rounded-lg", md: "size-12 text-xl rounded-xl", lg: "size-16 text-3xl rounded-2xl" }[size];
  return <span className={`grid shrink-0 place-items-center font-semibold tracking-tight ${box} ${grade ? GRADE_STYLE[grade] : "bg-foreground/[0.05] text-muted"}`}>{grade ?? "–"}</span>;
}

// Up or down on the period before, in points (core only)
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

export const PART: Record<Part, { label: string; Icon: LucideIcon; means: string }> = {
  quality: { label: PART_LABEL.quality, Icon: Sparkles, means: "The quality inspection's grade on first review, less the mistakes we found in it (never more than one grade), plus praise, less concerns." },
  efficiency: { label: PART_LABEL.efficiency, Icon: Timer, means: "Handed over on the day it was assigned (a podcast has a day more, a trailer two), revisions few and turned round the same day." },
  client: { label: PART_LABEL.client, Icon: Handshake, means: "Accepted by the client in one go. Each creative change they ask for takes a little, each mistake they find takes more." },
};

// One of a video's (or an editor's) three scores: its letter, the number
// for core, and the one thing behind it
export function ScoreTile({ part, letter, score, fact }: { part: Part; letter: Letter | null; score?: number | null; fact?: string }) {
  const { label, Icon, means } = PART[part];
  return (
    <div className="flex min-w-0 items-center gap-3">
      <GradeBadge grade={letter} size="md" />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Icon size={14} className="shrink-0 max-sm:hidden" />
          <span className="truncate">{label}</span>
          <Info label={label} text={means} />
        </p>
        <p className="truncate text-sm">
          {score !== undefined && score !== null && <span className="mr-1.5 font-medium tabular-nums">{score}</span>}
          <span className="text-muted">{fact ?? (letter ? LETTER_LABEL[letter] : "Pending")}</span>
        </p>
      </div>
    </div>
  );
}

export type VideoCardView = {
  id: string;
  title: string;
  where: string;
  day: string | null;
  tier: string | null;
  overall: Letter | null;
  score: number | null;
  parts: Record<Part, Letter | null>;
  grade: Letter | null;
  mistakes: number;
};

// One video as a card, tinted gold or green when it's rated S or A+: its
// letter, its three part letters, and how many mistakes. Opens its page.
export function VideoCard({ v, showScore }: { v: VideoCardView; showScore: boolean }) {
  return (
    <Link href={`/performance/video/${v.id}`} className={`card-surface card-interactive flex min-w-0 flex-col gap-3 rounded-xl p-4 ${tierClass(v.tier)}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <TierMark tier={v.tier} />
            <span className="truncate text-base font-medium">{v.title}</span>
          </span>
          <span className="block truncate text-sm text-muted">
            {v.where}
            {v.day ? ` · ${shortDay(v.day)}` : ""}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <GradeBadge grade={v.overall} size="sm" />
          {showScore && v.score !== null && <span className="text-xs tabular-nums text-muted">{v.score}</span>}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        {(Object.keys(PART) as Part[]).map((p) => (
          <span key={p} className="flex items-center gap-1.5 whitespace-nowrap">
            {PART[p].label.split(" ")[0]}
            <span className={`rounded-md px-1.5 py-px text-xs font-semibold ${v.parts[p] ? GRADE_STYLE[v.parts[p]!] : "bg-foreground/[0.05] text-muted"}`}>{v.parts[p] ?? "–"}</span>
          </span>
        ))}
        {!v.grade && <span className="text-amber-300/90">Awaiting grade</span>}
        {v.mistakes > 0 && <span className="ml-auto">{v.mistakes} mistake{v.mistakes === 1 ? "" : "s"}</span>}
      </div>
    </Link>
  );
}

// the videos of a stretch, as cards
export function VideoGrid({ videos, showScore, empty = "No videos here." }: { videos: VideoCardView[]; showScore: boolean; empty?: string }) {
  if (!videos.length) return <Empty>{empty}</Empty>;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {videos.map((v) => (
        <VideoCard key={v.id} v={v} showScore={showScore} />
      ))}
    </div>
  );
}

// The quality inspection's grade on a video's page: core picks or changes
// it, and every score follows
export function GradeControl({ taskId, grade }: { taskId: string; grade: Letter | null }) {
  const { run, error } = useRun();
  const [value, setValue] = useState<string>(grade ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <GradePicker
        value={value}
        onChange={async (g) => {
          setValue(g);
          setSaving(true);
          await run(() => setGrade(taskId, g));
          setSaving(false);
        }}
      />
      {saving && <p className="text-xs text-muted">Saving…</p>}
      {error && <p className="text-sm text-red-300">{error}</p>}
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
export type CategoryView = { id: string; name: string; description: string | null; points: number; keywords: string | null; repeats: boolean };

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
  scoring: VideoScoring;
  today: string;
};

// what's being written: praise adds its points, a concern takes them off,
// a tip (for the future) carries none, a mistake has a type and a count, a
// creative change (for that video only) never counts
type Kind = "positive" | "negative" | "guidance" | "mistake" | "creative";
const KINDS: { key: Kind; label: string; Icon: LucideIcon; placeholder: string }[] = [
  { key: "positive", label: "Praise", Icon: ThumbsUp, placeholder: "What did they do well?" },
  { key: "negative", label: "Concern", Icon: ThumbsDown, placeholder: "What wasn't right?" },
  { key: "guidance", label: "Tip", Icon: Lightbulb, placeholder: "A pointer for next time" },
  { key: "mistake", label: "Mistake", Icon: CircleAlert, placeholder: "What was the mistake?" },
  { key: "creative", label: "Creative", Icon: Palette, placeholder: "What change was asked for this video?" },
];

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
  const [f, setF] = useState(() => ({
    kind: (KINDS.some((k) => k.key === entry?.kind) ? entry!.kind : "positive") as Kind,
    // how many points praise adds to its video's Quality, or a concern takes off
    points: entry?.kind === "positive" ? (entry.points ?? scoring.praisePoints) : entry?.kind === "negative" ? (entry.points ?? scoring.concernPoints) : scoring.praisePoints,
    // found at the client stage: counts against Client acceptance, not Quality
    fromClient: entry?.fromClient ?? false,
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

  const kind = KINDS.find((k) => k.key === f.kind)!;
  const scored = f.kind === "positive" || f.kind === "negative";
  const client = clients.find((c) => c.id === f.clientId);
  const missing = !f.body.trim() ? "Write what it's about." : scored && f.points === 0 ? "Give it points." : null;

  async function save() {
    const input: EntryInput = {
      editorId,
      kind: f.kind,
      category: f.kind === "mistake" ? f.category : "",
      body: f.body,
      count: f.count,
      points: scored ? f.points : null,
      fromClient: (f.kind === "mistake" || f.kind === "creative") && f.fromClient,
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
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => set({ kind: k.key, ...(k.key !== f.kind && (k.key === "positive" || k.key === "negative") ? { points: k.key === "positive" ? scoring.praisePoints : scoring.concernPoints } : {}) })}
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
        {scored && (
          <StepChip
            value={f.points}
            onChange={(n) => set({ points: n })}
            step={1}
            min={0}
            max={20}
            show={f.points === 0 ? "Points" : `${f.kind === "positive" ? "+" : "−"}${f.points}`}
            tone={f.points === 0 ? "text-muted" : f.kind === "positive" ? "text-accent" : "text-rose-300"}
          />
        )}
        {f.kind === "mistake" && (
          <>
            <Dropdown pill={{ icon: <Tag size={12} className="text-rose-400" /> }} value={f.category} placeholder="Type" onChange={(v) => set({ category: v })} options={categories.map((c) => ({ value: c.name, label: c.name }))} />
            <StepChip value={f.count} onChange={(n) => set({ count: n })} step={1} min={1} max={99} show={`×${f.count}`} />
          </>
        )}
        {(f.kind === "mistake" || f.kind === "creative") && (
          <button type="button" onClick={() => set({ fromClient: !f.fromClient })} title="A mistake the client finds counts against Client acceptance; one we find, against Quality" className={chip(true)}>
            <Handshake size={12} className={f.fromClient ? "text-amber-300" : "text-muted"} />
            {f.fromClient ? "Found by the client" : "Found by us"}
          </button>
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
        {clients.length > 0 && (
          <Dropdown
            pill={{ icon: <Building2 size={12} className="text-sky-400" /> }}
            value={f.clientId}
            placeholder="Client"
            search={{ recent: 8, placeholder: "Find a client…" }}
            onChange={(v) => set({ clientId: v, projectId: "" })}
            options={[...clearable(f.clientId, "No client"), ...clients.map((c) => ({ value: c.id, label: c.name }))]}
          />
        )}
        {client && (
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
          aria-pressed={value === o.key}
          className="chip flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm"
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
function Actions({ e, onEdit, run, className, extra }: { e: FeedbackView; onEdit: () => void; run: ReturnType<typeof useRun>["run"]; className: string; extra?: React.ReactNode }) {
  return (
    <div className={`flex shrink-0 gap-0.5 ${className}`}>
      {extra}
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
function Row({ e, lead, tags, canEdit, onEdit, run, extra }: { e: FeedbackView; lead: React.ReactNode; tags: React.ReactNode; canEdit: boolean; onEdit: () => void; run: ReturnType<typeof useRun>["run"]; extra?: React.ReactNode }) {
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
          {canEdit && <Actions e={e} onEdit={onEdit} run={run} extra={extra} className="-my-1 ml-auto sm:hidden" />}
        </div>
      </div>
      {canEdit && <Actions e={e} onEdit={onEdit} run={run} extra={extra} className="self-start opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-sm:hidden" />}
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

// The changes asked for on their work, each Frame.io comment with its
// frame: mistakes, which count, and creative changes, which don't. Any one
// switches between the two in a click.
export function MistakeList({ entries, canEdit, initialType = "", ...dialog }: ListProps & { initialType?: string }) {
  const { run, error } = useRun();
  const [filter, setFilter] = useState<"mistakes" | "repeats" | "creative">("mistakes");
  const [type, setType] = useState(initialType);
  const [editing, setEditing] = useState<FeedbackView | null>(null);
  const [sorting, setSorting] = useState(false);
  const mistakes = entries.filter((e) => e.kind === "mistake");
  const shown = (filter === "creative" ? entries.filter((e) => e.kind === "creative") : filter === "repeats" ? mistakes.filter((e) => e.repeat) : mistakes).filter((e) => filter === "creative" || !type || e.category === type);
  const used = [...new Set(mistakes.map((e) => e.category ?? "Others"))];
  // what Sort with AI would touch: Frame.io comments nobody has sorted by hand
  const unsorted = entries.filter((e) => e.source === "frameio" && !e.reviewed);
  const flip = (e: FeedbackView) => {
    const creative = e.kind === "creative";
    return (
      <button
        onClick={() => run(() => setCreative(e.id, !creative))}
        aria-label={creative ? "It's a mistake" : "It's a creative change"}
        title={creative ? "It's a mistake: count it" : "It's a creative change: don't count it"}
        className={`grid size-8 place-items-center rounded-lg hover:bg-surface-2 ${creative ? "text-violet-300 hover:text-foreground" : "text-muted hover:text-violet-300"}`}
      >
        <Palette size={14} />
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Filters
          value={filter}
          onChange={setFilter}
          options={[
            { key: "mistakes", label: "Mistakes", count: mistakes.length },
            { key: "repeats", label: "Repeats", count: mistakes.filter((e) => e.repeat).length },
            { key: "creative", label: "Creative", count: entries.length - mistakes.length },
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
          {used.length > 1 && filter !== "creative" && (
            <div className="w-44">
              <Dropdown value={type} placeholder="Every type" onChange={setType} options={[{ value: "", label: "Every type" }, ...used.map((c) => ({ value: c, label: c }))]} />
            </div>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty>{filter === "creative" ? "No creative changes here." : "No mistakes here."}</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
          {shown.map((e) => (
            <Row
              key={e.id}
              e={e}
              canEdit={canEdit}
              onEdit={() => setEditing(e)}
              run={run}
              extra={flip(e)}
              lead={e.kind === "creative" ? <Tile Icon={Palette} tone="bg-violet-300/10 text-violet-300" /> : <Tile Icon={CircleAlert} tone="bg-surface-2/70 text-muted" />}
              tags={
                e.kind === "creative" ? null : (
                  <>
                    <span className="flex items-center gap-1 text-foreground/85">
                      {e.category ?? "Others"}
                      {e.count > 1 && <span className="text-muted">×{e.count}</span>}
                      <Info label={e.category ?? "Others"} text={describe(dialog.categories, e.category ?? "Others")} />
                    </span>
                    {e.fromClient && <span className="text-amber-300/90">Found by the client</span>}
                    {!e.counted && <span title="From before their work was tracked here">Not counted</span>}
                  </>
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

const SAID: Record<string, { label: string; Icon: LucideIcon; tone: string; text: string }> = {
  positive: { label: "Praise", Icon: ThumbsUp, tone: "bg-accent/15 text-accent", text: "text-accent" },
  negative: { label: "Concern", Icon: ThumbsDown, tone: "bg-rose-300/10 text-rose-300", text: "text-rose-300" },
  guidance: { label: "Tip", Icon: Lightbulb, tone: "bg-amber-300/10 text-amber-300", text: "text-amber-300" },
};

// What's said to them about their work as a whole: praise adds its
// points, a concern takes them off, a tip is for them to work on from now
// on and counts for nothing.
export function FeedbackList({ entries, canEdit, ...dialog }: ListProps) {
  const { run, error } = useRun();
  const [filter, setFilter] = useState<"all" | "positive" | "negative" | "guidance">("all");
  const [editing, setEditing] = useState<FeedbackView | null>(null);
  const shown = entries.filter((e) => filter === "all" || e.kind === filter);
  const count = (k: string) => entries.filter((e) => e.kind === k).length;

  return (
    <div className="flex flex-col gap-3">
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
      {shown.length === 0 ? (
        <Empty>No feedback here.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/40">
          {shown.map((e) => {
            const k = SAID[e.kind] ?? SAID.guidance;
            return (
              <Row
                key={e.id}
                e={e}
                canEdit={canEdit}
                onEdit={() => setEditing(e)}
                run={run}
                lead={<Tile Icon={k.Icon} tone={k.tone} />}
                tags={
                  <span className={`flex items-center gap-1.5 ${k.text}`}>
                    {e.kind !== "guidance" && (
                      <span className="font-medium tabular-nums">
                        {e.kind === "positive" ? "+" : "−"}
                        {e.points ?? dialog.scoring.praisePoints}
                      </span>
                    )}
                    {k.label}
                  </span>
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
