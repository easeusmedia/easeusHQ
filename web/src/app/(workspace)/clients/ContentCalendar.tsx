"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Workflow } from "lucide-react";
import { STAGE } from "@/lib/stages";
import { monthGrid, type PlanItem } from "@/lib/contentPlan";
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
  // yyyy-mm-dd, the day it's due
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

// The client's work laid out by day — every task on the day it's due, so the
// month reads as the plan it is: which edit, which reel, which thumbnail,
// when. New projects fill it in from the blueprint; dragging a task to
// another day moves its due date. The client's own page shows the same
// calendar, read-only.
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
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  // a move shows at once; the saved date arrives with the refreshed items
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

  const byDay = new Map<string, CalendarItem[]>();
  for (const it of items) {
    const day = moved[it.id] ?? it.due;
    byDay.set(day, [...(byDay.get(day) ?? []), it]);
  }

  const weeks = monthGrid(month.y, month.m);
  const inMonth = (day: string) => Number(day.slice(5, 7)) - 1 === month.m;
  const isThisMonth = month.y === Number(today.slice(0, 4)) && month.m === Number(today.slice(5, 7)) - 1;
  const step = (n: number) =>
    setMonth(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));

  async function move(id: string, day: string) {
    const item = items.find((i) => i.id === id);
    if (!item || (moved[id] ?? item.due) === day) return;
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

  const chip = (it: CalendarItem) => {
    const done = it.status === "delivered_and_uploaded";
    const openable = !!dialog?.tasks.some((t) => t.id === it.id);
    return (
      <button
        key={it.id}
        type="button"
        title={it.title}
        draggable={canEdit && !done}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          setDragId(it.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOver(null);
        }}
        onClick={() => openTask(it.id)}
        className={`flex w-full min-w-0 items-center gap-1.5 rounded-md bg-surface-2/80 px-1.5 py-1 text-left text-xs transition-[background-color,opacity] duration-150 ${
          openable ? "hover:bg-surface-2" : "cursor-default"
        } ${canEdit && !done ? "active:cursor-grabbing" : ""} ${dragId === it.id ? "opacity-40" : ""} ${
          done ? "text-muted" : it.overdue ? "text-red-300" : "text-foreground"
        }`}
      >
        {done ? (
          <Check size={11} className="shrink-0 text-emerald-400" />
        ) : (
          <span className={`size-1.5 shrink-0 rounded-full ${STAGE[it.status].dot}`} />
        )}
        <span className="truncate">{it.title}</span>
      </button>
    );
  };

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

  const monthDays = weeks.flat().filter(inMonth);
  const planned = monthDays.filter((d) => byDay.has(d));

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Content calendar</h2>
          <p className="mt-0.5 text-xs text-muted">
            Every task on the day it&apos;s due.
            {canEdit && " New projects are laid out here from the blueprint — drag a task to another day to move it."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && plan && <BlueprintButton clientId={clientId} plan={plan} />}
          {!isThisMonth && (
            <button
              type="button"
              onClick={() => setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })}
              className="btn btn-xs btn-ghost"
            >
              Today
            </button>
          )}
          <div className="flex items-center gap-0.5 rounded-lg bg-surface-2/60 p-0.5">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous month"
              className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-32 text-center text-sm font-medium">
              {MONTHS[month.m]} {month.y}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next month"
              className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {error && <p className="mb-2 text-xs text-red-300">{error}</p>}

      {/* the month as a grid, wide screens */}
      <div key={`${month.y}-${month.m}`} className="fade-in hidden overflow-hidden rounded-xl border border-border/60 sm:block">
        <div className="grid grid-cols-7 bg-surface/60 text-xs text-muted">
          {WEEKDAYS.map((d) => (
            <span key={d} className="px-2 py-1.5">
              {d}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 border-t border-border/60">
            {week.map((day) => {
              const list = byDay.get(day) ?? [];
              return (
                <div
                  key={day}
                  {...dropTarget(day)}
                  className={`flex min-h-28 min-w-0 flex-col gap-1 p-1.5 transition-colors duration-150 not-first:border-l not-first:border-border/40 ${
                    over === day ? "bg-blue-400/[0.08]" : inMonth(day) ? "" : "bg-background/50"
                  }`}
                >
                  <span
                    className={`mb-0.5 grid h-5 min-w-5 place-items-center self-start rounded-full px-1 text-xs tabular-nums ${
                      day === today ? "bg-foreground font-medium text-background" : inMonth(day) ? "text-muted" : "text-muted/40"
                    }`}
                  >
                    {Number(day.slice(8))}
                  </span>
                  {list.map(chip)}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* phones: just the days that have something on them */}
      <div className="flex flex-col gap-3 sm:hidden">
        {planned.length === 0 ? (
          <p className="rounded-xl bg-surface/40 px-4 py-6 text-center text-sm text-muted">Nothing planned this month.</p>
        ) : (
          planned.map((day) => (
            <div key={day} className="flex flex-col gap-1">
              <p className={`text-xs ${day === today ? "font-medium text-foreground" : "text-muted"}`}>
                {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                })}
                {day === today && " · Today"}
              </p>
              {(byDay.get(day) ?? []).map(chip)}
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

// The blueprint: what one new project of this client gets, and when each is
// due, in days from the day the project starts.
function BlueprintButton({ clientId, plan }: { clientId: string; plan: PlanItem[] }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(plan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (type: string, patch: Partial<PlanItem>) =>
    setDraft((d) => d.map((p) => (p.type === type ? { ...p, ...patch } : p)));

  const total = draft.reduce((n, p) => n + p.count, 0);
  const span = Math.max(0, ...draft.filter((p) => p.count > 0).map((p) => p.startDay + (p.count - 1) * p.everyDays));

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
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 text-foreground"
      >
        <h2 className="text-base font-semibold">Blueprint</h2>
        <p className="mt-1 text-sm text-muted">
          What one new project gets, and when each is due — in days from the day the project starts. New projects
          are laid out on the calendar from this; the calendar is where they&apos;re moved afterwards.
        </p>

        <div className="mt-5 flex flex-col divide-y divide-border/50">
          {draft.map((p) => (
            <div
              key={p.type}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 transition-opacity duration-150 ${
                p.count ? "" : "opacity-50"
              }`}
            >
              <span className="w-36 text-sm font-medium">{p.type}</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                <Stepper value={p.count} min={0} max={30} onChange={(n) => set(p.type, { count: n })} /> per project
              </span>
              {p.count > 0 && (
                <span className="flex items-center gap-2 text-xs text-muted">
                  {p.count > 1 ? "first on day" : "on day"}
                  <Stepper value={p.startDay} min={0} max={365} onChange={(n) => set(p.type, { startDay: n })} />
                </span>
              )}
              {p.count > 1 && (
                <span className="flex items-center gap-2 text-xs text-muted">
                  then every
                  <Stepper value={p.everyDays} min={1} max={60} onChange={(n) => set(p.type, { everyDays: n })} />
                  days
                </span>
              )}
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-muted">
          {total
            ? `One project: ${total} task${total === 1 ? "" : "s"} over ${span + 1} day${span ? "s" : ""}.`
            : "Nothing is planned for new projects."}
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
