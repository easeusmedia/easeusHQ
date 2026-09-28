"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleSlash, Crosshair, MessageSquare, PenLine, Plus, RotateCcw, StickyNote, Target, ThumbsUp, Trash2, X, type LucideIcon } from "lucide-react";
import { ENTRY_KINDS, MISTAKE_CATEGORIES, PART_LABEL, monthName, shiftMonth, type Grade, type Part, type Targets } from "@/lib/editorKpi";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { Reveal } from "../Reveal";
import { Stepper } from "../Stepper";
import { ConfirmButton } from "../ConfirmButton";
import { acceptAll, addFocusArea, deleteEntry, deleteFocusArea, logEntry, reviewEntry, saveKpiTargets, setFocusImproved, setTaskExcluded, updateEntry, type EntryInput } from "./actions";

// ---------- header ----------

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

// a number field that takes decimals (0.5 mistakes a video), no spinners
function Num({ value, onChange, suffix, wide }: { value: number; onChange: (n: number) => void; suffix?: string; wide?: boolean }) {
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
        className={`${wide ? "w-20" : "w-16"} rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm tabular-nums text-foreground`}
      />
      {suffix && <span className="text-xs text-muted">{suffix}</span>}
    </span>
  );
}

// The team's targets, how much each part counts and what each kind of work
// weighs, set by the admin, opening under the page title.
export function TargetsEditor({ targets, kinds }: { targets: Targets; kinds: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(targets);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = Object.values(draft.weights).reduce((a, b) => a + b, 0);
  const unlisted = kinds.filter((k) => !(k in draft.typeWeights));

  async function save() {
    setSaving(true);
    const res = await saveKpiTargets(draft);
    setSaving(false);
    if (res.error) return setError(res.error);
    setError(null);
    setOpen(false);
    router.refresh();
  }

  const label = "flex flex-col gap-1.5 text-xs text-muted";
  return (
    <>
      <button onClick={() => setOpen((o) => !o)} className="btn btn-ghost flex items-center gap-1.5">
        <Target size={14} /> Targets
      </button>
      <div className="order-last basis-full">
        <Reveal open={open}>
          <div className="mt-1 grid gap-6 rounded-2xl border border-border bg-surface-2/30 p-5 lg:grid-cols-3">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">Targets</p>
              <div className={label}>
                Output a month
                <Num value={draft.output} onChange={(n) => setDraft({ ...draft, output: n })} suffix="weighted videos" />
              </div>
              <div className={label}>
                Mistakes per video, at most
                <Num value={draft.mistakesPerVideo} onChange={(n) => setDraft({ ...draft, mistakesPerVideo: n })} />
              </div>
              <div className={label}>
                Times sent back per video, at most
                <Num value={draft.revisions} onChange={(n) => setDraft({ ...draft, revisions: n })} />
              </div>
              <div className={label}>
                First drafts on time
                <Num value={draft.onTimePct} onChange={(n) => setDraft({ ...draft, onTimePct: n })} suffix="% or more" />
              </div>
              <div className={label}>
                Turnaround, shown but not scored
                <Num value={draft.draftHours} onChange={(n) => setDraft({ ...draft, draftHours: n })} suffix="hours to a first draft" />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">How much each part counts</p>
              {(Object.keys(PART_LABEL) as Part[]).map((part) => (
                <div key={part} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">{PART_LABEL[part]}</span>
                  <Num value={draft.weights[part]} onChange={(n) => setDraft({ ...draft, weights: { ...draft.weights, [part]: n } })} suffix="%" />
                </div>
              ))}
              <p className={`text-xs ${total === 100 ? "text-muted" : "text-foreground"}`}>
                Total {total}%{total === 100 ? "" : ". The score scales them either way."}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">What each kind of work counts as</p>
              {Object.entries(draft.typeWeights).map(([kind, w]) => (
                <div key={kind} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-muted">{kind}</span>
                  <span className="flex items-center gap-1">
                    <Num value={w} onChange={(n) => setDraft({ ...draft, typeWeights: { ...draft.typeWeights, [kind]: n } })} suffix="videos" />
                    <button
                      onClick={() => {
                        const next = { ...draft.typeWeights };
                        delete next[kind];
                        setDraft({ ...draft, typeWeights: next });
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
                <Dropdown
                  value=""
                  placeholder="Add a kind of work"
                  size="sm"
                  options={unlisted.map((k) => ({ value: k, label: k }))}
                  onChange={(k) => k && setDraft({ ...draft, typeWeights: { ...draft.typeWeights, [k]: 1 } })}
                />
              )}
              <p className="text-xs text-muted">Anything not listed, and untagged videos, count as 1.</p>
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

// ---------- marks ----------

// The month's score and its letter, in one quiet block
export function ScoreBadge({ score, grade, size = "md" }: { score: number | null; grade: Grade | null; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "h-9 min-w-9 px-2 text-sm", md: "h-12 min-w-12 px-2.5 text-lg", lg: "h-16 min-w-16 px-3 text-2xl" }[size];
  return (
    <span
      title={score === null ? "Nothing to score yet this month" : `Score ${score} out of 100`}
      className={`inline-flex shrink-0 flex-col items-center justify-center rounded-xl bg-surface-2 ring-1 ring-border ${box}`}
    >
      <span className={`font-semibold leading-none tabular-nums ${score === null ? "text-muted" : ""}`}>{score ?? "–"}</span>
      {grade && <span className="mt-1 text-[10px] font-medium leading-none text-muted">{grade}</span>}
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
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${points ?? 0}%` }} />
      </div>
      {note && <p className="mt-1 truncate text-[11px] text-muted">{note}</p>}
    </div>
  );
}

// The score week by week over the last four weeks, oldest on the left
export function WeekStrip({ weeks, labels }: { weeks: (number | null)[]; labels: string[] }) {
  return (
    <div className="flex h-9 items-end gap-1" title={weeks.map((w, i) => `${labels[i]}: ${w ?? "–"}`).join(" · ")}>
      {weeks.map((w, i) => (
        <span
          key={i}
          className={`w-2.5 rounded-t-[3px] ${w === null ? "bg-foreground/[0.07]" : i === weeks.length - 1 ? "bg-accent" : "bg-accent/35"}`}
          style={{ height: w === null ? 3 : Math.max(3, (w / 100) * 36) }}
        />
      ))}
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

const KIND_ICON: Record<string, LucideIcon> = {
  mistake: CircleAlert,
  creative: MessageSquare,
  praise: ThumbsUp,
  note: StickyNote,
};
function KindIcon({ kind, size, className }: { kind: string; size: number; className?: string }) {
  const Icon = KIND_ICON[kind] ?? StickyNote;
  return <Icon size={size} className={className} />;
}
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
  { key: "review", label: "To confirm" },
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
  const waiting = (e: EntryRow) => !e.reviewed && e.kind === "mistake";
  const pending = entries.filter(waiting).length;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>(pending ? "review" : "all");
  const [editing, setEditing] = useState<EntryRow | null>(null);
  const shown = entries.filter((e) => (filter === "all" ? true : filter === "review" ? waiting(e) : e.kind === filter));

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
            Frame.io comments Claude sorted as mistakes. Each counts towards the score once you confirm it.
          </span>
          <button
            onClick={async () => {
              await acceptAll(shown.map((e) => e.id));
              router.refresh();
            }}
            className="btn btn-xs btn-glow flex items-center gap-1"
          >
            <Check size={11} /> Confirm all
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">Nothing here this month.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {shown.map((e) => (
            <li key={e.id} className={`group flex items-start gap-3 px-4 py-3 ${waiting(e) ? "bg-accent/[0.04]" : "bg-surface/40"}`}>
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

// ---------- focus areas ----------

export type FocusRow = {
  id: string;
  title: string;
  category: string | null;
  since: string;
  improved: string | null;
  cameUp: number;
  lastSeen: string | null;
  quiet: boolean;
};

// What an editor is working on improving. Each stays open, week after week,
// until ops marks it improved; one that tracks a kind of mistake shows
// whether it's still coming up, and asks once it's been quiet for a month.
export function FocusAreas({ editorId, rows }: { editorId: string; rows: FocusRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", category: "" });
  const [showImproved, setShowImproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = rows.filter((r) => !r.improved);
  const improved = rows.filter((r) => r.improved);

  async function run(fn: () => Promise<{ error?: string }>) {
    const res = await fn();
    if (res.error) return setError(res.error);
    setError(null);
    router.refresh();
  }

  async function add() {
    await run(() => addFocusArea({ editorId, title: form.title, category: form.category, note: "" }));
    setForm({ title: "", category: "" });
    setAdding(false);
  }

  const status = (r: FocusRow) =>
    !r.category
      ? `Since ${shortDay(r.since)}`
      : r.cameUp
        ? `Since ${shortDay(r.since)} · came up ${r.cameUp} time${r.cameUp === 1 ? "" : "s"}, last on ${shortDay(r.lastSeen!)}`
        : `Since ${shortDay(r.since)} · hasn't come up since`;

  return (
    <section className="rounded-2xl border border-border bg-surface-2/30 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Focus areas</h2>
          <p className="mt-0.5 text-xs text-muted">What they&apos;re working on improving. Each stays until it has.</p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn btn-xs btn-ghost flex items-center gap-1">
            <Plus size={12} /> Add
          </button>
        )}
      </div>

      <Reveal open={adding}>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && form.title.trim() && add()}
            placeholder="e.g. Sound design"
            className="min-w-48 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
          />
          <div className="w-56">
            <Dropdown
              value={form.category}
              placeholder="Track a kind of mistake"
              onChange={(v) => setForm({ ...form, category: v })}
              options={[{ value: "", label: "Don't track one" }, ...MISTAKE_CATEGORIES.map((c) => ({ value: c, label: c }))]}
            />
          </div>
          <button onClick={() => setAdding(false)} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button onClick={add} disabled={!form.title.trim()} className="btn btn-sm btn-glow disabled:opacity-50">
            Add
          </button>
        </div>
      </Reveal>

      {open.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nothing open right now.</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {open.map((r) => (
            <li key={r.id} className="group flex items-center gap-3 bg-surface/40 px-4 py-3">
              <Crosshair size={14} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {r.title}
                  {r.category && r.category !== r.title && <span className="ml-2 text-xs font-normal text-muted">{r.category}</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {status(r)}
                  {r.quiet && <span className="text-foreground/80"> · Quiet for four weeks. Improved?</span>}
                </p>
              </div>
              <button
                onClick={() => run(() => deleteFocusArea(r.id))}
                aria-label="Remove"
                className="grid size-7 shrink-0 place-items-center rounded-md text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
              >
                <Trash2 size={13} />
              </button>
              <button onClick={() => run(() => setFocusImproved(r.id, true))} className={`btn btn-xs flex shrink-0 items-center gap-1 ${r.quiet ? "btn-glow" : "btn-ghost"}`}>
                <Check size={12} /> Improved
              </button>
            </li>
          ))}
        </ul>
      )}

      {improved.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setShowImproved((v) => !v)} className="flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <ChevronDown size={12} className={`transition-transform duration-200 ${showImproved ? "rotate-180" : ""}`} />
            Improved ({improved.length})
          </button>
          <Reveal open={showImproved}>
            <ul className="mt-2 flex flex-col gap-1.5">
              {improved.map((r) => (
                <li key={r.id} className="flex items-center gap-3 text-sm text-muted">
                  <Check size={12} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate">
                    {r.title} <span className="text-xs">· improved {shortDay(r.improved!)}</span>
                  </span>
                  <button onClick={() => run(() => setFocusImproved(r.id, false))} className="flex items-center gap-1 text-xs hover:text-foreground">
                    <RotateCcw size={11} /> Reopen
                  </button>
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
