"use client";

import { Fragment, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSignature,
  GripVertical,
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
import { ADD_BUTTON, PlusBadge } from "../AddButton";
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
import { addDays, shortDay, weekday } from "@/lib/editorKpi";
import { calendarConsentUrl } from "@/lib/driveClient";
import { ordinal } from "@/lib/overdue";
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
};

type Env = { editors: { id: string; name: string }[]; projects: Project[]; taskTags: TaskTagOption[]; actingRole: Role; actingUserId: string };

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ADMIN_TASKS = "Admin tasks";

// "11:30 am", in IST
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const istDay = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

// ---------- the right rail: sections in an order, each foldable and movable ----------

type SectionId = "mine" | "calendar" | "notices";
type Layout = { order: SectionId[]; collapsed: SectionId[] };
const LAYOUT_KEY = "home.layout.v3";

// the saved layout, holding only the sections this person has, each once
function readLayout(have: SectionId[]): Layout {
  let saved: Partial<Layout> | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "null");
  } catch {}
  const kept = saved?.order;
  const order = (Array.isArray(kept) ? kept : []).filter((s, i, all) => have.includes(s) && all.indexOf(s) === i);
  return { order: [...order, ...have.filter((s) => !order.includes(s))], collapsed: (saved?.collapsed ?? []).filter((s) => have.includes(s)) };
}

type Drag = { start: (id: SectionId) => void; over: (id: SectionId) => void; end: () => void; dragging: SectionId | null };

// one section of the rail: its heading folds it, the handle beside it moves it
function Section({
  id,
  title,
  aside,
  collapsed,
  onCollapse,
  drag,
  children,
}: {
  id: SectionId;
  title: string;
  aside?: React.ReactNode;
  collapsed: boolean;
  onCollapse: () => void;
  drag: Drag;
  children: React.ReactNode;
}) {
  return (
    <section
      onDragOver={(e) => {
        if (!drag.dragging || drag.dragging === id) return;
        e.preventDefault();
        drag.over(id);
      }}
      className={`group/sec border-t border-white/[0.06] transition-opacity duration-200 first:border-t-0 ${drag.dragging === id ? "opacity-50" : ""}`}
    >
      <header className="flex items-center gap-1 px-4 pt-3.5 pb-2">
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            drag.start(id);
          }}
          onDragEnd={drag.end}
          aria-label={`Move ${title}`}
          title="Drag to move"
          className="-ml-2 cursor-grab rounded p-0.5 text-muted/50 opacity-0 transition-opacity group-hover/sec:opacity-100 hover:text-foreground focus-visible:opacity-100 active:cursor-grabbing"
        >
          <GripVertical size={13} />
        </button>
        <button type="button" onClick={onCollapse} aria-expanded={!collapsed} className="mr-auto flex min-w-0 items-center gap-1 text-sm font-semibold tracking-tight">
          <span className="truncate">{title}</span>
          <ChevronDown size={14} className={`shrink-0 text-muted transition-transform duration-300 ${collapsed ? "-rotate-90" : ""}`} />
        </button>
        {!collapsed && aside}
      </header>
      {!collapsed && <div className="fade-in px-4 pb-4">{children}</div>}
    </section>
  );
}

// ---------- rows ----------

// a status, and on hover what it means
function Status({ item }: { item: HomeItem }) {
  return (
    <span className="group/hint relative hidden shrink-0 sm:inline-flex">
      <span className={`rounded-full border px-2 py-px text-[11px] font-medium ${item.pill}`}>{item.status}</span>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 bottom-full z-30 mb-2 w-max max-w-56 rounded-xl border border-white/[0.08] bg-background/95 px-3 py-2 text-xs leading-snug text-foreground/85 opacity-0 shadow-xl backdrop-blur transition-opacity duration-150 group-hover/hint:opacity-100 group-hover/hint:delay-150"
      >
        <span className="font-medium text-foreground">{item.status}</span>
        <br />
        {item.meaning}
      </span>
    </span>
  );
}

function Strikes({ n }: { n: number }) {
  if (!n) return null;
  return <span className="shrink-0 rounded-full bg-rose-400/10 px-1.5 py-px text-[10px] font-medium text-rose-300">{ordinal(n)} miss</span>;
}

// "Today", "28 Sep"
const dayLabel = (d: string, today: string) => (d === today ? "Today" : shortDay(d));

// one piece of work on a line: what it is (and for whom), its stage, its
// completion date, who's on it; opens it
function WorkRow({ item, today, showClient = true, onOpen }: { item: HomeItem; today: string; showClient?: boolean; onOpen: () => void }) {
  const late = !!item.due && item.due < today;
  const sub = [showClient && (item.client ?? ADMIN_TASKS), item.delivery && `Delivery ${shortDay(item.delivery)}`].filter(Boolean).join(" · ");
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.04]">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate text-sm">{item.title}</span>
          <Strikes n={item.strikes} />
        </p>
        {sub && <p className="truncate text-xs text-muted">{sub}</p>}
      </div>
      <Status item={item} />
      <span className={`w-14 shrink-0 text-right text-xs tabular-nums ${late ? "text-rose-300" : "text-muted"}`}>{item.due ? dayLabel(item.due, today) : "No date"}</span>
      {item.person ? <Avatar name={item.person.name} size={24} /> : <span className="size-6 shrink-0 rounded-full border border-dashed border-white/15" title="Not assigned" />}
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
type Stat = "active" | "today" | "overdue" | "meetings";

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
  const have = useMemo<SectionId[]>(() => (showMine ? ["mine", "calendar", "notices"] : ["calendar", "notices"]), [showMine]);
  const [layout, setLayout] = useState<Layout>({ order: have, collapsed: [] });
  const [dragging, setDragging] = useState<SectionId | null>(null);
  const [view, setView] = useState("client");
  const [day, setDay] = useState(monday <= today && today < addDays(monday, 7) ? today : monday);
  const [adding, setAdding] = useState(false);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<{ key: string; n: number } | null>(null);
  const [stat, setStat] = useState<Stat | null>(null);
  const meetingRef = useRef<{ open: (day: string) => void }>(null);

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
  const collapse = (id: SectionId) => save({ ...layout, collapsed: layout.collapsed.includes(id) ? layout.collapsed.filter((s) => s !== id) : [...layout.collapsed, id] });
  // dragging a section over another takes its place
  const drag: Drag = {
    dragging,
    start: (id) => setDragging(id),
    end: () => setDragging(null),
    over: (target) => {
      if (!dragging || dragging === target) return;
      const order = layout.order.filter((s) => s !== dragging);
      order.splice(layout.order.indexOf(target), 0, dragging);
      save({ ...layout, order });
    },
  };

  const live = useMemo(() => items.filter((i) => !gone.has(i.key)), [items, gone]);
  const open = (key: string) => setOpened((o) => ({ key, n: (o?.n ?? 0) + 1 }));
  const openItem = opened && items.find((i) => i.key === opened.key);

  // the work in motion, grouped the chosen way, busiest first
  const groups = useMemo(() => {
    const keyOf = (i: HomeItem) => (view === "client" ? (i.client ?? ADMIN_TASKS) : view === "department" ? (i.department ?? "No department") : (i.person?.name ?? "Not assigned"));
    const byDue = (a: HomeItem, b: HomeItem) => (a.due ?? "9999").localeCompare(b.due ?? "9999");
    const map = new Map<string, HomeItem[]>();
    for (const i of live) map.set(keyOf(i), [...(map.get(keyOf(i)) ?? []), i]);
    return [...map.entries()].map(([name, list]) => ({ name, items: list.sort(byDue) })).sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [live, view]);

  const mine = live.filter((i) => i.person?.id === meId).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const overdue = live.filter((i) => i.due && i.due < today);
  const dueToday = live.filter((i) => i.due === today);
  const todays = meetings.filter((m) => istDay(m.start) === today);
  const days = Array.from({ length: 7 }, (_, n) => addDays(monday, n));
  const shownDay = days.includes(day) ? day : days.includes(today) ? today : monday;

  async function tick(item: HomeItem) {
    setGone((g) => new Set(g).add(item.key));
    const res = item.source === "work" ? await moveWorkTask(item.id, "done", item.todo?.sortOrder ?? 0) : await moveTask(item.id, "delivered_and_uploaded");
    if (res.error) setGone((g) => new Set([...g].filter((k) => k !== item.key)));
    router.refresh();
  }

  // the numbers that matter, in one line; each opens its list
  const stats: { key: Stat; value: number; label: string; late?: boolean }[] = [
    { key: "active", value: live.length, label: "active" },
    { key: "today", value: dueToday.length, label: "due today" },
    { key: "overdue", value: overdue.length, label: "overdue", late: overdue.length > 0 },
    { key: "meetings", value: todays.length, label: todays.length === 1 ? "meeting today" : "meetings today" },
  ];

  const sections: Record<SectionId, React.ReactNode> = {
    mine: (
      <Section
        key="mine"
        id="mine"
        title="My tasks"
        aside={
          <Link href="/my-tasks" className="flex items-center gap-0.5 text-xs text-muted transition-colors hover:text-foreground">
            All <ArrowUpRight size={12} />
          </Link>
        }
        collapsed={layout.collapsed.includes("mine")}
        onCollapse={() => collapse("mine")}
        drag={drag}
      >
        {mine.length === 0 ? (
          <p className="text-sm text-muted">Nothing on your list.</p>
        ) : (
          <div className="-mx-2 flex flex-col">
            {mine.map((i) => {
              const tickable = i.source === "work" || i.workflow === "todo";
              const late = !!i.due && i.due < today;
              return (
                <div key={i.key} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]">
                  {tickable ? (
                    <button
                      type="button"
                      aria-label="Mark done"
                      onClick={() => tick(i)}
                      className="flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-muted/50 text-transparent transition-colors hover:border-accent hover:text-accent"
                    >
                      <Check size={10} strokeWidth={3} />
                    </button>
                  ) : (
                    <span className="size-4 shrink-0 rounded-full border-[1.5px] border-dashed border-muted/40" title={i.status} />
                  )}
                  <button type="button" onClick={() => open(i.key)} className="min-w-0 flex-1 truncate text-left text-sm">
                    {i.title}
                  </button>
                  <Strikes n={i.strikes} />
                  {i.due && <span className={`shrink-0 text-xs tabular-nums ${late ? "text-rose-300" : "text-muted"}`}>{dayLabel(i.due, today)}</span>}
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
    // the page's own height: the work list and the rail fill the screen
    // below the greeting, and each scrolls inside itself
    <div className="relative isolate flex flex-col gap-5 lg:h-[calc(100dvh-2*var(--page-pad))]">
      {/* a soft blue light from the top right corner, behind everything */}
      <div aria-hidden className="pointer-events-none fixed -top-64 -right-56 -z-10 size-[46rem] rounded-full bg-[radial-gradient(closest-side,rgb(75_149_230/0.2),rgb(75_149_230/0.06)_55%,transparent)]" />

      <header className="flex shrink-0 flex-wrap items-end gap-x-6 gap-y-3">
        <div className="mr-auto min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{greeting}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span>
              {WEEKDAY_LONG[weekday(today)]}, {Number(today.slice(8, 10))} {MONTH[Number(today.slice(5, 7)) - 1]}
            </span>
            {stats.map((s) => (
              <Fragment key={s.key}>
                <span aria-hidden className="text-muted/40">
                  ·
                </span>
                <button type="button" onClick={() => setStat(s.key)} className={`underline-offset-4 transition-colors hover:underline ${s.late ? "text-rose-300" : "hover:text-foreground"}`}>
                  <span className={`font-medium tabular-nums ${s.late ? "" : "text-foreground"}`}>{s.value}</span> {s.label}
                </button>
              </Fragment>
            ))}
          </p>
        </div>
        <div className="flex gap-2">
          {showMine && (
            <button type="button" onClick={() => setAdding(true)} className={ADD_BUTTON}>
              <PlusBadge /> New task
            </button>
          )}
          {canMeet && (
            <button type="button" onClick={() => meetingRef.current?.open(shownDay)} className={ADD_BUTTON}>
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent transition-colors group-hover/add:bg-accent/25">
                <Video size={11} />
              </span>
              New meeting
            </button>
          )}
        </div>
      </header>

      {adding && (
        <div className="fade-in shrink-0">
          <Composer kinds={composer.kinds} projects={composer.projects} assignees={composer.assignees} actingUserId={meId} startOpen onClose={() => setAdding(false)} />
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="panel flex min-h-0 flex-col rounded-2xl">
          <header className="flex shrink-0 flex-wrap items-center gap-3 px-5 pt-4 pb-1">
            <h2 className="mr-auto text-[15px] font-semibold tracking-tight">{showMine ? "Work in progress" : "My work"}</h2>
            <Segmented options={VIEWS} value={view} onChange={setView} />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
            {groups.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">Nothing in progress.</p>
            ) : (
              <div key={view} className="fade-in">
                {groups.map((g) => (
                  <div key={g.name}>
                    <p className="flex items-center gap-2 px-3 pt-4 pb-1 text-xs font-medium text-foreground/70">
                      {g.name}
                      <span className="text-muted/70 tabular-nums">{g.items.length}</span>
                    </p>
                    {g.items.map((i) => (
                      <WorkRow key={i.key} item={i} today={today} showClient={view !== "client"} onOpen={() => open(i.key)} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="panel min-h-0 overflow-y-auto rounded-2xl">{layout.order.map((id) => sections[id])}</aside>
      </div>

      {openItem && <TaskWindow key={`${opened.key}:${opened.n}`} item={openItem} env={env} assignees={composer.assignees} />}
      <StatDialog
        stat={stat}
        onClose={() => setStat(null)}
        lists={{ active: live, today: dueToday, overdue }}
        meetings={todays}
        today={today}
        onOpen={(key) => {
          setStat(null);
          open(key);
        }}
      />
      {canMeet && <MeetingDialog ref={meetingRef} people={people} connected={calendar.connected} />}
    </div>
  );
}

// ---------- a stat, opened: its tasks (or meetings) ----------

function StatDialog({
  stat,
  onClose,
  lists,
  meetings,
  today,
  onOpen,
}: {
  stat: Stat | null;
  onClose: () => void;
  lists: { active: HomeItem[]; today: HomeItem[]; overdue: HomeItem[] };
  meetings: Meeting[];
  today: string;
  onOpen: (key: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (stat) ref.current?.showModal();
    else ref.current?.close();
  }, [stat]);

  const title = { active: "Active tasks", today: "Due today", overdue: "Overdue", meetings: "Meetings today" }[stat ?? "active"];
  // overdue ones by how many times they've gone past their date, the worst first
  const groups =
    stat === "overdue"
      ? [...new Set(lists.overdue.map((i) => Math.max(i.strikes, 1)))]
          .sort((a, b) => b - a)
          .map((n) => ({ name: `${ordinal(n)} time past its date`, items: lists.overdue.filter((i) => Math.max(i.strikes, 1) === n) }))
      : stat === "active"
        ? [
            { name: "Client work", items: lists.active.filter((i) => i.client) },
            { name: ADMIN_TASKS, items: lists.active.filter((i) => !i.client) },
          ].filter((g) => g.items.length)
        : stat === "today"
          ? [{ name: "", items: lists.today }]
          : [];

  return (
    <dialog
      ref={ref}
      {...closeOnBackdrop}
      onClose={onClose}
      className="glass fixed top-1/2 left-1/2 m-0 max-h-[min(40rem,calc(100vh-2rem))] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl p-0 text-foreground"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/80 px-5 py-4 backdrop-blur">
        <h2 className="text-base font-semibold">{title}</h2>
        <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="rounded-md p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground">
          <X size={16} />
        </button>
      </header>
      <div className="flex flex-col gap-5 p-4">
        {stat === "overdue" && lists.overdue.length > 0 && <p className="px-1 text-xs text-muted">Open one to see every new date it was given, and why.</p>}
        {stat === "meetings" ? (
          meetings.length ? (
            meetings.map((m) => (
              <div key={m.id} className="rounded-2xl bg-accent/[0.08] px-4 py-3 ring-1 ring-accent/20">
                <p className="text-sm font-medium">{m.title}</p>
                <p className="mt-0.5 text-xs text-muted">{m.allDay ? "All day" : `${clock(m.start)} – ${clock(m.end)}`}</p>
              </div>
            ))
          ) : (
            <p className="px-1 text-sm text-muted">No meetings today.</p>
          )
        ) : groups.every((g) => !g.items.length) ? (
          <p className="px-1 text-sm text-muted">Nothing here.</p>
        ) : (
          groups.map((g) => (
            <div key={g.name || "all"} className="flex flex-col">
              {g.name && <p className="px-3 pb-1 text-xs font-medium text-muted">{g.name}</p>}
              {g.items.map((i) => (
                <WorkRow key={i.key} item={i} today={today} onOpen={() => onOpen(i.key)} />
              ))}
            </div>
          ))
        )}
      </div>
    </dialog>
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
  const arrow = "flex size-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground";
  return (
    <Section
      id="calendar"
      title="Calendar"
      collapsed={collapsed}
      onCollapse={onCollapse}
      drag={drag}
      aside={
        <div className="flex items-center gap-0.5">
          <span className="mr-1 text-xs text-muted">{MONTH[Number(day.slice(5, 7)) - 1]}</span>
          <Link href={`/home?week=${addDays(monday, -7)}`} scroll={false} aria-label="Previous week" className={arrow}>
            <ChevronLeft size={14} />
          </Link>
          <Link href={`/home?week=${addDays(monday, 7)}`} scroll={false} aria-label="Next week" className={arrow}>
            <ChevronRight size={14} />
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const on = d === day;
          const has = meetings.some((m) => istDay(m.start) === d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-pressed={on}
              className={`flex flex-col items-center gap-0.5 rounded-lg py-1.5 transition-colors ${on ? "bg-accent text-white" : "hover:bg-white/[0.05]"}`}
            >
              <span className={`text-[10px] font-medium ${on ? "text-white/75" : "text-muted"}`}>{WEEKDAY[weekday(d)]}</span>
              <span className={`text-sm leading-none font-semibold tabular-nums ${!on && d === today ? "text-accent" : ""}`}>{Number(d.slice(8, 10))}</span>
              <span className={`size-1 rounded-full ${has ? (on ? "bg-white/80" : "bg-accent") : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        {!calendar.connected ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-xs leading-relaxed text-muted">Connect easeus.media@gmail.com&apos;s Google Calendar to see meetings here.</p>
            {calendar.clientId && (
              <button type="button" onClick={() => window.location.assign(calendarConsentUrl(calendar.clientId, window.location.origin))} className={ADD_BUTTON}>
                <CalendarDays size={14} /> Connect Google Calendar
              </button>
            )}
          </div>
        ) : calendar.error ? (
          <p className="text-xs leading-relaxed text-rose-300">{calendar.error}</p>
        ) : onDay.length === 0 ? (
          <p className="text-sm text-muted">No meetings {day === today ? "today" : `on ${WEEKDAY[weekday(day)]} ${shortDay(day)}`}.</p>
        ) : (
          onDay.map((m) => (
            <div key={m.id} className="border-l-2 border-accent/70 pl-3">
              <p className="truncate text-sm font-medium">{m.title}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                {m.allDay ? "All day" : `${clock(m.start)} – ${clock(m.end)}`}
                {m.people > 0 && (
                  <>
                    <Users size={11} className="ml-1" /> {m.people}
                  </>
                )}
                {m.meet && (
                  <a href={m.meet} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-accent hover:underline">
                    <Video size={12} /> Join
                  </a>
                )}
              </p>
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
  invoice: <Receipt size={12} />,
  contract: <FileSignature size={12} />,
  message: <MessageSquare size={12} />,
  note: <StickyNote size={12} />,
  overdue: <Clock size={12} />,
  shared: <UserPlus size={12} />,
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
      title="Notices"
      collapsed={collapsed}
      onCollapse={onCollapse}
      drag={drag}
      aside={
        canNote &&
        !writing && (
          <button type="button" onClick={() => setWriting(true)} className="flex items-center gap-0.5 text-xs text-muted transition-colors hover:text-foreground">
            <Plus size={12} /> Add
          </button>
        )
      }
    >
      {writing && (
        <div className="fade-in mb-2 flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 ring-1 ring-white/[0.08]">
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
        !writing && <p className="text-sm text-muted">All clear.</p>
      ) : (
        <div className="-mx-2 flex flex-col">
          {notices.map((n) => {
            const body = (
              <>
                <span className={`mt-px flex size-6 shrink-0 items-center justify-center rounded-full ${TONE[n.tone]}`}>{NOTICE_ICON[n.kind]}</span>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-[13px] leading-snug">{n.text}</p>
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
            const cls = "group flex w-full items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04]";
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
