import { prisma } from "@/lib/prisma";
import { LIVE_TASK, LIVE_WORK_TASK, type TaskStatus } from "@/lib/workflow";
import { stageLabel } from "@/lib/stages";
import { dayOf } from "@/lib/editorKpi";
import type { MapDepartment } from "./OrgMap";

// what someone is "on": a video being edited first, then one sent back, then
// what's queued, then the rest; a to-do counts as queued. Soonest due first.
const RANK: Partial<Record<TaskStatus, number>> = { editing: 0, revision_requested: 1, queued: 2, sent_for_approval: 3 };

// Each department's work and people for the Organization page: its open and
// late work, its leads, and each person with what they're on
export async function orgData(departments: { id: string; slug: string; name: string }[]) {
  // the start of today in IST: anything due before it and not done is late
  const today = new Date(`${dayOf(new Date())}T00:00:00+05:30`);
  const ids = departments.map((d) => d.id);
  const [people, tasks, todos, leads] = await Promise.all([
    prisma.user.findMany({ where: { employment: { not: "former" } }, select: { id: true, name: true, teamId: true, departments: { select: { id: true } } }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ where: { AND: [LIVE_TASK, { teamId: { in: ids } }] }, select: { teamId: true, title: true, status: true, dueDate: true, handedOffAt: true, assignedToId: true } }),
    prisma.workTask.findMany({ where: { AND: [LIVE_WORK_TASK, { teamId: { in: ids } }] }, select: { teamId: true, title: true, dueDate: true, assignedToId: true, createdById: true } }),
    prisma.lead.findMany({ where: { board: { teamId: { in: ids } } }, select: { assignedToId: true, board: { select: { teamId: true } } } }),
  ]);
  const work = [
    ...tasks.map((t) => ({ teamId: t.teamId, who: t.assignedToId, title: t.title, stage: stageLabel(t.status), rank: RANK[t.status] ?? 4, due: t.dueDate, late: !!t.dueDate && !t.handedOffAt && t.dueDate < today })),
    ...todos.map((t) => ({ teamId: t.teamId, who: t.assignedToId ?? t.createdById, title: t.title, stage: null, rank: 2, due: t.dueDate, late: !!t.dueDate && t.dueDate < today })),
  ].sort((a, b) => a.rank - b.rank || (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));

  const map: MapDepartment[] = departments.map((d) => {
    const here = work.filter((w) => w.teamId === d.id);
    const held = leads.filter((l) => l.board.teamId === d.id);
    // everyone in it, and anyone else holding its work
    const team = people.filter((p) => p.teamId === d.id || p.departments.some((x) => x.id === d.id) || here.some((w) => w.who === p.id));
    return {
      slug: d.slug,
      name: d.name,
      open: here.length,
      late: here.filter((w) => w.late).length,
      leads: held.length || null,
      people: team
        .map((p) => {
          const theirs = here.filter((w) => w.who === p.id);
          return {
            name: p.name,
            on: theirs[0]?.title ?? null,
            stage: theirs[0]?.stage ?? null,
            open: theirs.length,
            late: theirs.filter((w) => w.late).length,
            leads: held.filter((l) => l.assignedToId === p.id).length,
          };
        })
        .sort((a, b) => b.open - a.open || b.leads - a.leads),
    };
  });
  const everyone = new Set(map.flatMap((d) => d.people.map((p) => p.name))).size;

  return { map, everyone };
}
