"use client";

import { useEffect, useRef, useState } from "react";
import { STAGE } from "@/lib/stages";
import { addDays, daysIn, packLanes, type Span } from "@/lib/timeline";
import { Avatar, DUE_TONE, type TaskCardData } from "../TaskCard";
import { TaskDetailsDialog } from "../TaskDetailsDialog";
import type { TaskEnv } from "./CalendarGrid";

export type TimelineTask = Span & {
  id: string;
  title: string;
  client: string;
  status: TaskCardData["status"];
  assignee: string | null;
  tag: string | null;
  // still open past its due day (its bar runs on to today)
  overdue: boolean;
};

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

// One week of the team's work as a timeline: every task a bar from the day
// work starts to the day it's due, in as few rows as fit; a line through
// today. A bar that runs on past the week says so with an open end. A bar
// opens the task's window.
export function CalendarTimeline({
  weekStart,
  today,
  items,
  tasks,
  env,
}: {
  weekStart: string;
  today: string;
  items: TimelineTask[];
  tasks: TaskCardData[];
  env: TaskEnv;
}) {
  const detailsRef = useRef<{ open: () => void }>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [opened, setOpened] = useState(0);
  const openTask = tasks.find((t) => t.id === openTaskId) ?? null;
  useEffect(() => {
    if (openTaskId) detailsRef.current?.open();
  }, [openTaskId, opened]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = days[6];
  const lanes = packLanes(items);
  const todayAt = days.indexOf(today);

  return (
    <div className="panel overflow-hidden rounded-3xl">
      {/* a phone scrolls the week sideways rather than squeezing it */}
      <div className="overflow-x-auto">
        <div className="relative min-w-[56rem]">
          <div className="grid grid-cols-7 border-b border-white/[0.06]">
            {days.map((day, i) => (
              <div key={day} className="flex items-baseline gap-1.5 px-4 py-3.5">
                <span className="text-[11px] text-muted">{WEEKDAYS[i]}</span>
                <span className={`text-lg tabular-nums ${day === today ? "font-semibold text-accent" : "text-foreground/85"}`}>{Number(day.slice(8))}</span>
              </div>
            ))}
          </div>

          {/* the days' own hairlines, and today's line through the lot */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 bottom-0 grid grid-cols-7">
            {days.map((day, i) => (
              <div key={day} className={i ? "border-l border-white/[0.04]" : ""} />
            ))}
          </div>
          {todayAt >= 0 && (
            <div aria-hidden className="pointer-events-none absolute top-[3.1rem] bottom-0 w-px bg-accent/70" style={{ left: `${((todayAt + 0.5) / 7) * 100}%` }}>
              <span className="absolute -top-0.5 -left-[2.5px] size-1.5 rounded-full bg-accent" />
            </div>
          )}

          {lanes.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-muted">Nothing scheduled this week.</p>
          ) : (
            <div className="relative grid grid-cols-7 gap-y-3 px-1.5 py-5" style={{ gridTemplateRows: `repeat(${lanes.length}, auto)` }}>
              {lanes.flatMap((lane, row) =>
                lane.map((t) => {
                  const from = Math.max(0, days.indexOf(t.start < weekStart ? weekStart : t.start));
                  const to = days.indexOf(t.end > weekEnd ? weekEnd : t.end);
                  const before = t.start < weekStart;
                  const after = t.end > weekEnd;
                  const done = t.status === "delivered_and_uploaded";
                  const n = daysIn(t);
                  // one day wide: the title gets two lines, and the face stays out of its way
                  const narrow = to === from;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      title={t.title}
                      onClick={() => {
                        setOpenTaskId(t.id);
                        setOpened((k) => k + 1);
                      }}
                      style={{ gridRow: row + 1, gridColumn: `${from + 1} / ${to + 2}` }}
                      // solid, so today's line passes behind rather than through
                      className={`mx-1 flex min-w-0 items-center gap-2.5 border border-white/[0.07] bg-surface-2 px-2.5 py-2 text-left transition-colors hover:border-white/[0.14] hover:bg-hover ${
                        before ? "rounded-l-md" : "rounded-l-xl"
                      } ${after ? "rounded-r-md" : "rounded-r-xl"} ${done ? "opacity-55" : ""}`}
                    >
                      <span className={`w-[3px] shrink-0 self-stretch rounded-full ${STAGE[t.status].dot}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[13px] font-medium leading-snug ${narrow ? "line-clamp-2" : "truncate"}`}>{t.title}</span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
                          {!narrow && <span className="truncate">{t.tag ? `${t.client} · ${t.tag}` : t.client}</span>}
                          <span className={`shrink-0 ${t.overdue ? DUE_TONE.overdue : "text-muted/70"}`}>
                            {t.overdue ? "Overdue" : `${n} day${n === 1 ? "" : "s"}`}
                          </span>
                        </span>
                      </span>
                      {t.assignee && !narrow && <Avatar name={t.assignee} size={24} presence={false} />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {openTask && <TaskDetailsDialog key={openTask.id} ref={detailsRef} task={openTask} clientName={openTask.project.client.name} {...env} />}
    </div>
  );
}
