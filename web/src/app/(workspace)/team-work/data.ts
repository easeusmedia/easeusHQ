import { prisma } from "@/lib/prisma";
import { DEPT, isMember } from "@/lib/scope";
import { LIVE_TASK, LIVE_WORK_TASK, workflowOf, type TaskStatus, type Workflow } from "@/lib/workflow";
import { STAGE, stageLabel } from "@/lib/stages";
import { WORK_TASK_STAGE } from "@/lib/workTaskStages";
import { currentStatuses, inHand, pageOfDone, stagePhases, startOf } from "@/lib/history";
import { taskRecord } from "@/lib/taskTrack";
import { deliveredAt } from "@/lib/delivered";
import { dayOf } from "@/lib/editorKpi";
import { handoffUnknown } from "@/lib/due";

// What Team work reads: everyone's current tasks, a person's finished ones
// a page at a time, and one task's overview when it's opened. Lean selects
// throughout, and a task's activity trail only for the tasks being shown.

// A task as its row shows it, whichever kind it is
export type WorkCard = {
  kind: "task" | "work";
  id: string;
  title: string;
  // what kind of work it is, for its icon: a to-do is "todo" whichever kind it is
  workflow: Workflow;
  // the client and project, or "Admin tasks", as Home names them
  where: string;
  // the client's name, or null for someone's own work
  client: string | null;
  // where it stands, for work still open
  stage: { label: string; pill: string } | null;
  start: string;
  // when it was finished, for finished work
  end: string | null;
  // yyyy-mm-dd, for work still open
  due: string | null;
  // finished after its due date, as History scored it (lib/history onTime):
  // client work by when it reached the client
  late: boolean;
};

const PROJECT = { select: { name: true, type: true, client: { select: { name: true } } } } as const;
const TASK = { id: true, title: true, status: true, workflow: true, createdAt: true, updatedAt: true, dueDate: true, handedOffAt: true, project: PROJECT } as const;
const TODO = { id: true, title: true, status: true, createdAt: true, completedAt: true, updatedAt: true, dueDate: true, project: PROJECT } as const;

type Project = { name: string; type: string; client: { name: string } } | null;
const whereOf = (p: Project) => (p ? `${p.client.name} · ${p.name || p.type}` : "Admin tasks");

// each client task's stage moves, oldest first: only for the tasks asked about
async function trails(ids: string[]) {
  const by = new Map<string, { action: string; at: Date }[]>();
  if (!ids.length) return by;
  const logs = await prisma.activityLog.findMany({
    where: { entity: "Task", entityId: { in: ids }, action: { contains: " → " } },
    select: { entityId: true, action: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const l of logs) by.set(l.entityId, [...(by.get(l.entityId) ?? []), { action: l.action, at: l.createdAt }]);
  return by;
}

type TaskRow = { id: string; title: string; status: TaskStatus; workflow: string; createdAt: Date; updatedAt: Date; dueDate: Date | null; handedOffAt: Date | null; project: NonNullable<Project> };
type TodoRow = { id: string; title: string; status: keyof typeof WORK_TASK_STAGE; createdAt: Date; completedAt: Date | null; updatedAt: Date; dueDate: Date | null; project: Project };

// A client task is finished at `end`, when it was delivered (null while it's
// open); its completion date is met once it first reaches the client, and a
// Notion import that arrived with the client already isn't scored
const taskCard = (t: TaskRow, trail: { action: string; at: Date }[], end: Date | null): WorkCard => ({
  kind: "task",
  id: t.id,
  title: t.title,
  workflow: workflowOf(t.workflow),
  where: whereOf(t.project),
  client: t.project.client.name,
  stage: end ? null : { label: stageLabel(t.status, t.workflow), pill: STAGE[t.status].pill },
  start: startOf(trail, t.createdAt).toISOString(),
  end: end ? end.toISOString() : null,
  due: !end && t.dueDate && !t.handedOffAt ? dayOf(t.dueDate) : null,
  late: !!end && !!t.dueDate && !handoffUnknown(t.createdAt, t.handedOffAt) && dayOf(t.handedOffAt ?? end) > dayOf(t.dueDate),
});

const todoCard = (t: TodoRow, done: boolean): WorkCard => ({
  kind: "work",
  id: t.id,
  title: t.title,
  workflow: "todo",
  where: whereOf(t.project),
  client: t.project?.client.name ?? null,
  stage: done ? null : { label: WORK_TASK_STAGE[t.status].label, pill: WORK_TASK_STAGE[t.status].pill },
  start: t.createdAt.toISOString(),
  end: done ? (t.completedAt ?? t.updatedAt).toISOString() : null,
  due: !done && t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
  late: done && !!t.dueDate && dayOf(t.completedAt ?? t.updatedAt) > t.dueDate.toISOString().slice(0, 10),
});

// What each of these people is on now, as Home shows it, all of them in one
// pass: the live client work and open to-dos are read once and shared out
// to whoever holds each (its assignee and anyone brought onto it, each once),
// so the people list and a person's page can't disagree. Client work counts
// at the stages that go by whose task it is, as Home's onHome does: a Level
// 3's only while it's with them, anyone else's until Final export ready. A
// Level 3 in Production: only what's in hand (lib/history inHand), to-dos
// too. Soonest due first.
export async function currentWorkOf(ids: string[]): Promise<Map<string, WorkCard[]>> {
  const holder = { OR: [{ assignedToId: { in: ids } }, { shares: { some: { userId: { in: ids } } } }] };
  const holders = { assignedToId: true, shares: { select: { userId: true } } } as const;
  const [held, open, productionLevel3] = await Promise.all([
    prisma.task.findMany({ where: { AND: [LIVE_TASK, holder] }, select: { ...TASK, ...holders, assignedTo: { select: { role: true } } } }),
    prisma.workTask.findMany({ where: { AND: [LIVE_WORK_TASK, holder] }, select: { ...TODO, ...holders } }),
    prisma.user.findMany({ where: { role: "employee", departments: { some: { slug: DEPT.production } } }, select: { id: true } }),
  ]);
  const editors = new Set(productionLevel3.map((u) => u.id));
  const today = dayOf(new Date());
  const tasks = held.filter((t) =>
    t.assignedToId && editors.has(t.assignedToId)
      ? inHand({ kind: "task", status: t.status, due: t.dueDate && !t.handedOffAt ? dayOf(t.dueDate) : null }, today)
      : currentStatuses(!!t.assignedTo && isMember(t.assignedTo)).includes(t.status),
  );
  const trail = await trails(tasks.map((t) => t.id));
  const by = new Map(ids.map((id) => [id, [] as WorkCard[]]));
  const holdersOf = (t: { assignedToId: string | null; shares: { userId: string }[] }) => new Set([t.assignedToId, ...t.shares.map((s) => s.userId)]);
  for (const t of tasks) {
    const card = taskCard(t, trail.get(t.id) ?? [], null);
    for (const id of holdersOf(t)) if (id) by.get(id)?.push(card);
  }
  for (const t of open) {
    const card = todoCard(t, false);
    const now = inHand({ kind: "work", status: t.status, due: card.due }, today);
    for (const id of holdersOf(t)) if (id && (now || !editors.has(id))) by.get(id)?.push(card);
  }
  for (const list of by.values()) list.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || a.start.localeCompare(b.start));
  return by;
}

// One person's, from the same pass
export async function currentWork(person: { id: string }): Promise<WorkCard[]> {
  return (await currentWorkOf([person.id])).get(person.id) ?? [];
}

// What counts as someone's finished work: all their delivered client work,
// a paused or past client's too, since finished work is their record, and
// to-dos made here (not Notion's)
const doneTasks = (personId: string) => ({ assignedToId: personId, status: "delivered_and_uploaded" as const });
const doneTodos = (personId: string) => ({ assignedToId: personId, status: "done" as const, fromNotion: false });

// How many they've finished in all, for the Completed tab before it's opened
export async function completedCount(personId: string) {
  const [tasks, todos] = await Promise.all([prisma.task.count({ where: doneTasks(personId) }), prisma.workTask.count({ where: doneTodos(personId) })]);
  return tasks + todos;
}

// A page of what they've finished, newest first, within a range of days if
// one is set, and how many the range holds. The list itself is ids and
// dates; only the page's tasks are read whole.
export async function completedPage(personId: string, range: { from?: string; to?: string }, offset: number, limit: number) {
  const [tasks, todos] = await Promise.all([
    prisma.task.findMany({ where: doneTasks(personId), select: { id: true, updatedAt: true } }),
    prisma.workTask.findMany({ where: doneTodos(personId), select: { id: true, completedAt: true, updatedAt: true } }),
  ]);
  // finished when it was moved to Delivered, not at its last edit (a Drive
  // link added a week later); its last edit only where no move was logged
  const delivered = await deliveredAt(tasks.map((t) => t.id));
  const { total, page } = pageOfDone(
    [...tasks.map((t) => ({ kind: "task" as const, id: t.id, at: delivered.get(t.id) ?? t.updatedAt })), ...todos.map((t) => ({ kind: "work" as const, id: t.id, at: t.completedAt ?? t.updatedAt }))],
    { ...range, offset, limit }
  );
  const end = new Map(page.map((p) => [p.id, p.at]));
  const taskIds = page.filter((p) => p.kind === "task").map((p) => p.id);
  const todoIds = page.filter((p) => p.kind === "work").map((p) => p.id);
  const [taskRows, todoRows, trail] = await Promise.all([
    taskIds.length ? prisma.task.findMany({ where: { id: { in: taskIds } }, select: TASK }) : [],
    todoIds.length ? prisma.workTask.findMany({ where: { id: { in: todoIds } }, select: TODO }) : [],
    trails(taskIds),
  ]);
  const cards = new Map([...taskRows.map((t) => [t.id, taskCard(t, trail.get(t.id) ?? [], end.get(t.id) ?? t.updatedAt)] as const), ...todoRows.map((t) => [t.id, todoCard(t, true)] as const)]);
  return { total, cards: page.flatMap((p) => cards.get(p.id) ?? []) };
}

// One task, opened. Client work: each stage it went through, its delivered
// file and the notes worth reading. A to-do: who made it and when, its due
// date and each time that moved, its notes and links. No Drive link on a to-do.
export type Overview =
  | {
      kind: "task";
      workflow: string;
      due: string | null;
      drive: string | null;
      notes: string | null;
      reviewNotes: string | null;
      phases: { stage: string; at: string; by: string | null; ms: number | null }[];
    }
  | {
      kind: "work";
      due: string | null;
      createdBy: string | null;
      createdAt: string;
      notes: string | null;
      links: { label: string; url: string }[];
      dates: { from: string | null; to: string | null; reason: string; by: string; at: string }[];
    };

export async function overview(ref: { kind: "task" | "work"; id: string }, now = new Date()): Promise<Overview | null> {
  if (ref.kind === "task") {
    const [t, logs] = await Promise.all([
      prisma.task.findUnique({ where: { id: ref.id }, select: { status: true, workflow: true, createdAt: true, dueDate: true, driveLink: true, editingNotes: true, reviewNotes: true } }),
      prisma.activityLog.findMany({ where: { entity: "Task", entityId: ref.id, action: { contains: " → " } }, select: { action: true, createdAt: true, actor: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    ]);
    if (!t) return null;
    const phases = stagePhases(
      logs.map((l) => ({ action: l.action, at: l.createdAt, by: l.actor.name })),
      t.createdAt,
      t.status,
      now
    );
    return {
      kind: "task",
      workflow: t.workflow,
      due: t.dueDate ? dayOf(t.dueDate) : null,
      drive: t.driveLink,
      notes: t.editingNotes,
      reviewNotes: t.reviewNotes,
      phases: phases.map((p) => ({ ...p, at: p.at.toISOString() })),
    };
  }
  const [t, record] = await Promise.all([
    prisma.workTask.findUnique({ where: { id: ref.id }, select: { createdAt: true, dueDate: true, notes: true, links: true, createdBy: { select: { name: true } } } }),
    taskRecord({ kind: "work", id: ref.id }),
  ]);
  if (!t) return null;
  return {
    kind: "work",
    due: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    createdBy: t.createdBy.name,
    createdAt: t.createdAt.toISOString(),
    notes: t.notes,
    links: ((t.links as { label?: string; url?: string }[] | null) ?? []).flatMap((l) => (l?.url ? [{ label: l.label || "Link", url: l.url }] : [])),
    dates: record.dates.map(({ from, to, reason, by, at }) => ({ from, to, reason, by, at })),
  };
}
