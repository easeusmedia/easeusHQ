"use client";

import { useImperativeHandle, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Bell, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, FileSignature, Layers, ListChecks, MessageSquare, Plus, Receipt, StickyNote, Users, Video, X } from "lucide-react";
import { Avatar } from "../TaskCard";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { closeOnBackdrop } from "../dialog";
import { moveTask } from "../actions";
import { moveWorkTask } from "../my-tasks/actions";
import { Composer } from "../my-tasks/TodoList";
import type { Project } from "../my-tasks/WorkTaskDialog";
import { addDays, shortDay, weekday } from "@/lib/editorKpi";
import { calendarConsentUrl } from "@/lib/driveClient";
import type { Meeting } from "@/lib/googleCalendar";
import { addNotice, clearNotice, scheduleMeeting } from "./actions";

export type HomeItem = {
  key: string;
  id: string;
  source: "task" | "work";
  workflow: string;
  sortOrder: number;
  title: string;
  status: string;
  meaning: string;
  pill: string;
  due: string | null;
  delivery: string | null;
  client: string | null;
  href: string | null;
  department: string | null;
  person: { id: string; name: string } | null;
};

export type Notice = {
  key: string;
  id?: string;
  kind: "invoice" | "contract" | "message" | "note";
  tone: "rose" | "amber" | "accent" | "neutral";
  text: string;
  sub?: string;
  href?: string;
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const VIEWS = [
  { key: "client", label: "Client" },
  { key: "department", label: "Department" },
  { key: "person", label: "Person" },
];
// the rows a group shows before "Show all"
const FIRST = 3;

// "11:30 am", in IST
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const istDay = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

// the header's buttons share one size; only their fill differs
const BUTTON = "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors";

function Card({ icon, title, aside, children }: { icon: React.ReactNode; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-white/[0.012] p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-white/[0.05] text-foreground/80 ring-1 ring-white/[0.08]">{icon}</span>
          <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

// a status, and on hover what it means
function Status({ item }: { item: HomeItem }) {
  return (
    <span className="group/hint relative hidden shrink-0 sm:inline-flex">
      <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${item.pill}`}>{item.status}</span>
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

// "Due today · Delivery 5 Oct"
function when(item: HomeItem, today: string) {
  return [item.due && `Due ${item.due === today ? "today" : shortDay(item.due)}`, item.delivery && `Delivery ${shortDay(item.delivery)}`].filter(Boolean).join(" · ");
}

// one piece of work: what it is, for whom, when, its stage, who's on it
function WorkRow({ item, today, showClient = true }: { item: HomeItem; today: string; showClient?: boolean }) {
  const late = !!item.due && item.due < today;
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {showClient && item.client && <span>{item.client} · </span>}
          <span className={late ? "text-rose-300" : undefined}>{when(item, today) || "No date"}</span>
        </p>
      </div>
      <Status item={item} />
      {item.person ? <Avatar name={item.person.name} size={28} /> : <span className="size-7 shrink-0 rounded-full border border-dashed border-white/15" title="Not assigned" />}
    </>
  );
  const cls = "flex items-center gap-3 rounded-2xl bg-white/[0.035] px-4 py-3 transition-colors hover:bg-white/[0.065]";
  return item.href ? (
    <Link href={item.href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// a small switch between views, drawn like the cards around it
function Segmented({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={value === o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${value === o.key ? "bg-white/[0.1] text-foreground" : "text-muted hover:text-foreground"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function HomeView({
  greeting,
  today,
  monday,
  meId,
  work,
  notices,
  meetings,
  calendar,
  people,
  composer,
}: {
  greeting: string;
  today: string;
  monday: string;
  meId: string;
  work: HomeItem[];
  notices: Notice[];
  meetings: Meeting[];
  calendar: { connected: boolean; error: string | null; clientId: string };
  people: { id: string; name: string }[];
  composer: { projects: Project[]; assignees: { id: string; name: string }[] };
}) {
  const router = useRouter();
  const [view, setView] = useState("client");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [day, setDay] = useState(monday <= today && today < addDays(monday, 7) ? today : monday);
  const [adding, setAdding] = useState(false);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const meetingRef = useRef<{ open: (day: string) => void }>(null);
  const tasksRef = useRef<HTMLElement>(null);

  const live = useMemo(() => work.filter((i) => !gone.has(i.key)), [work, gone]);
  // the work in motion, grouped the chosen way, busiest first
  const groups = useMemo(() => {
    const keyOf = (i: HomeItem) => (view === "client" ? (i.client ?? "Internal") : view === "department" ? (i.department ?? "No department") : (i.person?.name ?? "Not assigned"));
    const byDue = (a: HomeItem, b: HomeItem) => (a.due ?? "9999").localeCompare(b.due ?? "9999");
    const map = new Map<string, HomeItem[]>();
    for (const i of live) map.set(keyOf(i), [...(map.get(keyOf(i)) ?? []), i]);
    return [...map.entries()].map(([name, items]) => ({ name, items: items.sort(byDue) })).sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [live, view]);

  const mine = live.filter((i) => i.person?.id === meId).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const days = Array.from({ length: 7 }, (_, n) => addDays(monday, n));
  const stats = [
    { value: live.length, label: "In progress" },
    { value: live.filter((i) => i.due === today).length, label: "Due today" },
    { value: live.filter((i) => i.due && i.due < today).length, label: "Overdue", late: true },
    { value: meetings.filter((m) => istDay(m.start) === today).length, label: "Meetings today" },
  ];

  async function tick(item: HomeItem) {
    setGone((g) => new Set(g).add(item.key));
    const res = item.source === "work" ? await moveWorkTask(item.id, "done", item.sortOrder) : await moveTask(item.id, "delivered_and_uploaded");
    if (res.error) setGone((g) => new Set([...g].filter((k) => k !== item.key)));
    router.refresh();
  }

  function newTask() {
    setAdding(true);
    tasksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="relative isolate flex flex-col gap-6">
      {/* a soft blue light from the top right corner, behind everything */}
      <div aria-hidden className="pointer-events-none fixed -top-64 -right-56 -z-10 size-[46rem] rounded-full bg-[radial-gradient(closest-side,rgb(75_149_230/0.2),rgb(75_149_230/0.06)_55%,transparent)]" />

      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">
              {WEEKDAY_LONG[weekday(today)]}, {Number(today.slice(8, 10))} {MONTH[Number(today.slice(5, 7)) - 1]}
            </p>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-tight sm:text-4xl">{greeting}</h1>
            <p className="text-3xl font-semibold tracking-tight text-foreground/35 sm:text-4xl">Here&apos;s everything in motion.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={newTask} className={`${BUTTON} bg-accent text-white hover:bg-accent/85`}>
              <Plus size={16} /> New task
            </button>
            <button type="button" onClick={() => meetingRef.current?.open(day)} className={`${BUTTON} border border-white/[0.1] bg-white/[0.04] text-foreground hover:bg-white/[0.08]`}>
              <Video size={16} /> New meeting
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/[0.06] ring-1 ring-white/[0.07] sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-background/80 px-5 py-3.5 backdrop-blur">
              <p className={`text-2xl font-semibold tracking-tight tabular-nums ${s.late && s.value ? "text-rose-300" : ""}`}>{s.value}</p>
              <p className="mt-0.5 text-xs text-muted">{s.label}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* your own tasks come first */}
          <section ref={tasksRef} className="scroll-mt-4">
            <Card
              icon={<ListChecks size={16} />}
              title="My tasks"
              aside={
                <div className="flex items-center gap-3">
                  {!adding && (
                    <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground">
                      <Plus size={13} /> Add
                    </button>
                  )}
                  <Link href="/my-tasks" className="flex items-center gap-0.5 text-xs text-muted transition-colors hover:text-foreground">
                    Open list <ArrowUpRight size={13} />
                  </Link>
                </div>
              }
            >
              {adding && (
                <div className="mb-3">
                  <Composer kinds={[]} projects={composer.projects} assignees={composer.assignees} actingUserId={meId} startOpen onClose={() => setAdding(false)} />
                </div>
              )}
              {mine.length === 0 ? (
                !adding && <p className="px-1 text-sm text-muted">Nothing on your list. Add something with New task.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {mine.slice(0, 6).map((i) => {
                    const tickable = i.source === "work" || i.workflow === "todo";
                    const late = !!i.due && i.due < today;
                    return (
                      <div key={i.key} className="flex items-center gap-3 rounded-2xl bg-white/[0.035] px-4 py-3">
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
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{i.title}</p>
                          {(i.client || i.due) && (
                            <p className="mt-0.5 truncate text-xs text-muted">
                              {i.client && <span>{i.client}</span>}
                              {i.client && i.due && " · "}
                              {i.due && <span className={late ? "text-rose-300" : undefined}>{i.due === today ? "Today" : shortDay(i.due)}</span>}
                            </p>
                          )}
                        </div>
                        {!tickable && <Status item={i} />}
                      </div>
                    );
                  })}
                  {mine.length > 6 && (
                    <Link href="/my-tasks" className="px-1 pt-1 text-xs text-muted hover:text-foreground">
                      And {mine.length - 6} more
                    </Link>
                  )}
                </div>
              )}
            </Card>
          </section>

          <Card icon={<Layers size={16} />} title="Work in progress" aside={<Segmented options={VIEWS} value={view} onChange={setView} />}>
            {groups.length === 0 ? (
              <p className="px-1 text-sm text-muted">Nothing in progress.</p>
            ) : (
              <div key={view} className="fade-in flex flex-col gap-6">
                {groups.map((g) => {
                  const all = openGroups.has(g.name);
                  return (
                    <div key={g.name} className="flex flex-col gap-1.5">
                      <p className="mb-0.5 flex items-center gap-2 px-1 text-xs font-medium">
                        <span className="text-foreground/90">{g.name}</span>
                        <span className="rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] text-muted tabular-nums">{g.items.length}</span>
                      </p>
                      {(all ? g.items : g.items.slice(0, FIRST)).map((i) => (
                        <WorkRow key={i.key} item={i} today={today} showClient={view !== "client"} />
                      ))}
                      {g.items.length > FIRST && (
                        <button
                          type="button"
                          onClick={() => setOpenGroups((s) => (s.has(g.name) ? new Set([...s].filter((x) => x !== g.name)) : new Set(s).add(g.name)))}
                          className="self-start px-1 pt-0.5 text-xs text-muted transition-colors hover:text-foreground"
                        >
                          {all ? "Show fewer" : `Show all ${g.items.length}`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <CalendarCard today={today} monday={monday} day={day} setDay={setDay} days={days} meetings={meetings} calendar={calendar} />
          <Notices notices={notices} />
        </div>
      </div>

      <MeetingDialog ref={meetingRef} people={people} connected={calendar.connected} />
    </div>
  );
}

function CalendarCard({
  today,
  monday,
  day,
  setDay,
  days,
  meetings,
  calendar,
}: {
  today: string;
  monday: string;
  day: string;
  setDay: (d: string) => void;
  days: string[];
  meetings: Meeting[];
  calendar: { connected: boolean; error: string | null; clientId: string };
}) {
  const onDay = meetings.filter((m) => istDay(m.start) === day);
  const arrow = "flex size-8 items-center justify-center rounded-full text-muted ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.06] hover:text-foreground";
  return (
    <Card
      icon={<CalendarDays size={16} />}
      title="Calendar"
      aside={
        <div className="flex items-center gap-2">
          <span className="mr-1 text-sm font-medium text-muted">{MONTH[Number(day.slice(5, 7)) - 1]}</span>
          <Link href={`/home?week=${addDays(monday, -7)}`} scroll={false} aria-label="Previous week" className={arrow}>
            <ChevronLeft size={15} />
          </Link>
          <Link href={`/home?week=${addDays(monday, 7)}`} scroll={false} aria-label="Next week" className={arrow}>
            <ChevronRight size={15} />
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const on = d === day;
          const has = meetings.some((m) => istDay(m.start) === d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-pressed={on}
              className={`flex flex-col items-center gap-1 rounded-2xl py-2.5 transition-colors ${on ? "bg-accent text-white" : "hover:bg-white/[0.05]"}`}
            >
              <span className={`text-[10px] font-medium tracking-wide uppercase ${on ? "text-white/75" : "text-muted"}`}>{WEEKDAY[weekday(d)]}</span>
              <span className={`text-lg leading-none font-semibold tabular-nums ${!on && d === today ? "text-accent" : ""}`}>{Number(d.slice(8, 10))}</span>
              <span className={`size-1 rounded-full ${has ? (on ? "bg-white/80" : "bg-accent") : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {!calendar.connected ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/[0.1] px-5 py-6 text-center">
            <p className="text-sm font-medium">Bring in your meetings</p>
            <p className="max-w-xs text-xs leading-relaxed text-muted">Connect easeus.media@gmail.com&apos;s Google Calendar once, and its meetings show here. New meetings get a Meet link and invites.</p>
            {calendar.clientId ? (
              <button type="button" onClick={() => window.location.assign(calendarConsentUrl(calendar.clientId, window.location.origin))} className={`${BUTTON} h-9 bg-accent text-white hover:bg-accent/85`}>
                <CalendarDays size={15} /> Connect Google Calendar
              </button>
            ) : (
              <Link href="/integrations" className="text-xs text-accent hover:underline">
                Set up the Google app in Integrations first
              </Link>
            )}
          </div>
        ) : calendar.error ? (
          <p className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-sm text-rose-200">{calendar.error}</p>
        ) : onDay.length === 0 ? (
          <p className="rounded-2xl bg-white/[0.025] px-4 py-5 text-center text-sm text-muted">No meetings {day === today ? "today" : `on ${WEEKDAY[weekday(day)]} ${shortDay(day)}`}</p>
        ) : (
          onDay.map((m) => (
            <div key={m.id} className="flex gap-3">
              <p className="w-16 shrink-0 pt-3 text-right text-xs text-muted tabular-nums">{m.allDay ? "All day" : clock(m.start)}</p>
              <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl bg-accent/[0.09] py-3 pr-3 pl-4 ring-1 ring-accent/20">
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
                  <a href={m.meet} target="_blank" rel="noreferrer" className="mt-2.5 inline-flex h-7 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-neutral-900 transition-opacity hover:opacity-85">
                    <Video size={12} /> Join Google Meet
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

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
};

// What the app knows needs Level 1 (invoices, contracts, client messages),
// then whatever they've written for themselves
function Notices({ notices }: { notices: Notice[] }) {
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
    <Card
      icon={<Bell size={16} />}
      title="Notices"
      aside={
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
        !writing && <p className="px-1 text-sm text-muted">All clear. Invoices, contracts and client messages that need you show up here.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {notices.map((n) => {
            const body = (
              <>
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${TONE[n.tone]}`}>{NOTICE_ICON[n.kind]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">{n.text}</p>
                  {n.sub && <p className="mt-0.5 text-xs text-muted">{n.sub}</p>}
                </div>
                {n.href && <ArrowUpRight size={14} className="shrink-0 text-muted transition-colors group-hover:text-foreground" />}
                {n.id && (
                  <button
                    type="button"
                    aria-label="Clear"
                    onClick={async () => {
                      await clearNotice(n.id!);
                      router.refresh();
                    }}
                    className="shrink-0 rounded-full p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"
                  >
                    <X size={13} />
                  </button>
                )}
              </>
            );
            const cls = "group flex items-center gap-3 rounded-2xl bg-white/[0.035] px-3.5 py-3 transition-colors hover:bg-white/[0.06]";
            return n.href ? (
              <Link key={n.key} href={n.href} className={cls}>
                {body}
              </Link>
            ) : (
              <div key={n.key} className={cls}>
                {body}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

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
