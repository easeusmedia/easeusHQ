import { prisma } from "@/lib/prisma";
import { assigneeWhere, type Viewer } from "@/lib/scope";
import { LIVE_TASK, LIVE_WORK_TASK } from "@/lib/workflow";
import { parseStageChange, stageLabel } from "@/lib/stages";
import { WORK_TASK_STAGE } from "@/lib/workTaskStages";
import { calendarAccount, listMeetings, type Meeting } from "@/lib/googleCalendar";
import { dayBounds, groupDay, type DayEvent, type DayPerson, type DayTask } from "@/lib/dayActivity";

// What the Calendar reads: the meetings between two moments, and one day of
// the company's work when that day is opened. Lean selects, every query
// bounded to the day.

// The meetings that start between two moments, or null when Google
// Calendar isn't connected or doesn't answer: the Calendar simply leaves
// them out (Home is where a broken connection is explained). Google also
// returns ones only running into the span (from 11:30 pm the night before);
// a meeting belongs to the day it starts, so a day's dot and its panel agree.
export async function meetingsBetween(from: Date, to: Date): Promise<Meeting[] | null> {
  if ((await calendarAccount()) === null) return null;
  const starts = (m: Meeting) => new Date(m.start) >= from && new Date(m.start) < to;
  return listMeetings(from, to).then((all) => all.filter(starts), () => null);
}

// what's due on a day still to come, as one list
export type DueItem = { kind: "task" | "work"; id: string; title: string; where: string | null; stage: string; person: string | null };

export type Day = { meetings: Meeting[] | null; people: DayPerson[]; due: DueItem[] | null };

const PROJECT = { select: { name: true, type: true, client: { select: { name: true } } } } as const;
type Project = { name: string; type: string; client: { name: string } } | null;
// a to-do names its project as Team work does; a client task its client
const projectName = (p: Project) => (p ? `${p.client.name} · ${p.name || p.type}` : null);

// One IST day as `viewer` may see it (lib/scope: Level 1 everything, a Lead
// their departments' work). A day still to come has nothing done yet, so
// it shows what's due then instead.
export async function loadDay(viewer: Viewer, day: string, today: string): Promise<Day> {
  const { from, to } = dayBounds(day);
  const inDay = { gte: from, lt: to };
  const scope = assigneeWhere(viewer);

  if (day > today) {
    const [meetings, tasks, todos] = await Promise.all([
      meetingsBetween(from, to),
      prisma.task.findMany({
        where: { AND: [LIVE_TASK, scope, { dueDate: inDay }] },
        select: { id: true, title: true, status: true, workflow: true, assignedTo: { select: { name: true } }, project: PROJECT },
      }),
      prisma.workTask.findMany({
        where: { AND: [LIVE_WORK_TASK, scope, { dueDate: inDay }] },
        select: { id: true, title: true, status: true, assignedTo: { select: { name: true } }, project: PROJECT },
      }),
    ]);
    const due: DueItem[] = [
      ...tasks.map((t) => ({ kind: "task" as const, id: t.id, title: t.title, where: t.project.client.name, stage: stageLabel(t.status, t.workflow), person: t.assignedTo?.name ?? null })),
      ...todos.map((t) => ({ kind: "work" as const, id: t.id, title: t.title, where: projectName(t.project), stage: WORK_TASK_STAGE[t.status].label, person: t.assignedTo.name })),
    ].sort((a, b) => (a.person ?? "~").localeCompare(b.person ?? "~") || a.title.localeCompare(b.title));
    return { meetings, people: [], due };
  }

  // what was logged that day: stage moves (and "created") and due-date moves
  const [meetings, logs, dates] = await Promise.all([
    meetingsBetween(from, to),
    prisma.activityLog.findMany({ where: { entity: "Task", createdAt: inDay }, select: { entityId: true, action: true, actorId: true, createdAt: true } }),
    prisma.taskDateChange.findMany({ where: { createdAt: inDay }, select: { taskId: true, workTaskId: true, from: true, to: true, reason: true, byId: true, createdAt: true } }),
  ]);
  // the tasks those touched, and the ones made or finished that day, as far as the viewer sees
  const taskIds = [...new Set([...logs.map((l) => l.entityId), ...dates.flatMap((d) => (d.taskId ? [d.taskId] : []))])];
  const todoIds = [...new Set(dates.flatMap((d) => (d.workTaskId ? [d.workTaskId] : [])))];
  const [tasks, todos] = await Promise.all([
    prisma.task.findMany({
      where: { AND: [scope, { OR: [{ createdAt: inDay }, { id: { in: taskIds } }] }] },
      select: { id: true, title: true, workflow: true, createdAt: true, createdById: true, assignedToId: true, notionPageId: true, project: PROJECT },
    }),
    prisma.workTask.findMany({
      where: { AND: [scope, { OR: [{ createdAt: inDay }, { completedAt: inDay }, { id: { in: todoIds } }] }] },
      select: { id: true, title: true, createdAt: true, completedAt: true, createdById: true, assignedToId: true, fromNotion: true, project: PROJECT },
    }),
  ]);
  const taskOf = new Map(tasks.map((t) => [t.id, { kind: "task", id: t.id, title: t.title, where: t.project.client.name, workflow: t.workflow } satisfies DayTask]));
  const todoOf = new Map(todos.map((t) => [t.id, { kind: "work", id: t.id, title: t.title, where: projectName(t.project) } satisfies DayTask]));

  const events: DayEvent[] = [];
  const madeBy = new Map<string, string>();
  for (const l of logs) {
    const task = taskOf.get(l.entityId);
    if (!task) continue;
    if (l.action === "created") madeBy.set(task.id, l.actorId);
    const move = parseStageChange(l.action);
    // a sync copying Notion's column isn't anyone's work here (lib/stages)
    if (move && !move.fromNotion) events.push({ personId: l.actorId, at: l.createdAt, task, what: "move", from: move.from, to: move.to });
  }
  for (const t of tasks) {
    // one a Notion sync brought in has no maker here and its "creation" is
    // the moment of the sync, so it isn't its assignee's work that day
    const by = madeBy.get(t.id) ?? t.createdById ?? (t.notionPageId ? null : t.assignedToId);
    if (by && t.createdAt >= from && t.createdAt < to) events.push({ personId: by, at: t.createdAt, task: taskOf.get(t.id)!, what: "created" });
  }
  for (const t of todos) {
    const task = todoOf.get(t.id)!;
    // a to-do synced from Notion takes its dates from Notion's date-only
    // fields, not from work here: left out, as History does (14 Oct 2026)
    if (t.fromNotion) continue;
    if (t.createdAt >= from && t.createdAt < to) events.push({ personId: t.createdById, at: t.createdAt, task, what: "created" });
    if (t.completedAt && t.completedAt >= from && t.completedAt < to) events.push({ personId: t.assignedToId, at: t.completedAt, task, what: "completed" });
  }
  for (const d of dates) {
    const task = d.taskId ? taskOf.get(d.taskId) : d.workTaskId ? todoOf.get(d.workTaskId) : undefined;
    if (task) events.push({ personId: d.byId, at: d.createdAt, task, what: "date", from: d.from, to: d.to, reason: d.reason });
  }

  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(events.map((e) => e.personId))] } }, select: { id: true, name: true } });
  return { meetings, people: groupDay(day, events, new Map(people.map((p) => [p.id, p.name]))), due: null };
}
