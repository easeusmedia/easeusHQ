"use client";

import { useEffect, useRef, useState } from "react";
import { Users, Video, X } from "lucide-react";
import type { Role } from "@/lib/workflow";
import { addDays } from "@/lib/editorKpi";
import { Avatar, type TaskCardData } from "../TaskCard";
import { TaskDetailsDialog } from "../TaskDetailsDialog";
import type { TaskTagOption } from "../TaskTagPicker";
import { closeOnBackdrop } from "../dialog";
import { Bone } from "../Skeleton";
import { paramOrProp, setParam } from "../urlState";
import { isDay } from "@/lib/dayActivity";
import { openDay as readDay, taskForWindow } from "./actions";
import type { Day } from "./day";

// what the task window needs, the same as the board passes it
export type TaskEnv = {
  editors: { id: string; name: string }[];
  projects: { id: string; name: string; client: { id: string; name: string } }[];
  actingUserId: string;
  actingRole: Role;
  taskTags: TaskTagOption[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LABEL = "mb-2.5 text-[12px] font-medium uppercase tracking-wider text-muted/70";
// a day's contents easing in once read, for anyone who hasn't asked for less motion (as Team work does)
const ARRIVE = "motion-safe:animate-[fade-in_0.24s_cubic-bezier(0.22,1,0.36,1)]";

// "4:05 pm", in IST
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// The month as a calm grid of days: no task counts in it (Abhishek, 26 Oct
// 2026), only a small dot under a day that has a meeting. A day opens what
// happened that day across the company (calendar/day.ts), read when it's
// opened; a client task in it opens its own window over it.
//
// Days are strings (yyyy-mm-dd) and IST's today comes from the server, so
// the grid renders the same on the server and after hydration.
export function CalendarGrid({
  year,
  month, // 0-indexed
  today,
  meetingDays,
  openDay,
  env,
}: {
  year: number;
  month: number;
  today: string;
  meetingDays: string[];
  // ?day=, opened on arrival
  openDay: string | null;
  env: TaskEnv;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // the address bar over the prop: on Back, Next replays the payload it
  // cached before the day was opened or closed (urlState paramOrProp)
  const [selected, setSelected] = useState<string | null>(() => {
    const d = paramOrProp("day", openDay ?? undefined);
    return isDay(d) ? d : null;
  });
  // "error" when it couldn't be read, so a failed load isn't shown as a quiet day
  const [day, setDay] = useState<{ key: string; data: Day | "error" } | null>(null);
  // the day last asked for: an answer for an earlier one is dropped
  const asked = useRef<string | null>(null);

  const details = useRef<{ open: () => void }>(null);
  const [task, setTask] = useState<TaskCardData | null>(null);
  // bumped on every pick, so picking the same task again reopens it
  const [opened, setOpened] = useState(0);
  useEffect(() => {
    if (task) details.current?.open();
  }, [task, opened]);

  // whole weeks, Sunday first, with the days either side of the month muted
  const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lead = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const weeks = Math.ceil((lead + new Date(Date.UTC(year, month + 1, 0)).getUTCDate()) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(first, i - lead));
  const meets = new Set(meetingDays);

  function fetchDay(key: string) {
    asked.current = key;
    readDay(key)
      .then((data) => asked.current === key && setDay({ key, data: data ?? "error" }))
      .catch(() => asked.current === key && setDay({ key, data: "error" }));
  }

  function show(key: string) {
    setSelected(key);
    setParam("day", key);
    dialog.current?.showModal();
    fetchDay(key);
  }

  // a link with ?day= arrives with that day open
  const arrived = useRef(selected);
  useEffect(() => {
    if (!arrived.current) return;
    dialog.current?.showModal();
    fetchDay(arrived.current);
  }, []);

  function showTask(id: string) {
    taskForWindow(id).then((t) => {
      if (!t) return;
      setTask(t);
      setOpened((n) => n + 1);
    });
  }

  const loaded = day && day.key === selected ? day.data : undefined;

  return (
    <div>
      <div className="panel overflow-hidden rounded-3xl">
        <div className="grid grid-cols-7 border-b border-white/[0.06]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2.5 text-xs font-medium text-muted sm:px-3">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            // hairlines between days: every cell but the last in a row draws
            // its right edge, every row but the last its bottom one
            const edges = `${i % 7 !== 6 ? "border-r" : ""} ${i < cells.length - 7 ? "border-b" : ""} border-white/[0.05]`;
            const inMonth = d.slice(0, 7) === first.slice(0, 7);
            const isToday = d === today;
            const lit = d === selected;
            const meeting = meets.has(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => show(d)}
                aria-current={isToday ? "date" : undefined}
                aria-label={`${dayLabel(d)}${meeting ? ", meetings" : ""}`}
                className={`flex min-h-16 flex-col items-start p-1.5 text-left sm:min-h-24 sm:p-2 ${edges} ${
                  lit ? "bg-accent/[0.08] shadow-[inset_0_0_0_1px_rgba(75,149,230,0.5)]" : `${inMonth ? "" : "bg-black/20"} hover:bg-white/[0.04]`
                }`}
              >
                <span className="flex flex-col items-center gap-1">
                  <span
                    className={`flex size-7 items-center justify-center rounded-full text-[13px] tabular-nums transition-colors duration-200 motion-reduce:transition-none ${
                      isToday ? "bg-accent font-semibold text-white" : lit ? "font-medium text-foreground" : inMonth ? "text-foreground/80" : "text-muted/50"
                    }`}
                  >
                    {Number(d.slice(8))}
                  </span>
                  <span className={`size-1 rounded-full ${meeting ? (inMonth ? "bg-muted" : "bg-muted/50") : "bg-transparent"}`} />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* one day, everything that happened in it; a task opens over it, and
          closing that comes back here */}
      <dialog
        ref={dialog}
        {...closeOnBackdrop}
        onClose={() => setParam("day", null)}
        aria-labelledby="calendar-day"
        className="glass fixed top-1/2 left-1/2 m-0 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl p-0 text-foreground"
      >
        <div className="flex max-h-[min(42rem,calc(100dvh-2rem))] flex-col">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
            <h2 id="calendar-day" className="text-base font-medium">
              {selected ? dayLabel(selected) : ""}
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label="Close"
              className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/[0.06] px-5 py-4">
            {loaded === undefined ? (
              <div className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <Bone key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : loaded === "error" ? (
              <p className={`py-8 text-center text-sm text-muted ${ARRIVE}`}>Couldn&apos;t load this day</p>
            ) : (
              <DayView key={selected} data={loaded} onTask={showTask} />
            )}
          </div>
        </div>
      </dialog>

      {task && <TaskDetailsDialog key={task.id} ref={details} task={task} clientName={task.project.client.name} {...env} />}
    </div>
  );
}

// The day itself: its meetings first, then each person's work, or, for a
// day still to come, what's due then
function DayView({ data, onTask }: { data: Day; onTask: (id: string) => void }) {
  const meetings = data.meetings ?? [];
  const people = data.people;
  const due = data.due ?? [];
  if (!meetings.length && !people.length && !due.length) {
    return <p className={`py-8 text-center text-sm text-muted ${ARRIVE}`}>Nothing on this day</p>;
  }
  return (
    <div className={`flex flex-col gap-6 ${ARRIVE}`}>
      {meetings.length > 0 && (
        <section>
          <h3 className={LABEL}>Meetings</h3>
          <ul className="flex flex-col gap-2">
            {meetings.map((m) => (
              <li key={m.id} className="relative overflow-hidden rounded-xl bg-white/[0.04] py-2.5 pr-3 pl-4 ring-1 ring-white/[0.08]">
                <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-foreground/40" />
                <p className="truncate text-sm font-medium">{m.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="tabular-nums">{m.allDay ? "All day" : `${clock(m.start)} – ${clock(m.end)}`}</span>
                  {m.people > 0 && (
                    <span className="flex items-center gap-1">
                      <Users size={12} /> {m.people}
                    </span>
                  )}
                  {m.meet && (
                    <a href={m.meet} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-foreground/80 hover:text-foreground">
                      <Video size={12} /> Google Meet
                    </a>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {people.length > 0 && (
        <section>
          <h3 className={LABEL}>Work</h3>
          <ul className="flex flex-col gap-5">
            {people.map((p) => (
              <li key={p.id}>
                <p className="mb-1.5 flex items-center gap-2.5 text-sm font-medium">
                  <Avatar name={p.name} size={24} />
                  {p.name}
                </p>
                <ul className="ml-3 flex flex-col border-l border-white/[0.06] pl-3">
                  {p.tasks.map((t) => (
                    <li key={`${t.kind}${t.id}`}>
                      <Row onClick={t.kind === "task" ? () => onTask(t.id) : undefined}>
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate text-sm">{t.title}</span>
                          {t.where && <span className="shrink-0 truncate text-xs text-muted">{t.where}</span>}
                        </span>
                        {t.lines.map((l, i) => (
                          <span key={i} className="mt-1 flex items-baseline justify-between gap-3 text-xs">
                            <span className="min-w-0 text-foreground/80">
                              {l.text}
                              {l.note && <span className="block text-muted">{l.note}</span>}
                            </span>
                            <span className="shrink-0 text-muted tabular-nums">{l.time}</span>
                          </span>
                        ))}
                      </Row>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {due.length > 0 && (
        <section>
          <h3 className={LABEL}>Due</h3>
          <ul className="flex flex-col">
            {due.map((d) => (
              <li key={`${d.kind}${d.id}`}>
                <Row onClick={d.kind === "task" ? () => onTask(d.id) : undefined}>
                  <span className="flex items-center gap-3">
                    {d.person && <Avatar name={d.person} size={22} />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{d.title}</span>
                      <span className="block truncate text-xs text-muted">{[d.where, d.stage].filter(Boolean).join(" · ")}</span>
                    </span>
                  </span>
                </Row>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// a task's block: a client task opens its window; a to-do stays as it is
function Row({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  const box = "block w-full rounded-xl px-2.5 py-2 text-left";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${box} hover:bg-white/[0.04]`}>
      {children}
    </button>
  ) : (
    <div className={box}>{children}</div>
  );
}
