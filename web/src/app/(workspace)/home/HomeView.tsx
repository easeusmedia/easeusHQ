"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSignature,
  GripVertical,
  Layers,
  ListChecks,
  Maximize2,
  MessageSquare,
  Plus,
  Receipt,
  StickyNote,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { Avatar, type TaskCardData } from "../TaskCard";
import { ADD_BUTTON } from "../AddButton";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { closeOnBackdrop } from "../dialog";
import { moveTask } from "../actions";
import { moveWorkTask } from "../my-tasks/actions";
import { Composer, type TodoKind } from "../my-tasks/TodoList";
import { WorkTaskDialog, type Project } from "../my-tasks/WorkTaskDialog";
import type { WorkTaskCardData } from "../my-tasks/WorkTaskCard";
import { TaskDetailsDialog } from "../TaskDetailsDialog";
import type { TaskTagOption } from "../TaskTagPicker";
import { addDays, daysBetween, shortDay, weekday } from "@/lib/editorKpi";
import { calendarConsentUrl } from "@/lib/driveClient";
import type { Role } from "@/lib/workflow";
import type { Meeting } from "@/lib/googleCalendar";
import { addNotice, clearNotice, scheduleMeeting } from "./actions";

export type HomeItem = {
  key: string;
  id: string;
  source: "task" | "work";
  workflow: string;
  title: string;
  status: string;
  meaning: string;
  pill: string;
  due: string | null;
  delivery: string | null;
  client: string | null;
  department: string | null;
  person: { id: string; name: string } | null;
  strikes: number;
  // the task itself, for its window
  task?: TaskCardData;
  todo?: WorkTaskCardData;
};

export type Notice = {
  key: string;
  id?: string;
  kind: "invoice" | "contract" | "message" | "note" | "overdue" | "shared";
  tone: "rose" | "amber" | "accent" | "neutral";
  text: string;
  sub?: string;
  href?: string;
  // the task it's about (an item's key), to open it
  open?: string;
  // not seen before this visit
  fresh?: boolean;
};

type Env = { editors: { id: string; name: string }[]; projects: Project[]; taskTags: TaskTagOption[]; actingRole: Role; actingUserId: string };

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ADMIN_TASKS = "Admin tasks";

// "11:30 am", in IST
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const istDay = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

// ---------- the layout: sections in two columns, each collapsible and movable ----------

type SectionId = "work" | "mine" | "calendar" | "notices";
type Layout = { columns: SectionId[][]; collapsed: SectionId[] };
const LAYOUT_KEY = "home.layout.v2";
const DEFAULT_LAYOUT: Layout = { columns: [["work"], ["mine", "calendar", "notices"]], collapsed: [] };

// the saved layout, holding only the sections this person has, each once
function readLayout(have: SectionId[]): Layout {
  let saved: Layout | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null");
  } catch {}
  const base = saved && Array.isArray(saved.columns) && saved.columns.length === 2 ? saved : DEFAULT_LAYOUT;
  const seen = new Set<SectionId>();
  const columns = base.columns.map((col) => col.filter((s) => have.includes(s) && !seen.has(s) && seen.add(s)));
  for (const s of have) if (!seen.has(s)) columns[s === "work" ? 0 : 1].push(s);
  return { columns, collapsed: (base.collapsed ?? []).filter((s) => have.includes(s)) };
}

// a section is picked up by its handle and follows the pointer; the others
// slide out of its way (HomeView)
type Drag = { start: (id: SectionId, e: React.PointerEvent) => void; mount: (id: SectionId) => (el: HTMLElement | null) => void; dragging: SectionId | null };
const SLIDE = { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };

function Section({
  id,
  icon,
  title,
  aside,
  count,
  collapsed,
  onCollapse,
  grow = true,
  drag,
  children,
}: {
  id: SectionId;
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
  // how many are waiting, shown even while it's folded
  count?: number;
  collapsed: boolean;
  onCollapse: () => void;
  // fills its share of the column (lists) or keeps to its size (the calendar)
  grow?: boolean;
  drag: Drag;
  children: React.ReactNode;
}) {
  return (
    <section
      ref={drag.mount(id)}
      data-section={id}
      className={`relative flex min-h-0 flex-col rounded-3xl border bg-gradient-to-b from-white/[0.045] to-white/[0.012] transition-[flex-grow,border-color,box-shadow] duration-300 ${
        collapsed ? "flex-none" : grow ? "lg:flex-[1_1_0]" : "flex-none"
      } ${drag.dragging === id ? "z-20 border-accent/30 bg-background/95 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.85)]" : "border-white/[0.07]"}`}
    >
      <header className="flex shrink-0 items-center gap-2 px-4 py-3 sm:px-5">
        <button
          type="button"
          onPointerDown={(e) => drag.start(id, e)}
          aria-label={`Move ${title}`}
          title="Drag to move"
          className="-ml-1.5 cursor-grab touch-none rounded-md p-1 text-muted/50 transition-colors hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </button>
        <span className="flex size-8 items-center justify-center rounded-full bg-white/[0.05] text-foreground/80 ring-1 ring-white/[0.08]">{icon}</span>
        <h2 className="mr-auto flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="truncate">{title}</span>
          {!!count && <span className="rounded-full bg-accent/15 px-1.5 py-px text-[11px] font-medium text-accent tabular-nums">{count}</span>}
        </h2>
        {!collapsed && aside}
        <button type="button" onClick={onCollapse} aria-expanded={!collapsed} aria-label={collapsed ? `Open ${title}` : `Collapse ${title}`} className="rounded-full p-1.5 text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
          <ChevronDown size={15} className={`transition-transform duration-300 ${collapsed ? "-rotate-90" : ""}`} />
        </button>
      </header>
      {!collapsed && <div className="fade-in min-h-0 flex-1 overflow-y-auto px-4 pb-4 max-lg:max-h-[70vh] sm:px-5">{children}</div>}
    </section>
  );
}

// ---------- rows ----------

// "3 days late", "Due today", "Due 3 Oct": the one thing about its date
// worth knowing at a glance, as a pill
function dueText(due: string | null, today: string): { text: string; pill: string } | null {
  if (!due) return null;
  if (due < today) {
    const n = daysBetween(due, today);
    return { text: `${n} ${n === 1 ? "day" : "days"} late`, pill: "bg-rose-400/15 text-rose-300" };
  }
  if (due === today) return { text: "Due today", pill: "bg-amber-400/15 text-amber-300" };
  return { text: `Due ${shortDay(due)}`, pill: "bg-white/[0.07] text-foreground/70" };
}

// one piece of work as a card: what it is, a line under it, whether it's
// late, and who's on it
function WorkCard({ item, today, sub, onOpen }: { item: HomeItem; today: string; sub: string; onOpen: () => void }) {
  const due = dueText(item.due, today);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 text-left ring-1 ring-white/[0.04] transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-white/[0.085]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>
      </div>
      {due && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium tabular-nums ${due.pill}`}>{due.text}</span>}
      {item.person ? <Avatar name={item.person.name} size={28} /> : <span className="size-7 shrink-0 rounded-full border border-dashed border-white/15" title="Not assigned" />}
    </button>
  );
}

// a small switch between views
function Segmented({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${value === o.key ? "bg-white/[0.1] text-foreground" : "text-muted hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- a task's window, opened from anywhere on Home ----------

function TaskWindow({ item, env, assignees }: { item: HomeItem; env: Env; assignees: { id: string; name: string }[] }) {
  const ref = useRef<{ open: () => void }>(null);
  // mounted afresh for each opening (see `open` in HomeView), so it opens at once
  useEffect(() => ref.current?.open(), []);
  if (item.task) {
    return (
      <TaskDetailsDialog
        ref={ref}
        task={item.task}
        clientName={item.client ?? ""}
        editors={env.editors}
        projects={env.projects}
        actingUserId={env.actingUserId}
        actingRole={env.actingRole}
        taskTags={env.taskTags}
      />
    );
  }
  return item.todo ? <WorkTaskDialog ref={ref} mode="edit" task={item.todo} projects={env.projects} actingUserId={env.actingUserId} assignees={assignees} taskTags={env.taskTags} /> : null;
}

// ---------- Home ----------

const VIEWS = [
  { key: "client", label: "Client" },
  { key: "department", label: "Department" },
  { key: "person", label: "Person" },
];
type Show = "active" | "today" | "overdue";

export function HomeView({
  greeting,
  today,
  monday,
  meId,
  showMine,
  canMeet,
  canNote,
  items,
  notices,
  meetings,
  calendar,
  people,
  composer,
  env,
}: {
  greeting: string;
  today: string;
  monday: string;
  meId: string;
  showMine: boolean;
  canMeet: boolean;
  canNote: boolean;
  items: HomeItem[];
  notices: Notice[];
  meetings: Meeting[];
  calendar: { connected: boolean; error: string | null; clientId: string };
  people: { id: string; name: string }[];
  composer: { projects: Project[]; assignees: { id: string; name: string }[]; kinds: TodoKind[] };
  env: Env;
}) {
  const router = useRouter();
  const have = useMemo<SectionId[]>(() => (showMine ? ["work", "mine", "calendar", "notices"] : ["work", "calendar", "notices"]), [showMine]);
  const [layout, setLayout] = useState<Layout>(() => ({ ...DEFAULT_LAYOUT, columns: DEFAULT_LAYOUT.columns.map((c) => c.filter((s) => have.includes(s))) }));
  const [dragging, setDragging] = useState<SectionId | null>(null);
  const [view, setView] = useState("client");
  const [day, setDay] = useState(monday <= today && today < addDays(monday, 7) ? today : monday);
  const [adding, setAdding] = useState(false);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<{ key: string; n: number } | null>(null);
  // which work the list shows: everything active, due today, or overdue
  const [show, setShow] = useState<Show>("active");
  // overdue: all, or only what's been late once, twice, or 3 or more times
  const [times, setTimes] = useState(0);
  const meetingRef = useRef<{ open: (day: string) => void }>(null);
  const fullRef = useRef<HTMLDialogElement>(null);

  // the saved layout, once in the browser (localStorage only exists after mount)
  useEffect(() => {
    const saved = readLayout(have);
    setLayout(saved); // eslint-disable-line react-hooks/set-state-in-effect
  }, [have]);
  function save(next: Layout) {
    setLayout(next);
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
    } catch {}
  }
  // Moving sections: the one picked up follows the pointer (pointer-events
  // off, so what's under it can be found); passing over the top or bottom
  // half of another puts it before or after that one, in either column, and
  // the rest slide to their new places from where they were
  const els = useRef(new Map<SectionId, HTMLElement>());
  const was = useRef<Map<SectionId, DOMRect> | null>(null);
  const grab = useRef<{ id: SectionId; x: number; y: number; left: number; top: number } | null>(null);
  const latest = useRef(layout);
  useEffect(() => {
    latest.current = layout;
  }, [layout]);
  useLayoutEffect(() => {
    const before = was.current;
    was.current = null;
    if (!before) return;
    for (const [id, el] of els.current) {
      const from = before.get(id);
      if (!from || id === grab.current?.id) continue;
      const now = el.getBoundingClientRect();
      const dx = from.left - now.left;
      const dy = from.top - now.top;
      if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], SLIDE);
    }
  }, [layout]);
  function arrange(next: Layout) {
    was.current = new Map([...els.current].map(([id, el]) => [id, el.getBoundingClientRect()]));
    save(next);
  }
  const collapse = (id: SectionId) => arrange({ ...layout, collapsed: layout.collapsed.includes(id) ? layout.collapsed.filter((s) => s !== id) : [...layout.collapsed, id] });

  const drag: Drag = {
    dragging,
    // a section moved to the other column is a new element: keep the latest
    mount: (id) => (el) => {
      if (el) els.current.set(id, el);
      else els.current.delete(id);
    },
    start: (id, e) => {
      const el = els.current.get(id);
      if (!el || e.button !== 0) return;
      e.preventDefault();
      grab.current = { id, x: e.clientX, y: e.clientY, left: el.offsetLeft, top: el.offsetTop };
      setDragging(id);
      const move = (ev: PointerEvent) => {
        const g = grab.current;
        const node = g && els.current.get(g.id);
        if (!g || !node) return;
        // under the pointer wherever its place in the layout has gone
        node.style.pointerEvents = "none";
        node.style.transform = `translate(${ev.clientX - g.x - (node.offsetLeft - g.left)}px, ${ev.clientY - g.y - (node.offsetTop - g.top)}px) scale(1.01)`;
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const over = under?.closest<HTMLElement>("[data-section]");
        const column = under?.closest<HTMLElement>("[data-column]");
        const cur = latest.current;
        const columns = cur.columns.map((c) => c.filter((s) => s !== g.id));
        if (over) {
          const target = over.dataset.section as SectionId;
          const r = over.getBoundingClientRect();
          const col = columns.find((c) => c.includes(target))!;
          col.splice(col.indexOf(target) + (ev.clientY > r.top + r.height / 2 ? 1 : 0), 0, g.id);
        } else if (column && !cur.columns[Number(column.dataset.column)].includes(g.id)) {
          columns[Number(column.dataset.column)].push(g.id);
        } else return;
        if (JSON.stringify(columns) !== JSON.stringify(cur.columns)) arrange({ ...cur, columns });
      };
      const drop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", drop);
        window.removeEventListener("pointercancel", drop);
        const node = grab.current && els.current.get(grab.current.id);
        grab.current = null;
        setDragging(null);
        if (!node) return;
        // settle into its place
        const from = node.style.transform;
        node.style.transform = "";
        node.style.pointerEvents = "";
        if (from) node.animate([{ transform: from }, { transform: "none" }], SLIDE);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", drop);
      window.addEventListener("pointercancel", drop);
    },
  };

  const live = useMemo(() => items.filter((i) => !gone.has(i.key)), [items, gone]);
  const open = (key: string) => setOpened((o) => ({ key, n: (o?.n ?? 0) + 1 }));
  const openItem = opened && items.find((i) => i.key === opened.key);

  const overdue = useMemo(() => live.filter((i) => i.due && i.due < today), [live, today]);
  const dueToday = useMemo(() => live.filter((i) => i.due === today), [live, today]);

  // how many times an overdue task has been late (this time included), 3 and up together
  const lateTimes = (i: HomeItem) => Math.min(Math.max(i.strikes, 1), 3);
  // the work shown (overdue narrowed by how often it's been late), grouped
  // the chosen way, busiest first, oldest date first in each
  const groups = useMemo(() => {
    const list = show === "today" ? dueToday : show === "overdue" ? overdue.filter((i) => times === 0 || lateTimes(i) === times) : live;
    const keyOf = (i: HomeItem) => (view === "client" ? (i.client ?? ADMIN_TASKS) : view === "department" ? (i.department ?? "No department") : (i.person?.name ?? "Not assigned"));
    const byDue = (a: HomeItem, b: HomeItem) => (a.due ?? "9999").localeCompare(b.due ?? "9999");
    const map = new Map<string, HomeItem[]>();
    for (const i of list) map.set(keyOf(i), [...(map.get(keyOf(i)) ?? []), i]);
    return [...map.entries()].map(([name, items]) => ({ name, items: items.sort(byDue) })).sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [live, dueToday, overdue, show, view, times]);
  const LATE_FILTERS = [
    { key: 0, label: "All" },
    { key: 1, label: "Late once" },
    { key: 2, label: "Late twice" },
    { key: 3, label: "Late 3 or more times" },
  ];

  const mine = live.filter((i) => i.person?.id === meId).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const days = Array.from({ length: 7 }, (_, n) => addDays(monday, n));
  const shownDay = days.includes(day) ? day : days.includes(today) ? today : monday;

  async function tick(item: HomeItem) {
    setGone((g) => new Set(g).add(item.key));
    const res = item.source === "work" ? await moveWorkTask(item.id, "done", item.todo?.sortOrder ?? 0) : await moveTask(item.id, "delivered_and_uploaded");
    if (res.error) setGone((g) => new Set([...g].filter((k) => k !== item.key)));
    router.refresh();
  }

  // the greeting's second line: how today looks, the numbers brighter
  const tasks = (n: number) => (n === 1 ? "task is" : "tasks are");
  const summary: [string, boolean?][] =
    dueToday.length && overdue.length
      ? [[String(dueToday.length), true], ["due today and"], [String(overdue.length), true], ["running late."]]
      : dueToday.length
        ? [[String(dueToday.length), true], [`${tasks(dueToday.length)} due today.`]]
        : overdue.length
          ? [[String(overdue.length), true], [`${tasks(overdue.length)} running late.`]]
          : [["Everything is"], ["on track", true], ["today."]];

  const toggles: { key: Show; value: number; label: string; late?: boolean }[] = [
    { key: "active", value: live.length, label: "Active" },
    { key: "today", value: dueToday.length, label: "Due today" },
    { key: "overdue", value: overdue.length, label: "Overdue", late: true },
  ];

  // what's under each card's title: whatever the grouping doesn't already say
  const subOf = (i: HomeItem) => (view === "client" ? (i.person?.name ?? "Not assigned") : [i.client ?? ADMIN_TASKS, view === "department" && i.person?.name].filter(Boolean).join(" · "));
  // the work, as the section shows it and (wide) as the full-screen view does
  const workBody = (wide: boolean) => (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {/* which work: everything active, due today, or overdue */}
        <div role="tablist" aria-label="Show" className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
          {toggles.map((t) => {
            const on = show === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setShow(t.key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-200 ${on ? "bg-accent/20 text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {t.label}
                <span className={`tabular-nums ${on ? "text-accent" : "opacity-70"}`}>{t.value}</span>
              </button>
            );
          })}
        </div>
        <Segmented options={VIEWS} value={view} onChange={setView} />
      </div>
      {show === "overdue" && overdue.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {LATE_FILTERS.map((f) => {
            const n = f.key ? overdue.filter((i) => lateTimes(i) === f.key).length : overdue.length;
            if (f.key && !n) return null;
            const on = times === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={on}
                onClick={() => setTimes(f.key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors duration-200 ${on ? "bg-accent/15 text-foreground ring-1 ring-accent/40" : "bg-white/[0.04] text-muted hover:text-foreground"}`}
              >
                {f.label}
                <span className={`tabular-nums ${on ? "text-accent" : "opacity-70"}`}>{n}</span>
              </button>
            );
          })}
        </div>
      )}
      {groups.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted">{show === "today" ? "Nothing due today." : show === "overdue" ? "Nothing overdue." : "Nothing in progress."}</p>
      ) : (
        <div key={`${show}:${view}:${times}`} className="fade-in flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.name} className="flex flex-col gap-2">
              <p className="flex items-center gap-2 px-1 text-xs font-medium">
                <span className="text-foreground/80">{g.name}</span>
                <span className="text-muted/70 tabular-nums">{g.items.length}</span>
              </p>
              <div className={wide ? "grid gap-2 md:grid-cols-2 2xl:grid-cols-3" : "flex flex-col gap-2"}>
                {g.items.map((i) => (
                  <WorkCard key={i.key} item={i} today={today} sub={subOf(i)} onOpen={() => open(i.key)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const sections: Record<SectionId, React.ReactNode> = {
    work: (
      <Section
        key="work"
        id="work"
        icon={<Layers size={15} />}
        title={showMine ? "Work in progress" : "My work"}
        aside={
          <button type="button" onClick={() => fullRef.current?.showModal()} aria-label="Full screen" title="Full screen" className="rounded-full p-1.5 text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
            <Maximize2 size={14} />
          </button>
        }
        collapsed={layout.collapsed.includes("work")}
        onCollapse={() => collapse("work")}
        drag={drag}
      >
        {workBody(false)}
      </Section>
    ),
    mine: (
      <Section
        key="mine"
        id="mine"
        icon={<ListChecks size={15} />}
        title="My tasks"
        aside={
          <Link href="/my-tasks" className="flex items-center gap-0.5 text-xs text-muted transition-colors hover:text-foreground">
            Open list <ArrowUpRight size={13} />
          </Link>
        }
        collapsed={layout.collapsed.includes("mine")}
        onCollapse={() => collapse("mine")}
        drag={drag}
      >
        {adding && (
          <div className="mb-3">
            <Composer kinds={composer.kinds} projects={composer.projects} assignees={composer.assignees} actingUserId={meId} startOpen onClose={() => setAdding(false)} />
          </div>
        )}
        {mine.length === 0 ? (
          !adding && <p className="px-1 py-2 text-sm text-muted">Nothing on your list.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {mine.map((i) => {
              const tickable = i.source === "work" || i.workflow === "todo";
              const due = dueText(i.due, today);
              return (
                <div key={i.key} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-4 py-3 ring-1 ring-white/[0.04] transition-colors duration-200 hover:bg-white/[0.085]">
                  {tickable ? (
                    <button
                      type="button"
                      aria-label="Mark done"
                      onClick={() => tick(i)}
                      className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-muted/50 text-transparent transition-colors hover:border-accent hover:text-accent"
                    >
                      <Check size={11} strokeWidth={3} />
                    </button>
                  ) : (
                    <span className="size-[18px] shrink-0 rounded-full border-[1.5px] border-dashed border-muted/40" />
                  )}
                  <button type="button" onClick={() => open(i.key)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium">{i.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted">{i.client ?? ADMIN_TASKS}</span>
                  </button>
                  {due && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium tabular-nums ${due.pill}`}>{due.text}</span>}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    ),
    calendar: (
      <CalendarSection
        key="calendar"
        today={today}
        monday={monday}
        day={shownDay}
        setDay={setDay}
        meetings={meetings}
        calendar={calendar}
        collapsed={layout.collapsed.includes("calendar")}
        onCollapse={() => collapse("calendar")}
        drag={drag}
      />
    ),
    notices: (
      <NoticesSection
        key="notices"
        notices={notices}
        canNote={canNote}
        onOpen={(key) => items.some((i) => i.key === key) && open(key)}
        collapsed={layout.collapsed.includes("notices")}
        onCollapse={() => collapse("notices")}
        drag={drag}
      />
    ),
  };

  return (
    // the page's own height: everything below the top bar fills the screen,
    // and each section scrolls inside itself
    <div className="relative isolate flex flex-col gap-4 lg:h-[calc(100dvh-2*var(--page-pad))]">
      {/* the theme's blue, washing down from the top, over a faint dot grid */}
      <div aria-hidden className="pointer-events-none absolute -inset-x-(--page-pad) -top-(--page-pad) -z-10 h-[36rem] bg-[radial-gradient(55%_75%_at_82%_0%,rgb(75_149_230/0.26),transparent_70%),radial-gradient(35%_55%_at_12%_0%,rgb(75_149_230/0.1),transparent_70%)]" />
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-(--page-pad) -top-(--page-pad) -z-10 h-[30rem] [background-image:radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(70%_100%_at_75%_0%,black,transparent)]"
      />

      <header className="flex shrink-0 flex-wrap items-end gap-x-6 gap-y-4 pt-1">
        <div className="mr-auto min-w-0">
          <p className="greet-in text-sm text-muted">
            {WEEKDAY[weekday(today)]}, {Number(today.slice(8, 10))} {MONTH[Number(today.slice(5, 7)) - 1].slice(0, 3)}
          </p>
          <h1 className="greet-in mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl" style={{ animationDelay: "80ms" }}>
            {greeting}
          </h1>
          <p className="greet-in mt-1 text-base text-muted sm:text-lg" style={{ animationDelay: "180ms" }}>
            {summary.map(([text, strong], i) => (
              <span key={i} className={strong ? "font-medium text-foreground" : undefined}>
                {i ? " " : ""}
                {text}
              </span>
            ))}
          </p>
        </div>
        <div className="flex gap-2.5">
          {showMine && (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                if (layout.collapsed.includes("mine")) collapse("mine");
              }}
              className="btn-primary flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-[0_8px_24px_-8px_rgb(75_149_230/0.7)]"
            >
              <Plus size={15} /> New task
            </button>
          )}
          {canMeet && (
            <button
              type="button"
              onClick={() => meetingRef.current?.open(shownDay)}
              className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-foreground/90 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
            >
              <Video size={15} /> New meeting
            </button>
          )}
        </div>
      </header>

      <div className={`relative grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] ${dragging ? "cursor-grabbing select-none" : ""}`}>
        {layout.columns.map((col, i) => (
          <div
            key={i}
            data-column={i}
            className={`flex min-h-0 flex-col gap-4 ${!col.length ? `rounded-3xl border border-dashed transition-colors duration-300 max-lg:hidden ${dragging ? "border-accent/30" : "border-white/[0.08]"}` : ""}`}
          >
            {col.map((id) => sections[id])}
          </div>
        ))}
      </div>

      <dialog ref={fullRef} {...closeOnBackdrop} className="glass fixed inset-3 m-0 size-auto max-h-none max-w-none overflow-hidden rounded-3xl p-0 text-foreground sm:inset-6">
        <div className="flex h-full flex-col">
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4">
            <span className="flex size-8 items-center justify-center rounded-full bg-white/[0.05] text-foreground/80 ring-1 ring-white/[0.08]">
              <Layers size={15} />
            </span>
            <h2 className="mr-auto text-base font-semibold">{showMine ? "Work in progress" : "My work"}</h2>
            <button type="button" aria-label="Close" onClick={() => fullRef.current?.close()} className="rounded-full p-1.5 text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
              <X size={16} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{workBody(true)}</div>
        </div>
      </dialog>
      {openItem && <TaskWindow key={`${opened.key}:${opened.n}`} item={openItem} env={env} assignees={composer.assignees} />}
      {canMeet && <MeetingDialog ref={meetingRef} people={people} connected={calendar.connected} />}
    </div>
  );
}

// ---------- the calendar ----------

function CalendarSection({
  today,
  monday,
  day,
  setDay,
  meetings,
  calendar,
  collapsed,
  onCollapse,
  drag,
}: {
  today: string;
  monday: string;
  day: string;
  setDay: (d: string) => void;
  meetings: Meeting[];
  calendar: { connected: boolean; error: string | null; clientId: string };
  collapsed: boolean;
  onCollapse: () => void;
  drag: Drag;
}) {
  const days = Array.from({ length: 7 }, (_, n) => addDays(monday, n));
  const onDay = meetings.filter((m) => istDay(m.start) === day);
  const arrow = "flex size-7 items-center justify-center rounded-full text-muted ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.06] hover:text-foreground";
  return (
    <Section
      id="calendar"
      icon={<CalendarDays size={15} />}
      title="Calendar"
      grow={false}
      collapsed={collapsed}
      onCollapse={onCollapse}
      drag={drag}
      aside={
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-muted">{MONTH[Number(day.slice(5, 7)) - 1]}</span>
          <Link href={`/home?week=${addDays(monday, -7)}`} scroll={false} aria-label="Previous week" className={arrow}>
            <ChevronLeft size={14} />
          </Link>
          <Link href={`/home?week=${addDays(monday, 7)}`} scroll={false} aria-label="Next week" className={arrow}>
            <ChevronRight size={14} />
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const on = d === day;
          const has = meetings.some((m) => istDay(m.start) === d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-pressed={on}
              className={`flex flex-col items-center gap-1 rounded-2xl py-2 transition-colors ${on ? "bg-accent text-white" : "hover:bg-white/[0.05]"}`}
            >
              <span className={`text-[10px] font-medium tracking-wide uppercase ${on ? "text-white/75" : "text-muted"}`}>{WEEKDAY[weekday(d)]}</span>
              <span className={`text-base leading-none font-semibold tabular-nums ${!on && d === today ? "text-accent" : ""}`}>{Number(d.slice(8, 10))}</span>
              <span className={`size-1 rounded-full ${has ? (on ? "bg-white/80" : "bg-accent") : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {!calendar.connected ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/[0.1] px-5 py-5 text-center">
            <p className="text-xs leading-relaxed text-muted">Connect easeus.media@gmail.com&apos;s Google Calendar to see meetings here.</p>
            {calendar.clientId && (
              <button type="button" onClick={() => window.location.assign(calendarConsentUrl(calendar.clientId, window.location.origin))} className={ADD_BUTTON}>
                <CalendarDays size={14} /> Connect Google Calendar
              </button>
            )}
          </div>
        ) : calendar.error ? (
          <p className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-200">{calendar.error}</p>
        ) : onDay.length === 0 ? (
          <p className="rounded-2xl bg-white/[0.025] px-4 py-4 text-center text-sm text-muted">No meetings {day === today ? "today" : `on ${WEEKDAY[weekday(day)]} ${shortDay(day)}`}</p>
        ) : (
          onDay.map((m) => (
            <div key={m.id} className="flex gap-3">
              <p className="w-14 shrink-0 pt-3 text-right text-xs text-muted tabular-nums">{m.allDay ? "All day" : clock(m.start)}</p>
              <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl bg-accent/[0.09] py-2.5 pr-3 pl-4 ring-1 ring-accent/20">
                <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-accent" />
                <p className="truncate text-sm font-medium">{m.title}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  <Clock size={12} />
                  {m.allDay ? "All day" : `${clock(m.start)} – ${clock(m.end)}`}
                  {m.people > 0 && (
                    <>
                      <Users size={12} className="ml-1.5" /> {m.people}
                    </>
                  )}
                </p>
                {m.meet && (
                  <a href={m.meet} target="_blank" rel="noreferrer" className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-neutral-900 transition-opacity hover:opacity-85">
                    <Video size={12} /> Join Google Meet
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Section>
  );
}

// ---------- notices ----------

const TONE: Record<Notice["tone"], string> = {
  rose: "bg-rose-400/10 text-rose-300",
  amber: "bg-amber-400/10 text-amber-300",
  accent: "bg-accent/10 text-accent",
  neutral: "bg-white/[0.06] text-foreground/70",
};
const NOTICE_ICON: Record<Notice["kind"], React.ReactNode> = {
  invoice: <Receipt size={14} />,
  contract: <FileSignature size={14} />,
  message: <MessageSquare size={14} />,
  note: <StickyNote size={14} />,
  overdue: <Clock size={14} />,
  shared: <UserPlus size={14} />,
};

// What needs this person: their overdue tasks, tasks they've been added to,
// and (Level 1) invoices, contracts, client messages and their own notes
function NoticesSection({
  notices,
  canNote,
  onOpen,
  collapsed,
  onCollapse,
  drag,
}: {
  notices: Notice[];
  canNote: boolean;
  onOpen: (key: string) => void;
  collapsed: boolean;
  onCollapse: () => void;
  drag: Drag;
}) {
  const router = useRouter();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!text.trim()) return setWriting(false);
    setBusy(true);
    const res = await addNotice(text);
    setBusy(false);
    if (res.error) return setError(res.error);
    setText("");
    setWriting(false);
    setError(null);
    router.refresh();
  }

  return (
    <Section
      id="notices"
      icon={<Bell size={15} />}
      title="Notices"
      count={notices.length}
      collapsed={collapsed}
      onCollapse={onCollapse}
      drag={drag}
      aside={
        canNote &&
        !writing && (
          <button type="button" onClick={() => setWriting(true)} className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground">
            <Plus size={13} /> Add
          </button>
        )
      }
    >
      {writing && (
        <div className="fade-in mb-3 flex items-center gap-2 rounded-2xl bg-white/[0.04] px-4 py-2.5 ring-1 ring-white/[0.08]">
          <input
            autoFocus
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              else if (e.key === "Escape") setWriting(false);
            }}
            placeholder="A reminder, a deadline, anything, then Enter"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none! placeholder:text-muted/60"
          />
          <button type="button" onClick={() => setWriting(false)} aria-label="Cancel" className="text-muted hover:text-foreground">
            <X size={14} />
          </button>
        </div>
      )}
      {error && <p className="mb-2 text-xs text-red-300">{error}</p>}
      {notices.length === 0 ? (
        !writing && <p className="px-1 py-2 text-sm text-muted">All clear.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {notices.map((n) => {
            const body = (
              <>
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${TONE[n.tone]}`}>{NOTICE_ICON[n.kind]}</span>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-sm leading-snug">
                    {n.fresh && <span className="mr-1.5 mb-0.5 inline-block size-1.5 rounded-full bg-accent align-middle" aria-label="New" />}
                    {n.text}
                  </p>
                  {n.sub && <p className="mt-0.5 text-xs text-muted">{n.sub}</p>}
                </div>
                {n.href && <ArrowUpRight size={14} className="shrink-0 text-muted transition-colors group-hover:text-foreground" />}
                {n.id && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Clear"
                    onClick={async (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      await clearNotice(n.id!);
                      router.refresh();
                    }}
                    className="shrink-0 rounded-full p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                  >
                    <X size={13} />
                  </span>
                )}
              </>
            );
            const cls = "group flex w-full items-center gap-3 rounded-2xl bg-white/[0.035] px-3.5 py-3 transition-colors hover:bg-white/[0.06]";
            if (n.href)
              return (
                <Link key={n.key} href={n.href} className={cls}>
                  {body}
                </Link>
              );
            return n.open ? (
              <button key={n.key} type="button" onClick={() => onOpen(n.open!)} className={cls}>
                {body}
              </button>
            ) : (
              <div key={n.key} className={cls}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ---------- a new meeting ----------

// 7:00 am to 10:00 pm, every half hour
const TIMES = Array.from({ length: 31 }, (_, n) => {
  const h = 7 + Math.floor(n / 2);
  const m = n % 2 ? "30" : "00";
  return { value: `${String(h).padStart(2, "0")}:${m}`, label: `${h % 12 || 12}:${m} ${h < 12 ? "am" : "pm"}` };
});
const LENGTHS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1½ hours" },
  { value: "120", label: "2 hours" },
];

// A town hall or group meeting: into Google Calendar, with a Meet link and
// an invite to everyone picked
function MeetingDialog({ ref, people, connected }: { ref: React.Ref<{ open: (day: string) => void }>; people: { id: string; name: string }[]; connected: boolean }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({ title: "", day: "", time: "11:00", minutes: "30", people: [] as string[], note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((cur) => ({ ...cur, ...patch }));

  // the handle Home opens it by, on the day the calendar is showing
  useImperativeHandle(ref, () => ({
    open: (day) => {
      setF({ title: "", day, time: "11:00", minutes: "30", people: [], note: "" });
      setError(null);
      dialogRef.current?.showModal();
    },
  }));

  const everyone = f.people.length === people.length;
  async function save() {
    setBusy(true);
    setError(null);
    const res = await scheduleMeeting({ ...f, minutes: Number(f.minutes) });
    setBusy(false);
    if (res.error) return setError(res.error);
    dialogRef.current?.close();
    router.refresh();
  }

  const field = "w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground";
  const label = "flex min-w-0 flex-col gap-1 text-xs text-muted";

  return (
    <dialog
      ref={dialogRef}
      {...closeOnBackdrop}
      className="glass fixed top-1/2 left-1/2 m-0 max-h-[min(40rem,calc(100vh-2rem))] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-0 text-foreground"
    >
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold">New meeting</h2>
          <p className="mt-0.5 text-xs text-muted">Added to easeus.media@gmail.com&apos;s calendar with a Google Meet link. Everyone picked gets an invite.</p>
        </div>
        <button type="button" aria-label="Close" onClick={() => dialogRef.current?.close()} className="rounded-md p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
          <X size={16} />
        </button>
      </header>
      <div className="flex flex-col gap-4 px-5 py-4">
        <label className={label}>
          Name
          <input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Town hall" className={field} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <div className={label}>
            Day
            <DatePicker value={f.day} onChange={(v) => set({ day: v })} clearable={false} />
          </div>
          <div className={label}>
            Time
            <Dropdown value={f.time} onChange={(v) => set({ time: v })} options={TIMES} />
          </div>
          <div className={label}>
            Length
            <Dropdown value={f.minutes} onChange={(v) => set({ minutes: v })} options={LENGTHS} />
          </div>
        </div>
        <div className={label}>
          <span className="flex items-center justify-between">
            People
            <button type="button" onClick={() => set({ people: everyone ? [] : people.map((p) => p.id) })} className="text-xs text-accent hover:underline">
              {everyone ? "Clear" : "Everyone"}
            </button>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => {
              const on = f.people.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ people: on ? f.people.filter((x) => x !== p.id) : [...f.people, p.id] })}
                  className={`flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-xs transition-colors ${on ? "border-accent/40 bg-accent/15 text-foreground" : "border-border text-muted hover:text-foreground"}`}
                >
                  <Avatar name={p.name} size={18} presence={false} />
                  {p.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>
        <label className={label}>
          Note
          <textarea value={f.note} onChange={(e) => set({ note: e.target.value })} rows={2} placeholder="What it's about" className={field} />
        </label>
        {!connected && <p className="text-xs text-amber-200">Connect Google Calendar first, from the Calendar card on Home.</p>}
        {error && <p className="text-xs text-red-300">{error}</p>}
      </div>
      <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" onClick={() => dialogRef.current?.close()} className="btn btn-sm btn-ghost">
          Cancel
        </button>
        <button type="button" onClick={save} disabled={busy || !connected || !f.title.trim() || !f.day} className="btn btn-sm btn-glow disabled:opacity-50">
          {busy ? "Scheduling…" : "Schedule"}
        </button>
      </footer>
    </dialog>
  );
}
