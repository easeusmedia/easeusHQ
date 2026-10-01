import { prisma } from "@/lib/prisma";
import { LIVE_TASK, LIVE_WORK_TASK } from "@/lib/workflow";
import { assigneeWhere, isFounder, isLead, peopleWhere, visibleTagWhere, type Viewer } from "@/lib/scope";
import { displayTeam } from "@/lib/teams";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import type { WorkTaskLink, WorkTaskAttachment } from "./my-tasks/actions";

// What the work views load, for either page that shows them: My tasks (your
// own work tasks) and the Board's team views (everyone's work in a team, or
// every team, including editors' editing-queue tasks).

// "mine" (your own), or "all": everything you may see (lib/scope), which the
// Board splits by department in the browser
export type WorkScope = "mine" | "all";

const assignee = {
  select: {
    ...PUBLIC_USER_SELECT,
    role: true,
    team: { select: { slug: true, name: true } },
  },
};

type Assignee = { id: string; name: string; role: string; team: { slug: string; name: string } | null };
// shown under the department they belong to
const person = (u: Assignee) => ({ id: u.id, name: u.name, team: displayTeam(u) });

export async function loadWork(viewer: Viewer, scope: WorkScope, { withQueue }: { withQueue: boolean }) {
  // one filter for both kinds of task: yours (and those you've been brought
  // onto), or all you may see
  const where = scope === "mine" ? { OR: [{ assignedToId: viewer.id }, { shares: { some: { userId: viewer.id } } }] } : assigneeWhere(viewer);

  const [projects, workTasks, queueTasks, taskTags, assignable] = await Promise.all([
    prisma.project.findMany({
      where: { client: { status: "current" } },
      include: { client: true },
      // newest first within each client: a task form lists a client's
      // latest few projects and searches for the rest
      orderBy: [{ client: { name: "asc" } }, { createdAt: "desc" }],
    }),
    prisma.workTask.findMany({
      // finished work belongs to History, not to a board
      where: { AND: [where, LIVE_WORK_TASK] },
      include: { assignedTo: assignee, createdBy: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: true } }, team: { select: { slug: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    withQueue
      ? prisma.task.findMany({
          where: { AND: [where, LIVE_TASK] },
          orderBy: { createdAt: "desc" },
          include: { assignedTo: assignee, tags: true, project: { include: { client: true } }, team: { select: { slug: true } } },
        })
      : Promise.resolve([]),
    prisma.taskTag.findMany({ where: visibleTagWhere(viewer), orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { team: { select: { name: true } } } }),
    // who work can be handed to: down the levels (lib/scope canAssign)
    prisma.user.findMany({
      where: isFounder(viewer)
        ? { employment: "active" }
        : isLead(viewer)
          ? { employment: "active", OR: [{ id: viewer.id }, { AND: [peopleWhere(viewer), { role: "employee" }] }] }
          : { id: viewer.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    projects: projects.map((p) => ({ id: p.id, name: p.name || p.type, client: { id: p.client.id, name: p.client.name } })),
    tasks: workTasks.map((t) => ({
      id: t.id,
      title: t.title,
      notes: t.notes,
      status: t.status,
      category: t.category,
      tags: t.tags.map((tag) => ({ id: tag.id, name: tag.name })),
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      sortOrder: t.sortOrder,
      links: (t.links as WorkTaskLink[]) ?? [],
      attachments: (t.attachments as WorkTaskAttachment[]) ?? [],
      projectId: t.projectId,
      project: t.project ? { name: t.project.name || t.project.type, client: { name: t.project.client.name } } : null,
      assignedTo: person(t.assignedTo),
      createdBy: { id: t.createdBy.id, name: t.createdBy.name },
      // its department, which the Board's department views split by
      teamSlug: t.team?.slug ?? t.assignedTo.team?.slug ?? null,
      createdAt: t.createdAt.toISOString(),
      strikes: t.strikes,
    })),
    // whole rows: they render as the editing board's own cards, which open
    // the task and move its stage under the editing queue's rules
    queueTasks: queueTasks.map(({ team, ...t }) => ({ ...t, teamSlug: team?.slug ?? t.assignedTo?.team?.slug ?? null, assignedTo: t.assignedTo && person(t.assignedTo) })),
    taskTags: taskTags.map((t) => ({ id: t.id, name: t.name, clientFacing: t.clientFacing, group: t.team?.name ?? null })),
    assignable,
  };
}
