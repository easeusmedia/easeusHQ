"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarDays, Check, ChevronDown, CircleAlert, CircleCheck, CircleDashed, Columns3, FileText, FolderOpen, Hash, Inbox, Plus, Rows3, Search, Sun, Sunrise, Trash2, Type, User } from "lucide-react";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { StatusSelect } from "../StatusSelect";
import { TaskDetailsDialog } from "../TaskDetailsDialog";
import { WorkTaskDialog, type Project } from "./WorkTaskDialog";
import { createTask, deleteTask, moveTask } from "../actions";
import { createWorkTask, deleteWorkTask, moveWorkTask } from "./actions";
import { ConfirmButton } from "../ConfirmButton";
import { addDays, dayOf, daysBetween, mondayOf, shortDay, weekday } from "@/lib/editorKpi";
import { availableStatuses, workflowOf, type Role } from "@/lib/workflow";
import type { TaskCardData } from "../TaskCard";
import type { TaskTagOption } from "../TaskTagPicker";
import type { WorkTaskCardData } from "./WorkTaskCard";
import { useFrozen } from "../FrozenTasks";

export type TodoKind = { id: string; name: string; workflow: string; clientFacing: boolean; department: string | null };
type Done = { id: string; title: string; kind: "todo" | "task"; workflow?: string; at: string; client: string | null };

// one row, from either kind of task: a to-do of your own, or client work
type Item = {
  key: string;
  id: string;
  title: string;
  notes: string | null;
  due: string | null;
  delivery: string | null;
  client: string | null;
  project: string | null;
  tag: string | null;
  person: string | null;
  todo?: WorkTaskCardData;
  task?: TaskCardData;
};

// both kinds of task as the list's rows
function itemsOf(todos: WorkTaskCardData[], tasks: TaskCardData[]): Item[] {
  return [
    ...todos.map((t) => ({
      key: `w${t.id}`,
      id: t.id,
      title: t.title,
      notes: t.notes,
      due: t.dueDate,
      delivery: null,
      client: t.project?.client.name ?? null,
      project: t.project?.name ?? null,
      tag: t.tags[0]?.name ?? null,
      person: t.assignedTo?.name ?? null,
      todo: t,
    })),
    ...tasks.map((t) => ({
      key: `t${t.id}`,
      id: t.id,
      title: t.title,
      notes: t.editingNotes,
      due: t.dueDate ? dayOf(new Date(t.dueDate)) : null,
      delivery: t.deliveryDate ? dayOf(new Date(t.deliveryDate)) : null,
      client: t.project.client.name,
      project: t.project.name || t.project.type,
      tag: t.tags[0]?.name ?? null,
      person: t.assignedTo?.name ?? null,
      task: t,
    })),
  ];
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Today", "Tomorrow", "Fri 3 Oct"
function dayLabel(day: string, today: string) {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  return `${WEEKDAY[weekday(day)]} ${shortDay(day)}`;
}

// a row's date, said the useful way: late by how much, or which day
function dueLabel(due: string, today: string): { text: string; tone: string } {
  if (due < today) {
    const n = daysBetween(due, today);
    return { text: `${n} ${n === 1 ? "day" : "days"} late`, tone: "text-rose-300" };
  }
  return { text: dayLabel(due, today), tone: due === today ? "text-amber-300" : "text-muted" };
}

type Env = {
  today: string;
  projects: Project[];
  assignees: { id: string; name: string }[];
  editors: { id: string; name: string }[];
  taskTags: TaskTagOption[];
  actingUserId: string;
  actingRole: Role;
};

type Filter = "all" | "today" | "upcoming" | "overdue" | "none";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "overdue", label: "Overdue" },
  { key: "none", label: "No date" },
];
const WIDE_KEY = "mytasks.wide";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// what's been finished, over which stretch
type Period = "week" | "month" | "last" | "all" | "range";
const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last", label: "Last month" },
  { key: "all", label: "All time" },
  { key: "range", label: "Pick dates" },
];
// the yyyy-mm a day's month is, and the one before
const monthOf = (day: string) => day.slice(0, 7);
const monthBefore = (day: string) => {
  const [y, m] = day.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

// each section's icon, as Notion marks its pages
function SectionIcon({ id, today }: { id: string; today: string }) {
  if (id === "overdue") return <CircleAlert size={15} className="text-rose-300" />;
  if (id === "none") return <Inbox size={15} className="text-muted" />;
  if (id === today) return <Sun size={15} className="text-amber-300" />;
  if (id === addDays(today, 1)) return <Sunrise size={15} className="text-sky-300" />;
  return <CalendarDays size={15} className="text-muted" />;
}

// Your work as a to-do list, the way a to-do app lays it out: what's late,
// today, each day ahead, and what has no date, with the last week's
// finished below. Filter it, search it, read it narrow (compact) or across
// the page with its columns (full). A to-do (and client work that's a to-do)
// is ticked off, with a moment to undo; a video or design moves through its
// stages from the pill on its row. N adds a task; / searches.
export function TodoList({
  todos,
  tasks,
  done,
  kinds,
  ...env
}: Env & {
  todos: WorkTaskCardData[];
  tasks: TaskCardData[];
  done: Done[];
  kinds: TodoKind[];
}) {
  const router = useRouter();
  // ticked off here: checked for a moment, then gone before the refresh brings the list back
  const [ticking, setTicking] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<Item | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [period, setPeriod] = useState<Period>("week");
  const [range, setRange] = useState({ from: "", to: "" });
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [wide, setWide] = useState(false);
  // N opens a fresh composer: a new key mounts it open
  const [composing, setComposing] = useState(0);
  const search = useRef<HTMLInputElement>(null);

  // the saved width, once in the browser
  useEffect(() => {
    try {
      setWide(localStorage.getItem(WIDE_KEY) === "1"); // eslint-disable-line react-hooks/set-state-in-effect
    } catch {}
  }, []);
  function setWidth(next: boolean) {
    setWide(next);
    try {
      localStorage.setItem(WIDE_KEY, next ? "1" : "0");
    } catch {}
  }

  // N to add, / to search, unless already typing somewhere
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, [contenteditable], dialog[open]")) return;
      if (e.key === "n") {
        e.preventDefault();
        setComposing((n) => n + 1);
      } else if (e.key === "/") {
        e.preventDefault();
        search.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const all: Item[] = useMemo(() => itemsOf(todos, tasks).filter((i) => !gone.has(i.key)), [todos, tasks, gone]);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((i) => [i.title, i.client ?? "", i.project ?? "", i.notes ?? ""].some((v) => v.toLowerCase().includes(q))) : all;
  }, [all, query]);
  const inFilter = (i: Item, f: Filter) =>
    f === "all" || (f === "today" ? i.due === env.today : f === "upcoming" ? !!i.due && i.due > env.today : f === "overdue" ? !!i.due && i.due < env.today : !i.due);

  const sections = useMemo(() => {
    const shown = items.filter((i) => inFilter(i, filter));
    const byDue = (a: Item, b: Item) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.title.localeCompare(b.title);
    const overdue = shown.filter((i) => i.due && i.due < env.today).sort(byDue);
    const days = [...new Set(shown.filter((i) => i.due && i.due >= env.today).map((i) => i.due!))].sort();
    const none = shown.filter((i) => !i.due);
    return [
      ...(overdue.length ? [{ key: "overdue", title: "Overdue", items: overdue }] : []),
      ...days.map((d) => ({ key: d, title: dayLabel(d, env.today), items: shown.filter((i) => i.due === d) })),
      ...(none.length ? [{ key: "none", title: "No date", items: none }] : []),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inFilter reads only filter and today
  }, [items, filter, env.today]);

  async function tick(item: Item) {
    setError(null);
    setTicking((t) => new Set(t).add(item.key));
    // a beat to see it ticked
    await new Promise((r) => setTimeout(r, 450));
    setGone((g) => new Set(g).add(item.key));
    const res = item.todo ? await moveWorkTask(item.id, "done", item.todo.sortOrder) : await moveTask(item.id, "delivered_and_uploaded");
    setTicking((t) => {
      const next = new Set(t);
      next.delete(item.key);
      return next;
    });
    if (res.error) {
      setGone((g) => {
        const next = new Set(g);
        next.delete(item.key);
        return next;
      });
      return setError(res.error);
    }
    setUndo(item);
    router.refresh();
  }
  // the undo offer fades after a few seconds
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(t);
  }, [undo]);

  // deleted with a reason (kept in History); gone at once, back if it fails
  async function remove(item: Item, reason: string) {
    setError(null);
    setGone((g) => new Set(g).add(item.key));
    const res = item.todo ? await deleteWorkTask(item.id, reason) : await deleteTask(item.id, reason);
    if (res.error) {
      setGone((g) => new Set([...g].filter((k) => k !== item.key)));
      return setError(res.error);
    }
    router.refresh();
  }

  // what's been finished in the chosen stretch, newest first, by month
  const finished = useMemo(() => {
    const t = env.today;
    const inPeriod = (day: string) =>
      period === "week"
        ? day >= mondayOf(t)
        : period === "month"
          ? monthOf(day) === monthOf(t)
          : period === "last"
            ? monthOf(day) === monthBefore(t)
            : period === "range"
              ? (!range.from || day >= range.from) && (!range.to || day <= range.to)
              : true;
    const shown = done.filter((d) => inPeriod(dayOf(new Date(d.at))));
    const months = new Map<string, Done[]>();
    for (const d of shown) {
      const m = monthOf(dayOf(new Date(d.at)));
      months.set(m, [...(months.get(m) ?? []), d]);
    }
    return { count: shown.length, months: [...months.entries()] };
  }, [done, period, range, env.today]);

  async function reopen(d: { id: string; kind: "todo" | "task" }) {
    setError(null);
    const res = d.kind === "todo" ? await moveWorkTask(d.id, "todo", 0) : await moveTask(d.id, "queued");
    if (res.error) return setError(res.error);
    setGone((g) => new Set([...g].filter((k) => k !== `${d.kind === "todo" ? "w" : "t"}${d.id}`)));
    router.refresh();
  }

  // full width's columns: Client and Stage only when a task fills them (a
  // stage is a video's or design's; a plain to-do has none)
  const cols = {
    client: all.some((i) => i.client),
    stage: all.some((i) => (i.task && workflowOf(i.task.workflow) !== "todo") || i.tag),
  };
  const grid = { "--cols": ["18px", "minmax(0,1fr)", cols.client && "14rem", "8rem", cols.stage && "10rem", "1.5rem"].filter(Boolean).join(" ") } as React.CSSProperties;

  const doneWeek = done.filter((d) => dayOf(new Date(d.at)) >= mondayOf(env.today)).length;
  const progress = doneWeek + all.length ? Math.round((doneWeek / (doneWeek + all.length)) * 100) : 0;

  return (
    <div className={`mx-auto flex w-full flex-col gap-6 transition-[max-width] duration-500 ease-out ${wide ? "max-w-[120rem]" : "max-w-3xl"}`}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My tasks</h1>
            <p className="mt-1.5 text-sm text-muted">
              <span className="text-foreground/85 tabular-nums">{all.length}</span> to do · <span className="text-foreground/85 tabular-nums">{doneWeek}</span> done this week
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex h-9 w-52 items-center gap-2 rounded-full bg-white/[0.04] px-3 ring-1 ring-white/[0.07] transition-shadow focus-within:ring-accent/40">
            <Search size={14} className="shrink-0 text-muted" />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())}
              placeholder="Search"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none! placeholder:text-muted/60"
            />
            <kbd className="rounded border border-white/10 px-1 text-[10px] text-muted/70">/</kbd>
          </label>
          {/* narrow and dense, or across the page with its columns */}
          <div className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
            {[
              { on: false, label: "Compact", Icon: Rows3 },
              { on: true, label: "Full width", Icon: Columns3 },
            ].map((v) => (
              <button
                key={v.label}
                type="button"
                aria-pressed={wide === v.on}
                onClick={() => setWidth(v.on)}
                title={v.label}
                className="seg flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              >
                <v.Icon size={13} />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* this week: done against what's left */}
      <div className="-mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]">
        <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const n = items.filter((i) => inFilter(i, f.key)).length;
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(f.key)}
                className="chip flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
              >
                {f.label}
                <span className={`tabular-nums ${on ? "text-accent" : "opacity-70"}`}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Composer key={composing} startOpen={composing > 0} kinds={kinds} {...env} />
      {error && <p className="fade-in -mt-3 text-sm text-red-300">{error}</p>}

      {sections.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-12 text-center">
          <CircleCheck size={22} className="text-accent" />
          <p className="text-sm text-muted">{query ? "Nothing matches that." : filter === "all" ? "Nothing on your list. Press N to add something." : "Nothing here."}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {wide && (
            // the columns, named as a Notion table names them
            <div style={grid} className="hidden grid-cols-(--cols) items-center gap-3 border-b border-border/60 px-3 pb-2 text-[11px] font-medium tracking-wide text-muted uppercase md:grid">
              <span />
              <span className="flex items-center gap-1.5">
                <Type size={12} /> Task
              </span>
              {cols.client && (
                <span className="flex items-center gap-1.5">
                  <Building2 size={12} /> Client
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <CalendarDays size={12} /> Due
              </span>
              {cols.stage && (
                <span className="flex items-center gap-1.5">
                  <CircleDashed size={12} /> Stage
                </span>
              )}
            </div>
          )}
          {sections.map((s) => {
            const open = !folded.has(s.key);
            return (
              <section key={s.key} className="fade-in flex flex-col">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setFolded((f) => (f.has(s.key) ? new Set([...f].filter((k) => k !== s.key)) : new Set(f).add(s.key)))}
                  className="group/head flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-semibold"
                >
                  <ChevronDown size={14} className={`text-muted transition-transform duration-300 ${open ? "" : "-rotate-90"}`} />
                  <SectionIcon id={s.key} today={env.today} />
                  <span className={s.key === "overdue" ? "text-rose-300" : undefined}>{s.title}</span>
                  <span className="rounded-full bg-white/[0.06] px-1.5 text-xs font-normal text-muted tabular-nums">{s.items.length}</span>
                </button>
                <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden pt-1" inert={!open}>
                    {s.items.map((i) => (
                      <Row
                        key={i.key}
                        item={i}
                        wide={wide}
                        cols={cols}
                        grid={grid}
                        ticked={ticking.has(i.key)}
                        showDue={wide || s.key === "overdue"}
                        onTick={() => tick(i)}
                        // client work is deleted by Level 1 and 2; your own to-dos by you
                        onDelete={i.todo || env.actingRole !== "employee" ? (reason) => remove(i, reason) : undefined}
                        {...env}
                      />
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <section className="flex flex-col gap-2">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="flex items-center gap-2 self-start rounded-lg px-1 py-1.5 text-sm text-muted transition-colors hover:text-foreground">
            <ChevronDown size={14} className={`transition-transform duration-300 ${showDone ? "" : "-rotate-90"}`} />
            <CircleCheck size={15} className="text-emerald-400" />
            Completed <span className="tabular-nums">{finished.count}</span>
            <span className="text-muted/60">· {PERIODS.find((p) => p.key === period)!.label.toLowerCase()}</span>
          </button>
          {showDone && (
            <div className="fade-in flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-1.5 px-1">
                {PERIODS.map((p) => {
                  const on = period === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPeriod(p.key)}
                      className="chip rounded-full px-3 py-1 text-xs"
                    >
                      {p.label}
                    </button>
                  );
                })}
                {period === "range" && (
                  <span className="fade-in flex items-center gap-1.5 text-xs text-muted">
                    <DatePicker value={range.from} onChange={(v) => setRange((r) => ({ ...r, from: v }))} placeholder="Start date" pill={{ icon: <CalendarDays size={12} className="text-emerald-400" /> }} />
                    <span className="text-muted/60">–</span>
                    <DatePicker value={range.to} onChange={(v) => setRange((r) => ({ ...r, to: v }))} placeholder="End date" pill={{ icon: <CalendarDays size={12} className="text-emerald-400" /> }} />
                  </span>
                )}
              </div>
              {finished.count === 0 ? (
                <p className="px-3 py-2 text-sm text-muted">Nothing finished in this stretch.</p>
              ) : (
                finished.months.map(([m, list]) => (
                  <div key={m} className="flex flex-col gap-0.5">
                    <p className="px-3 pt-1 pb-0.5 text-xs font-medium text-muted">
                      {MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)} <span className="text-muted/60 tabular-nums">· {list.length}</span>
                    </p>
                    {list.map((d) => {
                      const reopenable = d.kind === "todo" || workflowOf(d.workflow) === "todo";
                      return (
                        <div key={`${d.kind}${d.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.03]">
                          <button
                            type="button"
                            disabled={!reopenable}
                            onClick={() => reopen(d)}
                            aria-label="Mark not done"
                            title={reopenable ? "Mark not done" : "Finished"}
                            className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-accent/80 text-background transition-opacity enabled:hover:opacity-70"
                          >
                            <Check size={11} strokeWidth={3} />
                          </button>
                          <span className="min-w-0 flex-1 truncate text-sm text-muted line-through decoration-muted/50">{d.title}</span>
                          {d.client && <span className="hidden shrink-0 text-xs text-muted/70 sm:block">{d.client}</span>}
                          <span className="w-14 shrink-0 text-right text-xs text-muted/70 tabular-nums">{shortDay(dayOf(new Date(d.at)))}</span>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      )}

      {/* just ticked: a moment to take it back */}
      {undo && (
        <div className="pop-in panel fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full py-2 pr-2 pl-4 text-sm shadow-xl">
          <CircleCheck size={15} className="text-emerald-400" />
          <span className="max-w-60 truncate">{undo.title}</span>
          <button
            type="button"
            onClick={() => {
              const it = undo;
              setUndo(null);
              reopen({ id: it.id, kind: it.todo ? "todo" : "task" });
            }}
            className="rounded-full bg-white/[0.08] px-3 py-1 text-xs font-medium transition-colors hover:bg-white/[0.14]"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

function Row({
  item,
  wide,
  ticked,
  showDue,
  onTick,
  today,
  projects,
  assignees,
  editors,
  taskTags,
  actingUserId,
  actingRole,
  onDelete,
  cols,
  grid,
}: Env & {
  item: Item;
  wide: boolean;
  ticked: boolean;
  showDue: boolean;
  onTick: () => void;
  onDelete?: (reason: string) => void;
  // which of full width's columns the list has, and their sizes
  cols: { client: boolean; stage: boolean };
  grid: React.CSSProperties;
}) {
  const frozen = useFrozen();
  const ref = useRef<{ open: () => void }>(null);
  const task = item.task;
  const flow = workflowOf(task?.workflow);
  // a to-do is ticked off; a video or design moves by its stages
  const tickable = !!item.todo || flow === "todo";
  const due = item.due ? dueLabel(item.due, today) : null;
  const stage =
    task && flow !== "todo" ? (
      <div onClick={(e) => e.stopPropagation()}>
        <StatusSelect
          taskId={task.id}
          currentStatus={task.status}
          options={availableStatuses(task.status, { role: actingRole, isAssignee: true }, task.workflow)}
          links={{ frameioLink: task.frameioLink, driveLink: task.driveLink }}
          variant="pill"
          workflow={task.workflow}
        />
      </div>
    ) : item.tag ? (
      <span className="flex items-center gap-0.5 text-xs text-muted">
        <Hash size={11} />
        {item.tag}
      </span>
    ) : null;
  const del = onDelete ? (
    <span onClick={(e) => e.stopPropagation()} className="opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
      <ConfirmButton message={`Delete "${item.title}"?`} reason="Reason" onConfirm={onDelete} className="flex size-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-white/[0.08] hover:text-red-300">
        <Trash2 size={13} aria-label="Delete task" />
      </ConfirmButton>
    </span>
  ) : (
    <span />
  );
  const client = item.client && (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
      <Building2 size={12} className="shrink-0 text-sky-400/80" />
      <span className="truncate">
        {item.client}
        {item.project && item.project !== item.client && <span className="text-muted/60"> / {item.project}</span>}
      </span>
    </span>
  );

  return (
    <div
      {...frozen(item.id)}
      onClick={() => ref.current?.open()}
      style={wide ? grid : undefined}
      className={`group grid cursor-pointer items-center gap-3 rounded-xl px-3 transition-[background-color,opacity] duration-300 hover:bg-white/[0.04] ${ticked ? "opacity-50" : ""} ${
        wide ? "grid-cols-[18px_minmax(0,1fr)_1.5rem] py-2.5 md:grid-cols-(--cols)" : "grid-cols-[18px_minmax(0,1fr)_auto] py-2"
      }`}
    >
      {tickable ? (
        <button
          type="button"
          aria-label="Mark done"
          onClick={(e) => {
            e.stopPropagation();
            if (!ticked) onTick();
          }}
          className={`flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-300 ${
            ticked ? "scale-110 border-accent bg-accent text-background" : "border-muted/50 text-transparent hover:border-accent hover:text-accent"
          }`}
        >
          <Check size={11} strokeWidth={3} />
        </button>
      ) : (
        <span title="Moves through its stages" className="size-[18px] shrink-0 rounded-full border-[1.5px] border-dashed border-muted/40" />
      )}
      <div className="min-w-0">
        <p className={`flex items-center gap-1.5 text-sm leading-snug transition-colors duration-300 ${ticked ? "text-muted line-through" : ""}`}>
          <span className="truncate">{item.title}</span>
          {!wide && item.notes && <FileText size={12} className="shrink-0 text-muted/60" aria-label="Has notes" />}
        </p>
        {wide && item.notes && <p className="mt-0.5 truncate text-xs text-muted">{item.notes}</p>}
      </div>
      {wide ? (
        <>
          {cols.client && <span className="hidden min-w-0 md:block">{client}</span>}
          <span className={`hidden text-xs tabular-nums md:block ${due?.tone ?? "text-muted/50"}`}>{due?.text ?? "No date"}</span>
          {cols.stage && <span className="hidden md:block">{stage}</span>}
          {del}
        </>
      ) : (
        <span className="flex items-center gap-3">
          <span className="hidden max-w-40 sm:block">{client}</span>
          {showDue && due && <span className={`text-xs tabular-nums ${due.tone}`}>{due.text}</span>}
          {stage}
          {del}
        </span>
      )}
      <span onClick={(e) => e.stopPropagation()} className="contents">
        {item.todo && <WorkTaskDialog ref={ref} mode="edit" task={item.todo} projects={projects} actingUserId={actingUserId} assignees={assignees} taskTags={taskTags} />}
        {task && (
          <TaskDetailsDialog
            ref={ref}
            task={task}
            clientName={item.client ?? ""}
            editors={editors}
            projects={projects}
            actingUserId={actingUserId}
            actingRole={actingRole}
            taskTags={taskTags}
          />
        )}
      </span>
    </div>
  );
}

// days from today: today, tomorrow, and next Monday
const QUICK_DAYS: [string, (weekdayToday: number) => number][] = [
  ["Today", () => 0],
  ["Tomorrow", () => 1],
  ["Next week", (wd) => (8 - wd) % 7 || 7],
];

// the option that clears a chip, offered only once it holds something
const NONE = "__none";
const blank = { title: "", notes: "", due: "", kindId: "", clientId: "", projectId: "", assignedToId: "" };

// "Add task", the way a to-do app does it: a title, a note, and chips you
// touch only if they apply. A kind of work from your roles decides the
// rest: a video or a design needs its client and goes through its stages;
// anything with a client is client work (on the client's page, in
// History); anything else is a to-do of your own.
export function Composer({
  kinds,
  projects,
  assignees,
  actingUserId,
  startOpen = false,
  onClose,
}: {
  kinds: TodoKind[];
  projects: Project[];
  assignees: { id: string; name: string }[];
  actingUserId: string;
  // Home opens it from its New task button, and hides it again on Cancel
  startOpen?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [open, setOpenState] = useState(startOpen);
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v) onClose?.();
  };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof blank>) => setF((cur) => ({ ...cur, ...patch }));

  // A click anywhere else puts the form away, while nothing is written in it
  // (so a stray click never loses a half-typed task). A click in one of its
  // own menus, or one that only dismisses an open menu, doesn't count.
  const boxRef = useRef<HTMLDivElement>(null);
  const empty = !f.title.trim() && !f.notes.trim();
  useEffect(() => {
    if (!open || !empty) return;
    const away = (e: PointerEvent) => {
      const box = boxRef.current;
      const at = e.target instanceof Element ? e.target : null;
      if (!box || !at || box.contains(at)) return;
      if (at.closest("[popover], dialog, .popover") || box.querySelector('[aria-haspopup][aria-expanded="true"]')) return;
      setOpenState(false);
      onClose?.();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, empty, onClose]);

  const kind = kinds.find((k) => k.id === f.kindId);
  // every kind of work offered here is Production's, and Production's work
  // is always for a client; a plain to-do (no kind) needn't have one
  const needsClient = !!kind;
  const clients = useMemo(() => [...new Map(projects.map((p) => [p.client.id, p.client])).values()], [projects]);
  const clientProjects = projects.filter((p) => p.client.id === f.clientId);

  async function add() {
    if (!f.title.trim()) return;
    if (needsClient && !f.clientId) return setError(`Pick the client this ${kind!.name.toLowerCase()} is for.`);
    setBusy(true);
    setError(null);
    const assignedToId = f.assignedToId || actingUserId;
    let res: { error?: string };
    if (f.clientId) {
      const data = new FormData();
      data.set("title", f.title);
      data.set("clientId", f.clientId);
      data.set("projectId", f.projectId);
      data.set("assignedToId", assignedToId);
      data.set("dueDate", f.due);
      data.set("editingNotes", f.notes);
      data.set("tagsPresent", "1");
      if (kind?.id.startsWith("role:")) data.set("roleId", kind.id.slice(5));
      else if (kind) data.append("tagIds", kind.id);
      data.set("workflow", kind?.workflow ?? "todo");
      // work done for the client that they never receive as a file
      if ((kind?.workflow ?? "todo") === "todo" && !kind?.clientFacing) data.set("internal", "on");
      res = await createTask({}, data);
    } else {
      const role = kind?.id.startsWith("role:") ? kind.id.slice(5) : undefined;
      res = await createWorkTask({ title: f.title, notes: f.notes, dueDate: f.due, tagIds: kind && !role ? [kind.id] : [], roleId: role, projectId: "", links: [], attachments: [], assignedToId });
    }
    setBusy(false);
    if (res.error) return setError(res.error);
    // stays open for the next one, keeping the chips that usually repeat
    setF((cur) => ({ ...blank, due: cur.due, kindId: cur.kindId, clientId: cur.clientId, projectId: cur.projectId, assignedToId: cur.assignedToId }));
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center gap-2.5 self-start text-sm text-muted transition-colors hover:text-foreground"
      >
        <span className="flex size-[18px] items-center justify-center rounded-full text-accent transition-colors group-hover:bg-accent group-hover:text-background">
          <Plus size={15} />
        </span>
        Add task
        <kbd className="rounded border border-white/10 px-1 text-[10px] text-muted/60">N</kbd>
      </button>
    );
  }

  return (
    <div ref={boxRef} className="fade-in rounded-2xl border border-border bg-surface-2/40 p-4">
      <input
        autoFocus
        value={f.title}
        onChange={(e) => set({ title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Task name"
        className="w-full bg-transparent text-sm font-medium outline-none! placeholder:text-muted/60"
      />
      <input
        value={f.notes}
        onChange={(e) => set({ notes: e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
        placeholder="Description"
        className="mt-1 w-full bg-transparent text-xs text-muted outline-none! placeholder:text-muted/50"
      />
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <DatePicker value={f.due} onChange={(v) => set({ due: v })} placeholder="Date" pill={{ icon: <CalendarDays size={12} className="text-emerald-400" /> }} />
        {/* the usual days, one tap each */}
        {!f.due &&
          QUICK_DAYS.map(([label, days]) => (
            <button key={label} type="button" onClick={() => set({ due: addDays(dayOf(new Date()), days(weekday(dayOf(new Date())))) })} className="rounded-full px-2 py-1 text-[11px] text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
              {label}
            </button>
          ))}
        {kinds.length > 0 && (
          <Dropdown
            pill={{ icon: <Hash size={12} className="text-amber-400" /> }}
            value={f.kindId}
            placeholder="Kind of work"
            onChange={(v) => set({ kindId: v === NONE ? "" : v })}
            options={[...(f.kindId ? [{ value: NONE, label: "No kind" }] : []), ...kinds.map((k) => ({ value: k.id, label: k.name, group: k.department ?? undefined }))]}
          />
        )}
        <Dropdown
          pill={{ icon: <Building2 size={12} className="text-sky-400" /> }}
          value={f.clientId}
          placeholder={needsClient ? "Client (needed)" : "Client"}
          search={{ recent: 6, placeholder: "Find a client…" }}
          onChange={(v) => set({ clientId: v === NONE ? "" : v, projectId: "" })}
          options={[...(f.clientId ? [{ value: NONE, label: "No client" }] : []), ...clients.map((c) => ({ value: c.id, label: c.name }))]}
        />
        {f.clientId && clientProjects.length > 1 && (
          <Dropdown
            pill={{ icon: <FolderOpen size={12} className="text-violet-400" /> }}
            value={f.projectId}
            placeholder="Project"
            onChange={(v) => set({ projectId: v })}
            options={clientProjects.map((p) => ({ value: p.id, label: p.name }))}
          />
        )}
        {assignees.length > 1 && (
          <Dropdown
            pill={{ icon: <User size={12} className="text-rose-300" /> }}
            value={f.assignedToId || actingUserId}
            onChange={(v) => set({ assignedToId: v })}
            options={assignees.map((a) => ({ value: a.id, label: a.id === actingUserId ? "Me" : a.name }))}
          />
        )}
      </div>
      {error && <p className="fade-in mt-2 text-xs text-red-300">{error}</p>}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
        <p className="text-xs text-muted">
          {kind ? (kind.workflow === "todo" ? (f.clientId ? "Client work, ticked off when done" : "A to-do") : `Moves through the ${kind.workflow === "design" ? "Design" : "Video"} stages`) : f.clientId ? "Client work, ticked off when done" : "A to-do"}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={add} disabled={busy || !f.title.trim()} className="btn btn-sm btn-glow disabled:opacity-50">
            {busy ? "Adding…" : "Add task"}
          </button>
        </div>
      </div>
    </div>
  );
}
