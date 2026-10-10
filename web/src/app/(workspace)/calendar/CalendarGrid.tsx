"use client";

import { useEffect, useRef, useState } from "react";
import { ListChecks, Megaphone } from "lucide-react";
import type { TaskStatus, Role } from "@/lib/workflow";
import { STAGE } from "@/lib/stages";
import { Avatar, type TaskCardData } from "../TaskCard";
import { TaskDetailsDialog } from "../TaskDetailsDialog";
import type { TaskTagOption } from "../TaskTagPicker";
import { closeOnBackdrop } from "../dialog";

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

// The month as one panel of days. Each day says in a line what it holds —
// for now, how many open tasks the team carried — so it stays readable as
// meetings and events join it later; the day itself opens the whole list,
// and a task in that list opens its full window.
//
// UTC-based date math throughout (see TaskCard's formatDate) so the grid
// renders the same on the server and after hydration.
export function CalendarGrid({
  year,
  month, // 0-indexed
  days,
  postings = {},
  tasks,
  env,
}: {
  year: number;
  month: number;
  days: Record<string, DayEntry[]>;
  // delivered work going live that day (Operations only)
  postings?: Record<string, DayEntry[]>;
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
  const selectedPosts = selected ? (postings[selected] ?? []) : [];
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
            const posts = postings[key] ?? [];
            const isToday = key === todayKey;
            const future = key > todayKey;

            return (
              <div
                key={i}
                role={entries.length + posts.length ? "button" : undefined}
                tabIndex={entries.length + posts.length ? 0 : undefined}
                aria-current={isToday ? "date" : undefined}
                onClick={() => entries.length + posts.length > 0 && showDay(key)}
                onKeyDown={(e) => e.key === "Enter" && entries.length + posts.length > 0 && showDay(key)}
                className={`flex min-h-24 flex-col gap-2 p-2 text-left transition-colors duration-150 ${edges} ${
                  isToday ? "bg-accent/[0.07] shadow-[inset_0_0_0_1px_rgba(75,149,230,0.45)]" : ""
                } ${entries.length + posts.length ? "cursor-pointer hover:bg-white/[0.03]" : ""} ${future && !posts.length ? "opacity-50" : ""}`}
              >
                <span
                  className={`flex size-6 items-center justify-center rounded-full text-xs tabular-nums ${
                    isToday ? "bg-accent font-semibold text-white" : "text-muted"
                  }`}
                >
                  {day}
                </span>
                {/* one line per kind of thing on the day */}
                {entries.length > 0 && (
                  <span className="flex w-fit items-center gap-1.5 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-foreground/85">
                    <ListChecks size={12} className="text-sky-400" />
                    {entries.length} task{entries.length === 1 ? "" : "s"}
                  </span>
                )}
                {posts.length > 0 && (
                  <span className="flex w-fit items-center gap-1.5 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-foreground/85">
                    <Megaphone size={12} className="text-pink-400" />
                    {posts.length} posting{posts.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* one day's whole list; a task in it opens over it, and closing that
          comes back here */}
      <dialog
        ref={dayRef}
        {...closeOnBackdrop}
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground"
      >
        <div className="px-5 pb-3 pt-5">
          <p className="text-base font-medium">{selectedLabel}</p>
        </div>
        {/* the day's open tasks, then what went live, each only if there's any */}
        <div className="max-h-[28rem] overflow-y-auto border-y border-white/[0.06]">
          {(
            [
              ["Tasks", ListChecks, "text-sky-400", selectedEntries],
              ["Postings", Megaphone, "text-pink-400", selectedPosts],
            ] as const
          )
            .filter(([, , , list]) => list.length > 0)
            .map(([label, Icon, tone, list]) => (
              <section key={label} className="pt-3">
                <p className="flex items-center gap-1.5 px-5 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted/70">
                  <Icon size={12} className={tone} />
                  {label} · {list.length}
                </p>
                <ul className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
                  {list.map((e) => (
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
              </section>
            ))}
        </div>
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
