import { prisma } from "@/lib/prisma";
import { ACTIVE_STATUSES } from "@/lib/workflow";
import { seesEveryTeam, visibleTagWhere, type Viewer } from "@/lib/scope";
import { PUBLIC_USER_SELECT } from "@/lib/publicUser";
import type { WorkTaskLink, WorkTaskAttachment } from "./my/actions";

// What the work views load, for either page that shows them: My tasks (your
// own work tasks) and the Board's team views (everyone's work in a team, or
// every team, including editors' editing-queue tasks).

// "mine", "all", or a team's slug
export type WorkScope = string;

const assignee = {
  select: {
    ...PUBLIC_USER_SELECT,
    team: { select: { slug: true, name: true } },
  },
};

type Assignee = { id: string; name: string; team: { slug: string; name: string } | null };
const person = (u: Assignee) => ({ id: u.id, name: u.name, team: u.team });

export async function loadWork(viewer: Viewer, scope: WorkScope, { withQueue }: { withQueue: boolean }) {
  const everyTeam = seesEveryTeam(viewer);
  // one filter for both kinds of task: yours, one team's (everyone on it,
  // whatever their role), or everything
  const where = scope === "mine" ? { assignedToId: viewer.id } : scope === "all" ? {} : { assignedTo: { team: { slug: scope } } };

  const [projects, workTasks, queueTasks, taskTags, assignable] = await Promise.all([
    prisma.project.findMany({
      where: { client: { status: "current" } },
      include: { client: true },
      orderBy: { client: { name: "asc" } },
    }),
    prisma.workTask.findMany({
      where,
      include: { assignedTo: assignee, createdBy: { select: PUBLIC_USER_SELECT }, tags: true, project: { include: { client: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    withQueue
      ? prisma.task.findMany({
          where: { ...where, status: { in: ACTIVE_STATUSES } },
          orderBy: { createdAt: "desc" },
          include: { assignedTo: assignee, tags: true, project: { include: { client: true } } },
        })
      : Promise.resolve([]),
    prisma.taskTag.findMany({ where: visibleTagWhere(viewer), orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    // who work can be handed to: anyone, your own team, or only you
    prisma.user.findMany({
      where: everyTeam
        ? { employment: "active" }
        : viewer.role === "core" && viewer.teamId
          ? { teamId: viewer.teamId, employment: "active" }
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
    })),
    // whole rows: they render as the editing board's own cards, which open
    // the task and move its stage under the editing queue's rules
    queueTasks: queueTasks.map((t) => ({ ...t, assignedTo: t.assignedTo && person(t.assignedTo) })),
    taskTags: taskTags.map((t) => ({ id: t.id, name: t.name, clientFacing: t.clientFacing })),
    assignable,
  };
}
