"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/viewer";
import { assigneeWhere, isFounder } from "@/lib/scope";
import type { Prisma } from "@prisma/client";
import { bringOn, canBringOn, taskRecord, type TaskRef, type TaskRecord } from "@/lib/taskTrack";

// whether this person may see the task: it's in their view, theirs, or
// they've been brought onto it
async function sees(ref: TaskRef, viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>>) {
  // Level 1 sees everything (and Prisma reads an empty {} inside OR as false)
  if (isFounder(viewer)) return true;
  const shared = { shares: { some: { userId: viewer.id } } };
  const where = { AND: [{ id: ref.id }, { OR: [assigneeWhere(viewer), shared, { createdById: viewer.id }] }] };
  return ref.kind === "task" ? (await prisma.task.count({ where })) > 0 : (await prisma.workTask.count({ where })) > 0;
}

// A task's record for its window, and who could be added to it
export async function getTaskRecord(ref: TaskRef): Promise<(TaskRecord & { canAdd: { id: string; name: string }[]; departments: { id: string; name: string }[]; teamId: string | null }) | null> {
  const viewer = await getViewer();
  if (!viewer || !(await sees(ref, viewer))) return null;
  const [record, people, departments, task] = await Promise.all([
    taskRecord(ref),
    prisma.user.findMany({ where: { employment: { not: "former" }, id: { not: viewer.id } }, select: { id: true, name: true, role: true, email: true, teamId: true, departments: { select: { id: true } } }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    ref.kind === "task" ? prisma.task.findUnique({ where: { id: ref.id }, select: { teamId: true } }) : prisma.workTask.findUnique({ where: { id: ref.id }, select: { teamId: true } }),
  ]);
  return {
    ...record,
    canAdd: people.filter((p) => canBringOn(viewer, p) && !record.people.some((x) => x.id === p.id)).map((p) => ({ id: p.id, name: p.name })),
    departments,
    teamId: task?.teamId ?? null,
  };
}

// Bring people onto a task, with why (they're told, and it shows in their My tasks)
export async function addPeopleToTask(ref: TaskRef, userIds: string[], reason: string): Promise<{ error?: string }> {
  const viewer = await getViewer();
  if (!viewer || !(await sees(ref, viewer))) return { error: "You can't change this task." };
  const res = await bringOn(ref, userIds, reason, viewer);
  revalidatePath("/my-tasks");
  revalidatePath("/home");
  return res;
}

// The department a task is filed under, picked by hand
export async function setTaskDepartment(ref: TaskRef, teamId: string): Promise<{ error?: string }> {
  const viewer = await getViewer();
  if (!viewer || !(await sees(ref, viewer))) return { error: "You can't change this task." };
  if (!(await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } }))) return { error: "That department no longer exists." };
  if (ref.kind === "task") await prisma.task.update({ where: { id: ref.id }, data: { teamId } });
  else await prisma.workTask.update({ where: { id: ref.id }, data: { teamId } });
  revalidatePath("/home");
  return {};
}

// Level 1 brings a deleted task back, as it was
export async function restoreDeleted(id: string): Promise<{ error?: string }> {
  const viewer = await getViewer();
  if (!viewer || !isFounder(viewer)) return { error: "Only Level 1 can bring a task back." };
  const record = await prisma.deletedTask.findUnique({ where: { id } });
  if (!record) return {};
  // the row as it was, without what hung off it
  const { tags, assignedTo, project, createdBy, team, ...row } = record.data as Record<string, unknown> & { tags?: { id: string }[] };
  void assignedTo;
  void project;
  void createdBy;
  void team;
  const connect = (tags ?? []).map((t) => ({ id: t.id }));
  try {
    if (record.kind === "client") {
      await prisma.task.create({ data: { ...(row as Prisma.TaskUncheckedCreateInput), tags: { connect } } });
    } else {
      await prisma.workTask.create({ data: { ...(row as Prisma.WorkTaskUncheckedCreateInput), tags: { connect } } });
    }
  } catch {
    return { error: "It couldn't come back: its client or project may be gone." };
  }
  await prisma.deletedTask.delete({ where: { id } });
  revalidatePath("/history");
  revalidatePath("/home");
  return {};
}
