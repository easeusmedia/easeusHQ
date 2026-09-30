"use client";

import { useImperativeHandle, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, CalendarDays, ChevronLeft, ChevronRight, Clock, Layers, ListChecks, Plus, Users, Video, X } from "lucide-react";
import { Avatar } from "../TaskCard";
import { ScopeToggle } from "../ScopeToggle";
import { Dropdown } from "../Dropdown";
import { DatePicker } from "../DatePicker";
import { closeOnBackdrop } from "../dialog";
import { addDays, shortDay, weekday } from "@/lib/editorKpi";
import type { Meeting } from "@/lib/googleCalendar";
import { scheduleMeeting } from "./actions";

export type HomeItem = {
  key: string;
  title: string;
  status: string;
  pill: string;
  due: string | null;
  delivery: string | null;
  client: string | null;
  href: string | null;
  department: string | null;
  person: { id: string; name: string } | null;
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const VIEWS = [
  { key: "client", label: "Client" },
  { key: "department", label: "Department" },
  { key: "person", label: "Person" },
];
// the rows a group shows before "Show all"
const FIRST = 4;

// "11:30 am", in IST
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const istDay = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);

function Card({ icon, title, aside, children, className = "" }: { icon: React.ReactNode; title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-surface-2/30 p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-full border border-border text-muted">{icon}</span>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

// one piece of work: what it is, its stage, when it's due and delivered, who
function WorkRow({ item, today, showClient = true }: { item: HomeItem; today: string; showClient?: boolean }) {
  const late = !!item.due && item.due < today;
  const when = [item.due && `Due ${item.due === today ? "today" : shortDay(item.due)}`, item.delivery && `Delivery ${shortDay(item.delivery)}`].filter(Boolean).join(" · ");
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className={`mt-0.5 truncate text-xs ${late ? "text-rose-300" : "text-muted"}`}>
          {[showClient && item.client, when].filter(Boolean).join(" · ") || "No date"}
        </p>
      </div>
      <span className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium sm:inline ${item.pill}`}>{item.status}</span>
      {item.person ? <Avatar name={item.person.name} size={26} /> : <span className="size-[26px] shrink-0 rounded-full border border-dashed border-border" title="Unassigned" />}
    </>
  );
  const cls = "flex items-center gap-3 rounded-xl bg-white/[0.035] px-3.5 py-2.5 transition-colors hover:bg-white/[0.06]";
  return item.href ? (
    <Link href={item.href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function HomeView({
  greeting,
  today,
  monday,
  meId,
  work,
  meetings,
  calendar,
  people,
}: {
  greeting: string;
  today: string;
  monday: string;
  meId: string;
  work: HomeItem[];
  meetings: Meeting[];
  calendar: { connected: boolean; error: string | null };
  people: { id: string; name: string }[];
}) {
  const [view, setView] = useState("client");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [day, setDay] = useState(monday <= today && today < addDays(monday, 7) ? today : monday);
  const meetingRef = useRef<{ open: (day: string) => void }>(null);

  // the work in motion, grouped the chosen way, busiest first
  const groups = useMemo(() => {
    const keyOf = (i: HomeItem) => (view === "client" ? i.client ?? "Internal" : view === "department" ? i.department ?? "No department" : i.person?.name ?? "Unassigned");
    const byDue = (a: HomeItem, b: HomeItem) => (a.due ?? "9999").localeCompare(b.due ?? "9999");
    const map = new Map<string, HomeItem[]>();
    for (const i of work) map.set(keyOf(i), [...(map.get(keyOf(i)) ?? []), i]);
    return [...map.entries()].map(([name, items]) => ({ name, items: items.sort(byDue) })).sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [work, view]);

  const attention = work.filter((i) => i.due && i.due <= today).sort((a, b) => a.due!.localeCompare(b.due!));
  const mine = work.filter((i) => i.person?.id === meId).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  const days = Array.from({ length: 7 }, (_, n) => addDays(monday, n));
  const onDay = meetings.filter((m) => istDay(m.start) === day);
  const month = MONTH[Number(day.slice(5, 7)) - 1];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            {WEEKDAY[weekday(today)]}, {shortDay(today)}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{greeting}</h1>
          <p className="text-3xl font-semibold tracking-tight text-muted/70">Here&apos;s everything in motion.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/my-tasks" className="btn-primary flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold">
            <Plus size={15} /> New task
          </Link>
          <button type="button" onClick={() => meetingRef.current?.open(day)} className="btn btn-ghost flex h-10 items-center gap-1.5 rounded-full border border-border px-4">
            <Video size={15} /> New meeting
          </button>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card
          icon={<Layers size={15} />}
          title="Work in progress"
          aside={<ScopeToggle options={VIEWS} active={view} onSelect={setView} />}
          className="lg:row-span-3"
        >
          {groups.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">Nothing in progress.</p>
          ) : (
            <div key={view} className="fade-in flex flex-col gap-5">
              {groups.map((g) => {
                const all = openGroups.has(g.name);
                return (
                  <div key={g.name} className="flex flex-col gap-1.5">
                    <p className="flex items-baseline gap-2 px-1 text-xs font-medium text-muted">
                      <span className="text-foreground/90">{g.name}</span>
                      <span className="tabular-nums">{g.items.length}</span>
                    </p>
                    {(all ? g.items : g.items.slice(0, FIRST)).map((i) => (
                      <WorkRow key={i.key} item={i} today={today} showClient={view !== "client"} />
                    ))}
                    {g.items.length > FIRST && (
                      <button
                        type="button"
                        onClick={() => setOpenGroups((s) => (s.has(g.name) ? new Set([...s].filter((x) => x !== g.name)) : new Set(s).add(g.name)))}
                        className="self-start px-1 text-xs text-muted transition-colors hover:text-foreground"
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

        <Card
          icon={<CalendarDays size={15} />}
          title="Calendar"
          aside={
            <div className="flex items-center gap-1 text-sm text-muted">
              <span className="mr-1">{month}</span>
              <Link href={`/home?week=${addDays(monday, -7)}`} scroll={false} aria-label="Previous week" className="rounded-md p-1 transition-colors hover:bg-white/[0.06] hover:text-foreground">
                <ChevronLeft size={15} />
              </Link>
              <Link href={`/home?week=${addDays(monday, 7)}`} scroll={false} aria-label="Next week" className="rounded-md p-1 transition-colors hover:bg-white/[0.06] hover:text-foreground">
                <ChevronRight size={15} />
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
                  className={`flex flex-col items-center gap-0.5 rounded-xl py-2 transition-colors ${on ? "bg-foreground text-background" : "hover:bg-white/[0.05]"}`}
                >
                  <span className={`text-[11px] ${on ? "text-background/70" : "text-muted"}`}>{WEEKDAY[weekday(d)]}</span>
                  <span className={`text-base font-semibold tabular-nums ${on ? "text-accent" : d === today ? "text-accent" : ""}`}>{Number(d.slice(8, 10))}</span>
                  <span className={`size-1 rounded-full ${has ? (on ? "bg-background/60" : "bg-accent") : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {!calendar.connected ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted">
                Connect Google Calendar to see meetings here.{" "}
                <Link href="/integrations" className="text-accent hover:underline">
                  Connect it
                </Link>
              </p>
            ) : calendar.error ? (
              <p className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-sm text-rose-200">{calendar.error}</p>
            ) : onDay.length === 0 ? (
              <p className="px-1 py-3 text-sm text-muted">No meetings {day === today ? "today" : `on ${WEEKDAY[weekday(day)]} ${shortDay(day)}`}.</p>
            ) : (
              onDay.map((m) => (
                <div key={m.id} className="rounded-xl border border-accent/20 bg-accent/[0.08] px-3.5 py-3">
                  <p className="text-sm font-medium">{m.title}</p>
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
                    <a href={m.meet} target="_blank" rel="noreferrer" className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-neutral-900 transition-opacity hover:opacity-85">
                      <Video size={12} /> Google Meet
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card icon={<AlarmClock size={15} />} title="Needs attention" aside={attention.length > 0 && <span className="text-xs text-rose-300 tabular-nums">{attention.length} due</span>}>
          {attention.length === 0 ? (
            <p className="px-1 text-sm text-muted">Nothing late or due today.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {attention.slice(0, 6).map((i) => (
                <WorkRow key={i.key} item={i} today={today} />
              ))}
              {attention.length > 6 && <p className="px-1 pt-1 text-xs text-muted">And {attention.length - 6} more</p>}
            </div>
          )}
        </Card>

        <Card
          icon={<ListChecks size={15} />}
          title="My tasks"
          aside={
            <Link href="/my-tasks" className="text-xs text-muted transition-colors hover:text-foreground">
              Open list
            </Link>
          }
        >
          {mine.length === 0 ? (
            <p className="px-1 text-sm text-muted">Nothing on your list.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {mine.slice(0, 5).map((i) => (
                <WorkRow key={i.key} item={i} today={today} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <MeetingDialog ref={meetingRef} people={people} connected={calendar.connected} />
    </div>
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
        {!connected && <p className="text-xs text-amber-200">Connect Google Calendar under Integrations first.</p>}
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
