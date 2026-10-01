import { prisma } from "./prisma";
import { dayOf } from "./editorKpi";
import { isFounder, type Viewer } from "./scope";
import { ACTIVE_STATUSES } from "./workflow";
import { overdueAudience, ordinal } from "./overdue.ts";
import { departmentFromTitle } from "./department.ts";

// The record every task keeps, whichever kind it is (a client Task or a
// to-do WorkTask): who was brought onto it and why, every move of its
// completion date and why, the times it went past that date (strikes, with
// notices up the levels), and, when it's deleted, a whole copy with the
// reason. Pages and actions call these; the rules themselves are in
// lib/overdue.ts.

export type TaskRef = { kind: "task" | "work"; id: string };
const key = (ref: TaskRef) => (ref.kind === "task" ? { taskId: ref.id } : { workTaskId: ref.id });

type Person = { id: string; name: string; role: string; email: string; teamId: string | null; departments: { id: string }[] };
const PERSON = { id: true, name: true, role: true, email: true, teamId: true, departments: { select: { id: true } } } as const;

// one task of either kind, in one shape
async function load(ref: TaskRef) {
  const select = { id: true, title: true, dueDate: true, strikes: true, teamId: true, assignedToId: true } as const;
  return ref.kind === "task"
    ? prisma.task.findUnique({ where: { id: ref.id }, select: { ...select, createdById: true } })
    : prisma.workTask.findUnique({ where: { id: ref.id }, select: { ...select, createdById: true } });
}

// ---------- people on a task ----------

// Who someone may bring onto a task: Level 1 anyone; everyone else the
// people at their own level or in a department they share, upward or down
export function canBringOn(actor: Viewer, target: Person): boolean {
  if (isFounder(actor)) return true;
  if (target.role === actor.role) return true;
  const mine = actor.departments.map((d) => d.id);
  return (!!target.teamId && mine.includes(target.teamId)) || target.departments.some((d) => mine.includes(d.id));
}

export async function bringOn(ref: TaskRef, userIds: string[], reason: string, actor: Viewer & { name: string }): Promise<{ error?: string }> {
  const why = reason.trim();
  if (!why) return { error: "Say why you're adding them, so they know what it's about." };
  const task = await load(ref);
  if (!task) return { error: "This task no longer exists." };
  const [people, already] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds }, employment: { not: "former" } }, select: PERSON }),
    prisma.taskShare.findMany({ where: key(ref), select: { userId: true } }),
  ]);
  const allowed = people.filter((p) => canBringOn(actor, p) && p.id !== task.assignedToId && !already.some((a) => a.userId === p.id));
  if (!allowed.length) return { error: people.length ? "They're already on it, or not someone you can add." : "Pick someone to add." };
  await prisma.$transaction([
    prisma.taskShare.createMany({ data: allowed.map((p) => ({ ...key(ref), userId: p.id, byId: actor.id, reason: why })) }),
    prisma.notice.createMany({
      data: allowed.map((p) => ({ ...key(ref), forId: p.id, kind: "shared", by: actor.name, body: `${actor.name} added you to "${task.title}": ${why}` })),
    }),
  ]);
  return {};
}

// ---------- the completion date ----------

// Moving the completion date needs a reason; the change is kept, with the
// strike the task was on
export async function recordDateChange(ref: TaskRef, from: Date | null, to: Date | null, reason: string, byId: string, strikes: number) {
  await prisma.taskDateChange.create({ data: { ...key(ref), from, to, reason: reason.trim(), byId, strike: strikes } });
}

// Who hears about a task's nth miss (lib/overdue.ts): whoever's
// responsible for it (its assignee, else whoever made it), then up the levels
function toldAbout(strike: number, owner: Person | undefined, teamId: string | null, people: Person[]): Person[] {
  const audience = overdueAudience(strike, owner?.role ?? "admin");
  const leads = audience.leads ? people.filter((p) => p.role === "core" && !!teamId && (p.teamId === teamId || p.departments.some((d) => d.id === teamId))) : [];
  const levelOne = audience.levelOne ? people.filter((p) => isFounder(p)) : [];
  return [...new Map([...(owner ? [owner] : []), ...leads, ...levelOne].map((p) => [p.id, p])).values()];
}

// Every task past its completion date that hasn't been counted for that
// date yet: one more strike, and notices to whoever the rules say
// (lib/overdue.ts). Run each night, and on opening Home if the night's run
// hasn't happened.
export async function sweepOverdue(now = new Date()): Promise<number> {
  const today = dayOf(now);
  const before = new Date(`${today}T00:00:00+05:30`);
  const [tasks, todos, people] = await Promise.all([
    // a client task is done with, for its deadline, once it reaches the client
    prisma.task.findMany({
      where: { status: { in: ACTIVE_STATUSES }, handedOffAt: null, dueDate: { lt: before }, project: { client: { status: "current" } } },
      select: { id: true, title: true, dueDate: true, strikes: true, overdueFor: true, teamId: true, assignedToId: true, createdById: true },
    }),
    prisma.workTask.findMany({
      where: { status: { not: "done" }, dueDate: { lt: before } },
      select: { id: true, title: true, dueDate: true, strikes: true, overdueFor: true, teamId: true, assignedToId: true, createdById: true },
    }),
    prisma.user.findMany({ where: { employment: { not: "former" } }, select: PERSON }),
  ]);

  let counted = 0;
  const all = [...tasks.map((t) => ({ ...t, ref: { kind: "task" as const, id: t.id } })), ...todos.map((t) => ({ ...t, ref: { kind: "work" as const, id: t.id } }))];
  for (const t of all) {
    if (!t.dueDate || (t.overdueFor && t.overdueFor.getTime() === t.dueDate.getTime())) continue;
    const strike = t.strikes + 1;
    const owner = people.find((p) => p.id === (t.assignedToId ?? t.createdById));
    const to = toldAbout(strike, owner, t.teamId, people);
    const when = `${ordinal(strike)} time`;
    const data = to.map((p) => ({
      ...key(t.ref),
      forId: p.id,
      kind: "overdue",
      body: p.id === owner?.id ? `"${t.title}" is past its due date (${when}). Set a new date and say why.` : `"${t.title}" (${owner?.name ?? "unassigned"}) is past its due date, the ${when}.`,
    }));
    if (t.ref.kind === "task") {
      await prisma.$transaction([prisma.task.update({ where: { id: t.id }, data: { strikes: strike, overdueFor: t.dueDate } }), prisma.notice.createMany({ data })]);
    } else {
      await prisma.$transaction([prisma.workTask.update({ where: { id: t.id }, data: { strikes: strike, overdueFor: t.dueDate } }), prisma.notice.createMany({ data })]);
    }
    counted++;
  }
  await prisma.appSetting.upsert({ where: { key: SWEPT }, create: { key: SWEPT, value: today }, update: { value: today } });
  return counted;
}

const SWEPT = "overdue.sweptOn";
// the sweep, unless it's already run today
export async function sweepIfDue(now = new Date()) {
  const last = await prisma.appSetting.findUnique({ where: { key: SWEPT } });
  if (last?.value !== dayOf(now)) await sweepOverdue(now).catch(() => 0);
}

// ---------- deleting ----------

// A task goes from every list, but a whole copy stays (DeletedTask), with
// who deleted it and why: History shows it, and Level 1 can bring it back
export async function deleteWithRecord(ref: TaskRef, reason: string, by: { id: string; name: string }): Promise<{ error?: string }> {
  const why = reason.trim();
  if (!why) return { error: "Say why it's being deleted." };
  if (ref.kind === "task") {
    const t = await prisma.task.findUnique({ where: { id: ref.id }, include: { tags: { select: { id: true } }, assignedTo: { select: { name: true } }, project: { select: { client: { select: { name: true } } } } } });
    if (!t) return {};
    await prisma.$transaction([
      prisma.deletedTask.create({
        data: { kind: "client", originalId: t.id, title: t.title, client: t.project.client.name, assignee: t.assignedTo?.name ?? null, data: JSON.parse(JSON.stringify(t)), reason: why, byId: by.id, byName: by.name, createdAt: t.createdAt },
      }),
      prisma.feedback.deleteMany({ where: { taskId: t.id } }),
      prisma.task.delete({ where: { id: t.id } }),
    ]);
  } else {
    const t = await prisma.workTask.findUnique({ where: { id: ref.id }, include: { tags: { select: { id: true } }, assignedTo: { select: { name: true } }, project: { select: { client: { select: { name: true } } } } } });
    if (!t) return {};
    await prisma.$transaction([
      prisma.deletedTask.create({
        data: { kind: "todo", originalId: t.id, title: t.title, client: t.project?.client.name ?? null, assignee: t.assignedTo.name, data: JSON.parse(JSON.stringify(t)), reason: why, byId: by.id, byName: by.name, createdAt: t.createdAt },
      }),
      prisma.workTask.delete({ where: { id: t.id } }),
    ]);
  }
  return {};
}

// ---------- which department ----------

// the department a task's title points to (lib/department.ts), or null
export async function departmentFromWords(title: string): Promise<string | null> {
  const teams = await prisma.team.findMany({ select: { id: true, keywords: true }, orderBy: { sortOrder: "asc" } });
  return departmentFromTitle(title, teams);
}

// ---------- the record a task window shows ----------

export async function taskRecord(ref: TaskRef) {
  const [shares, changes, task, people] = await Promise.all([
    prisma.taskShare.findMany({ where: key(ref), orderBy: { createdAt: "asc" } }),
    prisma.taskDateChange.findMany({ where: key(ref), orderBy: { createdAt: "asc" } }),
    load(ref),
    prisma.user.findMany({ where: { employment: { not: "former" } }, select: PERSON }),
  ]);
  // each miss, and who was told (by the same rules the check sends by)
  const owner = task && people.find((p) => p.id === (task.assignedToId ?? task.createdById));
  const misses = Array.from({ length: task?.strikes ?? 0 }, (_, n) => ({ told: toldAbout(n + 1, owner ?? undefined, task?.teamId ?? null, people).map((p) => p.name) }));
  const ids = [...new Set([...shares.flatMap((s) => [s.userId, s.byId]), ...changes.map((c) => c.byId), ...(task?.createdById ? [task.createdById] : [])])];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return {
    createdBy: task?.createdById ? (names.get(task.createdById) ?? null) : null,
    strikes: task?.strikes ?? 0,
    due: task?.dueDate?.toISOString() ?? null,
    misses,
    people: shares.map((s) => ({ id: s.userId, name: names.get(s.userId) ?? "Someone", by: names.get(s.byId) ?? "Someone", reason: s.reason, at: s.createdAt.toISOString() })),
    dates: changes.map((c) => ({ from: c.from?.toISOString() ?? null, to: c.to?.toISOString() ?? null, reason: c.reason, by: names.get(c.byId) ?? "Someone", strike: c.strike, at: c.createdAt.toISOString() })),
  };
}
export type TaskRecord = Awaited<ReturnType<typeof taskRecord>>;
