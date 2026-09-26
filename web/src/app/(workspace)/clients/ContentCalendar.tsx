"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Workflow } from "lucide-react";
import { PLAN_DAYS, addDays, daysApart, monthGrid, weekLanes, type PlanItem } from "@/lib/contentPlan";
import type { Role, TaskStatus } from "@/lib/workflow";
import { rescheduleTask, saveContentPlan } from "./actions";
import { Stepper } from "../Stepper";
import { TaskDetailsDialog } from "../TaskDetailsDialog";
import type { TaskCardData } from "../TaskCard";
import type { TaskTagOption } from "../TaskTagPicker";

export type CalendarItem = {
  id: string;
  title: string;
  status: TaskStatus;
  projectId: string;
  // yyyy-mm-dd: when work on it starts (its due day, if nobody said) and when it's due
  start: string;
  due: string;
  // past its day and still not with the client (lib/due.ts)
  overdue: boolean;
};

// What's needed to open a task from the calendar — the team's page only
type DialogEnv = {
  tasks: TaskCardData[];
  clientName: string;
  editors: { id: string; name: string }[];
  projects: { id: string; name: string; client: { id: string; name: string } }[];
  actingUserId: string;
  actingRole: Role;
  taskTags: TaskTagOption[];
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// one colour per project, so a project's tasks read as one run of work
const TONES = [
  { band: "border-sky-400/60 bg-sky-400/10", due: "bg-sky-400", dot: "bg-sky-400" },
  { band: "border-violet-400/60 bg-violet-400/10", due: "bg-violet-400", dot: "bg-violet-400" },
  { band: "border-emerald-400/60 bg-emerald-400/10", due: "bg-emerald-400", dot: "bg-emerald-400" },
  { band: "border-amber-400/60 bg-amber-400/10", due: "bg-amber-400", dot: "bg-amber-400" },
  { band: "border-rose-400/60 bg-rose-400/10", due: "bg-rose-400", dot: "bg-rose-400" },
  { band: "border-cyan-400/60 bg-cyan-400/10", due: "bg-cyan-400", dot: "bg-cyan-400" },
];
const toneOf = (projectId: string) => TONES[[...projectId].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % TONES.length];

// the Monday of the week a day falls in
const mondayOf = (day: string) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
const short = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// The client's work laid out as it'll actually happen: each task a band of
// its project's colour from the day work starts to the day it's due, the due
// day itself solid — so a week reads as the trailer being made Monday and
// Tuesday and landing Wednesday, the reels following on. New projects fill it
// in from the blueprint; dragging a task moves it, start and due together.
// The client's own page shows the same calendar, read-only.
export function ContentCalendar({
  items,
  today,
  clientId,
  plan,
  dialog,
}: {
  items: CalendarItem[];
  // yyyy-mm-dd in India, from the server
  today: string;
  // set on the team's page: the blueprint can be edited and tasks moved
  clientId?: string;
  plan?: PlanItem[];
  dialog?: DialogEnv;
}) {
  const canEdit = !!clientId;
  // Two weeks by default — this one and the next, what's actually in hand —
  // with the whole month a click away.
  const [view, setView] = useState<"weeks" | "month">("weeks");
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [weekOf, setWeekOf] = useState(() => mondayOf(today));
  // a move shows at once; the saved dates arrive with the refreshed items
  const [optimistic, setOptimistic] = useState<{ base: CalendarItem[]; days: Record<string, string> } | null>(null);
  const moved = optimistic?.base === items ? optimistic.days : {};
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ task: TaskCardData; n: number } | null>(null);
  const detailsRef = useRef<{ open: () => void }>(null);

  useEffect(() => {
    if (opened) detailsRef.current?.open();
  }, [opened]);

  // where each task sits now, a move included
  const shown = items.map((it) => {
    const due = moved[it.id];
    if (!due) return it;
    return { ...it, due, start: addDays(it.start, daysApart(it.due, due)) };
  });

  const weeks =
    view === "month"
      ? monthGrid(month.y, month.m)
      : [0, 1].map((w) => Array.from({ length: 7 }, (_, d) => addDays(weekOf, w * 7 + d)));
  const inMonth = (day: string) => view === "weeks" || Number(day.slice(5, 7)) - 1 === month.m;
  const atToday =
    view === "month"
      ? month.y === Number(today.slice(0, 4)) && month.m === Number(today.slice(5, 7)) - 1
      : weekOf === mondayOf(today);
  const step = (n: number) =>
    view === "month"
      ? setMonth(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }))
      : setWeekOf((w) => addDays(w, n * 7));
  const toToday = () => {
    setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });
    setWeekOf(mondayOf(today));
  };
  const label = view === "month" ? `${MONTHS[month.m]} ${month.y}` : `${short(weeks[0][0])} – ${short(weeks[1][6])}`;

  async function move(id: string, day: string) {
    const item = shown.find((i) => i.id === id);
    if (!item || item.due === day) return;
    setError(null);
    setOptimistic({ base: items, days: { ...moved, [id]: day } });
    const res = await rescheduleTask(id, day);
    if (res.error) {
      setOptimistic(null);
      setError(res.error);
    }
  }

  function openTask(id: string) {
    const task = dialog?.tasks.find((t) => t.id === id);
    if (task) setOpened((o) => ({ task, n: (o?.n ?? 0) + 1 }));
  }

  const drag = (it: CalendarItem) => ({
    draggable: canEdit && it.status !== "delivered_and_uploaded",
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      setDragId(it.id);
    },
    onDragEnd: () => {
      setDragId(null);
      setOver(null);
    },
  });

  const dropTarget = (day: string) =>
    canEdit
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (!dragId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (over !== day) setOver(day);
          },
          onDragLeave: (e: React.DragEvent) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            if (dragId) move(dragId, day);
            setDragId(null);
            setOver(null);
          },
        }
      : {};

  // phones: what's due, day by day
  const dueDays = [...new Set(shown.map((i) => i.due))].filter((d) => weeks.flat().includes(d) && inMonth(d)).sort();

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Content calendar</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-5 rounded-sm border border-dashed border-foreground/40 bg-foreground/[0.06]" /> being made
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-foreground/70" /> delivered that day
            </span>
            {canEdit && <span>· drag a task to move it</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && plan && <BlueprintButton clientId={clientId} plan={plan} />}
          {!atToday && (
            <button type="button" onClick={toToday} className="btn btn-xs btn-ghost">
              Today
            </button>
          )}
          <div className="flex gap-0.5 rounded-lg bg-surface-2/60 p-0.5 text-xs">
            {(
              [
                ["weeks", "2 weeks"],
                ["month", "Month"],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`rounded-md px-2.5 py-1.5 ${view === key ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-lg bg-surface-2/60 p-0.5">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={view === "month" ? "Previous month" : "Previous week"}
              className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-32 text-center text-sm font-medium">{label}</span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={view === "month" ? "Next month" : "Next week"}
              className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {error && <p className="mb-2 text-xs text-red-300">{error}</p>}

      {/* the weeks as rows of bands, wide screens */}
      <div key={`${view}-${label}`} className="fade-in hidden overflow-hidden rounded-xl border border-border/60 sm:block">
        <div className="grid grid-cols-7 bg-surface/60 text-xs text-muted">
          {WEEKDAYS.map((d) => (
            <span key={d} className="px-2 py-1.5">
              {d}
            </span>
          ))}
        </div>
        {weeks.map((week) => {
          const { placed, lanes } = weekLanes(week, shown);
          return (
            <div key={week[0]} className="relative border-t border-border/60">
              {/* the days, underneath: the date, and where a task can be dropped */}
              <div className="absolute inset-0 grid grid-cols-7">
                {week.map((day) => (
                  <div
                    key={day}
                    {...dropTarget(day)}
                    className={`p-1.5 transition-colors duration-150 not-first:border-l not-first:border-border/40 ${
                      over === day ? "bg-blue-400/[0.08]" : inMonth(day) ? "" : "bg-background/50"
                    }`}
                  >
                    <span
                      className={`grid h-5 min-w-5 w-fit place-items-center rounded-full px-1 text-xs tabular-nums ${
                        day === today ? "bg-foreground font-medium text-background" : inMonth(day) ? "text-muted" : "text-muted/40"
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                  </div>
                ))}
              </div>
              {/* the tasks, over them — out of the way while one is being dragged */}
              <div
                className={`relative grid min-h-16 grid-cols-7 gap-y-1 pt-8 pb-2 ${dragId ? "pointer-events-none" : ""}`}
                style={{ gridTemplateRows: `repeat(${Math.max(lanes, 1)}, 1.5rem)` }}
              >
                {placed.map(({ item, col, span, lane, startsHere, endsHere }) => {
                  const tone = toneOf(item.projectId);
                  const done = item.status === "delivered_and_uploaded";
                  const oneDay = span === 1 && endsHere;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      {...drag(item)}
                      onClick={() => openTask(item.id)}
                      title={`${item.title} — ${item.start === item.due ? `due ${short(item.due)}` : `${short(item.start)} → due ${short(item.due)}`}`}
                      style={{ gridColumn: `${col + 1} / span ${span}`, gridRow: lane + 1 }}
                      className={`relative mx-1 flex min-w-0 items-center overflow-hidden text-left text-xs transition-opacity duration-150 ${
                        oneDay ? `${tone.due} rounded-md` : `border border-dashed ${tone.band} ${startsHere ? "rounded-l-md" : "-ml-px rounded-l-none border-l-0"} ${endsHere ? "rounded-r-md" : "-mr-px rounded-r-none border-r-0"}`
                      } ${dragId === item.id ? "opacity-40" : done ? "opacity-50" : ""} ${canEdit && !done ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      {/* the day it lands, solid */}
                      {endsHere && !oneDay && (
                        <span className={`absolute inset-y-0 right-0 ${item.overdue ? "bg-red-400" : tone.due}`} style={{ width: `${100 / span}%` }} />
                      )}
                      <span
                        className={`relative flex min-w-0 items-center gap-1 px-1.5 ${oneDay ? "font-medium text-background" : "text-foreground/90"}`}
                        style={endsHere && !oneDay ? { maxWidth: `${100 - 100 / span}%` } : undefined}
                      >
                        {done && <Check size={11} className="shrink-0" />}
                        <span className="truncate">{item.title}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* phones: what's due, day by day */}
      <div className="flex flex-col gap-3 sm:hidden">
        {dueDays.length === 0 ? (
          <p className="rounded-xl bg-surface/40 px-4 py-6 text-center text-sm text-muted">
            Nothing planned {view === "month" ? "this month" : "these two weeks"}.
          </p>
        ) : (
          dueDays.map((day) => (
            <div key={day} className="flex flex-col gap-1">
              <p className={`text-xs ${day === today ? "font-medium text-foreground" : "text-muted"}`}>
                Due {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                {day === today && " · Today"}
              </p>
              {shown
                .filter((i) => i.due === day)
                .map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => openTask(i.id)}
                    className="flex min-w-0 items-center gap-2 rounded-md bg-surface-2/80 px-2 py-1.5 text-left text-xs"
                  >
                    <span className={`size-2 shrink-0 rounded-full ${toneOf(i.projectId).dot}`} />
                    <span className="truncate">{i.title}</span>
                    {i.start !== i.due && <span className="ml-auto shrink-0 text-muted">from {short(i.start)}</span>}
                  </button>
                ))}
            </div>
          ))
        )}
      </div>

      {dialog && opened && (
        <TaskDetailsDialog
          key={`${opened.task.id}-${opened.n}`}
          ref={detailsRef}
          task={opened.task}
          clientName={dialog.clientName}
          editors={dialog.editors}
          projects={dialog.projects}
          actingUserId={dialog.actingUserId}
          actingRole={dialog.actingRole}
          taskTags={dialog.taskTags}
        />
      )}
    </section>
  );
}

// The blueprint: what one new project of this client gets, and across which
// days of its week each is made — fitted to each project's own deadline.
function BlueprintButton({ clientId, plan }: { clientId: string; plan: PlanItem[] }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(plan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (type: string, patch: Partial<PlanItem>) =>
    setDraft((d) => d.map((p) => (p.type === type ? { ...p, ...patch } : p)));
  const total = draft.reduce((n, p) => n + p.count, 0);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await saveContentPlan(clientId, draft);
    setSaving(false);
    if (res.error) return setError(res.error);
    ref.current?.close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(plan);
          setError(null);
          ref.current?.showModal();
        }}
        className="btn btn-sm btn-ghost"
      >
        <Workflow size={14} /> Blueprint
      </button>
      <dialog
        ref={ref}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 text-foreground"
      >
        <h2 className="text-base font-semibold">Blueprint</h2>
        <p className="mt-1 text-sm text-muted">
          What one new project gets, and across which days of a {PLAN_DAYS}-day project each is made. A project with a
          different deadline gets the same shape, stretched or squeezed to fit.
        </p>

        <div className="mt-5 flex flex-col divide-y divide-border/50">
          {draft.map((p) => (
            <div
              key={p.type}
              className={`flex flex-col gap-2.5 py-3 transition-opacity duration-150 ${p.count ? "" : "opacity-50"}`}
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="w-36 text-sm font-medium">{p.type}</span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <Stepper value={p.count} min={0} max={30} onChange={(n) => set(p.type, { count: n })} /> per project
                </span>
                {p.count > 0 && (
                  <span className="flex items-center gap-2 text-xs text-muted">
                    days
                    <Stepper value={p.startDay} min={0} max={60} onChange={(n) => set(p.type, { startDay: n, endDay: Math.max(n, p.endDay) })} />
                    to
                    <Stepper value={p.endDay} min={p.startDay} max={60} onChange={(n) => set(p.type, { endDay: n })} />
                  </span>
                )}
              </div>
              {/* the range on the project's week, at a glance */}
              {p.count > 0 && (
                <span className="ml-36 grid h-2 grid-cols-8 gap-0.5 max-sm:ml-0">
                  {Array.from({ length: PLAN_DAYS + 1 }, (_, d) => (
                    <span
                      key={d}
                      className={`rounded-full ${
                        d === p.endDay ? "bg-foreground/70" : d >= p.startDay && d < p.endDay ? "bg-foreground/25" : "bg-foreground/[0.06]"
                      }`}
                    />
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-muted">
          {total ? `One project: ${total} task${total === 1 ? "" : "s"}.` : "Nothing is planned for new projects."} Day 0 is the day a
          project starts; its deadline is set when it&apos;s created.
        </p>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => ref.current?.close()} className="btn btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn btn-glow disabled:opacity-60">
            {saving ? "Saving…" : "Save blueprint"}
          </button>
        </div>
      </dialog>
    </>
  );
}
