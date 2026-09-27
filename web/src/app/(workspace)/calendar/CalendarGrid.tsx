"use client";

import { useEffect, useRef, useState } from "react";
import type { TaskStatus, Role } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";
import { Avatar, type TaskCardData } from "../TaskCard";
import { TaskDetailsDialog } from "../TaskDetailsDialog";
import type { TaskTagOption } from "../TaskTagPicker";

export type DayEntry = { taskId: string; title: string; clientName: string; status: TaskStatus; actorName: string };

// what the task window needs, the same as the board passes it
export type TaskEnv = {
  editors: { id: string; name: string }[];
  projects: { id: string; name: string; client: { id: string; name: string } }[];
  actingUserId: string;
  actingRole: Role;
  taskTags: TaskTagOption[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHOWN = 3;

// The month as one panel of days. Each day shows the first few tasks the
// team was carrying (a dot in each one's stage colour) and how many more;
// a task opens its full window, a day opens its whole list.
//
// UTC-based date math throughout (see TaskCard's formatDate) so the grid
// renders the same on the server and after hydration.
export function CalendarGrid({
  year,
  month, // 0-indexed
  days,
  tasks,
  env,
}: {
  year: number;
  month: number;
  days: Record<string, DayEntry[]>;
  tasks: TaskCardData[];
  env: TaskEnv;
}) {
  const dayRef = useRef<HTMLDialogElement>(null);
  const detailsRef = useRef<{ open: () => void }>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // bumped on every pick, so picking the same task again reopens it
  const [opened, setOpened] = useState(0);

  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayKey = new Date().toISOString().slice(0, 10);

  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const openTask = tasks.find((t) => t.id === openTaskId) ?? null;
  // the window mounts for the task picked, then opens
  useEffect(() => {
    if (openTaskId) detailsRef.current?.open();
  }, [openTaskId, opened]);

  function showTask(id: string) {
    setOpenTaskId(id);
    setOpened((n) => n + 1);
  }

  function showDay(key: string) {
    setSelected(key);
    dayRef.current?.showModal();
  }

  const selectedEntries = selected ? (days[selected] ?? []) : [];
  const selectedLabel = selected
    ? new Date(`${selected}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    : "";

  return (
    <div>
      <div className="panel overflow-hidden rounded-3xl">
        <div className="grid grid-cols-7 border-b border-white/[0.06]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-3 py-2.5 text-xs font-medium text-muted">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            // hairlines between days: every cell but the last in a row draws
            // its right edge, every row but the last its bottom one
            const edges = `${i % 7 !== 6 ? "border-r" : ""} ${i < cells.length - 7 ? "border-b" : ""} border-white/[0.05]`;
            if (day === null) return <div key={i} className={`min-h-28 bg-black/20 ${edges}`} />;
            const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const entries = days[key] ?? [];
            const isToday = key === todayKey;
            const future = key > todayKey;

            return (
              <div
                key={i}
                role={entries.length ? "button" : undefined}
                tabIndex={entries.length ? 0 : undefined}
                onClick={() => entries.length > 0 && showDay(key)}
                onKeyDown={(e) => e.key === "Enter" && entries.length > 0 && showDay(key)}
                className={`group flex min-h-28 flex-col gap-1.5 p-2 text-left transition-colors duration-150 ${edges} ${
                  entries.length ? "cursor-pointer hover:bg-white/[0.03]" : ""
                } ${future ? "opacity-50" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`flex size-6 items-center justify-center rounded-full text-xs tabular-nums ${
                      isToday ? "bg-accent font-semibold text-white" : "text-muted"
                    }`}
                  >
                    {day}
                  </span>
                  {entries.length > 0 && <span className="pr-1 text-[11px] tabular-nums text-muted/70">{entries.length}</span>}
                </div>
                {entries.slice(0, SHOWN).map((e) => (
                  <button
                    key={e.taskId}
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      showTask(e.taskId);
                    }}
                    title={`${e.clientName} · ${e.title}`}
                    className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-[11px] text-foreground/85 transition-colors hover:bg-white/[0.06]"
                  >
                    <span className={`size-1.5 shrink-0 rounded-full ${STAGE[e.status].dot}`} />
                    <span className="truncate">{e.title}</span>
                  </button>
                ))}
                {entries.length > SHOWN && <span className="px-1.5 text-[11px] text-muted">+{entries.length - SHOWN} more</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* one day's whole list; a task in it opens over it, and closing that
          comes back here */}
      <dialog
        ref={dayRef}
        onClick={(e) => {
          if (e.target === dayRef.current) dayRef.current?.close();
        }}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground"
      >
        <div className="px-5 pb-3 pt-5">
          <p className="text-base font-medium">{selectedLabel}</p>
          <p className="mt-0.5 text-xs text-muted">
            {selectedEntries.length} open task{selectedEntries.length === 1 ? "" : "s"}
          </p>
        </div>
        <ul className="max-h-96 divide-y divide-white/[0.05] overflow-y-auto border-y border-white/[0.06]">
          {selectedEntries.map((e) => (
            <li key={e.taskId}>
              <button
                type="button"
                onClick={() => showTask(e.taskId)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.03]"
              >
                <span className={`size-2 shrink-0 rounded-full ${STAGE[e.status].dot}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{e.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {e.clientName} · {STAGE[e.status].label}
                  </span>
                </span>
                <Avatar name={e.actorName} size={22} presence={false} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end px-5 py-3">
          <button type="button" onClick={() => dayRef.current?.close()} className="btn btn-ghost">
            Close
          </button>
        </div>
      </dialog>

      {openTask && (
        <TaskDetailsDialog
          key={openTask.id}
          ref={detailsRef}
          task={openTask}
          clientName={openTask.project.client.name}
          {...env}
        />
      )}
    </div>
  );
}
