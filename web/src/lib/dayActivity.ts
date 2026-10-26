import { STAGE, stageLabel } from "./stages.ts";
import { dayOf, settle, shortDay } from "./editorKpi.ts";
import type { TaskStatus } from "./workflow.ts";

// One day of the company's work, as the Calendar opens it: what each person
// did that day, task by task, each a few timed lines. Pure (no database),
// so the grouping is testable on its own; calendar/day.ts reads the rows.

// An IST day as the moments it runs between, [from, to)
export function dayBounds(day: string): { from: Date; to: Date } {
  const from = new Date(`${day}T00:00:00+05:30`);
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

// a real day, not just its shape: 2026-13-45 and 2026-02-30 aren't days,
// so a typed ?day= like them is ignored
export function isDay(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { from } = dayBounds(s);
  return !isNaN(from.getTime()) && dayOf(from) === s;
}

// a client task (Task) or a to-do (WorkTask), as its line in the day names it
export type DayTask = { kind: "task" | "work"; id: string; title: string; where: string | null; workflow?: string };

export type DayEvent = { personId: string; at: Date; task: DayTask } & (
  | { what: "created" }
  | { what: "completed" }
  | { what: "move"; from: string; to: string }
  | { what: "date"; from: Date | null; to: Date | null; reason: string }
);

export type DayLine = { at: string; time: string; text: string; note: string | null };
export type DayPerson = { id: string; name: string; tasks: (DayTask & { lines: DayLine[] })[] };

// "4:05 pm", in IST
const clock = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const stage = (s: string, workflow?: string) => (s in STAGE ? stageLabel(s as TaskStatus, workflow) : s);
const date = (d: Date) => shortDay(dayOf(d));

function text(e: DayEvent): { text: string; note: string | null } {
  switch (e.what) {
    case "created":
      return { text: "Created", note: null };
    case "completed":
      return { text: "Completed", note: null };
    case "move":
      return { text: `${stage(e.from, e.task.workflow)} → ${stage(e.to, e.task.workflow)}`, note: null };
    case "date": {
      // the same date both sides: ticked off after it was due (TaskRecordPanel reads it the same way)
      const { from, to } = e;
      const said =
        from && to && dayOf(from) === dayOf(to)
          ? "Ticked off late"
          : to
            ? from
              ? `Due date moved from ${date(from)} to ${date(to)}`
              : `Due date set to ${date(to)}`
            : "Due date cleared";
      return { text: said, note: e.reason || null };
    }
  }
}

// Everyone who did something on `day`: each task they touched once, with
// what happened to it that day in time order. People who did the most come
// first; a person's tasks in the order the day reached them. A stage
// clicked by mistake and put straight back isn't shown (editorKpi settle).
export function groupDay(day: string, events: DayEvent[], names: Map<string, string>): DayPerson[] {
  const today = events.filter((e) => dayOf(e.at) === day).sort((a, b) => a.at.getTime() - b.at.getTime());

  // per task, the moves that stand once slips are undone
  const moves = new Map<string, DayEvent[]>();
  for (const e of today) if (e.what === "move") moves.set(e.task.id, [...(moves.get(e.task.id) ?? []), e]);
  const kept = new Set<DayEvent>();
  for (const list of moves.values()) for (const m of settle(list as (DayEvent & { from: string; to: string })[])) kept.add(m as DayEvent);

  const people = new Map<string, Map<string, DayTask & { lines: DayLine[] }>>();
  const lines = new Map<string, number>();
  for (const e of today) {
    if (e.what === "move" && !kept.has(e)) continue;
    const tasks = people.get(e.personId) ?? new Map();
    people.set(e.personId, tasks);
    const key = `${e.task.kind}:${e.task.id}`;
    const task = tasks.get(key) ?? { ...e.task, lines: [] };
    tasks.set(key, task);
    task.lines.push({ at: e.at.toISOString(), time: clock(e.at), ...text(e) });
    lines.set(e.personId, (lines.get(e.personId) ?? 0) + 1);
  }

  return [...people]
    .map(([id, tasks]) => ({ id, name: names.get(id) ?? "Someone", tasks: [...tasks.values()] }))
    .sort((a, b) => (lines.get(b.id) ?? 0) - (lines.get(a.id) ?? 0) || a.name.localeCompare(b.name));
}
